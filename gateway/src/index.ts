import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { createAuthContextMiddleware } from './authMiddleware.js';
import { AppError, buildRfcError } from './errors.js';

import type { NextFunction, Request, Response } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type net from 'node:net';

export const SERVICE_NAME = 'api-gateway';

const PORT = Number(process.env.PORT ?? process.env.GATEWAY_PORT ?? 8000);
const JWT_SECRET = process.env.JWT_SECRET ?? 'super_jwt_secret_token';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://auth-service:5001';
const PROJECT_SERVICE_URL = process.env.PROJECT_SERVICE_URL ?? 'http://project-service:5002';
const TEST_EXECUTION_SERVICE_URL =
  process.env.TEST_EXECUTION_SERVICE_URL ?? 'http://test-execution-service:5003';
const STORAGE_SERVICE_URL = process.env.STORAGE_SERVICE_URL ?? 'http://storage-service:5004';

const app = express();

// [2.1.3] Security HTTP headers (Helmet) & strict CORS with credentials
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(
  cors({
    origin: CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  }),
);

app.use(cookieParser());

// Gateway Healthcheck
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    service: SERVICE_NAME,
    status: 'UP',
    timestamp: new Date().toISOString(),
  });
});

// [2.1.4] Authenticated user context propagation middleware (x-user-id, x-user-role)
app.use('/api/v1', createAuthContextMiddleware(JWT_SECRET));

function createServiceProxy(target: string, serviceLabel: string): express.RequestHandler {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq, req: IncomingMessage) => {
        const userId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];
        const userEmail = req.headers['x-user-email'];

        if (typeof userId === 'string') {
          proxyReq.setHeader('x-user-id', userId);
        }
        if (typeof userRole === 'string') {
          proxyReq.setHeader('x-user-role', userRole);
        }
        if (typeof userEmail === 'string') {
          proxyReq.setHeader('x-user-email', userEmail);
        }
      },
      error: (_err: Error, _req: IncomingMessage, res: ServerResponse | net.Socket) => {
        if ('writeHead' in res && !res.headersSent) {
          const payload = buildRfcError(
            502,
            `Upstream microservice '${serviceLabel}' is unreachable.`,
            { service: serviceLabel, target },
          );
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        }
      },
    },
  });
}

// [2.1.1] Semantic routing to microservices
app.use('/api/v1/auth', createServiceProxy(`${AUTH_SERVICE_URL}/api/v1/auth`, 'auth-service'));
app.use(
  '/api/v1/projects',
  createServiceProxy(`${PROJECT_SERVICE_URL}/api/v1/projects`, 'project-service'),
);
app.use(
  '/api/v1/tests',
  createServiceProxy(`${TEST_EXECUTION_SERVICE_URL}/api/v1/tests`, 'test-execution-service'),
);
app.use(
  '/api/v1/storage',
  createServiceProxy(`${STORAGE_SERVICE_URL}/api/v1/storage`, 'storage-service'),
);

// 404 Not Found Handler in RFC-compliant format
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(
    new AppError(404, `Route '${req.method} ${req.originalUrl}' was not found on API Gateway.`, {
      method: req.method,
      path: req.originalUrl,
    }),
  );
});

// [2.1.2] Global Error Interceptor Middleware (RFC-Compliant JSON)
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(buildRfcError(err.statusCode, err.message, err.details));
    return;
  }

  const fallbackMessage =
    err instanceof Error ? err.message : 'An unexpected internal error occurred.';
  res.status(500).json(
    buildRfcError(500, fallbackMessage, {
      path: req.originalUrl,
    }),
  );
});

app.listen(PORT, '0.0.0.0', () => {
  console.info(`[${SERVICE_NAME}] Listening on port ${PORT}`);
});
