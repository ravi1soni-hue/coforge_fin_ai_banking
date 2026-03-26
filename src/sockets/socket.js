import { WebSocketServer } from "ws";
import { handleMessageToSender } from "../services/message.handler.js";
 
const userConnections = new Map(); 
// userId -> Set<ws>

// Helper to send JSON message safely - DEFINED FIRST
const sendMessage = (ws, data) => {
  try {
    const jsonStr = JSON.stringify(data);
    console.log(`[sendMessage] Calling ws.send() with`, data.type);
    ws.send(jsonStr);
    console.log(`[sendMessage] ✅ ws.send() completed for`, data.type);
  } catch (error) {
    console.error(`[sendMessage] ❌ Exception in ws.send():`, error.message);
  }
};
 
export const initWebSocket = (server) => {
  console.log("[WebSocket] 🔌 Initializing WebSocket server...");
  const wss = new WebSocketServer({ server, perMessageDeflate: false });
  console.log("[WebSocket] ✅ WebSocketServer created");
 
  wss.on("connection", (ws, req) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const userId = url.searchParams.get("userId");
   
      if (!userId) {
        console.log("❌ No userId provided");
        ws.close(1008, "userId required");
        return;
      }
   
      ws.userId = userId;
      ws.isAlive = true;
   
      // Store connection
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId).add(ws);
   
      console.log(`✅ User connected: ${userId}`);
   
      // Send connection confirmation
      const deployMarker = "DEPLOY_TEST_" + Date.now();
      console.log(`[DEPLOY_MARKER] ${deployMarker}`);
      sendMessage(ws, {
        type: "CONNECTION_ESTABLISHED",
        payload: {
          message: `Welcome ${userId}!`,
          timestamp: Date.now(),
          deployMarker: deployMarker,
        },
      });
   
      ws.on("message", (message) => {
        try {
          const msgStr = message.toString();
          console.log(`[ws.on("message")] ✅ Message event fired for user ${userId}`);
          console.log(`[ws.on("message")] Raw data:`, msgStr.substring(0, 100));
          
          // SIMPLE ECHO - no logic, just send back immediately
          console.log(`[ws.on("message")] Sending echo response...`);
          sendMessage(ws, {
            type: "ECHO",
            payload: {
              echo: msgStr,
              received_at: Date.now()
            }
          });
          console.log(`[ws.on("message")] Echo sent, now calling handleMessageToSender...`);
          
          // Then call the actual handler
          handleMessageToSender(ws, msgStr).catch(err => {
            console.error(`[handleMessageToSender] Caught error:`, err.message);
          });
        } catch (error) {
          console.error(`[ws.on("message")] ❌ Exception:`, error.message, error.stack);
        }
      });
   
      ws.on("error", (error) => {
        console.error(`❌ WebSocket error for ${userId}:`, error);
      });

      ws.on("pong", () => {
        ws.isAlive = true;
      });
   
      ws.on("close", () => {
        const connections = userConnections.get(userId);
        connections?.delete(ws);
   
        if (connections?.size === 0) {
          userConnections.delete(userId);
        }
        console.log(`❌ User disconnected: ${userId}`);
      });
    } catch (error) {
      console.error("❌ Connection error:", error);
      ws.close(1011, "Server error");
    }
  });

  // Heartbeat to keep connections alive
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(heartbeat));
};

// Broadcast message to all connected users
const broadcastMessage = (senderId, message) => {
  userConnections.forEach((connections, userId) => {
    connections.forEach((ws) => {
      if (ws.readyState === 1) { // 1 = OPEN
        sendMessage(ws, {
          type: "BROADCAST",
          from: senderId,
          message: message,
          timestamp: Date.now()
        });
      }
    });
  });
};

// Helper to send message to specific user
export const sendToUser = (userId, message) => {
  const connections = userConnections.get(userId);
  if (connections) {
    connections.forEach((ws) => {
      if (ws.readyState === 1) {
        sendMessage(ws, message);
      }
    });
  }
};