type Listener = (event: string, data: string) => void;

const listeners = new Map<string, Set<Listener>>();

export function broadcastToIncident(reference: string, event: string, data: string) {
  const set = listeners.get(reference);
  if (!set) return;
  for (const fn of set) fn(event, data);
}

export function addListener(reference: string, listener: Listener) {
  if (!listeners.has(reference)) listeners.set(reference, new Set());
  listeners.get(reference)!.add(listener);
}

export function removeListener(reference: string, listener: Listener) {
  const set = listeners.get(reference);
  if (set) {
    set.delete(listener);
    if (set.size === 0) listeners.delete(reference);
  }
}
