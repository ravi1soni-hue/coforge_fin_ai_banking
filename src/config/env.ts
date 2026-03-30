import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`❌ Missing required environment variable: ${name}`);
  }
  return value;
}

export const ENV = {
  PORT: Number(process.env.PORT) || 3000,
  OPENAI_API_KEY: requireEnv("OPENAI_API_KEY"),
  DATABASE_URL: requireEnv("DATABASE_URL"),
};
