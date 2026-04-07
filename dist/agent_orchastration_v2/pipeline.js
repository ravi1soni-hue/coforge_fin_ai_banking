/**
 * V2 Orchestration Pipeline — deterministic state machine.
 *
 * Routing decisions are NEVER made by the LLM.
 * The LLM is called ONLY to generate user-facing text.
 *
 * Stage transitions:
 *   GENERAL              + AFFORDABILITY_CHECK (no amount) → AWAITING_COST → ask for cost
 *   GENERAL              + AFFORDABILITY_CHECK (has amount) → VERDICT_GIVEN → deliver verdict
 *   AWAITING_COST        + message has amount              → VERDICT_GIVEN → deliver verdict
 *   AWAITING_COST        + no amount                       → re-ask
 *   VERDICT_GIVEN        + affirmative ("yes please do that") → PLAN_SUGGESTED → deliver plan
 *   VERDICT_GIVEN        + new unrelated question          → GENERAL → answer fresh
 *   GENERAL              + PLANNING (has time horizon)     → PLAN_SUGGESTED → deliver plan
 *   GENERAL              + PLANNING (no time horizon)      → AWAITING_TIME_HORIZON → ask
 *   AWAITING_TIME_HORIZON + any message                    → PLAN_SUGGESTED → deliver plan
 *   GENERAL              + INFO_ONLY                       → GENERAL → info answer
 *   GENERAL              + COMPARISON                      → GENERAL → comparison answer
 *   GENERAL              + ACTION_SUGGESTION               → GENERAL → general answer
 */
import { ConversationStore } from "./conversationStore.js";
import { FinancialLoader } from "./financialLoader.js";
import { isAffirmative, extractAmount, extractDestination, inferGoalTypeFromMessage, extractTimeHorizon, extractRequestedPlanMonths, } from "./messageParser.js";
import { classifyIntent, computeAffordabilityVerdict, computeShouldSuggestProduct, generateCostQuestion, generateTimeHorizonQuestion, generateAffordabilityAnswer, generatePlanSimulation, generatePlanningAnswer, generateInfoAnswer, generateComparisonAnswer, generateGeneralAnswer, } from "./responseGenerators.js";
export class PipelineV2 {
    llm;
    vectorQuery;
    chatRepo;
    sessionRepo;
    db;
    store;
    loader;
    /** In-process conversation history cache: sessionKey → turns */
    historyCache = new Map();
    constructor(llm, vectorQuery, chatRepo, sessionRepo, db) {
        this.llm = llm;
        this.vectorQuery = vectorQuery;
        this.chatRepo = chatRepo;
        this.sessionRepo = sessionRepo;
        this.db = db;
        this.store = new ConversationStore(sessionRepo);
        this.loader = new FinancialLoader(vectorQuery, llm, db);
    }
    // ─── Public entry point ────────────────────────────────────────────────────
    async handle(req) {
        const sid = req.sessionId ?? "default";
        const sessionKey = `${req.userId}::${sid}`;
        // Load conversation state & history in parallel
        const [v2State, history] = await Promise.all([
            this.store.load(req.userId, sid),
            this.loadHistory(req.userId, sid, sessionKey),
        ]);
        console.log(`[PipelineV2] userId=${req.userId} stage="${v2State.stage}" message="${req.message.slice(0, 60)}"`);
        // Load user financial profile from incoming knownFacts
        const profile = await this.loader.loadProfile(req.userId, req.knownFacts ?? {});
        // ── ROUTE ──────────────────────────────────────────────────────────────────
        let response;
        if (v2State.stage === "VERDICT_GIVEN" && isAffirmative(req.message)) {
            // ── PATH A: User consented to plan simulation ──────────────────────────
            console.log("[PipelineV2] PATH A — plan simulation (consent detected)");
            response = await this.handlePlanSimulation(req, profile, v2State, history);
            await this.store.save(req.userId, sid, { stage: "PLAN_SUGGESTED" });
        }
        else if (v2State.stage === "AWAITING_COST") {
            // ── PATH B: We asked for amount last turn — user is replying ──────────
            const extracted = extractAmount(req.message);
            if (extracted) {
                console.log(`[PipelineV2] PATH B — amount received: ${extracted.amount} ${extracted.currency}`);
                const goal = {
                    ...(v2State.goal ?? { goalType: inferGoalTypeFromMessage(req.message) }),
                    cost: extracted.amount,
                    currency: extracted.currency,
                };
                const verdict = computeAffordabilityVerdict(profile, goal);
                const { should, reason } = computeShouldSuggestProduct(verdict, req.message, profile, goal.cost);
                const answer = await generateAffordabilityAnswer(this.llm, profile, goal, verdict, should, reason, [...history, { role: "user", content: req.message }]);
                response = { type: "FINAL", message: answer };
                await this.store.save(req.userId, sid, {
                    stage: "VERDICT_GIVEN",
                    goal,
                    lastVerdict: verdict,
                    intent: v2State.intent,
                    domain: v2State.domain,
                    profile,
                });
            }
            else {
                // Still no amount — re-ask politely
                console.log("[PipelineV2] PATH B — no amount found, re-asking");
                const question = await generateCostQuestion(this.llm, req.message, v2State.goal);
                response = { type: "FOLLOW_UP", message: question, missingFacts: ["targetAmount"] };
                await this.store.save(req.userId, sid, { ...v2State });
            }
        }
        else if (v2State.stage === "AWAITING_TIME_HORIZON") {
            // ── PATH C: We asked for time horizon — user is replying ──────────────
            const timeHorizon = extractTimeHorizon(req.message) ?? req.message.trim();
            const goal = {
                ...(v2State.goal ?? { goalType: "SAVINGS" }),
                timeHorizon,
            };
            const answer = await generatePlanningAnswer(this.llm, this.vectorQuery, req.userId, req.message, profile, goal, [...history, { role: "user", content: req.message }]);
            response = { type: "FINAL", message: answer };
            await this.store.save(req.userId, sid, { stage: "PLAN_SUGGESTED", goal, profile });
        }
        else {
            // ── PATH D: GENERAL stage (or VERDICT_GIVEN + non-affirmative) ────────
            // Classify the message with a minimal LLM call
            const classification = await classifyIntent(this.llm, req.message, history);
            console.log(`[PipelineV2] PATH D — intent=${classification.intent} domain=${classification.domain} reasoning=${classification.reasoning}`);
            if (classification.intent === "AFFORDABILITY_CHECK") {
                const extracted = extractAmount(req.message);
                const destination = extractDestination(req.message);
                const goalType = inferGoalTypeFromMessage(req.message);
                const partialGoal = {
                    goalType,
                    metadata: destination ? { destination } : undefined,
                };
                if (extracted) {
                    // Have everything — run affordability now
                    const completeGoal = {
                        ...partialGoal,
                        cost: extracted.amount,
                        currency: extracted.currency,
                    };
                    const verdict = computeAffordabilityVerdict(profile, completeGoal);
                    const { should, reason } = computeShouldSuggestProduct(verdict, req.message, profile, completeGoal.cost);
                    const answer = await generateAffordabilityAnswer(this.llm, profile, completeGoal, verdict, should, reason, [...history, { role: "user", content: req.message }]);
                    response = { type: "FINAL", message: answer };
                    await this.store.save(req.userId, sid, {
                        stage: "VERDICT_GIVEN",
                        goal: completeGoal,
                        lastVerdict: verdict,
                        intent: classification.intent,
                        domain: classification.domain,
                        reasoning: classification.reasoning,
                        profile,
                    });
                }
                else {
                    // Need the amount — ask for it
                    const question = await generateCostQuestion(this.llm, req.message, partialGoal);
                    response = { type: "FOLLOW_UP", message: question, missingFacts: ["targetAmount"] };
                    await this.store.save(req.userId, sid, {
                        stage: "AWAITING_COST",
                        goal: partialGoal,
                        intent: classification.intent,
                        domain: classification.domain,
                        reasoning: classification.reasoning,
                        profile,
                    });
                }
            }
            else if (classification.intent === "PLANNING") {
                const timeHorizon = extractTimeHorizon(req.message);
                const extracted = extractAmount(req.message);
                const goalType = inferGoalTypeFromMessage(req.message);
                const goal = {
                    goalType,
                    timeHorizon,
                    cost: extracted?.amount,
                };
                if (extracted?.amount && !timeHorizon) {
                    // Has cost but no time horizon — ask for it
                    const question = await generateTimeHorizonQuestion(this.llm, req.message);
                    response = { type: "FOLLOW_UP", message: question, missingFacts: ["timeHorizon"] };
                    await this.store.save(req.userId, sid, {
                        stage: "AWAITING_TIME_HORIZON",
                        goal,
                        intent: classification.intent,
                        domain: classification.domain,
                        profile,
                    });
                }
                else {
                    const answer = await generatePlanningAnswer(this.llm, this.vectorQuery, req.userId, req.message, profile, goal, [...history, { role: "user", content: req.message }]);
                    response = { type: "FINAL", message: answer };
                    await this.store.save(req.userId, sid, { stage: "GENERAL", profile });
                }
            }
            else if (classification.intent === "COMPARISON") {
                const answer = await generateComparisonAnswer(this.llm, this.vectorQuery, req.userId, req.message, profile, [...history, { role: "user", content: req.message }]);
                response = { type: "FINAL", message: answer };
                await this.store.save(req.userId, sid, { stage: "GENERAL", profile });
            }
            else if (classification.intent === "INFO_ONLY") {
                const answer = await generateInfoAnswer(this.llm, this.vectorQuery, req.userId, req.message, profile, [...history, { role: "user", content: req.message }]);
                response = { type: "FINAL", message: answer };
                await this.store.save(req.userId, sid, { stage: "GENERAL", profile });
            }
            else {
                // ACTION_SUGGESTION or fallback
                const answer = await generateGeneralAnswer(this.llm, this.vectorQuery, req.userId, req.message, profile, [...history, { role: "user", content: req.message }]);
                response = { type: "FINAL", message: answer };
                await this.store.save(req.userId, sid, { stage: "GENERAL", profile });
            }
        }
        // ── Persist conversation history ───────────────────────────────────────
        const updatedHistory = [
            ...history,
            { role: "user", content: req.message },
            { role: "assistant", content: response.message },
        ].slice(-12);
        this.historyCache.set(sessionKey, updatedHistory);
        void this.chatRepo.saveMessage(req.userId, sid, "user", req.message);
        void this.chatRepo.saveMessage(req.userId, sid, "assistant", response.message);
        return response;
    }
    // ─── Private helpers ───────────────────────────────────────────────────────
    async handlePlanSimulation(req, profile, state, history) {
        if (!state.goal?.cost || state.goal.cost <= 0) {
            const question = await generateCostQuestion(this.llm, req.message);
            return { type: "FOLLOW_UP", message: question, missingFacts: ["targetAmount"] };
        }
        const verdict = state.lastVerdict ?? computeAffordabilityVerdict(profile, state.goal);
        const requestedMonths = extractRequestedPlanMonths(req.message);
        const answer = await generatePlanSimulation(this.llm, profile, state.goal, verdict, [...history, { role: "user", content: req.message }], requestedMonths);
        return { type: "FINAL", message: answer };
    }
    async loadHistory(userId, sessionId, sessionKey) {
        const cached = this.historyCache.get(sessionKey);
        if (cached)
            return cached;
        const dbHistory = await this.chatRepo.getHistory(userId, sessionId, 12);
        this.historyCache.set(sessionKey, dbHistory);
        return dbHistory;
    }
}
