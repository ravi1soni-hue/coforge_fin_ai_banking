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
import { getFinancialProfile, checkAffordability, generateEmiPlan, calculateSavingsProjection, fetchLivePrice, fetchMarketData, } from "./implementations.js";
export class ToolExecutor {
    /**
     * Execute a single tool call and return the result.
     *
     * @param toolCall  The tool_call object from the LLM response
     * @param userId    Current user's ID (injected for tools that need it)
     * @param profile   Pre-loaded user financial profile (injected by pipeline)
     */
    async execute(toolCall, userId, profile) {
        const { name, arguments: argsJson } = toolCall.function;
        let args;
        try {
            args = JSON.parse(argsJson);
        }
        catch {
            console.error(`[ToolExecutor] Failed to parse args for ${name}: ${argsJson}`);
            return {
                toolName: name,
                data: { error: `Invalid JSON arguments for tool ${name}` },
            };
        }
        console.log(`[ToolExecutor] Executing tool: ${name}`, args);
        switch (name) {
            case "get_financial_profile": {
                const result = getFinancialProfile({ ...args, userId }, profile);
                return { toolName: name, data: result };
            }
            case "check_affordability": {
                const result = checkAffordability({ ...args, userId }, profile);
                return { toolName: name, data: result };
            }
            case "generate_emi_plan": {
                const result = generateEmiPlan({ ...args, userId }, profile);
                return { toolName: name, data: result };
            }
            case "calculate_savings_projection": {
                const result = calculateSavingsProjection({ ...args, userId }, profile);
                return { toolName: name, data: result };
            }
            case "fetch_live_price": {
                const result = await fetchLivePrice(args);
                return { toolName: name, data: result };
            }
            case "fetch_market_data": {
                const result = await fetchMarketData(args);
                return { toolName: name, data: result };
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
