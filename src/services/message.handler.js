import { runAgenticOrchestration } from "./agent.orchestrator.js";

export const handleMessageToSender = async (ws, rawMessage) => {
  try {
    console.log("[MessageHandler] Received raw message:", rawMessage);

    const clientMessage = JSON.parse(rawMessage);
    console.log("[MessageHandler] Parsed message:", clientMessage);

    if (clientMessage?.type === "PING") {
      send(ws, {
        type: "PONG",
        payload: {
          ts: Date.now(),
        },
      });
      return;
    }

    const userText =
      clientMessage?.payload?.text ||
      clientMessage?.payload?.message ||
      clientMessage?.text ||
      "";

    if (!userText) {
      send(ws, {
        type: "ERROR",
        payload: {
          message: "No user query found in payload.text or payload.message",
        },
      });
      return;
    }

    const canonicalContext =
      clientMessage?.payload?.canonicalContext ||
      clientMessage?.payload?.contextChunks ||
      clientMessage?.payload?.documents ||
      [];

    const history = Array.isArray(clientMessage?.payload?.history)
      ? clientMessage.payload.history
          .map((item) => {
            if (!item || !item.role || !item.content) {
              return null;
            }
            return {
              role: item.role,
              content: String(item.content),
            };
          })
          .filter(Boolean)
      : [];

    const result = await runAgenticOrchestration({
      userId: clientMessage?.userId || ws.userId,
      query: userText,
      history,
      canonicalContext,
    });

    const serverMessage = {
      type: "SERVER_MESSAGE",
      payload: {
        from: "server",
        text: result.text,
        timestamp: Date.now(),
        model: result.model,
        toolCallsUsed: result.toolCallsUsed,
        usage: result.usage,
      },
    };

    console.log("[MessageHandler] Created server message:", serverMessage);
    console.log("[MessageHandler] WebSocket state:", ws.readyState, "Expected OPEN: 1");
    
    send(ws, serverMessage);
  } catch (error) {
    console.error("[MessageHandler] Error:", error.message, error.stack);
    send(ws, {
      type: "ERROR",
      payload: {
        message: "Invalid message format",
        error: error.message,
      },
    });
  }
};

/* ------------------- helpers ------------------- */

const send = (ws, data) => {
  try {
    console.log("[Send] Starting send, ws.readyState:", ws.readyState);
    
    if (!ws) {
      console.error("[Send] ❌ WebSocket object is null");
      return;
    }
    
    // WebSocket.OPEN = 1, but we'll check numerically to be safe
    if (ws.readyState === 1) { 
      const jsonStr = JSON.stringify(data);
      ws.send(jsonStr);
      console.log(`[Send] ✅ Response sent: ${data.type}`);
    } else {
      console.error(`[Send] ❌ WebSocket not open. State: ${ws.readyState} (1=OPEN, 0=CONNECTING, 2=CLOSING, 3=CLOSED)`);
    }
  } catch (error) {
    console.error(`[Send] ❌ Error sending response:`, error.message);
  }
};