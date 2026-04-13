import { extractJson } from "../../utils/jsonExtractor.js";
export class LlmClient {
    async generateText(prompt) {
        return this.generateResponse(prompt);
    }
    async generateJSON(prompt) {
        const raw = await this.generateResponse(prompt);
        const cleaned = extractJson(raw);
        try {
            return JSON.parse(cleaned);
        }
        catch (err) {
            throw new Error(`LLM did not return valid JSON.\n` +
                `Raw response:\n${raw}\n\n` +
                `Extracted candidate:\n${cleaned}`);
        }
    }
}
