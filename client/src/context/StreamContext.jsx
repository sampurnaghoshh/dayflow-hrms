import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { USE_MOCKS } from '../api/client.js';
import { normalize } from '../api/normalize.js';
import { subscribeMockStream } from '../api/mocks/state.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';

const StreamContext = createContext(null);
const RECONNECT_MS = 3000;
const STREAM_EVENTS = ['approval:new', 'approval:decided', 'attendance:punch'];

// The ONE place that opens GET /api/stream (or, under mocks, subscribes to the mock's
// pub-sub stand-in — see api/mocks/state.js). Screens never touch EventSource directly;
// they call useStreamEvent(name, handler) below. Connects once `user` is set, closes on
// sign-out and on unmount — the effect's cleanup covers both, since sign-out sets user to
// null and re-runs this same effect.
export function StreamProvider({ children }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [approvalBellCount, setApprovalBellCount] = useState(0);
  const listenersRef = useRef(new Map()); // eventName -> Set<handler>

  const dispatch = useCallback((eventName, rawData) => {
    const data = normalize(rawData);
    if (eventName === 'approval:new') {
      setApprovalBellCount((n) => n + 1);
      showToast('New approval request', 'info');
    }
    listenersRef.current.get(eventName)?.forEach((fn) => fn(data));
  }, [showToast]);

  const subscribe = useCallback((eventName, handler) => {
    if (!listenersRef.current.has(eventName)) listenersRef.current.set(eventName, new Set());
    listenersRef.current.get(eventName).add(handler);
    return () => listenersRef.current.get(eventName)?.delete(handler);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    if (USE_MOCKS) {
      return subscribeMockStream((eventName, data) => { if (!cancelled) dispatch(eventName, data); });
    }

    let source;
    let reconnectTimer;
    function connect() {
      source = new EventSource('/api/stream', { withCredentials: true });
      STREAM_EVENTS.forEach((eventName) => {
        source.addEventListener(eventName, (e) => {
          if (cancelled) return;
          try {
            dispatch(eventName, JSON.parse(e.data));
          } catch {
            // malformed event — ignore rather than crash the stream
          }
        });
      });
      source.onerror = () => {
        if (cancelled) return;
        // A dropped connection normally leaves EventSource in CONNECTING — the browser
        // auto-retries using the server's `retry:` hint (docs/api-shapes.md). Only step in
        // when it's fully CLOSED (e.g. an auth failure the browser gave up on).
        if (source.readyState === EventSource.CLOSED) {
          source.close();
          reconnectTimer = setTimeout(connect, RECONNECT_MS);
        }
      };
    }
    connect();

    return () => {
      cancelled = true;
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [user, dispatch]);

  const resetApprovalBellCount = useCallback(() => setApprovalBellCount(0), []);
  const value = { subscribe, approvalBellCount, resetApprovalBellCount };
  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>;
}

export function useStream() {
  const ctx = useContext(StreamContext);
  if (!ctx) throw new Error('useStream must be used within StreamProvider');
  return ctx;
}
