import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SettingsClaude } from '../settings-claude/index.js';

/** Registers /ws/pty/:consoleId (the @fastify/websocket plugin must already be registered by the hub). */
export function registerPtyBridge(app: FastifyInstance, deps: {
  claude: Pick<SettingsClaude, 'getConsole'>; authorize?: (req: FastifyRequest) => boolean;
}): void {
  app.get<{ Params: { consoleId: string } }>('/ws/pty/:consoleId', {
    websocket: true,
    preValidation: async (req, reply) => {
      if (deps.authorize && !deps.authorize(req)) {
        await reply.code(401).send({ error: { code: 'unauthorized', message: 'Authentication required' } });
      }
    },
  }, (socket, req) => {
    const pty = deps.claude.getConsole(req.params.consoleId);
    if (!pty) { socket.send(JSON.stringify({ t: 'exit', reason: 'closed' })); socket.close(); return; }
    pty.onData((d) => { if (socket.readyState === 1) socket.send(JSON.stringify({ t: 'out', d })); });
    pty.onExit((reason) => { if (socket.readyState === 1) { socket.send(JSON.stringify({ t: 'exit', reason })); socket.close(); } });
    socket.on('message', (raw: Buffer) => {
      let m: { t?: string; d?: unknown; cols?: unknown; rows?: unknown };
      try { m = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (m.t === 'in' && typeof m.d === 'string') pty.write(m.d);
      else if (m.t === 'resize' && typeof m.cols === 'number' && typeof m.rows === 'number') pty.resize(m.cols, m.rows);
    });
  });
}
