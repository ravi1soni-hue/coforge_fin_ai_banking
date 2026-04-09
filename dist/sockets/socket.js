import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import { container } from "../config/di.container.js";
import { ENV } from "../config/env.js";
import { parseClientSocketMessage, } from "./socket.dto.js";
const ACTIVE_PIPELINE = ENV.PIPELINE_VERSION.toUpperCase();
/**
 * userId -> active WebSocket connections
 */
const userConnections = new Map();
// ✅ Resolve singletons from Awilix (typed)
const chatService = container.resolve("chatService");
const userRepo = container.resolve("userRepo");
const buildErrorMessage = ({ requestId, sessionId, code, message, retriable = false, }) => ({
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
const buildSuccessMessage = ({ requestId, sessionId, data, }) => ({
    v: 1,
    type: "CHAT_RESPONSE",
    requestId,
    sessionId,
    status: "success",
    timestamp: new Date().toISOString(),
    data,
});
const parseIncomingMessage = (rawMessage) => {
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
            knownFacts: undefined,
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
export const initWebSocket = (server) => {
    const wss = new WebSocketServer({
        noServer: true,
        perMessageDeflate: false,
        maxPayload: 64 * 1024, // 64KB max message size
    });
    // ⚡ Railway proxy kills idle streams after ~15-20s
    // Send pings every 3s to keep connection alive
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach((client) => {
            const trackedClient = client;
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
    }, 3000); // Ping every 3 seconds instead of 5
    server.on("close", () => {
        clearInterval(heartbeatInterval);
    });
    server.on("upgrade", (req, socket, head) => {
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
        }
        catch (err) {
            console.error("❌ [UPGRADE] WebSocket upgrade error:", err);
            try {
                socket.write("HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n");
            }
            catch {
                // Socket may already be closed
            }
            socket.destroy();
        }
    });
    wss.on("connection", async (ws, req) => {
        const url = new URL(req.url ?? "", `http://${req.headers.host}`);
        const queryUserId = url.searchParams.get("userId");
        const headerUserId = typeof req.headers["x-user-id"] === "string"
            ? req.headers["x-user-id"]
            : undefined;
        const rawExternalId = queryUserId?.trim() || headerUserId?.trim();
        let userId;
        if (rawExternalId) {
            // Resolve external_user_id → internal UUID (vector_documents.user_id is UUID FK to users.id)
            const user = await userRepo.findByExternalId(rawExternalId).catch(() => undefined);
            userId = user?.id ?? rawExternalId;
            if (!user) {
                console.warn("⚠️ No DB user found for external_user_id; using raw id for session", { rawExternalId });
            }
        }
        else {
            userId = `anonymous-${crypto.randomUUID()}`;
            console.warn("⚠️ WebSocket connection opened without explicit userId; assigned fallback id", { url: req.url, assignedUserId: userId });
        }
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
        userConnections.get(userId).add(ws);
        console.log(`✅ User connected: ${userId} (total: ${wss.clients.size})`);
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
        ws.on("message", async (message) => {
            let requestId = crypto.randomUUID();
            let sessionId;
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
                // ✅ Delegate logic to ChatService
                const result = await chatService.handleMessage({
                    userId,
                    message: parsedMessage.message,
                    sessionId,
                    knownFacts: parsedMessage.knownFacts,
                });
                // ✅ Send response back to user
                ws.send(JSON.stringify(buildSuccessMessage({ requestId, sessionId, data: result })));
            }
            catch (error) {
                const errorMessage = error instanceof Error
                    ? error.message
                    : "Unknown error";
                const isValidationError = error instanceof SyntaxError ||
                    /Invalid|Expected|Empty message payload|JSON/.test(errorMessage);
                ws.send(JSON.stringify(buildErrorMessage({
                    requestId,
                    sessionId,
                    code: isValidationError
                        ? "INVALID_CLIENT_MESSAGE"
                        : "CHAT_REQUEST_FAILED",
                    message: errorMessage,
                    retriable: !isValidationError,
                })));
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
            const reason = reasonBuffer && reasonBuffer.length > 0
                ? reasonBuffer.toString("utf8")
                : "no_reason";
            console.log(`❌ User disconnected: ${userId} (code=${code}, reason=${reason}, remaining=${wss.clients.size})`);
        });
    });
    wss.on("close", () => {
        clearInterval(heartbeatInterval);
    });
};
