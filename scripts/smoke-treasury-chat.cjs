const WebSocket = require('ws');

const userId = 'corp-northstar-001';
const url = `ws://localhost:3000/ws?userId=${encodeURIComponent(userId)}`;

const turns = [
  'Can I safely release a £750,000 supplier payment run today?',
  'Roughly £750,000 total. Some are urgent, some could wait.',
  'Let’s split it – £520k today, rest mid-week.',
  'Proceed with auto-release if cash arrives.',
];

const ws = new WebSocket(url);
let idx = 0;

function sendTurn() {
  if (idx >= turns.length) {
    ws.close();
    return;
  }
  const requestId = `smoke-${idx + 1}`;
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'CHAT_QUERY',
      requestId,
      payload: {
        message: turns[idx],
      },
    })
  );
}

ws.on('open', () => {
  console.log('CONNECTED');
  sendTurn();
});

ws.on('message', (buf) => {
  const raw = String(buf);
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.log('RAW:', raw);
    return;
  }

  if (msg?.type !== 'CHAT_RESPONSE') return;
  if (msg?.status !== 'success') {
    console.log('ERROR:', JSON.stringify(msg, null, 2));
    ws.close();
    process.exit(1);
    return;
  }

  const userTurn = turns[idx];
  console.log('\nUSER:', userTurn);
  console.log('AI:', msg?.data?.message ?? '');

  idx += 1;
  setTimeout(sendTurn, 700);
});

ws.on('close', () => {
  console.log('\nSMOKE TEST COMPLETE');
  process.exit(0);
});

ws.on('error', (e) => {
  console.error('WS ERROR:', e.message);
  process.exit(1);
});
