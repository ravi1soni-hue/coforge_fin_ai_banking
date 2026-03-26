import WebSocket from "ws";

export const handleMessageToSender = async (ws, rawMessage) => {
  try {
    const clientMessage = JSON.parse(rawMessage);

    // ✅ Server-generated message (can be AI / logic driven)
    const serverMessage = {
      type: "SERVER_MESSAGE",
      payload: {
        from: "server",
        text: generateServerResponse(clientMessage),
        timestamp: Date.now(),
      },
    };

    send(ws, serverMessage);
  } catch (error) {
    send(ws, {
      type: "ERROR",
      payload: {
        message: "Invalid message format",
      },
    });
  }
};

/* ------------------- helpers ------------------- */

const generateServerResponse = (clientMessage) => {
  if (clientMessage?.payload?.text) {
    return `Server received: "${clientMessage.payload.text}"`;
  }
  return "Server received your message";
};

const send = (ws, data) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
};