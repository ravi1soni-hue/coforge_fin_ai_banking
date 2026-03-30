import { GraphStateType } from "../graph/state.js";

export const plannerRouter = (state: GraphStateType) => {
  return state.missingFacts.length > 0
    ? "askUser"
    : "financeAgent";
};