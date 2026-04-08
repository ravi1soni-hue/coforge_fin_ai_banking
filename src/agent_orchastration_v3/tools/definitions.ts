/**
 * V3 Tool Definitions — OpenAI function calling schemas.
 *
 * These are the JSON schemas sent to the LLM so it knows which tools exist
 * and what arguments each one expects.
 *
 * Four tools cover the full V2 intent space:
 *   get_financial_profile      — fetch user's savings/income/surplus/currency
 *   check_affordability        — compute COMFORTABLE / RISKY / CANNOT_AFFORD
 *   generate_emi_plan          — compute monthly instalment options
 *   calculate_savings_projection — feasibility check for a savings goal
 */

import type { ToolDefinition } from "../types.js"; // agent_orchastration_v3/types.ts

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_financial_profile",
      description:
        "Retrieve the user's current financial profile: available savings, monthly income, monthly expenses, net monthly surplus, and home currency. " +
        "Call this FIRST on any conversation turn where you need financial data before doing calculations.",
      parameters: {
        type: "object",
        properties: {
          userId: {
            type: "string",
            description: "The unique user identifier (e.g. uk_user_001).",
          },
        },
        required: ["userId"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "check_affordability",
      description:
        "Compute whether the user can afford a specific purchase or expense. " +
        "Returns a verdict (COMFORTABLE, RISKY, or CANNOT_AFFORD), the remaining savings after payment, " +
        "the emergency buffer threshold, and a short explanation. " +
        "You MUST call this tool before delivering any affordability verdict — never guess.",
      parameters: {
        type: "object",
        properties: {
          userId: {
            type: "string",
            description: "The unique user identifier.",
          },
          cost: {
            type: "number",
            description: "The total cost of the item or expense in the specified currency.",
          },
          currency: {
            type: "string",
            description: "The currency of the cost (e.g. EUR, GBP, USD). Use the user's home currency if the same.",
          },
        },
        required: ["userId", "cost", "currency"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "generate_emi_plan",
      description:
        "Generate an instalment / EMI payment plan for a given purchase cost. " +
        "If `months` is provided, returns only that specific plan. " +
        "If `months` is omitted, returns plans for 3, 6, and 12 months. " +
        "You MUST call this tool before presenting any instalment plan — never invent monthly amounts.",
      parameters: {
        type: "object",
        properties: {
          userId: {
            type: "string",
            description: "The unique user identifier.",
          },
          cost: {
            type: "number",
            description: "The total cost to spread over instalments.",
          },
          currency: {
            type: "string",
            description: "Currency of the cost (e.g. EUR, GBP).",
          },
          months: {
            type: "number",
            description:
              "Optional. Specific plan duration in months (3, 6, or 12). Omit to return all three options.",
          },
        },
        required: ["userId", "cost", "currency"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "calculate_savings_projection",
      description:
        "Determine whether the user can reach a savings target within a given time horizon, " +
        "and calculate how much they need to save per month. " +
        "Returns: feasible flag, months required, required monthly saving, current monthly surplus, and a short explanation.",
      parameters: {
        type: "object",
        properties: {
          userId: {
            type: "string",
            description: "The unique user identifier.",
          },
          targetAmount: {
            type: "number",
            description: "The savings target amount.",
          },
          currency: {
            type: "string",
            description: "Currency of the target amount.",
          },
          timeHorizon: {
            type: "string",
            description:
              'Optional. Target timeframe as a string, e.g. "3 months", "6 months", "1 year", "by December". ' +
              "Omit if the user has not specified a time frame.",
          },
        },
        required: ["userId", "targetAmount", "currency"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "fetch_live_price",
      description:
        "Search the web (DuckDuckGo) for the realistic price or cost of something the user wants to buy or plan for. " +
        "Call this when the user mentions a product or financial goal but has NOT provided a specific numeric amount. " +
        "You MUST craft a concise, specific search query (max 8 words) as the `query` argument. " +
        "Example queries: 'new Honda Civic price UK 2026', '3 day Paris trip cost 2026'. " +
        "If the result has confidence=none, ask the user for the amount directly.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Concise web search query (max 8 words) to find the price or cost. " +
              "Include year and country/currency context for accuracy. E.g. 'iPhone 16 Pro price UK 2026'.",
          },
        },
        required: ["query"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "fetch_market_data",
      description:
        "Fetch the live foreign exchange (FX) rate between two currencies. " +
        "Call this when the purchase cost is in a different currency to the user's home currency, " +
        "or when the user asks about converting amounts between currencies. " +
        "Uses the Frankfurter API (European Central Bank data). " +
        "If the rate is unavailable, proceed with the user's home currency.",
      parameters: {
        type: "object",
        properties: {
          fromCurrency: {
            type: "string",
            description: "Source currency ISO code (e.g. EUR, USD, GBP).",
          },
          toCurrency: {
            type: "string",
            description: "Target currency ISO code (e.g. GBP, EUR, USD).",
          },
        },
        required: ["fromCurrency", "toCurrency"],
      },
    },
  },
];
