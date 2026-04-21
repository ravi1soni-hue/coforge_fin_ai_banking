import { OpenAiEmbeddingService } from "./openAi.embedding.service.js";

/**
 * Get embedding vector for a given text
 */
export async function getEmbeddingForText(
  text: string
): Promise<number[]> {
  const apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("EMBEDDING_API_KEY or OPENAI_API_KEY is not set in the environment variables.");
  }

  const embeddingService = new OpenAiEmbeddingService(apiKey);

  try {
    const embedding = await embeddingService.embed(text);
    return embedding;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error("Failed to get embedding: " + message);
  }
}