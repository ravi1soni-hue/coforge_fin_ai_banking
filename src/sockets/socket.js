import { WebSocketServer } from "ws";
import { handleMessageToSender } from "../services/message.handler.js";
 
const userConnections = new Map(); 
// userId -> Set<ws>

// Helper to send JSON message safely - DEFINED FIRST
const sendMessage = (ws, data) => {
  try {
    if (!ws) {
      console.error("❌ [sendMessage] WebSocket object is null");
      return false;
    }
    
    console.log(`[sendMessage] Attempting to send ${data.type}, readyState: ${ws.readyState}`);
    
    const jsonStr = JSON.stringify(data);
    ws.send(jsonStr);
    console.log(`✅ [sendMessage] Sent to ${ws.userId}:`, data.type);
    return true;
  } catch (error) {
    console.error(`❌ [sendMessage] Error sending message:`, error.message);
    return false;
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
      sendMessage(ws, {
        type: "CONNECTION_ESTABLISHED",
        payload: {
          message: `Welcome ${userId}!`,
          timestamp: Date.now(),
        },
      });
   
      ws.on("message", async (message) => {
        try {
          const msgStr = message.toString();
          console.log(`📨 Message event fired for ${userId}`);
          console.log(`📨 Raw message from ${userId}:`, msgStr);
          
          // ECHO BACK IMMEDIATELY FOR TESTING
          console.log(`[DEBUG] About to send echo back...`);
          sendMessage(ws, {
            type: "ECHO_RESPONSE",
            payload: {
              echo: msgStr,
              timestamp: Date.now()
            }
          });
          
          // Then call handler
          console.log(`📨 Calling handleMessageToSender...`);
          await handleMessageToSender(ws, msgStr);
          console.log(`📨 handleMessageToSender completed`);
        } catch (error) {
          console.error(`❌ Error in message handler for ${userId}:`, error.message, error.stack);
          sendMessage(ws, {
            type: "ERROR",
            payload: {
              message: "Error processing message",
              error: error.message,
              timestamp: Date.now(),
            },
          });
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