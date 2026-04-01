import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import crypto from "crypto";
import { container } from "../config/di.container.js";
import type { ChatService } from "../services/chat/chat.service.js";
import {
  ClientSocketMessageSchema,
  type ServerSocketMessage,
} from "./socket.dto.js";

/**
 * userId -> active WebSocket connections
 */
const userConnections = new Map<string, Set<WebSocket>>();

// ✅ Resolve singleton from Awilix (typed)
const chatService = container.resolve<ChatService>("chatService");

const buildErrorMessage = ({
  requestId,
  sessionId,
  code,
  message,
  retriable = false,
}: {
  requestId: string;
  sessionId?: string;
  code: string;
  message: string;
  retriable?: boolean;
}): ServerSocketMessage => ({
  v: 1,
  type: "CHAT_RESPONSE",
  requestId,
  sessionId,
  status: "error",
  timestamp: new Date().toISOString(),
  error: {
    code,
    message,
    retriable,
  },
});

const buildSuccessMessage = ({
  requestId,
  sessionId,
  data,
}: {
  requestId: string;
  sessionId?: string;
  data: {
    type: "FOLLOW_UP" | "FINAL" | "ERROR";
    message: string;
    missingFacts?: string[];
  };
}): ServerSocketMessage => ({
  v: 1,
  type: "CHAT_RESPONSE",
  requestId,
  sessionId,
  status: "success",
  timestamp: new Date().toISOString(),
  data,
});

const parseIncomingMessage = (rawMessage: string) => {
  const trimmed = rawMessage.trim();

  if (!trimmed) {
    throw new Error("Empty message payload");
  }

  // Backward compatibility: if payload is plain text, treat as CHAT_QUERY message
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return {
      requestId: crypto.randomUUID(),
      sessionId: undefined,
      message: trimmed,
      knownFacts: undefined as Record<string, unknown> | undefined,
    };
  }

  const parsedJson = JSON.parse(trimmed);
  const parsedMessage = ClientSocketMessageSchema.parse(parsedJson);

  return {
    requestId: parsedMessage.requestId ?? crypto.randomUUID(),
    sessionId: parsedMessage.sessionId,
    message: parsedMessage.payload.message,
    knownFacts: parsedMessage.payload.knownFacts,
  };
};

/**
 * Initialize WebSocket server
 */
export const initWebSocket = (server: any): void => {
  const wss = new WebSocketServer({ server });

  wss.on(
    "connection",
    (ws: WebSocket & { userId?: string }, req: IncomingMessage) => {
      const url = new URL(
        req.url ?? "",
        `http://${req.headers.host}`
      );

      const userId = url.searchParams.get("userId");

      if (!userId) {
        ws.close();
        return;
      }

      ws.userId = userId;

      // ✅ Store connection
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId)!.add(ws);

      console.log(`User connected: ${userId}`);

      /**
       * Message handler
       */
      ws.on("message", async (message: Buffer) => {
        let requestId = crypto.randomUUID();
        let sessionId: string | undefined;

        try {
          const messageString = message.toString();
          console.log(`Received from ${userId}: ${messageString}`);

          const parsedMessage = parseIncomingMessage(messageString);
          requestId = parsedMessage.requestId;
          sessionId = parsedMessage.sessionId;

          // ✅ Delegate logic to ChatService
          const result = await chatService.handleMessage({
            userId,
            message: parsedMessage.message,
            knownFacts: parsedMessage.knownFacts,
          });

          // ✅ Send response back to user
          ws.send(JSON.stringify(buildSuccessMessage({ requestId, sessionId, data: result })));
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Unknown error";

          const isValidationError =
            error instanceof SyntaxError ||
            /Invalid|Expected|Empty message payload|JSON/.test(errorMessage);

          ws.send(
            JSON.stringify(
              buildErrorMessage({
                requestId,
                sessionId,
                code: isValidationError
                  ? "INVALID_CLIENT_MESSAGE"
                  : "CHAT_REQUEST_FAILED",
                message: errorMessage,
                retriable: !isValidationError,
              })
            )
          );
        }
      });

      /**
       * Cleanup on close
       */
      ws.on("close", () => {
        const connections = userConnections.get(userId);
        connections?.delete(ws);

        if (!connections || connections.size === 0) {
          userConnections.delete(userId);
        }

        console.log(`User disconnected: ${userId}`);
      });
    }
  );
};