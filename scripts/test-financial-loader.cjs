// Script to test FinancialLoader and print a sample profile (CommonJS)

const { FinancialLoader } = require('../dist/src/agent_orchastration_v3/financialLoader.js');
const { VectorQueryService } = require('../dist/src/agent_orchastration_v3/services/vector.query.service.js');
const { db } = require('../dist/src/db.js');
const fs = require('fs');

const SEED_PATH = 'seed/corporate_treasury_seed.json';

// Mock LLM client with generateJSON method
class MockLlmClient {
  async generateJSON(prompt) {
    // Return realistic values for liquidity, income, expenses, etc.
    return {
      liquidity: 4800000,
      monthlyIncome: 650000,
      monthlyExpenses: 400000,
      netMonthlySurplus: 250000,
      currency: 'GBP',
      userName: 'James Walker / Northstar Treasury',
    };
  }
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const userId = seed.user.id;
  const knownFacts = {
    ...seed.user,
    accounts: seed.accounts,
    intentType: 'corporate',
    profileCurrency: seed.user.base_currency,
  };

  const vectorQuery = new VectorQueryService(db);
  const llm = new MockLlmClient();
  const loader = new FinancialLoader(vectorQuery, llm, db);

  const profile = await loader.loadProfile(userId, knownFacts);
  console.log('\n=== Loaded Financial Profile ===');
  console.log(profile);
}

main().catch(e => { console.error(e); process.exit(1); });
