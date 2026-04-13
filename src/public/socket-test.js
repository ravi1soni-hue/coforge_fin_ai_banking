let socket;
let connectAttempts = 0;

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const diagEl = document.getElementById("diag");
const wsUrlEl = document.getElementById("wsUrl");
const autoUrlEl = document.getElementById("autoUrl");
const pathEl = document.getElementById("path");
const userIdEl = document.getElementById("userId");
const sessionIdEl = document.getElementById("sessionId");
const requestIdEl = document.getElementById("requestId");
const messageEl = document.getElementById("message");
const knownFactsEl = document.getElementById("knownFacts");

const closeCodeHints = {
  1000: "Normal closure.",
  1001: "Endpoint is going away (server restart/deploy).",
  1002: "Protocol error.",
  1003: "Unsupported data.",
  1005: "No status code provided.",
  1006: "Abnormal closure (often proxy/network/TLS issue).",
  1007: "Invalid payload data.",
  1008: "Policy violation.",
  1009: "Message too big.",
  1011: "Server internal error.",
  1012: "Service restart.",
  1013: "Try again later.",
  1015: "TLS handshake failure.",
};

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

function appendDiag(label, data) {
  const timestamp = new Date().toISOString();
  const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  diagEl.textContent += `[${timestamp}] ${label}\n${body}\n\n`;
  diagEl.scrollTop = diagEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function buildWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  const path = (pathEl.value || "/").trim() || "/";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const userId = encodeURIComponent(userIdEl.value.trim());
  return `${protocol}://${host}${normalizedPath}?userId=${userId}`;
}

function normalizeWebSocketUrl(rawUrl) {
  if (!rawUrl) {
    throw new Error("WebSocket URL is empty");
  }

  let value = rawUrl.trim();
  if (!value) {
    throw new Error("WebSocket URL is empty");
  }

  if (value.startsWith("/")) {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    value = `${protocol}://${window.location.host}${value}`;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid URL format: ${value}`);
  }

  // Convert accidental HTTP(S) inputs into WebSocket schemes.
  if (parsed.protocol === "https:") {
    parsed.protocol = "wss:";
  } else if (parsed.protocol === "http:") {
    parsed.protocol = "ws:";
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error(`Unsupported protocol ${parsed.protocol}. Use ws:// or wss://`);
  }

  // Browsers will fail upgrades when explicit port is 0.
  if (parsed.port === "0") {
    parsed.port = "";
  }

  if (!parsed.pathname || parsed.pathname === "/") {
    parsed.pathname = "/ws";
  }

  if (!parsed.searchParams.get("userId")) {
    const userId = userIdEl.value.trim();
    if (userId) {
      parsed.searchParams.set("userId", userId);
    }
  }

  parsed.hash = "";
  return parsed.toString();
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

  connectAttempts += 1;
  const autoUrl = autoUrlEl.checked;
  const rawUrl = autoUrl ? buildWsUrl() : wsUrlEl.value.trim();

  let url;
  try {
    url = normalizeWebSocketUrl(rawUrl);
  } catch (error) {
    appendLog("error", error instanceof Error ? error.message : String(error));
    appendDiag("invalid_socket_url", {
      rawUrl,
      reason: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (!url) {
    appendLog("error", "WebSocket URL is empty");
    return;
  }

  wsUrlEl.value = url;

  appendDiag("connect_attempt", {
    attempt: connectAttempts,
    url,
    pageProtocol: window.location.protocol,
    pageHost: window.location.host,
    userId: userIdEl.value.trim(),
    sessionId: sessionIdEl.value.trim(),
    autoUrl,
  });

  socket = new WebSocket(url);

  setStatus("Connecting...");
  appendDiag("socket_ready_state", socket.readyState);

  socket.onopen = () => {
    setStatus("Connected");
    appendLog("connected", url);
    appendDiag("socket_open", {
      readyState: socket.readyState,
      protocol: socket.protocol,
      extensions: socket.extensions,
    });
  };

  socket.onmessage = (event) => {
    let parsed;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      parsed = event.data;
    }
    appendLog("recv", parsed);
    appendDiag("message_received", {
      type: typeof parsed,
      hasStatus: Boolean(parsed && parsed.status),
    });
  };

  socket.onerror = (event) => {
    setStatus("Socket error");
    appendLog("error", "Socket error event");
    appendDiag("socket_error", {
      eventType: event.type,
      readyState: socket.readyState,
      url,
    });
  };

  socket.onclose = (event) => {
    setStatus(`Disconnected (${event.code})`);
    appendLog("closed", { code: event.code, reason: event.reason || "" });
    appendDiag("socket_close", {
      code: event.code,
      reason: event.reason || "",
      wasClean: event.wasClean,
      readyState: socket.readyState,
      hint: closeCodeHints[event.code] || "No known hint for this code.",
    });
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
  diagEl.textContent = "";
}

async function runConnectivityCheck() {
  const healthUrl = `${window.location.origin}/health`;
  const rawWsUrl = autoUrlEl.checked ? buildWsUrl() : wsUrlEl.value.trim();

  let wsUrl;
  try {
    wsUrl = normalizeWebSocketUrl(rawWsUrl);
  } catch (error) {
    appendDiag("connectivity_check_invalid_url", {
      rawWsUrl,
      reason: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  wsUrlEl.value = wsUrl;

  appendDiag("connectivity_check_start", {
    healthUrl,
    wsUrl,
  });

  try {
    const resp = await fetch(healthUrl);
    const text = await resp.text();
    appendDiag("health_check", {
      ok: resp.ok,
      status: resp.status,
      body: text,
    });
  } catch (err) {
    appendDiag("health_check_error", err instanceof Error ? err.message : String(err));
  }

  try {
    await new Promise((resolve) => {
      const probe = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        appendDiag("ws_probe_timeout", "No open event within 5 seconds");
        probe.close();
        resolve();
      }, 5000);

      probe.onopen = () => {
        clearTimeout(timeout);
        appendDiag("ws_probe_open", {
          protocol: probe.protocol,
          extensions: probe.extensions,
        });
        probe.close(1000, "probe complete");
        resolve();
      };

      probe.onclose = (event) => {
        clearTimeout(timeout);
        appendDiag("ws_probe_close", {
          code: event.code,
          reason: event.reason || "",
          wasClean: event.wasClean,
          hint: closeCodeHints[event.code] || "No known hint for this code.",
        });
        resolve();
      };

      probe.onerror = () => {
        appendDiag("ws_probe_error", "Probe socket error event received");
      };
    });
  } catch (err) {
    appendDiag("ws_probe_exception", err instanceof Error ? err.message : String(err));
  }
}

async function copyLogs() {
  const fullLog = [
    "=== SOCKET LOG ===",
    logEl.textContent,
    "=== DIAGNOSTICS ===",
    diagEl.textContent,
  ].join("\n");

  try {
    await navigator.clipboard.writeText(fullLog);
    appendLog("info", "Logs copied to clipboard");
  } catch {
    appendLog("error", "Failed to copy logs. Copy manually from the page.");
  }
}

function initDefaults() {
  userIdEl.value = "corp-northstar-001";
  sessionIdEl.value = randomId("session");
  wsUrlEl.value = normalizeWebSocketUrl(buildWsUrl());
  appendDiag("environment", {
    origin: window.location.origin,
    protocol: window.location.protocol,
    host: window.location.host,
    userAgent: navigator.userAgent,
  });
}

document.getElementById("connectBtn").addEventListener("click", connectSocket);
document.getElementById("disconnectBtn").addEventListener("click", disconnectSocket);
document.getElementById("diagnoseBtn").addEventListener("click", runConnectivityCheck);
document.getElementById("sendStructuredBtn").addEventListener("click", sendStructured);
document.getElementById("sendPlainBtn").addEventListener("click", sendPlainText);
document.getElementById("clearLogBtn").addEventListener("click", clearLog);
document.getElementById("copyLogBtn").addEventListener("click", copyLogs);
autoUrlEl.addEventListener("change", () => {
  if (autoUrlEl.checked) {
    wsUrlEl.value = buildWsUrl();
  }
});
pathEl.addEventListener("input", () => {
  if (autoUrlEl.checked) {
    wsUrlEl.value = buildWsUrl();
  }
});
userIdEl.addEventListener("input", () => {
  if (autoUrlEl.checked) {
    wsUrlEl.value = buildWsUrl();
  }
});

initDefaults();
