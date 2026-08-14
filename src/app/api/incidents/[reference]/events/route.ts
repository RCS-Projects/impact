import { NextRequest } from 'next/server';
import { getPublicIncident } from '@/server/services/incidents.service';

export const dynamic = 'force-dynamic';

type Listener = (event: string, data: string) => void;

const listeners = new Map<string, Set<Listener>>();

export function broadcastToIncident(reference: string, event: string, data: string) {
  const set = listeners.get(reference);
  if (!set) return;
  for (const fn of set) fn(event, data);
}

export const GET = async (
  _request: NextRequest,
  { params }: { params: { reference: string } },
) => {
  const incident = await getPublicIncident(params.reference);
  if (!incident) {
    return new Response('Incident not found', { status: 404 });
  }

  const reference = params.reference;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        const set = listeners.get(reference);
        if (set) {
          set.delete(send);
          if (set.size === 0) listeners.delete(reference);
        }
      };

      if (!listeners.has(reference)) listeners.set(reference, new Set());
      listeners.get(reference)!.add(send);

      send('connected', JSON.stringify({ reference, title: incident.title }));

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
          cleanup();
        }
      }, 15_000);

      _request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        cleanup();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
};
