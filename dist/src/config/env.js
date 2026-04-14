import dotenv from "dotenv";
dotenv.config();
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`❌ Missing required environment variable: ${name}`);
    }
    return value;
}
function optionalEnv(name, fallback) {
    const value = process.env[name];
    return value && value.trim() ? value : fallback;
}
function optionalInt(name, fallback) {
    const value = process.env[name];
    if (!value) {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
export const ENV = {
    PORT: Number(process.env.PORT) || 3000,
    OPENAI_API_KEY: requireEnv("OPENAI_API_KEY"),
    DATABASE_URL: requireEnv("DATABASE_URL"),
    MARKET_DATA_STOOQ_BASE_URL: optionalEnv("MARKET_DATA_STOOQ_BASE_URL", "https://stooq.com"),
    MARKET_DATA_FX_BASE_URL: optionalEnv("MARKET_DATA_FX_BASE_URL", "https://api.frankfurter.app"),
    MARKET_DATA_TIMEOUT_MS: optionalInt("MARKET_DATA_TIMEOUT_MS", 3500),
    /**
     * Pipeline version selector.
     * Set PIPELINE_VERSION=v3 in your .env or Railway environment variables
     * to switch to the V3 agentic tool-calling pipeline.
     * Defaults to "v2" (deterministic state-machine pipeline).
     */
    PIPELINE_VERSION: optionalEnv("PIPELINE_VERSION", "v3"),
    SERPER_API_KEY: optionalEnv("SERPER_API_KEY", "58955909affd1968515ddf0c7a4376c0ae63021a"),
    RAILWAY_PUBLIC_URL: optionalEnv("RAILWAY_PUBLIC_URL", "coforgefinaibanking-testingv3.up.railway.app"),
};
