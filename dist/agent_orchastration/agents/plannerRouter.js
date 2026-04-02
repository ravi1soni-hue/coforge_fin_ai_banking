export const plannerRouter = (state) => {
    return state.missingFacts && state.missingFacts.length > 0
        ? "askUser"
        : "financeAgent";
};
