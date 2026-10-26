import 'reflect-metadata';
import { Db } from '@qmenux/database';
import { Module, type DynamicModule, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type NextFunction, type Request, type Response } from 'express';
import { AdminController } from './admin/admin.controller.js';
import { ImportsController } from './admin/imports.controller.js';
import { CSV_TYPES, IMPORT_MAX_BYTES, XLSX_TYPES } from './admin/import-parse.js';
import { AuthController, DevIdpController, InviteController, MeController, OpsAuthController } from './auth/auth.controller.js';
import { OidcService } from './auth/oidc.js';
import { SessionService } from './auth/sessions.js';
import type { ApiConfig } from './config.js';
import { ProblemFilter } from './http/problem.js';
import { RateLimiter } from './http/rate-limit.js';
import { OnboardingController } from './onboarding.controller.js';
import { OpsController } from './ops/ops.controller.js';
import { MediaController, PublicController } from './public/public.controller.js';
import { createStorage, IMAGE_TYPES, MAX_IMAGE_BYTES, type Storage } from './storage.js';
import { CONFIG, DB, LIMITER, OIDC, SESSIONS, STORAGE } from './tokens.js';

export interface AppDeps {
  db?: Db;
  oidc?: OidcService;
  storage?: Storage;
}

@Module({})
class ApiModule {
  static register(cfg: ApiConfig, deps: AppDeps = {}): DynamicModule {
    const db = deps.db ?? new Db({ connectionString: cfg.databaseUrl, ssl: cfg.isProduction });
    return {
      module: ApiModule,
      controllers: [
        AuthController,
        MeController,
        InviteController,
        OpsAuthController,
        DevIdpController,
        OnboardingController,
        AdminController,
        ImportsController,
        OpsController,
        PublicController,
        MediaController,
      ],
      providers: [
        { provide: CONFIG, useValue: cfg },
        { provide: DB, useValue: db },
        { provide: OIDC, useValue: deps.oidc ?? new OidcService(cfg) },
        { provide: SESSIONS, useValue: new SessionService(cfg, db) },
        { provide: LIMITER, useValue: new RateLimiter(cfg, db) },
        { provide: STORAGE, useValue: deps.storage ?? createStorage(cfg) },
      ],
    };
  }
}

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
  next();
}

/**
 * Stateless app factory (Vercel Functions + local server + tests). No CORS: browsers talk to
 * their own first-party BFF, which calls this API server-to-server with a bearer session token.
 */
export async function createApp(cfg: ApiConfig, deps: AppDeps = {}): Promise<INestApplication> {
  const app = await NestFactory.create(ApiModule.register(cfg, deps), { bodyParser: false, logger: cfg.isProduction ? ['error', 'warn'] : ['error', 'warn', 'log'] });
  const http = app.getHttpAdapter().getInstance() as express.Express;
  http.disable('x-powered-by');
  http.set('trust proxy', false);
  app.use(securityHeaders);
  app.use(express.json({ limit: '256kb', type: ['application/json', 'application/*+json'] }));
  app.use('/v1/dev-idp', express.urlencoded({ extended: false, limit: '16kb' }));
  app.use('/v1/admin', express.raw({ type: Object.keys(IMAGE_TYPES), limit: MAX_IMAGE_BYTES }));
  app.use('/v1/admin/imports', express.raw({ type: [...CSV_TYPES, ...XLSX_TYPES], limit: IMPORT_MAX_BYTES }));
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  return app;
}
