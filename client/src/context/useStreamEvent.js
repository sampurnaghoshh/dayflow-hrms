import { useEffect, useRef } from 'react';
import { useStream } from './StreamContext.jsx';

// Subscribes a screen to one stream event for as long as it's mounted — unsubscribes
// automatically on unmount, which is what makes "refresh X if it's on screen" true for
// free: an unmounted screen's handler is gone, so an event arriving while it's elsewhere
// simply does nothing (it'll fetch fresh data on its own next mount anyway).
//
// The subscription itself is stable (doesn't re-subscribe every render even though most
// callers pass an inline handler) — a ref always points at the latest handler, so it never
// sees a stale closure either.
export function useStreamEvent(eventName, handler) {
  const { subscribe } = useStream();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => subscribe(eventName, (data) => handlerRef.current(data)), [subscribe, eventName]);
}
