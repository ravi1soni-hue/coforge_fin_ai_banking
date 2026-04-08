/**
 * V3 Tool Executor — dispatches LLM tool_call requests to TypeScript implementations.
 *
 * This is the bridge between the LLM (which picks tool names and arguments)
 * and the deterministic TypeScript functions that do the actual computation.
 *
 * Flow:
 *   LLM returns tool_call { name, arguments (JSON string) }
 *   → Executor parses args
 *   → Calls the matching implementation
 *   → Returns a ToolResult to be injected back as a tool message
 */

import type { ToolCall, ToolResult } from "../types.js";
import type { UserProfile } from "../../agent_orchastration_v2/types.js";
import {
  getFinancialProfile,
  checkAffordability,
  generateEmiPlan,
  calculateSavingsProjection,
  fetchLivePrice,
  fetchMarketData,
  type GetFinancialProfileArgs,
  type CheckAffordabilityArgs,
  type GenerateEmiPlanArgs,
  type CalculateSavingsProjectionArgs,
  type FetchLivePriceArgs,
  type FetchMarketDataArgs,
} from "./implementations.js";

export class ToolExecutor {
  /**
   * Execute a single tool call and return the result.
   *
   * @param toolCall  The tool_call object from the LLM response
   * @param userId    Current user's ID (injected for tools that need it)
   * @param profile   Pre-loaded user financial profile (injected by pipeline)
   */
  async execute(
    toolCall: ToolCall,
    userId: string,
    profile: UserProfile,
  ): Promise<ToolResult> {
    const { name, arguments: argsJson } = toolCall.function;

    let args: unknown;
    try {
      args = JSON.parse(argsJson);
    } catch {
      console.error(`[ToolExecutor] Failed to parse args for ${name}: ${argsJson}`);
      return {
        toolName: name,
        data: { error: `Invalid JSON arguments for tool ${name}` },
      };
    }

    console.log(`[ToolExecutor] Executing tool: ${name}`, args);

    switch (name) {
      case "get_financial_profile": {
        const result = getFinancialProfile(
          { ...(args as GetFinancialProfileArgs), userId },
          profile,
        );
        return { toolName: name, data: result as unknown as Record<string, unknown> };
      }

      case "check_affordability": {
        const result = checkAffordability(
          { ...(args as CheckAffordabilityArgs), userId },
          profile,
        );
        return { toolName: name, data: result as unknown as Record<string, unknown> };
      }

      case "generate_emi_plan": {
        const result = generateEmiPlan(
          { ...(args as GenerateEmiPlanArgs), userId },
          profile,
        );
        return { toolName: name, data: result as unknown as Record<string, unknown> };
      }

      case "calculate_savings_projection": {
        const result = calculateSavingsProjection(
          { ...(args as CalculateSavingsProjectionArgs), userId },
          profile,
        );
        return { toolName: name, data: result as unknown as Record<string, unknown> };
      }

      case "fetch_live_price": {
        const result = await fetchLivePrice(args as FetchLivePriceArgs);
        return { toolName: name, data: result as unknown as Record<string, unknown> };
      }

      case "fetch_market_data": {
        const result = await fetchMarketData(args as FetchMarketDataArgs);
        return { toolName: name, data: result as unknown as Record<string, unknown> };
      }

      default:
        console.warn(`[ToolExecutor] Unknown tool: ${name}`);
        return {
          toolName: name,
          data: { error: `Unknown tool: ${name}. Available tools: get_financial_profile, check_affordability, generate_emi_plan, calculate_savings_projection, fetch_live_price, fetch_market_data` },
        };
    }
  }
}
