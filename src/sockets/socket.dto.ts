export interface ChatPayload {
  message: string;
  knownFacts?: Record<string, unknown>;
}

export interface ClientSocketMessage {
  v: 1;
  type: "CHAT_QUERY";
  requestId?: string;
  sessionId?: string;
  payload: ChatPayload;
  meta?: {
    platform?: string;
    appVersion?: string;
    locale?: string;
    timezone?: string;
  };
}

export interface ServerSocketSuccessMessage {
  v: 1;
  type: "CHAT_RESPONSE";
  requestId: string;
  sessionId?: string;
  status: "success";
  timestamp: string;
  data: {
    type: "FOLLOW_UP" | "FINAL" | "ERROR";
    message: string;
    missingFacts?: string[];
  };
}

export interface ServerSocketErrorMessage {
  v: 1;
  type: "CHAT_RESPONSE";
  requestId: string;
  sessionId?: string;
  status: "error";
  timestamp: string;
  error: {
    code: string;
    message: string;
    retriable: boolean;
  };
}

export type ServerSocketMessage =
  | ServerSocketSuccessMessage
  | ServerSocketErrorMessage;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asOptionalNonEmptyString = (value: unknown): string | undefined => {
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

export const parseClientSocketMessage = (
  payload: unknown
): ClientSocketMessage => {
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
      knownFacts: knownFactsValue as Record<string, unknown> | undefined,
    },
    meta:
      parsedMeta === undefined
        ? undefined
        : {
            platform: asOptionalNonEmptyString(parsedMeta.platform),
            appVersion: asOptionalNonEmptyString(parsedMeta.appVersion),
            locale: asOptionalNonEmptyString(parsedMeta.locale),
            timezone: asOptionalNonEmptyString(parsedMeta.timezone),
          },
  };
};