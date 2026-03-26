import { WebSocketServer } from "ws";
import { handleMessageToSender } from "../services/message.handler.js";
 
const userConnections = new Map(); 
// userId -> Set<ws>
 
export const initWebSocket = (server) => {
  const wss = new WebSocketServer({ server });
 
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const userId = url.searchParams.get("userId");
 
    if (!userId) {
      ws.close();
      return;
    }
 
    ws.userId = userId;
 
    // Store connection
    if (!userConnections.has(userId)) {
      userConnections.set(userId, new Set());
    }
    userConnections.get(userId).add(ws);
 
    console.log(`✅ User connected: ${userId}`);
 
    ws.on("message", async (message) => {
      console.log(`📨 Message from ${userId}:`, message.toString());
      
      // Send response back to sender
      await handleMessageToSender(ws, message.toString());
      
      // Broadcast to all users (optional)
      broadcastMessage(userId, message.toString());
    });
 
    ws.on("close", () => {
      const connections = userConnections.get(userId);
      connections?.delete(ws);
 
      if (connections?.size === 0) {
        userConnections.delete(userId);
      }
      console.log(`❌ User disconnected: ${userId}`);
    });
  });
};

// Broadcast message to all connected users
const broadcastMessage = (senderId, message) => {
  userConnections.forEach((connections, userId) => {
    connections.forEach((ws) => {
      if (ws.readyState === 1) { // 1 = OPEN
        ws.send(JSON.stringify({
          type: "BROADCAST",
          from: senderId,
          message: message,
          timestamp: Date.now()
        }));
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
        ws.send(JSON.stringify(message));
      }
    });
  }
};