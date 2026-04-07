# Flutter Socket Contract (Production-Safe)

This document defines the WebSocket request/response DTOs for the AI Banking Assistant.

## Endpoint

- WebSocket URL (recommended): `wss://<host>/ws?userId=<user-id>`
- Legacy URL (also supported): `wss://<host>/?userId=<user-id>`
- Version: `v=1`

Important:
- Do not use `https://` for WebSocketChannel URL. Use `wss://` in production and `ws://` in local/dev.
- Do not append `:0` as port. Omit the port when using standard TLS endpoint.
- Example valid production URL: `wss://coforgefinaibanking-development-ebdd.up.railway.app/ws?userId=uk_user_001`

## Flutter URL Builder (Prevents `:0` and wrong scheme)

```dart
Uri buildSocketUri({
  required String baseHost,
  required String userId,
  int? port,
  bool secure = true,
}) {
  final safePort = (port != null && port > 0) ? port : null;

  return Uri(
    scheme: secure ? 'wss' : 'ws',
    host: baseHost,
    port: safePort,
    path: '/ws',
    queryParameters: {
      'userId': userId,
    },
  );
}

final uri = buildSocketUri(
  baseHost: 'coforgefinaibanking-development-ebdd.up.railway.app',
  userId: 'uk_user_001',
  secure: true,
);

final channel = WebSocketChannel.connect(uri);
```

## Client -> Server DTO

```json
{
  "v": 1,
  "type": "CHAT_QUERY",
  "requestId": "req-8f1c2d3e",
  "sessionId": "session-123",
  "payload": {
    "message": "Can I afford a holiday in Japan next month?",
    "knownFacts": {
      "targetMonth": "next month",
      "destination": "Japan"
    }
  },
  "meta": {
    "platform": "flutter",
    "appVersion": "1.0.0",
    "locale": "en-IN",
    "timezone": "Asia/Kolkata"
  }
}
```

### Field Notes

- `requestId`: Optional from client; server generates if absent.
- `sessionId`: Optional conversation/session correlation id.
- `payload.message`: Required user prompt.
- `payload.knownFacts`: Optional facts collected from prior turns.

## Server -> Client Success DTO

```json
{
  "v": 1,
  "type": "CHAT_RESPONSE",
  "requestId": "req-8f1c2d3e",
  "sessionId": "session-123",
  "status": "success",
  "timestamp": "2026-04-01T10:15:22.001Z",
  "data": {
    "type": "FINAL",
    "message": "Yes, with caution. Based on your current monthly cash flow...",
    "missingFacts": []
  }
}
```

### `data.type` Values

- `FINAL`: Final advisory answer.
- `FOLLOW_UP`: Assistant needs more information. `missingFacts` may be present for client workflow.
- `ERROR`: Managed domain error returned through success envelope (rare).

## Server -> Client Error DTO

```json
{
  "v": 1,
  "type": "CHAT_RESPONSE",
  "requestId": "req-8f1c2d3e",
  "sessionId": "session-123",
  "status": "error",
  "timestamp": "2026-04-01T10:15:22.221Z",
  "error": {
    "code": "INVALID_CLIENT_MESSAGE",
    "message": "Expected object payload for CHAT_QUERY",
    "retriable": false
  }
}
```

## Backward Compatibility

Server currently accepts both:

1. Raw plain text payloads (legacy):
   - Client sends only a string message.
2. Structured JSON payloads (recommended):
   - Use the DTO contract in this document.

## Flutter Handling Recommendation

- Correlate replies using `requestId`.
- Keep `sessionId` stable for one chat thread.
- Show `data.message` directly for conversational UX.
- If `data.type == FOLLOW_UP`, render as assistant question and collect missing details.
- On `status == error`, show `error.message` and retry only if `error.retriable == true`.

## Diagnostic Messages (Do NOT Render as Chat Bubbles)

The server sends diagnostic frames on connection and for internal probes. These must be silently ignored by the UI — never rendered as chat messages.

**Diagnostic frame shape:**
```json
{
  "v": 1,
  "type": "diagnostic",
  "status": "online",
  "message": "FinAi is online and ready",
  "timestamp": "2026-04-07T15:42:03.875Z"
}
```

**Triggered by:**
- On WebSocket connect (server sends one diagnostic immediately)
- When client sends `{}` as a preflight health probe

**Flutter filter (add to your message handler):**
```dart
void _onSocketMessage(dynamic raw) {
  final msg = jsonDecode(raw as String) as Map<String, dynamic>;

  // Ignore diagnostic frames — never render as chat bubbles
  if (msg['type'] == 'diagnostic') return;

  // Handle CHAT_RESPONSE frames
  if (msg['type'] == 'CHAT_RESPONSE' && msg['status'] == 'success') {
    final data = msg['data'] as Map<String, dynamic>;
    final text = data['message'] as String?;
    if (text != null) _appendChatMessage(sender: 'assistant', text: text);
  }
}
```

> **Root cause of "No message" bug:** Without this filter, the diagnostic frame reaches the chat renderer. It has no `data.message` field (its text is top-level `message`), so the renderer falls back to a blank or "No message" placeholder. The fix is entirely client-side — ignore frames where `type != "CHAT_RESPONSE"`.
