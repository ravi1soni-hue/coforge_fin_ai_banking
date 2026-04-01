let socket;

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const wsUrlEl = document.getElementById("wsUrl");
const userIdEl = document.getElementById("userId");
const sessionIdEl = document.getElementById("sessionId");
const requestIdEl = document.getElementById("requestId");
const messageEl = document.getElementById("message");
const knownFactsEl = document.getElementById("knownFacts");

function randomId(prefix) {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

function appendLog(label, data) {
  const timestamp = new Date().toISOString();
  const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  logEl.textContent += `[${timestamp}] ${label}\n${body}\n\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function buildWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  const userId = encodeURIComponent(userIdEl.value.trim());
  return `${protocol}://${host}/?userId=${userId}`;
}

function parseKnownFacts() {
  const raw = knownFactsEl.value.trim();
  if (!raw) return undefined;
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Known facts must be a JSON object");
  }
  return parsed;
}

function connectSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    appendLog("info", "Socket already connected");
    return;
  }

  const url = wsUrlEl.value.trim() || buildWsUrl();
  wsUrlEl.value = url;

  socket = new WebSocket(url);

  setStatus("Connecting...");

  socket.onopen = () => {
    setStatus("Connected");
    appendLog("connected", url);
  };

  socket.onmessage = (event) => {
    let parsed;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      parsed = event.data;
    }
    appendLog("recv", parsed);
  };

  socket.onerror = () => {
    setStatus("Socket error");
    appendLog("error", "Socket error event");
  };

  socket.onclose = (event) => {
    setStatus(`Disconnected (${event.code})`);
    appendLog("closed", { code: event.code, reason: event.reason || "" });
  };
}

function disconnectSocket() {
  if (!socket) return;
  socket.close();
}

function sendStructured() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    appendLog("error", "Socket is not connected");
    return;
  }

  const userMessage = messageEl.value.trim();
  if (!userMessage) {
    appendLog("error", "Message is empty");
    return;
  }

  const requestId = requestIdEl.value.trim() || randomId("req");
  requestIdEl.value = requestId;

  const payload = {
    v: 1,
    type: "CHAT_QUERY",
    requestId,
    sessionId: sessionIdEl.value.trim() || undefined,
    payload: {
      message: userMessage,
      knownFacts: parseKnownFacts(),
    },
    meta: {
      platform: "socket-test-ui",
      appVersion: "1.0.0",
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };

  socket.send(JSON.stringify(payload));
  appendLog("sent", payload);
}

function sendPlainText() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    appendLog("error", "Socket is not connected");
    return;
  }
  const text = messageEl.value.trim();
  socket.send(text);
  appendLog("sent", text);
}

function clearLog() {
  logEl.textContent = "";
}

function initDefaults() {
  userIdEl.value = randomId("test-user");
  sessionIdEl.value = randomId("session");
  wsUrlEl.value = buildWsUrl();
}

document.getElementById("connectBtn").addEventListener("click", connectSocket);
document.getElementById("disconnectBtn").addEventListener("click", disconnectSocket);
document.getElementById("sendStructuredBtn").addEventListener("click", sendStructured);
document.getElementById("sendPlainBtn").addEventListener("click", sendPlainText);
document.getElementById("clearLogBtn").addEventListener("click", clearLog);

initDefaults();
