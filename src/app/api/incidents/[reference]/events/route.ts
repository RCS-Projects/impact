import { NextRequest } from 'next/server';
import { getPublicIncident } from '@/server/services/incidents.service';
import { addListener, removeListener } from '@/server/sse-bus';

export const dynamic = 'force-dynamic';

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
        removeListener(reference, send);
      };

      addListener(reference, send);

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
