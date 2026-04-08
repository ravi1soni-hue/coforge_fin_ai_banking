/**
 * V3 Tool-Calling LLM Client.
 *
 * Wraps the Coforge/OpenAI-compatible endpoint with support for
 * the OpenAI `tools` parameter (function calling).
 *
 * Unlike the V2 LlmClient (which takes a single prompt string), this client
 * takes a full messages array and an optional tools array — matching the
 * OpenAI Chat Completions API format exactly.
 *
 * The Coforge endpoint at /v2/chat/completions is OpenAI-compatible and
 * supports the `tools` / `tool_calls` format used in GPT-4+ models.
 */

import type { ToolDefinition, ToolCall, ToolCallingResponse, AgenticMessage } from "../types.js";

const API_URL =
  "https://quasarmarket.coforge.com/qag/llmrouter-api/v2/chat/completions";

const MODEL = "gpt-5-chat";

export class V3LlmClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error("❌ V3LlmClient: apiKey is required");
    }
  }

  /**
   * Send a conversation (messages) to the LLM with the given tools available.
   *
   * Returns either:
   *   - { content: string, toolCalls: undefined } — final text response
   *   - { content: null, toolCalls: ToolCall[] }  — LLM wants to call tools
   */
  async chat(
    messages: AgenticMessage[],
    tools: ToolDefinition[],
  ): Promise<ToolCallingResponse> {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": this.apiKey,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? "auto" : undefined,
          temperature: 0.3,   // Lower temperature for more deterministic financial reasoning
          top_p: 0.9,
          max_tokens: 1200,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const choice = data?.choices?.[0];

      if (!choice) {
        throw new Error("No choices returned from API");
      }

      const message = choice.message;

      // LLM wants to call one or more tools (native OpenAI tool_calls format)
      if (
        choice.finish_reason === "tool_calls" ||
        (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0)
      ) {
        return {
          content: message.content ?? null,
          toolCalls: message.tool_calls,
          textBased: false,
        };
      }

      // Fallback: some models (including Coforge gpt-5-chat) output tool calls as
      // plain-text JSON lines instead of the structured tool_calls field.
      // Example output:
      //   {"name":"fetch_live_price","arguments":{"query":"iPhone 16 Pro Europe"}}
      //   {"name":"fetch_market_data","arguments":{"fromCurrency":"EUR","toCurrency":"GBP"}}
      const rawContent = (message?.content ?? "").trim();
      const textParsed = this.parseTextualToolCalls(rawContent);
      if (textParsed.length > 0) {
        console.log(
          `[V3LlmClient] Detected ${textParsed.length} text-based tool call(s):`,
          textParsed.map((t) => t.function.name),
        );
        return {
          content: null,
          toolCalls: textParsed,
          textBased: true,
        };
      }

      // LLM gave a final text response
      const content = rawContent.length > 0 ? rawContent : "No response from AI.";
      return {
        content,
        toolCalls: undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`V3LlmClient.chat failed: ${message}`);
    }
  }

  /**
   * Parse newline-separated JSON tool call objects from plain text content.
   *
   * The Coforge model outputs tool invocations as text in one of two formats:
   *
   * Format 1 (preferred): { "name": "<tool>", "arguments": { ... } }
   * Format 2 (bare args): { "userId": "...", "cost": 1234, "currency": "EUR" }
   *   — model omits the name wrapper; we infer the tool from the key signature.
   */
  private parseTextualToolCalls(text: string): ToolCall[] {
    if (!text) return [];
    const toolCalls: ToolCall[] = [];
    let seq = 0;

    // Split on newlines; also handle back-to-back JSON objects on one line
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;

        // ── Format 1: {"name":"tool_name","arguments":{…}} ──────────────────
        if (typeof obj.name === "string" && obj.arguments !== undefined) {
          toolCalls.push({
            id: `call_text_${Date.now()}_${seq++}`,
            type: "function",
            function: {
              name: obj.name,
              arguments:
                typeof obj.arguments === "string"
                  ? obj.arguments
                  : JSON.stringify(obj.arguments),
            },
          });
          continue;
        }

        // ── Format 2: bare argument object — infer tool from key signature ──
        const inferredName = this.inferToolNameFromArgs(obj);
        if (inferredName) {
          console.log(
            `[V3LlmClient] Inferred tool "${inferredName}" from bare arg object keys: ${Object.keys(obj).join(",")}`,
          );
          toolCalls.push({
            id: `call_text_${Date.now()}_${seq++}`,
            type: "function",
            function: {
              name: inferredName,
              arguments: JSON.stringify(obj),
            },
          });
        }
      } catch {
        // Not a JSON tool call line — could be part of a normal text answer
      }
    }

    return toolCalls;
  }

  /**
   * Infer a tool name from a bare argument object by matching its key signature
   * against known tool schemas.
   *
   * More-specific signatures are checked first to avoid ambiguity.
   */
  private inferToolNameFromArgs(obj: Record<string, unknown>): string | null {
    const keys = new Set(Object.keys(obj));

    // generate_emi_plan — userId + cost + currency + months
    if (keys.has("userId") && keys.has("cost") && keys.has("currency") && keys.has("months")) {
      return "generate_emi_plan";
    }
    // check_affordability — userId + cost + currency (no months)
    if (keys.has("userId") && keys.has("cost") && keys.has("currency")) {
      return "check_affordability";
    }
    // calculate_savings_projection — userId + targetAmount + currency
    if (keys.has("userId") && keys.has("targetAmount") && keys.has("currency")) {
      return "calculate_savings_projection";
    }
    // get_financial_profile — userId only (no cost, no targetAmount)
    if (keys.has("userId") && !keys.has("cost") && !keys.has("targetAmount")) {
      return "get_financial_profile";
    }
    // fetch_market_data — fromCurrency + toCurrency
    if (keys.has("fromCurrency") && keys.has("toCurrency")) {
      return "fetch_market_data";
    }
    // fetch_financial_news — query + region (or topic)
    if (keys.has("query") && (keys.has("region") || keys.has("topic"))) {
      return "fetch_financial_news";
    }
    // fetch_live_price — query (generic price lookup)
    if (keys.has("query")) {
      return "fetch_live_price";
    }

    return null; // Cannot identify — treat as plain text
  }

  /**
   * Simple text-only call (no tools) — used for health checks or simple fallbacks.
   */
  async generateText(prompt: string): Promise<string> {
    const result = await this.chat(
      [{ role: "user", content: prompt }],
      [],
    );
    return result.content ?? "No response.";
  }
}
