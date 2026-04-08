/**
 * LangGraph state definition for the Financial Assistant graph.
 *
 * Every field uses a "last-writer-wins" reducer (the default) so parallel
 * nodes freely update di­fferent keys without conflict.
 *
 * Parallel nodes in this graph:
 *   fetchPrice + fetchFx  → both run concurrently after extractIntent
 *   They write to priceData and fxData respectively — no overlap, no conflict.
 */
import { Annotation } from "@langchain/langgraph";
export const GraphStateAnnotation = Annotation.Root({
    // ── Input (set once at graph entry) ────────────────────────────────────────
    userId: (Annotation),
    sessionId: (Annotation),
    userMessage: (Annotation),
    // ── Loaded context ──────────────────────────────────────────────────────────
    profile: (Annotation),
    history: (Annotation),
    // ── Parsed intent ───────────────────────────────────────────────────────────
    /** Product name extracted from the user message, e.g. "iPhone 17 Pro Max" */
    product: (Annotation),
    /** User-provided cost (null = unknown, need to fetch) */
    costProvided: (Annotation),
    /** Currency the user mentioned for the cost */
    costCurrency: (Annotation),
    /** True when the user's message is confirming an EMI / instalments request */
    isEmiConfirmation: (Annotation),
    /**
     * Cost extracted from the most recent RISKY/CANNOT_AFFORD response in
     * history — used when the user later confirms EMI.
     */
    prevCost: (Annotation),
    prevCostCurrency: (Annotation),
    // ── Parallel tool results ───────────────────────────────────────────────────
    /** Output of fetchLivePrice — null if the user supplied an explicit cost */
    priceData: (Annotation),
    /** Output of fetchMarketData — null if no currency conversion needed */
    fxData: (Annotation),
    // ── Sequential tool results ─────────────────────────────────────────────────
    affordabilityData: (Annotation),
    // ── Final output ────────────────────────────────────────────────────────────
    response: (Annotation),
});
