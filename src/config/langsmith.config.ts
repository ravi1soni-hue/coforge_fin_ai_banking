export function configureLangSmith() {
  // Enable tracing (fallback only if not defined)
  process.env.LANGCHAIN_TRACING_V2 ||= "true";

  // API key must come from .env
  if (!process.env.LANGCHAIN_API_KEY) {
    throw new Error("LANGCHAIN_API_KEY is missing in .env");
  }

  // Project name
  process.env.LANGCHAIN_PROJECT ||= "fin-ai-assistant";
}