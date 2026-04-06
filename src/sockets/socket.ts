import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import crypto from "crypto";
import { container } from "../config/di.container.js";
import type { ChatService } from "../services/chat/chat.service.js";
import type { UserRepository } from "../repo/user.repo.js";
import {
  parseClientSocketMessage,
  type ServerSocketMessage,
} from "./socket.dto.js";

/**
 * userId -> active WebSocket connections
 */
const userConnections = new Map<string, Set<WebSocket>>();

// ✅ Resolve singletons from Awilix (typed)
const chatService = container.resolve<ChatService>("chatService");
const userRepo = container.resolve<UserRepository>("userRepo");

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
  const parsedMessage = parseClientSocketMessage(parsedJson);

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
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 64 * 1024,  // 64KB max message size
  });

  type TrackedWebSocket = WebSocket & {
    userId?: string;
    isAlive?: boolean;
  };

  // ⚡ Railway proxy kills idle streams after ~15-20s
  // Send pings every 3s to keep connection alive
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      const trackedClient = client as TrackedWebSocket;

      if (trackedClient.readyState !== WebSocket.OPEN) {
        return;
      }

      if (trackedClient.isAlive === false) {
        const staleUserId = trackedClient.userId ?? "unknown";
        console.warn(`⚠️ Terminating stale websocket connection for user ${staleUserId}`);
        trackedClient.terminate();
        return;
      }

      trackedClient.isAlive = false;
      trackedClient.ping(() => {
        // Pong received
      });
    });
  }, 3000);  // Ping every 3 seconds instead of 5

  server.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  server.on("upgrade", (req: IncomingMessage, socket: any, head: Buffer) => {
    try {
      // Ensure upgrade headers are valid
      const upgradeHeader = req.headers.upgrade?.toLowerCase() ?? "";
      const connectionHeader = req.headers.connection?.toLowerCase() ?? "";

      console.log("🔌 [UPGRADE] WebSocket request received", {
        url: req.url,
        method: req.method,
        upgradeHeader,
        connectionHeader,
        hasHead: head.length > 0,
        headers: {
          upgrade: req.headers.upgrade,
          connection: req.headers.connection,
          host: req.headers.host,
          "x-forwarded-proto": req.headers["x-forwarded-proto"],
          "x-forwarded-for": req.headers["x-forwarded-for"],
          "user-agent": req.headers["user-agent"],
        },
      });

      // Validate upgrade header
      if (upgradeHeader !== "websocket") {
        console.error("❌ [UPGRADE] Invalid upgrade header", {
          upgrade: req.headers.upgrade,
          connection: req.headers.connection,
        });
        socket.write("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
        socket.destroy();
        return;
      }

      // Validate connection header contains 'upgrade'
      if (!connectionHeader.includes("upgrade")) {
        console.error("❌ [UPGRADE] Connection header doesn't contain 'upgrade'", {
          connection: req.headers.connection,
        });
        socket.write("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
        socket.destroy();
        return;
      }

      const url = new URL(req.url ?? "", `http://${req.headers.host}`);
      const rawPath = url.pathname || "/";
      const pathname = rawPath.endsWith("/") && rawPath.length > 1
        ? rawPath.slice(0, -1)
        : rawPath;

      // Accept both legacy root path and explicit /ws path
      if (pathname !== "/" && pathname !== "/ws") {
        console.warn("⚠️ [UPGRADE] Rejected unsupported path", {
          path: rawPath,
          pathname,
          host: req.headers.host,
          url: req.url,
        });
        socket.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
        socket.destroy();
        return;
      }

      console.log("✅ [UPGRADE] Upgrading to WebSocket", { url: req.url, userId: url.searchParams.get("userId") });
      wss.handleUpgrade(req, socket, head, (ws) => {
        console.log("✅ [CONNECTION] WebSocket upgraded successfully");
        wss.emit("connection", ws, req);
      });
    } catch (err) {
      console.error("❌ [UPGRADE] WebSocket upgrade error:", err);
      try {
        socket.write("HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n");
      } catch {
        // Socket may already be closed
      }
      socket.destroy();
    }
  });

  wss.on(
    "connection",
    async (ws: TrackedWebSocket, req: IncomingMessage) => {
      const url = new URL(
        req.url ?? "",
        `http://${req.headers.host}`
      );

      const queryUserId = url.searchParams.get("userId");
      const headerUserId =
        typeof req.headers["x-user-id"] === "string"
          ? req.headers["x-user-id"]
          : undefined;
      const rawExternalId = queryUserId?.trim() || headerUserId?.trim();
      let userId: string;

      if (rawExternalId) {
        // Resolve external_user_id → internal UUID (vector_documents.user_id is UUID FK to users.id)
        const user = await userRepo.findByExternalId(rawExternalId).catch(() => undefined);
        userId = user?.id ?? rawExternalId;
        if (!user) {
          console.warn(
            "⚠️ No DB user found for external_user_id; using raw id for session",
            { rawExternalId }
          );
        }
      } else {
        userId = `anonymous-${crypto.randomUUID()}`;
        console.warn(
          "⚠️ WebSocket connection opened without explicit userId; assigned fallback id",
          { url: req.url, assignedUserId: userId }
        );
      }

      ws.userId = userId;
      ws.isAlive = true;
      ws.on("pong", () => {
        ws.isAlive = true;
      });

      // ✅ Store connection
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId)!.add(ws);

      console.log(`✅ User connected: ${userId} (total: ${wss.clients.size})`);

      /**
       * Message handler
       */
      ws.on("message", async (message: Buffer) => {
        let requestId: string = crypto.randomUUID();
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
            sessionId,
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

      ws.on("error", (err) => {
        console.error(`❌ WebSocket error for user ${userId}:`, err);
      });

      /**
       * Cleanup on close
       */
      ws.on("close", (code, reasonBuffer) => {
        const connections = userConnections.get(userId);
        connections?.delete(ws);

        if (!connections || connections.size === 0) {
          userConnections.delete(userId);
        }

        const reason =
          reasonBuffer && reasonBuffer.length > 0
            ? reasonBuffer.toString("utf8")
            : "no_reason";
        console.log(
          `❌ User disconnected: ${userId} (code=${code}, reason=${reason}, remaining=${wss.clients.size})`
        );
      });
    }
  );

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });
};