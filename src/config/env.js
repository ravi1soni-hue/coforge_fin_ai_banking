import dotenv from "dotenv";
 
dotenv.config();
 
export const ENV = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL
};

// Validate required environment variables
export function validateEnv() {
  const required = ["DATABASE_URL", "OPENAI_API_KEY"];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required env variables: ${missing.join(", ")}`);
    process.exit(1);
  }
  
  console.log(`✅ Environment validated (${ENV.NODE_ENV} mode)`);
}