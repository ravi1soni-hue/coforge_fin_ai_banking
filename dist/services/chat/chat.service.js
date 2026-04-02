/* ---------------- Service ---------------- */
export class ChatService {
    assistantService;
    constructor({ assistantService, }) {
        this.assistantService = assistantService;
        console.log("✅ assistantService REAL instance:", assistantService.constructor.name);
    }
    /**
     * Handles a single chat turn
     */
    async handleMessage(request) {
        const initialState = {
            userId: request.userId,
            question: request.message,
            knownFacts: request.knownFacts ?? {},
            missingFacts: [],
        };
        let resultState;
        try {
            resultState =
                await this.assistantService.run(initialState);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("❌ ChatService error:", message);
            return {
                type: "ERROR",
                message: "Sorry, I ran into an internal problem while answering. Please try again.",
            };
        }
        /* ---------------- FOLLOW‑UP CASE ---------------- */
        if (Array.isArray(resultState.missingFacts) &&
            resultState.missingFacts.length > 0 &&
            !resultState.finalAnswer) {
            return {
                type: "FOLLOW_UP",
                message: "I need a bit more information to help you better.",
                missingFacts: resultState.missingFacts,
            };
        }
        /* ---------------- FINAL ANSWER CASE ---------------- */
        return {
            type: "FINAL",
            message: resultState.finalAnswer ??
                "I couldn’t generate an answer. Please try again.",
        };
    }
}
