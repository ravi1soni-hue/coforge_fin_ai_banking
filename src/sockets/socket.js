import { WebSocketServer } from "ws";
// import { handleChatMessage } from "../modules/chat/chat.controller.js";
 
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
 
    console.log(`User connected: ${userId}`);
 
    ws.on("message", async (message) => {
      //await handleChatMessage(ws, message.toString());
    });
 
    ws.on("close", () => {
      const connections = userConnections.get(userId);
      connections?.delete(ws);
 
      if (connections?.size === 0) {
        userConnections.delete(userId);
      }
    });
  });
};