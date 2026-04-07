/**
 * Banking Reasoning Engine — v2
 *
 * Pipeline per turn:
 *   1. classifyTurn  → TurnDecision { action, contract? }
 *      Deterministic fast-path for short affirmatives; buildContract() asks the LLM
 *      to emit a full IntentDataContract from context — no keyword matching in hot path.
 *   2a. CONFIRM_OFFER → resolveData(contract) → resolverRegistry[category] → LLM formats
 *   2b. NEW_QUESTION / PROVIDE_FACT → analysisPipeline (unchanged)
 *   2c. GENERAL_EXPLORATION → zero data fetch, LLM reasons freely from history
 *
 * IntentDataContract.needs drives ALL data resolution.
 * resolveData() reads `needs` flags — it never inspects `category`.
 * Resolvers are pluggable pure functions: add one per new banking use-case.
 */
// ─────────────────────────────────────────────────────────────────────────────
// BankingReasoningEngine
// ─────────────────────────────────────────────────────────────────────────────
export class BankingReasoningEngine {
    llm;
    vectorQuery;
    constructor(llm, vectorQuery) {
        this.llm = llm;
        this.vectorQuery = vectorQuery;
    }
    // ── Public entry point ─────────────────────────────────────────────────────
    async run(state) {
        const history = state.conversationHistory ?? [];
        const hasHistory = history.some(m => m.role === "assistant");
        console.log(`[ReasoningEngine] question="${state.question}" historyLen=${history.length}`);
        const decision = hasHistory
            ? await this.classifyTurn(state, history)
            : { action: "NEW_QUESTION", contract: null };
        console.log(`[ReasoningEngine] action=${decision.action} category=${decision.contract?.category ?? "n/a"}`);
        if (decision.action === "GREETING") {
            return {
                finalAnswer: "Hello! I'm your AI banking advisor. Ask me about affordability, investments, subscriptions, spending patterns, or financial planning.",
                missingFacts: [],
                knownFacts: state.knownFacts ?? {},
            };
        }
        if (decision.action === "CONFIRM_OFFER" && decision.contract) {
            return this.executeContract(state, decision.contract, history);
        }
        return this.analysisPipeline(state, history);
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Turn Classification → TurnDecision
    // ─────────────────────────────────────────────────────────────────────────────
    async classifyTurn(state, history) {
        const { question } = state;
        const wordCount = question.trim().split(/\s+/).length;
        const lastAssistant = [...history].reverse().find(m => m.role === "assistant")?.content ?? "";
        const lastMsgHasOffer = /want me to|shall i|would you like|let me|i can show|i can work|i can map|i can calculate/i.test(lastAssistant);
        // ── Deterministic fast-path ─────────────────────────────────────────────
        // Short affirmative after an explicit offer → CONFIRM_OFFER, always.
        // Run before any LLM call — the LLM sometimes misclassifies short messages.
        if (wordCount <= 10 && lastMsgHasOffer) {
            const isAffirmative = /^(yes|sure|ok|okay|please|yep|go ahead|do it|yes please|sounds good|absolutely|of course|great|perfect|please do|definitely)\b/i.test(question.trim());
            if (isAffirmative) {
                const taskMatch = lastAssistant.match(/(?:want me to|shall i|i can show you|i can show|i can|would you like me to|let me)\s+([^.?!\n]{10,180})/i);
                const task = taskMatch ? taskMatch[1].trim() : "continue from the last offer";
                console.log(`[ReasoningEngine] deterministic CONFIRM_OFFER task="${task.slice(0, 80)}"`);
                const contract = await this.buildContract(task, state);
                return { action: "CONFIRM_OFFER", contract };
            }
        }
        // ── End deterministic fast-path ────────────────────────────────────────
        if (wordCount > 15 || !lastMsgHasOffer) {
            return { action: "NEW_QUESTION", contract: null };
        }
        // Short non-affirmative with offer present — let LLM classify
        const recentStr = history
            .slice(-6)
            .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n");
        try {
            const raw = await this.llm.generateJSON(`
You are a turn classifier for a banking AI assistant.

RECENT CONVERSATION:
${recentStr}

NEW USER MESSAGE: "${question}"

Classify into ONE category:
  CONFIRM_OFFER — user agrees to the specific action the assistant offered.
  PROVIDE_FACT  — user is answering a specific question the assistant asked.
  NEW_QUESTION  — user is asking something new.
  GREETING      — small talk / thanks / goodbye.

Rules:
- "yes" / affirmative after an explicit offer → CONFIRM_OFFER.
- A number or fact as a direct reply to a question → PROVIDE_FACT.
- Do NOT set CONFIRM_OFFER if the last assistant message had no offer.
- For CONFIRM_OFFER: extract the offered task from the "Want me to..." / "Shall I..." clause.

Return ONLY valid JSON: { "action": "...", "task": "<offered task string or null>" }
`);
            // Safety override: if LLM disagrees with deterministic logic, trust deterministic
            if (raw.action === "NEW_QUESTION" && lastMsgHasOffer) {
                const lowerQ = question.trim().toLowerCase();
                if (/^(yes|sure|ok|okay|please|yep|go ahead|do it|sounds good|absolutely|of course|great|perfect|please do|definitely)/.test(lowerQ)) {
                    const taskMatch = lastAssistant.match(/(?:want me to|shall i|i can show you|i can show|i can|would you like me to|let me)\s+([^.?!\n]{10,180})/i);
                    const task = taskMatch ? taskMatch[1].trim() : "continue from the last offer";
                    console.log(`[ReasoningEngine] LLM override → CONFIRM_OFFER task="${task.slice(0, 80)}"`);
                    const contract = await this.buildContract(task, state);
                    return { action: "CONFIRM_OFFER", contract };
                }
            }
            if (raw.action === "CONFIRM_OFFER" && raw.task) {
                const contract = await this.buildContract(raw.task, state);
                return { action: "CONFIRM_OFFER", contract };
            }
            return { action: raw.action ?? "NEW_QUESTION", contract: null };
        }
        catch {
            return { action: "NEW_QUESTION", contract: null };
        }
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Contract Builder
    // LLM emits a full IntentDataContract — no domain keywords in the hot path.
    // fallbackContract() is keyword-based and only runs on LLM error.
    // ─────────────────────────────────────────────────────────────────────────────
    async buildContract(task, state) {
        try {
            const contract = await this.llm.generateJSON(`
You are a data-contract builder for a banking AI reasoning engine.

TASK TO DELIVER: "${task}"

KNOWN SESSION FACTS:
${JSON.stringify(state.knownFacts ?? {}, null, 2)}

Step 1 — Map the task to ONE IntentCategory:
  COMPUTE_SCHEDULE      — any payment schedule, instalment plan, savings rate
  BREAKDOWN_ALLOCATION  — any budget breakdown, cost split, daily category allocation
  TIMELINE_PROJECTION   — any recovery timeline, goal milestone, rebuild projection
  FETCH_PORTFOLIO       — any investment performance, ISA/fund balance, portfolio view
  AUDIT_RECURRING       — any subscription list, recurring charge review, cancellation audit
  CASHFLOW_ANALYSIS     — any income/expense analysis, monthly net position
  GENERAL_EXPLORATION   — open-ended, conversational, or does not fit any above category

Step 2 — List what data is genuinely needed to compute the answer (only true when required):
  targetAmount:  a specific cost, goal, or loan amount
  surplus:       monthly net income surplus
  savings:       spendable savings balance
  goals:         named savings goals and targets
  investments:   investment portfolio data
  transactions:  transaction or cashflow history
  subscriptions: recurring charges list
  periodMonths:  (number) only if a specific repayment period was mentioned
  allocationWeights: (object { "category": fraction }) only if custom splits apply

Step 3 — Write a precise vectorQuery to search the user's financial DB for required data.
  Be specific about the data type, not the domain topic.

Return ONLY valid JSON:
{
  "category": "COMPUTE_SCHEDULE",
  "task": "${task.replace(/"/g, '\\"')}",
  "needs": {
    "targetAmount": true,
    "surplus": true,
    "savings": true,
    "goals": false,
    "investments": false,
    "transactions": false,
    "subscriptions": false
  },
  "vectorQuery": "payment schedule and surplus data"
}
`);
            return contract;
        }
        catch {
            return this.fallbackContract(task);
        }
    }
    // Keyword fallback — only runs if LLM throws. Domain keywords are isolated here.
    fallbackContract(task) {
        const t = task.toLowerCase();
        if (/instalment|repayment|spread.*pay|payment.*plan|0%|schedule|run.*numbers/i.test(t))
            return { category: "COMPUTE_SCHEDULE", task, needs: { targetAmount: true, surplus: true, savings: true, goals: false, investments: false, transactions: false, subscriptions: false }, vectorQuery: "payment schedule surplus data" };
        if (/budget|breakdown|daily.*budget|allocation|map.*out|itinerar/i.test(t))
            return { category: "BREAKDOWN_ALLOCATION", task, needs: { targetAmount: true, surplus: false, savings: true, goals: false, investments: false, transactions: false, subscriptions: false }, vectorQuery: "trip budget allocation data" };
        if (/recover|rebuild|restore|timeline|goal.*sav|sav.*for/i.test(t))
            return { category: "TIMELINE_PROJECTION", task, needs: { targetAmount: false, surplus: true, savings: true, goals: true, investments: false, transactions: false, subscriptions: false }, vectorQuery: "savings goals timeline data" };
        if (/invest|isa|fund|portfolio|return|performance|growth/i.test(t))
            return { category: "FETCH_PORTFOLIO", task, needs: { targetAmount: false, surplus: false, savings: false, goals: false, investments: true, transactions: false, subscriptions: false }, vectorQuery: "investment portfolio balance data" };
        if (/subscri|recurring|streaming|cancel|membership/i.test(t))
            return { category: "AUDIT_RECURRING", task, needs: { targetAmount: false, surplus: false, savings: false, goals: false, investments: false, transactions: false, subscriptions: true }, vectorQuery: "recurring subscriptions charges data" };
        if (/cashflow|income|expense|spending|statement|balance/i.test(t))
            return { category: "CASHFLOW_ANALYSIS", task, needs: { targetAmount: false, surplus: true, savings: true, goals: false, investments: false, transactions: true, subscriptions: false }, vectorQuery: "monthly cashflow income expenses data" };
        return { category: "GENERAL_EXPLORATION", task, needs: { targetAmount: false, surplus: false, savings: false, goals: false, investments: false, transactions: false, subscriptions: false }, vectorQuery: task };
    }
    // ─── Pluggable resolver registry ─────────────────────────────────────────────
    // Pure functions: (contract, resolved) → pre-computed data table for the LLM.
    // Add one resolver + register it to support any new banking use-case.
    // ─────────────────────────────────────────────────────────────────────────────
    resolverRegistry = {
        COMPUTE_SCHEDULE: (_contract, d) => {
            if (d.targetAmount === null)
                return "Target amount not in session — use best available estimate.";
            const { targetAmount: amt, surplus, savings, goalCurrency: gc, homeCurrency: hc } = d;
            const periods = [3, 6, 12];
            const lines = [`Payment schedule options for ${gc}${amt.toFixed(0)}:`];
            for (const p of periods) {
                lines.push(`  ${String(p).padStart(2)} months:  ${gc}${(amt / p).toFixed(0)}/month`);
            }
            if (surplus !== null) {
                lines.push(`Monthly surplus available: ${hc}${surplus.toFixed(0)}`);
                const fits = periods.filter(p => amt / p <= surplus);
                lines.push(fits.length > 0
                    ? `Fundable from surplus alone: ${fits.map(p => `${p}-month`).join(", ")}`
                    : `No period fits within surplus — all plans draw from savings`);
            }
            if (savings !== null) {
                lines.push(`Savings remaining if paid as lump sum: ${hc}${(savings - amt).toFixed(0)}`);
            }
            return lines.join("\n");
        },
        BREAKDOWN_ALLOCATION: (contract, d) => {
            if (d.targetAmount === null)
                return "Target amount not in session — use best available estimate.";
            const { targetAmount: amt, savings, goalCurrency: gc, homeCurrency: hc, days } = d;
            const weights = contract.needs.allocationWeights ?? {
                accommodation: 0.40, food: 0.22, transport: 0.22, activities: 0.16,
            };
            const lines = [`Budget allocation for ${gc}${amt.toFixed(0)} (${days} days):`];
            for (const [cat, w] of Object.entries(weights)) {
                const total = amt * w;
                lines.push(`  ${cat.padEnd(16)} ${gc}${total.toFixed(0)}  (${gc}${(total / days).toFixed(0)}/day)`);
            }
            const accomSave = amt * (weights.accommodation ?? 0.40) * 0.35;
            const foodSave = amt * (weights.food ?? 0.22) * 0.30;
            lines.push(`Trimming opportunities:`);
            lines.push(`  Mid-range hotel:   save ${gc}${accomSave.toFixed(0)}`);
            lines.push(`  Self-catering:     save ${gc}${foodSave.toFixed(0)}`);
            lines.push(`Trimmed total: ${gc}${(amt - accomSave - foodSave).toFixed(0)}`);
            if (savings !== null)
                lines.push(`Savings remaining after full spend: ${hc}${(savings - amt).toFixed(0)}`);
            return lines.join("\n");
        },
        TIMELINE_PROJECTION: (_contract, d) => {
            const { targetAmount: amt, surplus, savings, homeCurrency: hc } = d;
            if (surplus === null || savings === null)
                return "Insufficient numeric data — use DB context below.";
            const lines = [`Timeline projection:`];
            if (amt !== null) {
                lines.push(`  Savings after purchase:        ${hc}${(savings - amt).toFixed(0)}`);
                lines.push(`  Months to rebuild at ${hc}${surplus.toFixed(0)}/mo: ${Math.ceil(amt / surplus)}`);
                const boosted = surplus + 200;
                lines.push(`  Months at ${hc}${boosted.toFixed(0)}/mo (+${hc}200 boost):  ${Math.ceil(amt / boosted)}`);
            }
            else {
                lines.push(`  Current savings:  ${hc}${savings.toFixed(0)}`);
                lines.push(`  Monthly surplus:  ${hc}${surplus.toFixed(0)}`);
                lines.push(`  Goal details sourced from DB context.`);
            }
            return lines.join("\n");
        },
        FETCH_PORTFOLIO: (_contract, d) => d.dbContext.slice(0, 1200) || "Portfolio data: no DB results — use available session context.",
        AUDIT_RECURRING: (_contract, d) => d.dbContext.slice(0, 1200) || "Subscription data: no DB results — use available session context.",
        CASHFLOW_ANALYSIS: (_contract, d) => {
            const { surplus, savings, homeCurrency: hc, dbContext } = d;
            const lines = [];
            if (surplus !== null)
                lines.push(`Net monthly surplus: ${hc}${surplus.toFixed(0)}`);
            if (savings !== null)
                lines.push(`Spendable savings:   ${hc}${savings.toFixed(0)}`);
            if (dbContext)
                lines.push(`\nDetailed cashflow data:\n${dbContext.slice(0, 1000)}`);
            return lines.join("\n") || "Cashflow data: no DB results — use available session context.";
        },
        // Zero pre-computation — LLM reasons freely from history + DB context
        GENERAL_EXPLORATION: () => "",
    };
    // ─────────────────────────────────────────────────────────────────────────────
    // Contract Execution: resolveData → resolver → LLM formats
    // ─────────────────────────────────────────────────────────────────────────────
    async executeContract(state, contract, history) {
        console.log(`[ReasoningEngine] executeContract category=${contract.category} task="${contract.task.slice(0, 80)}"`);
        const resolved = await this.resolveData(contract, state);
        const precomputed = this.resolverRegistry[contract.category](contract, resolved);
        const recentStr = history
            .slice(-6)
            .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n");
        const answer = await this.llm.generateText(`
You are a financial reasoning engine delivering a specific banking analysis.
The user has CONFIRMED an offer. Deliver exactly that — nothing else.

CONVERSATION:
${recentStr}
User: ${state.question}

TASK: "${contract.task}"

PRE-COMPUTED DATA (use these numbers exactly — do not recalculate):
${precomputed || "(open-ended — reason from conversation history and DB context below)"}
${resolved.dbContext && contract.category !== "GENERAL_EXPLORATION" ? `\nDB CONTEXT:\n${resolved.dbContext.slice(0, 600)}` : ""}
RULES:
1. Do NOT mention affordability or restate whether the user can afford anything.
2. Do NOT start with "You", "Your", "Based", "Given", "Since", "As".
3. Start directly with the first concrete number, option, or step.
4. Use bullet points or a numbered list for multiple options.
5. Maximum 6 lines or 4 bullet points.
6. End with ONE forward-looking offer on the NEXT logical step (different from what was just delivered).
`);
        console.log(`[ReasoningEngine] contract answer="${answer.slice(0, 120)}..."`);
        return {
            finalAnswer: answer,
            missingFacts: [],
            knownFacts: state.knownFacts ?? {},
        };
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Data Resolver — reads contract.needs flags, never contract.category
    // ─────────────────────────────────────────────────────────────────────────────
    async resolveData(contract, state) {
        const kf = state.knownFacts ?? {};
        const hc = String(kf.profileCurrency ?? kf.currency ?? "GBP");
        const gc = String(kf.targetCurrency ?? hc);
        const targetAmount = contract.needs.targetAmount
            ? (typeof kf.targetAmount === "number" ? kf.targetAmount : null)
            : null;
        const surplus = contract.needs.surplus
            ? (typeof kf.netMonthlySavings === "number" ? kf.netMonthlySavings
                : typeof kf.netMonthlySurplus === "number" ? kf.netMonthlySurplus
                    : null)
            : null;
        const savings = contract.needs.savings
            ? (typeof kf.availableSavings === "number" ? kf.availableSavings
                : typeof kf.spendable_savings === "number" ? kf.spendable_savings
                    : typeof kf.currentBalance === "number" ? kf.currentBalance
                        : null)
            : null;
        const destination = typeof kf.destination === "string" ? kf.destination : "the purchase";
        const durationStr = typeof kf.duration === "string" ? kf.duration : "";
        const days = Number(durationStr.replace(/\D/g, "")) || 3;
        // GENERAL_EXPLORATION → zero DB fetch; all other categories use vectorQuery
        let dbContext = "";
        if (contract.category !== "GENERAL_EXPLORATION") {
            try {
                dbContext = await this.vectorQuery.getContext(state.userId, `${contract.vectorQuery} for user ${state.userId}`, { topK: 8 });
            }
            catch {
                // non-fatal — resolvers handle empty dbContext gracefully
            }
        }
        return { targetAmount, surplus, savings, homeCurrency: hc, goalCurrency: gc, destination, days, dbContext, kf };
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Standard Analysis Pipeline  (new questions / provided facts)
    // ─────────────────────────────────────────────────────────────────────────────
    async analysisPipeline(state, history) {
        // 1. Extract and validate facts
        const factResult = await this.extractAndValidateFacts(state, history);
        const mergedFacts = { ...state.knownFacts, ...factResult.extractedFacts };
        // 2. Missing facts → FOLLOW_UP
        if (factResult.missingFacts.length > 0) {
            return {
                finalAnswer: factResult.followUpQuestion,
                missingFacts: factResult.missingFacts,
                knownFacts: mergedFacts,
            };
        }
        // 3. Fetch financial data from vector DB
        let financialContext = "";
        try {
            financialContext = await this.vectorQuery.getContext(state.userId, `full financial profile for ${state.userId}. Question: ${state.question}`, { topK: 10 });
        }
        catch {
            // continue without DB context — LLM will note data is limited
        }
        // 4. Generate the analysis
        const recentStr = history
            .slice(-6)
            .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n");
        const hc = String(mergedFacts.profileCurrency ?? mergedFacts.currency ?? "GBP");
        const gc = String(mergedFacts.targetCurrency ?? hc);
        const answer = await this.llm.generateText(`
You are a senior banking advisor and financial reasoning engine.
Your role is to think through the user's financial situation and give a specific, data-driven answer.
You are NOT a chatbot that gives generic yes/no responses.

CONVERSATION CONTEXT:
${recentStr}

USER'S QUESTION: "${state.question}"

FINANCIAL DATA FROM DATABASE:
${financialContext.slice(0, 2500)}

EXTRACTED FACTS FROM THIS CONVERSATION:
${JSON.stringify(mergedFacts, null, 2)}

HOME CURRENCY: ${hc}   GOAL CURRENCY: ${gc}

HOW TO RESPOND — pick the right analysis mode:

AFFORDABILITY (can I afford X):
  - Use spendable_savings or availableSavings ONLY. Not the current account — that covers monthly living.
  - Subtract at minimum 1 month of expenses as an emergency buffer before calculating headroom.
  - Give a clear verdict (yes / conditional / not yet) with exact figures.
  - End with ONE actionable next-step offer ("Want me to...").

SUBSCRIPTIONS (recurring charges, streaming, SaaS):
  - List named subscriptions with amounts. Identify ones unused or duplicated.
  - Give the exact annual saving achievable by cutting waste.

INVESTMENTS (ISA, funds, Premium Bonds, performance):
  - Cite actual balance and contribution figures from the database.
  - Give a concrete return figure if available. Flag if data is insufficient.

BANK STATEMENT / CASHFLOW:
  - Give actual totals (income, expenses, net) for the relevant period.
  - Highlight the top spending category.

PLANNING / GOAL SAVING:
  - Give a concrete monthly savings target and a specific timeline.

FORMAT RULES:
- Lead with the most important finding or verdict.
- Back it with 2-3 specific numbers from the data.
- Max 5 sentences total.
- Close with ONE specific follow-up offer (start with "Want me to..." or "Shall I...").
- Use ${hc} for home-currency figures, ${gc} for goal-specific amounts.
- Never say "I don't have enough data" without also giving the best estimate available.
`);
        return {
            finalAnswer: answer,
            missingFacts: [],
            knownFacts: mergedFacts,
        };
    }
    async extractAndValidateFacts(state, history) {
        const recentStr = history
            .slice(-4)
            .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n");
        const result = await this.llm.generateJSON(`
You are a fact extractor for a banking assistant.

CONVERSATION SO FAR:
${recentStr}

CURRENT USER MESSAGE: "${state.question}"

ALREADY KNOWN FACTS (do NOT ask for these again):
${JSON.stringify(state.knownFacts ?? {})}

STEP 1 — Classify the query type:
  affordability  — user wants to know if they can afford a specific purchase, trip, or item
  subscriptions  — subscriptions, recurring charges, streaming, SaaS
  investments    — ISA, funds, Premium Bonds, portfolio performance
  statement      — account balance, transactions, monthly cashflow
  general        — planning, advice, comparison, anything else

STEP 2 — Extract facts explicitly stated in the CURRENT message:
  goalType        : string | null   (trip, car, phone, house, etc.)
  destination     : string | null   (city or country if mentioned)
  targetAmount    : number | null   (numeric cost — parse "2200 euros" → 2200)
  targetCurrency  : string | null   (EUR, GBP, USD, etc.)
  duration        : string | null   ("3 days", "2 weeks", etc.)
  timeframe       : string | null   ("next month", "this year", etc.)
Set to null if NOT explicitly stated in this specific message.

STEP 3 — Determine genuinely missing facts:
  - For affordability ONLY: need targetAmount (numeric goal cost).
  - A fact is missing ONLY if absent from BOTH this message AND the already-known facts above.
  - If targetAmount is in known facts → missingFacts = [].
  - For subscriptions / investments / statement / general → missingFacts = [].

STEP 4 — If missingFacts is non-empty, write ONE concise, natural question to ask the user.
Example: "How much do you expect the entire trip to cost?"

Return ONLY valid JSON (no markdown):
{
  "queryCategory": "affordability" | "subscriptions" | "investments" | "statement" | "general",
  "extractedFacts": { "goalType": null, "destination": null, "targetAmount": null, "targetCurrency": null, "duration": null, "timeframe": null },
  "missingFacts": [],
  "followUpQuestion": null
}
`);
        // Strip nulls from extracted facts
        const cleanFacts = Object.fromEntries(Object.entries(result.extractedFacts ?? {}).filter(([, v]) => v !== null && v !== undefined));
        // Currency safety: if a foreign goal currency was extracted, store as targetCurrency
        // so the user's home currency (profileCurrency) is never overwritten.
        if (cleanFacts.targetCurrency) {
            const home = (state.knownFacts?.profileCurrency ?? state.knownFacts?.currency);
            if (home && cleanFacts.targetCurrency !== home) {
                delete cleanFacts.currency; // don't let goal currency pollute home currency field
            }
        }
        return {
            extractedFacts: cleanFacts,
            missingFacts: Array.isArray(result.missingFacts) ? result.missingFacts : [],
            followUpQuestion: result.followUpQuestion ?? "Could you give me a bit more detail?",
            queryCategory: result.queryCategory ?? "general",
        };
    }
}
