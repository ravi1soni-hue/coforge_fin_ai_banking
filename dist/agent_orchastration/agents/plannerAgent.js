// Extract facts from question text before checking what's missing
const extractFactsFromQuestion = (question) => {
    const lowerQ = question.toLowerCase();
    const facts = {};
    // Extract goalType from keywords
    const goalTypePatterns = {
        trip: /\b(trip|travel|vacation|holiday|visit)\b/,
        car: /\b(car|vehicle|automobile|bike|motorcycle|scooter)\b/,
        house: /\b(house|property|home|apartment|flat|mortgage|condo)\b/,
        phone: /\b(phone|smartphone|mobile|iphone|android)\b/,
        electronics: /\b(laptop|computer|tv|tablet|gadget|device)\b/,
        education: /\b(course|education|degree|university|college|training)\b/,
        wedding: /\bwedding\b/,
        medical: /\b(medical|surgery|procedure|treatment)\b/,
        appliance: /\b(appliance|fridge|washing machine|microwave)\b/,
    };
    for (const [type, pattern] of Object.entries(goalTypePatterns)) {
        if (pattern.test(lowerQ)) {
            facts.goalType = type;
            break;
        }
    }
    // Extract destination for trips
    const destinationMatch = lowerQ.match(/(?:to|in|visit|trip to|holiday to)\s+([A-Z][a-zA-Z\s]+?)(?:\s+for|\s+with|\s*£|\s*\$|$|\?)/i);
    if (destinationMatch) {
        facts.destination = destinationMatch[1].trim();
    }
    // Extract monetary amount (£, $, €, or just numbers)
    const amountMatch = question.match(/[£$€]?([\d,]+\.?\d*)/);
    if (amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
        if (Number.isFinite(amount) && amount > 0) {
            facts.targetAmount = amount;
        }
    }
    return facts;
};
export const plannerAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    // If intent is too low confidence, skip fact checking
    if (!state.intent || state.intent.confidence < 0.5) {
        return {
            missingFacts: [],
        };
    }
    const lowerQuestion = state.question.toLowerCase();
    const action = state.intent.action.toLowerCase();
    // Extract facts from question and merge with existing knownFacts
    const extractedFacts = extractFactsFromQuestion(state.question);
    const knownFacts = { ...extractedFacts, ...state.knownFacts }; // Preserve explicit state over auto-extracted
    const hasAffordabilityContext = knownFacts.queryType === "affordability" ||
        "targetAmount" in knownFacts ||
        "budget" in knownFacts ||
        "goalType" in knownFacts ||
        "destination" in knownFacts;
    const isAffordability = /afford|affordability|buy|purchase|plan|decision/.test(action) ||
        /\bcan i afford\b|\bnext month\b/.test(lowerQuestion) ||
        hasAffordabilityContext;
    const isSubscriptions = /subscription/.test(lowerQuestion);
    const isInvestmentPerformance = /investment/.test(lowerQuestion) && /profit|return|gain|loss/.test(lowerQuestion);
    const isStatement = /bank statement|statement/.test(lowerQuestion);
    // For affordability queries, identify critical missing facts
    if (isAffordability) {
        const missingFacts = [];
        // Check if goalType is provided (car, house, phone, trip, education, wedding, etc.)
        if (!knownFacts.goalType) {
            missingFacts.push("goalType");
        }
        // Check if target amount/budget is provided
        const hasTargetAmount = typeof knownFacts.targetAmount === "number" && knownFacts.targetAmount > 0;
        const hasBudget = typeof knownFacts.budget === "number" && knownFacts.budget > 0;
        if (!hasTargetAmount && !hasBudget) {
            missingFacts.push("targetAmount");
        }
        // For trips, check if destination is provided
        const goalType = typeof knownFacts.goalType === "string"
            ? knownFacts.goalType.toLowerCase()
            : "";
        const isTrip = goalType === "trip" || goalType === "travel" || goalType === "vacation" || goalType === "holiday";
        if (isTrip && !knownFacts.destination) {
            missingFacts.push("destination");
        }
        // Return early if critical facts are missing (user will be asked to provide them)
        if (missingFacts.length > 0) {
            return {
                missingFacts,
                knownFacts, // Persist extracted facts even if some are still missing
            };
        }
    }
    // For non-affordability queries, proceed without asking for facts
    if (isSubscriptions || isInvestmentPerformance || isStatement) {
        return {
            missingFacts: [],
        };
    }
    // Default: no missing facts required
    return {
        missingFacts: [],
        // Merge extracted facts back into state so they flow downstream
        knownFacts,
    };
};
