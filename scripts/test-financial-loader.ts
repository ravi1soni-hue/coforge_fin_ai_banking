// Script to test FinancialLoader and print a sample profile
import { FinancialLoader } from '../src/agent_orchastration_v3/financialLoader.js';
import { VectorQueryService } from '../src/agent_orchastration_v3/services/vector.query.service.js';
import { LlmClient } from '../src/agent_orchastration_v3/llm/llmClient.js';
import { db } from '../dist/src/db.js';
import fs from 'fs';

const SEED_PATH = 'seed/corporate_treasury_seed.json';

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const userId = seed.user.id;
  const knownFacts = {
    ...seed.user,
    accounts: seed.accounts,
    intentType: 'corporate',
    profileCurrency: seed.user.base_currency,
  };

  // Instantiate loader with dummy LLM and vector service
  const vectorQuery = new VectorQueryService(db);
  const llm = new LlmClient();
  const loader = new FinancialLoader(vectorQuery, llm, db);

  const profile = await loader.loadProfile(userId, knownFacts);
  console.log('\n=== Loaded Financial Profile ===');
  console.log(profile);
}

main().catch(e => { console.error(e); process.exit(1); });
