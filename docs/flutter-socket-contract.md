# Flutter Socket Contract (Production-Safe)

This document defines the WebSocket request/response DTOs for the AI Banking Assistant.

## Endpoint

- WebSocket URL: `ws://<host>:<port>?userId=<user-id>`
- Version: `v=1`

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
