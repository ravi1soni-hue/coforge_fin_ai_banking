import { LlmClient } from "./llmClient.js";

interface OpenAIClientDeps {
  apiKey: string;
  model?: string;
}

var model = "gpt-5-chat";

export class OpenAIClient extends LlmClient {
  private readonly apiKey: string;

  constructor({ apiKey }: OpenAIClientDeps) {
    super();

    if (!apiKey) {
      throw new Error("❌ OpenAIClient: apiKey is required");
    }

    this.apiKey = apiKey;
  }

  async generateResponse(prompt: string): Promise<string> {
    const url =
      "https://quasarmarket.coforge.com/qag/llmrouter-api/v2/chat/completions";

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": this.apiKey,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content: "You are an expert AI banking assistant. Follow task instructions precisely and completely.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `API error ${response.status}: ${errorBody}`
        );
      }

      const data = await response.json();

      const textResponse =
        data?.choices?.[0]?.message?.content?.trim();

      return textResponse && textResponse.length > 0
        ? textResponse
        : "No response from AI.";

    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      return `Failed to connect to Quasar API: ${message}`;
    }
  }
}
