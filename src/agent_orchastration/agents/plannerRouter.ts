import { GraphStateType } from "../graph/state.js";

export const plannerRouter = (state: GraphStateType) => {
  // Fast path: user confirmed a pending follow-up offer.
  // Skip financeAgent + webSearchAgent (vector + DDG calls) to avoid Railway timeout.
  if (state.confirmedFollowUpAction) return "lightPath";

  return state.missingFacts && state.missingFacts.length > 0
    ? "askUser"
    : "financeAgent";
};