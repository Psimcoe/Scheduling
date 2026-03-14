import type { FastifyInstance } from "fastify";
import {
  subscribeRealtimeEvents,
  type RealtimeEvent,
} from "../services/realtimeEvents.js";

function writeEvent(reply: {
  raw: {
    write: (chunk: string) => boolean;
  };
}, event: RealtimeEvent): void {
  reply.raw.write(`event: ${event.type}\n`);
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export default async function eventRoutes(app: FastifyInstance) {
  app.get(
    "/events",
    {
      config: {
        rateLimit: {
          groupId: "events",
          max: (request: { auth?: { user?: { id?: string } } | null }) =>
            request.auth?.user?.id ? 240 : 600,
          timeWindow: "1 minute",
          keyGenerator: (request: { auth?: { user?: { id?: string } } | null; ip: string }) =>
            request.auth?.user?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.hijack();
      reply.raw.write(": connected\n\n");

      const heartbeat = setInterval(() => {
        reply.raw.write(": keepalive\n\n");
      }, 25_000);

      const unsubscribe = subscribeRealtimeEvents((event) => {
        writeEvent(reply, event);
      });

      request.raw.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  );
}
