import type { FastifyInstance, FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import type { WsEvent } from '../../shared/ws.js';
import { redactDeep } from '../redact/index.js';

export interface WsHub {
  broadcast(e: WsEvent): void;
  register(app: FastifyInstance, opts?: { authorize?: (req: FastifyRequest) => boolean }): Promise<void>;
  clientCount(): number;
}

export function createWsHub(opts: { serverVersion?: string } = {}): WsHub {
  const clients = new Set<WebSocket>();
  const send = (c: WebSocket, e: WsEvent) => { if (c.readyState === 1) c.send(JSON.stringify(e)); };
  return {
    broadcast(e) {
      const safe = redactDeep(e);
      for (const c of clients) send(c, safe);
    },
    clientCount: () => clients.size,
    async register(app, o = {}) {
      await app.register(websocket);
      app.get('/ws', {
        websocket: true,
        preValidation: async (req, reply) => {
          if (o.authorize && !o.authorize(req)) {
            await reply.code(401).send({ error: { code: 'unauthorized', message: 'Authentication required' } });
          }
        },
      }, (socket) => {
        clients.add(socket);
        socket.on('close', () => clients.delete(socket));
        socket.on('error', () => clients.delete(socket));
        send(socket, { type: 'hello', ts: new Date().toISOString(), data: { serverVersion: opts.serverVersion ?? '0.0.0' } });
      });
    },
  };
}
