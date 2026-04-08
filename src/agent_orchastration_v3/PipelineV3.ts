/**
 * V3 Agentic Pipeline — OpenAI tool-calling loop.
 *
 * Architecture:
 *   socket.ts → ChatServiceV3 → PipelineV3 → [agentic loop]
 *                                              ├── V3LlmClient.chat(messages, tools)
 *                                              │     ↓ tool_calls
 *                                              └── ToolExecutor.execute(toolCall)
 *                                                    ↓ deterministic TypeScript
 *                                                  result injected back as tool message
 *
 * The LLM acts as the orchestrator (decides which tools to call and in what order).
 * TypeScript tools do all deterministic computation (affordability, EMI math, projections).
 * The LLM generates only final user-facing narrative.
 *
 * State: conversation history is the only state (no manual stage machine).
 * The LLM's own context window maintains multi-turn memory via message history.
 *
 * Safety: max 5 tool-calling iterations per turn to prevent runaway loops.
 */

import type { Kysely } from "kysely";
import type { ChatRepository } from "../repo/chat.repo.js";
import type { SessionRepository } from "../repo/session.repo.js";
import type { VectorQueryService } from "../agent_orchastration/services/vector.query.service.js";
import type { LlmClient } from "../agent_orchastration/llm/llmClient.js";

import { FinancialLoader } from "../agent_orchastration_v2/financialLoader.js";
import { V3LlmClient } from "./llm/v3LlmClient.js";
import { ToolExecutor } from "./tools/executor.js";
import { TOOL_DEFINITIONS } from "./tools/definitions.js";
import { buildSystemPrompt } from "./systemPrompt.js";

import type {
  AgenticMessage,
  ChatRequestV3,
  ChatResponseV3,
} from "./types.js";
import type { ConversationTurn, UserProfile } from "../agent_orchastration_v2/types.js";

/** Maximum tool-calling iterations per turn before forcing a response */
const MAX_TOOL_ITERATIONS = 5;

export class PipelineV3 {
  private readonly toolExecutor: ToolExecutor;
  private readonly loader: FinancialLoader;

  /** In-process conversation history cache: sessionKey → turns */
  private readonly historyCache = new Map<string, ConversationTurn[]>();

  constructor(
    private readonly llmClient: V3LlmClient,
    /** Standard LlmClient used only by FinancialLoader's vector-DB fallback path */
    private readonly baseLlmClient: LlmClient,
    private readonly vectorQuery: VectorQueryService,
    private readonly chatRepo: ChatRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly db?: Kysely<unknown>,
  ) {
    this.toolExecutor = new ToolExecutor();
    // FinancialLoader is reused from V2 — same profile loading logic
    // Constructor order: (vectorQuery, llm, db)
    this.loader = new FinancialLoader(vectorQuery, baseLlmClient, db);
  }

  // ─── Public entry point ─────────────────────────────────────────────────────

  async handle(req: ChatRequestV3): Promise<ChatResponseV3> {
    const sid = req.sessionId ?? "default";
    const sessionKey = `${req.userId}::${sid}`;

    console.log(
      `[PipelineV3] userId=${req.userId} message="${req.message.slice(0, 60)}"`,
    );

    // Load profile and history in parallel
    const [profile, history] = await Promise.all([
      this.loader.loadProfile(req.userId, req.knownFacts ?? {}),
      this.loadHistory(req.userId, sid, sessionKey),
    ]);

    // Build the initial messages array for this turn
    const messages = this.buildMessages(profile, history, req.message);

    // Run the agentic tool-calling loop
    const answer = await this.runAgenticLoop(messages, profile, req.userId);

    // Persist history
    const updatedHistory: ConversationTurn[] = [
      ...history,
      { role: "user" as const, content: req.message },
      { role: "assistant" as const, content: answer },
    ].slice(-12);

    this.historyCache.set(sessionKey, updatedHistory);
    void this.chatRepo.saveMessage(req.userId, sid, "user", req.message);
    void this.chatRepo.saveMessage(req.userId, sid, "assistant", answer);

    return { type: "FINAL", message: answer };
  }

  // ─── Agentic loop ───────────────────────────────────────────────────────────

  /**
   * The core tool-calling loop.
   *
   * 1. Call the LLM with current messages + tools
   * 2. If LLM returns tool_calls → execute each, append results, loop back
   * 3. If LLM returns text → done, return the text
   * 4. Safety: bail out after MAX_TOOL_ITERATIONS
   */
  private async runAgenticLoop(
    messages: AgenticMessage[],
    profile: UserProfile,
    userId: string,
  ): Promise<string> {
    let iterationMessages = [...messages];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      console.log(`[PipelineV3] Agentic loop iteration ${i + 1}/${MAX_TOOL_ITERATIONS}`);

      const response = await this.llmClient.chat(iterationMessages, TOOL_DEFINITIONS);

      // ── Terminal: LLM returned a final text answer ─────────────────────────
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const finalText = response.content ?? "I couldn't complete the analysis. Please try again.";
        console.log(`[PipelineV3] Final response after ${i + 1} iteration(s)`);
        return finalText;
      }

      // ── Tool calls: execute all, inject results, loop ──────────────────────
      console.log(
        `[PipelineV3] LLM requested ${response.toolCalls.length} tool(s):`,
        response.toolCalls.map((tc) => tc.function.name),
      );

      // Append the assistant's tool-call message
      iterationMessages.push({
        role: "assistant",
        content: response.content ?? null,
        tool_calls: response.toolCalls,
      });

      // Execute each tool in sequence and inject results
      for (const toolCall of response.toolCalls) {
        const toolResult = await this.toolExecutor.execute(toolCall, userId, profile);

        iterationMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult.data),
        });

        console.log(`[PipelineV3] Tool "${toolResult.toolName}" completed`);
      }
    }

    // Safety net — should never be reached with well-prompted models
    console.warn("[PipelineV3] Hit MAX_TOOL_ITERATIONS — forcing final response");
    const fallback = await this.llmClient.chat(
      [
        ...iterationMessages,
        {
          role: "user",
          content: "Please provide your final response based on all the tool results above.",
        },
      ],
      [], // No tools on the forced-final call
    );

    return fallback.content ?? "I encountered a problem completing the analysis. Please try again.";
  }

  // ─── Message builder ────────────────────────────────────────────────────────

  /**
   * Builds the full messages array:
   *   [system] → [history turns] → [current user message]
   *
   * Tool messages from previous turns are NOT included in history
   * (history only contains user/assistant text pairs for clean context).
   */
  private buildMessages(
    profile: UserProfile,
    history: ConversationTurn[],
    currentMessage: string,
  ): AgenticMessage[] {
    const systemMessage: AgenticMessage = {
      role: "system",
      content: buildSystemPrompt(profile),
    };

    const historyMessages: AgenticMessage[] = history.map((turn) => ({
      role: turn.role as "user" | "assistant",
      content: turn.content,
    }));

    const userMessage: AgenticMessage = {
      role: "user",
      content: currentMessage,
    };

    return [systemMessage, ...historyMessages, userMessage];
  }

  // ─── History loader ─────────────────────────────────────────────────────────

  private async loadHistory(
    userId: string,
    sessionId: string,
    sessionKey: string,
  ): Promise<ConversationTurn[]> {
    const cached = this.historyCache.get(sessionKey);
    if (cached) return cached;

    const dbHistory = await this.chatRepo.getHistory(userId, sessionId, 12);
    this.historyCache.set(sessionKey, dbHistory);
    return dbHistory;
  }
}
