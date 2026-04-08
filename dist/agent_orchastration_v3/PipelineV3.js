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
import { FinancialLoader } from "../agent_orchastration_v2/financialLoader.js";
import { ToolExecutor } from "./tools/executor.js";
import { TOOL_DEFINITIONS } from "./tools/definitions.js";
import { buildSystemPrompt } from "./systemPrompt.js";
/** Maximum tool-calling iterations per turn before forcing a response */
const MAX_TOOL_ITERATIONS = 5;
export class PipelineV3 {
    llmClient;
    baseLlmClient;
    vectorQuery;
    chatRepo;
    sessionRepo;
    db;
    toolExecutor;
    loader;
    /** In-process conversation history cache: sessionKey → turns */
    historyCache = new Map();
    constructor(llmClient, 
    /** Standard LlmClient used only by FinancialLoader's vector-DB fallback path */
    baseLlmClient, vectorQuery, chatRepo, sessionRepo, db) {
        this.llmClient = llmClient;
        this.baseLlmClient = baseLlmClient;
        this.vectorQuery = vectorQuery;
        this.chatRepo = chatRepo;
        this.sessionRepo = sessionRepo;
        this.db = db;
        this.toolExecutor = new ToolExecutor();
        // FinancialLoader is reused from V2 — same profile loading logic
        // Constructor order: (vectorQuery, llm, db)
        this.loader = new FinancialLoader(vectorQuery, baseLlmClient, db);
    }
    // ─── Public entry point ─────────────────────────────────────────────────────
    async handle(req) {
        const sid = req.sessionId ?? "default";
        const sessionKey = `${req.userId}::${sid}`;
        console.log(`[PipelineV3] userId=${req.userId} message="${req.message.slice(0, 60)}"`);
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
        const updatedHistory = [
            ...history,
            { role: "user", content: req.message },
            { role: "assistant", content: answer },
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
    async runAgenticLoop(messages, profile, userId) {
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
            console.log(`[PipelineV3] LLM requested ${response.toolCalls.length} tool(s):`, response.toolCalls.map((tc) => tc.function.name));
            // Execute ALL tool calls in parallel
            console.log(`[PipelineV3] Running ${response.toolCalls.length} tool(s) in parallel`);
            const toolResults = await Promise.all(response.toolCalls.map((tc) => this.toolExecutor.execute(tc, userId, profile)));
            for (const r of toolResults) {
                console.log(`[PipelineV3] Tool "${r.toolName}" completed`);
            }
            if (response.textBased) {
                // ── Text-based tool dispatch (Coforge model) ────────────────────────
                // The model does not understand role:"tool" messages; inject results
                // as a user message so the next LLM call gets the data in-context.
                const resultSections = toolResults
                    .map((r) => `**${r.toolName}** result:\n${JSON.stringify(r.data, null, 2)}`)
                    .join("\n\n");
                iterationMessages.push({
                    role: "user",
                    content: `Tool execution results:\n\n${resultSections}\n\n` +
                        "If you still need additional tools (e.g. fetch_financial_news, get_financial_profile, check_affordability, generate_emi_plan) " +
                        "to complete your analysis, call them now in the same text-based JSON format. " +
                        "If you have all required data, provide a comprehensive final human-readable response only.",
                });
            }
            else {
                // ── Native OpenAI tool_calls (standard flow) ────────────────────────
                // Append the assistant's tool-call message then each tool result
                iterationMessages.push({
                    role: "assistant",
                    content: response.content ?? null,
                    tool_calls: response.toolCalls,
                });
                for (let j = 0; j < response.toolCalls.length; j++) {
                    iterationMessages.push({
                        role: "tool",
                        tool_call_id: response.toolCalls[j].id,
                        content: JSON.stringify(toolResults[j].data),
                    });
                }
            }
        }
        // Safety net — should never be reached with well-prompted models
        console.warn("[PipelineV3] Hit MAX_TOOL_ITERATIONS — forcing final response");
        const fallback = await this.llmClient.chat([
            ...iterationMessages,
            {
                role: "user",
                content: "Please provide your final response based on all the tool results above.",
            },
        ], []);
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
    buildMessages(profile, history, currentMessage) {
        const systemMessage = {
            role: "system",
            content: buildSystemPrompt(profile),
        };
        const historyMessages = history.map((turn) => ({
            role: turn.role,
            content: turn.content,
        }));
        const userMessage = {
            role: "user",
            content: currentMessage,
        };
        return [systemMessage, ...historyMessages, userMessage];
    }
    // ─── History loader ─────────────────────────────────────────────────────────
    async loadHistory(userId, sessionId, sessionKey) {
        const cached = this.historyCache.get(sessionKey);
        if (cached)
            return cached;
        const dbHistory = await this.chatRepo.getHistory(userId, sessionId, 12);
        this.historyCache.set(sessionKey, dbHistory);
        return dbHistory;
    }
}
