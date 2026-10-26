import type { IncomingMessage, ServerResponse } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

/**
 * Vercel Function entry. The Nest app is created once per warm instance and holds no
 * request state; every request carries its own bearer session (no in-memory sessions/queues).
 */
let ready: Promise<INestApplication> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= createApp(loadConfig()).then(async (app) => {
    await app.init();
    return app;
  });
  const app = await ready;
  const http = app.getHttpAdapter().getInstance() as (req: IncomingMessage, res: ServerResponse) => void;
  http(req, res);
}
