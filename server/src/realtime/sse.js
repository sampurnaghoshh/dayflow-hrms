/**
 * Server-Sent Events.
 *
 * One-way push is all this system needs (CLAUDE.md §2), and WebSockets are an
 * anti-goal (§13). SSE is plain HTTP: no handshake, no second protocol, and the
 * browser reconnects on its own.
 *
 * State is a Map of userId -> Set of open responses. A Set rather than a single
 * response because one user may have several tabs open, and a Map keyed by user
 * because some events are addressed to a person rather than broadcast.
 */
import { env } from '../config/env.js';

/** @type {Map<string, Set<import('express').Response>>} */
const clients = new Map();

const HEARTBEAT_MS = 20_000;

/**
 * A comment line every 20s. Two jobs: it keeps proxies from closing an idle
 * connection, and a write that fails is how we notice a client that vanished
 * without a 'close' event.
 */
const heartbeat = setInterval(() => {
  for (const [userId, sockets] of clients) {
    for (const res of sockets) {
      try {
        res.write(': ping\n\n');
      } catch {
        drop(userId, res);
      }
    }
  }
}, HEARTBEAT_MS);
// Never hold the process (or a test run) open just for the heartbeat.
heartbeat.unref?.();

function drop(userId, res) {
  const sockets = clients.get(userId);
  if (!sockets) return;
  sockets.delete(res);
  if (sockets.size === 0) clients.delete(userId);
}

function write(res, event, payload) {
  try {
    // The blank line terminates the event; without it the browser buffers forever.
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/stream - mount behind requireAuth.
 *
 * Note there is no CORS work here beyond what the global cors() middleware does:
 * EventSource sends the session cookie because the client opens it with
 * `withCredentials: true` against the one allowed origin.
 */
export function streamHandler(req, res) {
  const userId = String(req.user.id);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tells nginx and friends not to buffer, which would defeat the whole point.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  // An immediate event so the client knows the stream is live rather than merely
  // connecting, and a retry hint for the browser's own reconnect logic.
  res.write('retry: 3000\n\n');
  write(res, 'connected', { userId, at: new Date().toISOString() });

  const cleanup = () => {
    drop(userId, res);
    req.removeListener('close', cleanup);
  };
  req.on('close', cleanup);
  res.on('error', cleanup);
}

/**
 * Sends an event to every connected client, or only to the users named.
 *
 * Deliberately silent about failures: a dropped subscriber is normal (a closed tab),
 * and realtime delivery is a convenience layered on top of state that is already
 * committed. Nothing in this system is correct only because a broadcast arrived.
 *
 * @param {string} event   'approval:new' | 'approval:decided' | 'attendance:punch'
 * @param {object} payload
 * @param {{userIds?: Array<string|number>}} [options]
 */
export function broadcast(event, payload, { userIds } = {}) {
  const targets = userIds ? userIds.map(String) : [...clients.keys()];
  let delivered = 0;

  for (const userId of targets) {
    const sockets = clients.get(userId);
    if (!sockets) continue;
    for (const res of sockets) {
      if (write(res, event, payload)) delivered += 1;
      else drop(userId, res);
    }
  }

  if (!env.isProduction && delivered > 0) {
    console.log(`[sse] ${event} -> ${delivered} client(s)`);
  }
  return delivered;
}

/** Number of open connections, for the health endpoint and tests. */
export function clientCount() {
  let total = 0;
  for (const sockets of clients.values()) total += sockets.size;
  return total;
}

/** Closes every stream. Used by graceful shutdown so the process can actually exit. */
export function closeAllStreams() {
  for (const sockets of clients.values()) {
    for (const res of sockets) {
      try {
        res.end();
      } catch {
        // already gone
      }
    }
  }
  clients.clear();
  clearInterval(heartbeat);
}
