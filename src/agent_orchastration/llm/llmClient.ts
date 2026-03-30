import { extractJson } from "../../utils/jsonExtractor.js";

export abstract class LlmClient {
  abstract generateResponse(prompt: string): Promise<string>;

  async generateText(prompt: string): Promise<string> {
    return this.generateResponse(prompt);
  }

  async generateJSON<T>(prompt: string): Promise<T> {
    const raw = await this.generateResponse(prompt);

    const cleaned = extractJson(raw);

    try {
      return JSON.parse(cleaned) as T;
    } catch (err) {
      throw new Error(
        `LLM did not return valid JSON.\n` +
        `Raw response:\n${raw}\n\n` +
        `Extracted candidate:\n${cleaned}`
      );
    }
  }
}