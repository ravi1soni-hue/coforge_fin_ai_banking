import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import crypto from "crypto";
import { container } from "../config/di.container.js";
import { ENV } from "../config/env.js";
import type { ChatServiceV3 } from "../agent_orchastration_v3/ChatServiceV3.js";
import type { User, UserRepository } from "../repo/user.repo.js";
import {
  parseClientSocketMessage,
  type ServerSocketMessage,
} from "./socket.dto.js";

const ACTIVE_PIPELINE = ENV.PIPELINE_VERSION.toUpperCase();
const CANONICAL_EXTERNAL_USER_ID = "corp-northstar-001";
// Removed LINKED_RETAIL_EXTERNAL_USER_ID (retail logic)

/**
 * userId -> active WebSocket connections
 */
const userConnections = new Map<string, Set<WebSocket>>();

// ✅ Resolve singletons from Awilix (typed)
const chatService = container.resolve<ChatServiceV3>("chatService");
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
    sessionId?: string;
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
      // Normalise headers — mobile proxies may lowercase, strip, or modify them
      const upgradeHeader = req.headers.upgrade?.toLowerCase().trim() ?? "";
      const connectionHeader = req.headers.connection?.toLowerCase().trim() ?? "";
      const originHeader = req.headers.origin ?? "";

      console.log("🔌 [UPGRADE] WebSocket request received", {
        url: req.url,
        method: req.method,
        upgradeHeader,
        connectionHeader,
        originHeader,
        hasHead: head.length > 0,
        headers: {
          upgrade: req.headers.upgrade,
          connection: req.headers.connection,
          origin: req.headers.origin,
          host: req.headers.host,
          "x-forwarded-proto": req.headers["x-forwarded-proto"],
          "x-forwarded-for": req.headers["x-forwarded-for"],
          "user-agent": req.headers["user-agent"],
        },
      });

      // --- Origin validation (allow all origins, mirrors HTTP CORS policy) ---
      // We log the origin but never reject based on it so mobile apps and
      // browser clients from any domain can connect.
      if (originHeader) {
        console.log("🌐 [UPGRADE] Origin header present — allowed", { origin: originHeader });
      } else {
        console.log("🌐 [UPGRADE] No Origin header (native mobile client or proxy stripped it) — allowed");
      }

      // --- Upgrade header validation (lenient, case-insensitive) ---
      // Some mobile proxies send "WebSocket", "WEBSOCKET", or include extra
      // whitespace.  We accept anything that contains "websocket".
      const upgradeIsWebSocket = upgradeHeader.includes("websocket");
      if (!upgradeIsWebSocket) {
        if (upgradeHeader === "") {
          // Header was stripped entirely by a proxy — log a warning but still
          // attempt the upgrade so the client gets a chance to connect.
          console.warn("⚠️ [UPGRADE] Missing upgrade header (likely stripped by mobile proxy) — attempting upgrade anyway", {
            upgrade: req.headers.upgrade,
            connection: req.headers.connection,
            "user-agent": req.headers["user-agent"],
          });
        } else {
          // Header is present but clearly not a WebSocket request — reject.
          console.error("❌ [UPGRADE] Invalid upgrade header — not a WebSocket request", {
            upgrade: req.headers.upgrade,
            upgradeHeader,
            connection: req.headers.connection,
            reason: `Expected header to contain 'websocket', got '${upgradeHeader}'`,
          });
          socket.write("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
          socket.destroy();
          return;
        }
      }

      // --- Connection header validation (lenient) ---
      // RFC 6455 requires "Upgrade" in the Connection header, but many mobile
      // network proxies strip or rewrite it.  We warn instead of rejecting so
      // legitimate mobile clients are not blocked.
      if (!connectionHeader.includes("upgrade")) {
        console.warn("⚠️ [UPGRADE] Connection header missing 'upgrade' token (may have been stripped by mobile proxy) — proceeding", {
          connection: req.headers.connection,
          connectionHeader,
          "user-agent": req.headers["user-agent"],
          reason: `Expected 'upgrade' in connection header, got '${connectionHeader || "(empty)"}'`,
        });
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
      const requestedUserIdentity = queryUserId?.trim() || headerUserId?.trim();

      // Log the actual database URL being used (mask password for security)
      const dbUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/(\w+):([^@]+)@/, '$1:****@') : 'undefined';
      console.log("[SOCKET][DEBUG] Using DATABASE_URL:", dbUrl);

      // Query and log all users in the table for debugging
      let allUsers: Array<{ id: any; external_user_id: any; status: any }> = [];
      try {
        // Use dynamic import for ESM compatibility
        const dbModule = await import("../db.js");
        allUsers = await dbModule.db.selectFrom("users").selectAll().execute();
        console.log("[SOCKET][DEBUG] All users in DB:", allUsers.map((u: { id: any; external_user_id: any; status: any; }) => ({ id: u.id, external_user_id: u.external_user_id, status: u.status })));
      } catch (err) {
        console.error("[SOCKET][DEBUG] Error querying all users:", err);
      }

      console.log("[SOCKET][CONNECT] Incoming connection", {
        url: req.url,
        queryUserId,
        headerUserId,
        requestedUserIdentity,
        headers: req.headers,
      });

      if (!requestedUserIdentity) {
        console.error("[SOCKET][CONNECT] Missing userId. Closing connection.", {
          url: req.url,
          headers: req.headers,
        });
        const errorPayload = {
          code: "1008",
          message: "Missing userId",
          retriable: false,
          dbUrl,
          allUsers: allUsers.map((u: { id: any; external_user_id: any; status: any; }) => ({ id: u.id, external_user_id: u.external_user_id, status: u.status })),
          requestedUserIdentity: null
        };
        console.log("[SOCKET][SEND][ERROR_PAYLOAD]", errorPayload);
        ws.send(JSON.stringify(errorPayload));
        ws.close(1008, "Missing userId");
        return;
      }

      // Single source of truth for identity: always resolve to canonical users.id,
      // whether client passes internal UUID or external_user_id.
      let resolvedUser;
      try {
        resolvedUser = await userRepo.findByIdentity(requestedUserIdentity);
        console.log("[SOCKET][CONNECT] userRepo.findByIdentity result", {
          requestedUserIdentity,
          resolvedUser,
        });
      } catch (err) {
        console.error("[SOCKET][CONNECT] Error in userRepo.findByIdentity", {
          requestedUserIdentity,
          error: err,
        });
        const errorPayload = {
          code: "1011",
          message: "DB lookup error",
          retriable: false,
          error: (err && typeof err === "object" && "message" in err) ? (err as any).message : String(err),
          dbUrl,
          allUsers: allUsers.map((u: { id: any; external_user_id: any; status: any; }) => ({ id: u.id, external_user_id: u.external_user_id, status: u.status })),
          requestedUserIdentity
        };
        console.log("[SOCKET][SEND][ERROR_PAYLOAD]", errorPayload);
        ws.send(JSON.stringify(errorPayload));
        ws.close(1011, "DB lookup error");
        return;
      }
      if (!resolvedUser) {
        console.error("[SOCKET][CONNECT] Unknown userId. Closing connection.", {
          requestedUserIdentity,
        });
        const errorPayload = {
          code: "1008",
          message: "Unknown userId",
          retriable: true,
          requestedUserIdentity,
          dbUrl,
          allUsers: allUsers.map((u: { id: any; external_user_id: any; status: any; }) => ({ id: u.id, external_user_id: u.external_user_id, status: u.status })),
        };
        console.log("[SOCKET][SEND][ERROR_PAYLOAD]", errorPayload);
        ws.send(JSON.stringify(errorPayload));
        ws.close(1008, "Unknown userId");
        return;
      }

      // Only use resolvedUser as activeUser (retail logic removed)
      const userId = resolvedUser.id;

      ws.userId = userId;
      ws.isAlive = true;
      // Keep a stable per-connection session when client omits sessionId.
      ws.sessionId = `ws-${crypto.randomUUID()}`;
      ws.on("pong", () => {
        ws.isAlive = true;
      });

      // ✅ Store connection
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      console.log("[SOCKET][CONNECT] Connection established", {
        userId,
        activeUser: resolvedUser,
        // linkedRetailUser removed
        totalClients: wss.clients.size,
      });
      userConnections.get(userId)!.add(ws);

      console.log(`✅ User connected: ${userId} (requested=${requestedUserIdentity}, external=${resolvedUser.external_user_id}, total=${wss.clients.size})`);

      // ✅ Proactively send diagnostic so Flutter preflight health check passes
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          v: 1,
          type: "diagnostic",
          status: "online",
          message: `FinAi is online and ready (${ACTIVE_PIPELINE})`,
          pipelineVersion: ENV.PIPELINE_VERSION,
          timestamp: new Date().toISOString(),
        }));
      }

      /**
       * Message handler
       */
      ws.on("message", async (message: Buffer) => {
        let requestId: string = crypto.randomUUID();
        let sessionId: string | undefined;

        try {
          const messageString = message.toString();
          console.log(`Received from ${userId}: ${messageString}`);

          // Handle preflight health check probe (Flutter sends {} to verify connectivity)
          if (messageString.trim() === "{}") {
            ws.send(JSON.stringify({
              v: 1,
              type: "diagnostic",
              status: "online",
              pipelineVersion: ENV.PIPELINE_VERSION,
              timestamp: new Date().toISOString(),
            }));
            return;
          }

          const parsedMessage = parseIncomingMessage(messageString);
          requestId = parsedMessage.requestId;
          if (parsedMessage.sessionId) {
            ws.sessionId = parsedMessage.sessionId;
          }
          sessionId = parsedMessage.sessionId ?? ws.sessionId;

          const knownFacts = {
            ...(parsedMessage.knownFacts ?? {}),
            userId,
            externalUserId: resolvedUser.external_user_id,
            canonicalExternalUserId: CANONICAL_EXTERNAL_USER_ID,
          };

          // ✅ Delegate logic to ChatService
          const result = await chatService.handleMessage({
            userId,
            message: parsedMessage.message,
            sessionId,
            knownFacts,
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