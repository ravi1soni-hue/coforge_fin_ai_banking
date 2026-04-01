const isObject = (value) => typeof value === "object" && value !== null;
const asOptionalNonEmptyString = (value) => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new Error("Expected optional string field");
    }
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error("String field cannot be empty");
    }
    return trimmed;
};
export const parseClientSocketMessage = (payload) => {
    if (!isObject(payload)) {
        throw new Error("Expected object payload for CHAT_QUERY");
    }
    if (payload.v !== 1) {
        throw new Error("Unsupported message version");
    }
    if (payload.type !== "CHAT_QUERY") {
        throw new Error("Unsupported message type");
    }
    if (!isObject(payload.payload)) {
        throw new Error("Missing payload object");
    }
    const messageValue = payload.payload.message;
    if (typeof messageValue !== "string" || !messageValue.trim()) {
        throw new Error("payload.message must be a non-empty string");
    }
    const knownFactsValue = payload.payload.knownFacts;
    if (knownFactsValue !== undefined && !isObject(knownFactsValue)) {
        throw new Error("payload.knownFacts must be an object when provided");
    }
    const parsedMeta = payload.meta;
    if (parsedMeta !== undefined && !isObject(parsedMeta)) {
        throw new Error("meta must be an object when provided");
    }
    return {
        v: 1,
        type: "CHAT_QUERY",
        requestId: asOptionalNonEmptyString(payload.requestId),
        sessionId: asOptionalNonEmptyString(payload.sessionId),
        payload: {
            message: messageValue.trim(),
            knownFacts: knownFactsValue,
        },
        meta: parsedMeta === undefined
            ? undefined
            : {
                platform: asOptionalNonEmptyString(parsedMeta.platform),
                appVersion: asOptionalNonEmptyString(parsedMeta.appVersion),
                locale: asOptionalNonEmptyString(parsedMeta.locale),
                timezone: asOptionalNonEmptyString(parsedMeta.timezone),
            },
    };
};
