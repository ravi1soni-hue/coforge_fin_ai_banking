const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5";

const tokenize = (text) => {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
};

const normalizeContextItems = (rawItems) => {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          id: `ctx_${index + 1}`,
          text: item,
          metadata: {},
        };
      }

      if (item && typeof item === "object") {
        const text = item.text || item.content || item.chunk || "";
        if (!text) {
          return null;
        }

        return {
          id: item.id || `ctx_${index + 1}`,
          text,
          metadata: item.metadata || {},
        };
      }

      return null;
    })
    .filter(Boolean);
};

const lexicalScore = (queryTokens, docText) => {
  if (!queryTokens.length || !docText) {
    return 0;
  }

  const docTokens = tokenize(docText);
  if (!docTokens.length) {
    return 0;
  }

  const docSet = new Set(docTokens);
  let overlap = 0;
  for (const token of queryTokens) {
    if (docSet.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.sqrt(docTokens.length);
};

const searchCanonicalContext = ({ query, topK = 5 }, runtime) => {
  const contextItems = normalizeContextItems(runtime.canonicalContext);
  const queryTokens = tokenize(query);

  const ranked = contextItems
    .map((item) => ({
      ...item,
      score: lexicalScore(queryTokens, item.text),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(Number(topK) || 5, 10)));

  return {
    totalAvailable: contextItems.length,
    returned: ranked.length,
    results: ranked.map((item) => ({
      id: item.id,
      text: item.text,
      metadata: item.metadata,
      score: Number(item.score.toFixed(4)),
    })),
  };
};

const getSessionFacts = (_, runtime) => {
  return {
    userId: runtime.userId || null,
    nowIso: new Date().toISOString(),
    contextItems: Array.isArray(runtime.canonicalContext)
      ? runtime.canonicalContext.length
      : 0,
  };
};

const TOOL_REGISTRY = {
  search_canonical_context: searchCanonicalContext,
  get_session_facts: getSessionFacts,
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_canonical_context",
      description:
        "Search canonical context chunks and return the most relevant snippets for the user question.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          topK: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_session_facts",
      description: "Get current session metadata such as user id and timestamp.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a financial assistant backend orchestrator.
Follow this policy:
1. Prefer grounded answers using tool results.
2. Use search_canonical_context before giving factual answers tied to user data.
3. If data is missing, say what is missing and ask a focused follow-up.
4. Be concise and safe. Do not invent balances, transactions, or profile facts.
5. End with a short actionable next step when useful.`;

const callOpenAI = async ({ apiKey, model, messages }) => {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errText}`);
  }

  return response.json();
};

const parseToolArgs = (rawArgs) => {
  if (!rawArgs) {
    return {};
  }

  if (typeof rawArgs === "object") {
    return rawArgs;
  }

  try {
    return JSON.parse(rawArgs);
  } catch {
    return {};
  }
};

export const runAgenticOrchestration = async ({
  userId,
  query,
  history = [],
  canonicalContext = [],
}) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const runtime = {
    userId,
    canonicalContext,
  };

  const baseMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: query },
  ];

  const messages = [...baseMessages];
  const toolCallsUsed = [];

  for (let step = 0; step < 5; step += 1) {
    const completion = await callOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: DEFAULT_MODEL,
      messages,
    });

    const assistant = completion?.choices?.[0]?.message;
    if (!assistant) {
      throw new Error("OpenAI response missing assistant message");
    }

    if (assistant.tool_calls && assistant.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: assistant.content || "",
        tool_calls: assistant.tool_calls,
      });

      for (const toolCall of assistant.tool_calls) {
        const toolName = toolCall.function?.name;
        const toolFn = TOOL_REGISTRY[toolName];
        if (!toolFn) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
          });
          continue;
        }

        const args = parseToolArgs(toolCall.function?.arguments);
        const result = toolFn(args, runtime);
        toolCallsUsed.push({ name: toolName, args });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      continue;
    }

    return {
      text: assistant.content || "I could not generate a response.",
      model: completion?.model || DEFAULT_MODEL,
      usage: completion?.usage || null,
      toolCallsUsed,
    };
  }

  throw new Error("Agent orchestration exceeded max tool-call steps");
};
