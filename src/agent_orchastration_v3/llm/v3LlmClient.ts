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

import type { ToolDefinition, ToolCallingResponse, AgenticMessage } from "../types.js";

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

      // LLM wants to call one or more tools
      if (
        choice.finish_reason === "tool_calls" ||
        (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0)
      ) {
        return {
          content: message.content ?? null,
          toolCalls: message.tool_calls,
        };
      }

      // LLM gave a final text response
      const content = message?.content?.trim();
      return {
        content: content && content.length > 0 ? content : "No response from AI.",
        toolCalls: undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`V3LlmClient.chat failed: ${message}`);
    }
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
