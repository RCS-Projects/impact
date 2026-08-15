import { NextRequest } from 'next/server';
import { getPublicIncident } from '@/server/services/incidents.service';
import { addListener, removeListener } from '@/server/sse-bus';
import { clientIp } from '@/server/http';

export const dynamic = 'force-dynamic';

const MAX_CONNECTIONS_PER_IP = 20;
const connectionsByIp = new Map<string, number>();

export const GET = async (
  _request: NextRequest,
  { params }: { params: { reference: string } },
) => {
  const ip = clientIp(_request);
  const current = connectionsByIp.get(ip) ?? 0;
  if (current >= MAX_CONNECTIONS_PER_IP) {
    return new Response(JSON.stringify({ error: 'Too many live update connections' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  const incident = await getPublicIncident(params.reference);
  if (!incident) {
    return new Response('Incident not found', { status: 404 });
  }

  const reference = params.reference;
  const encoder = new TextEncoder();
  connectionsByIp.set(ip, current + 1);

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          cleanup();
        }
      };
      let cleaned = false;

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        removeListener(reference, send);
        const remaining = (connectionsByIp.get(ip) ?? 1) - 1;
        if (remaining > 0) connectionsByIp.set(ip, remaining);
        else connectionsByIp.delete(ip);
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
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
};
