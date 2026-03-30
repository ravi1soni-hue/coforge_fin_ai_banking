import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { container } from "../config/di.container.js";
import type { ChatService } from "../services/chat/chat.service.js";

/**
 * userId -> active WebSocket connections
 */
const userConnections = new Map<string, Set<WebSocket>>();

// ✅ Resolve singleton from Awilix (typed)
const chatService = container.resolve<ChatService>("chatService");

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
        try {
          const messageString = message.toString();
          console.log(`Received from ${userId}: ${messageString}`);

          // ✅ Delegate logic to ChatService
          const result = await chatService.handleMessage({
            userId,
            message: messageString,
          });

          // ✅ Send response back to user
          ws.send(
            JSON.stringify({
              status: "success",
              data: result,
              timestamp: new Date().toISOString(),
            })
          );
        } catch (error) {
          ws.send(
            JSON.stringify({
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Unknown error",
            })
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