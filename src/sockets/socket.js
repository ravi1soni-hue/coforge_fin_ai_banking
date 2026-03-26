import { WebSocketServer } from "ws";
import { handleMessageToSender } from "../services/message.handler.js";
 
const userConnections = new Map(); 
// userId -> Set<ws>

let activeConnections = 0;
export const getActiveConnectionCount = () => activeConnections;
export let websocketsReady = false;

// Helper to send JSON message safely (with readyState guard) - DEFINED FIRST
const sendMessage = (ws, data) => {
  try {
    if (ws.readyState !== 1) {
      console.warn(`[sendMessage] ⚠️ ws.readyState is not OPEN (${ws.readyState}), message ${data.type} dropped`);
      return;
    }
    const jsonStr = JSON.stringify(data);
    console.log(`[sendMessage] Calling ws.send() with`, data.type, `->`, jsonStr);
    ws.send(jsonStr);
    console.log(`[sendMessage] ✅ ws.send() completed for`, data.type);
  } catch (error) {
    console.error(`[sendMessage] ❌ Exception in ws.send():`, error.message, error.stack);
  }
};
 
export const initWebSocket = (server) => {
  console.log("[WebSocket] 🔌 Initializing WebSocket server...");
  const wss = new WebSocketServer({ server, perMessageDeflate: false });
  websocketsReady = true;
  console.log("[WebSocket] ✅ WebSocketServer created");

  // periodic server heartbeat broadcast - keep Railway proxy from dropping idle connections
  const debugBroadcast = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        sendMessage(client, {
          type: "SERVER_HEARTBEAT",
          payload: {
            message: "server heartbeat",
            timestamp: Date.now(),
          },
        });
      }
    });
  }, 5000);

  wss.on("close", () => {
    websocketsReady = false;
    clearInterval(debugBroadcast);
  });
 
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
      activeConnections++;

      // Store connection
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId).add(ws);

      console.log(`✅ User connected: ${userId} (activeConnections=${activeConnections})`);
      const deployMarker = "DEPLOY_TEST_" + Date.now();
      console.log(`[DEPLOY_MARKER] ${deployMarker}`);
      console.log(`[CONNECTION] ws.readyState = ${ws.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
      
      // Try direct send WITHOUT using sendMessage function
      try {
        const connMsg = JSON.stringify({
          type: "CONNECTION_ESTABLISHED",
          payload: {
            message: `Welcome ${userId}!`,
            timestamp: Date.now(),
            deployMarker: deployMarker,
          },
        });
        console.log(`[DIRECT_SEND] ready=${ws.readyState}, About to call ws.send()...`);
        ws.send(connMsg);
        console.log(`[DIRECT_SEND] ✅ ws.send() returned successfully`);
      } catch (err) {
        console.error(`[DIRECT_SEND] ❌ Error:`, err.message);
      }
      
      // Also try sendMessage
      sendMessage(ws, {
        type: "CONNECTION_ESTABLISHED",
        payload: {
          message: `Welcome ${userId}! (via sendMessage)`,
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

      // Try sending a message after 1 second delay as well
      setTimeout(() => {
        try {
          console.log(`[DELAYED_SEND] Sending delayed test message to ${userId}`);
          ws.send(JSON.stringify({
            type: "TEST_DELAY",
            message: "This is a delayed test message",
            timestamp: Date.now()
          }));
          console.log(`[DELAYED_SEND] ✅ Delayed send completed`);
        } catch (err) {
          console.error(`[DELAYED_SEND] ❌ Error:`, err.message);
        }
      }, 1000);
   
      ws.on("close", () => {
        const connections = userConnections.get(userId);
        connections?.delete(ws);
        activeConnections = Math.max(0, activeConnections - 1);
   
        if (connections?.size === 0) {
          userConnections.delete(userId);
        }
        console.log(`❌ User disconnected: ${userId} (activeConnections=${activeConnections})`);
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