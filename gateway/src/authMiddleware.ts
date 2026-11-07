import jwt from 'jsonwebtoken';

import { AppError } from './errors.js';

import type { NextFunction, Request, Response } from 'express';

export interface JwtUserPayload {
  sub: string;
  email: string;
  role: 'ADM' | 'LIDER_TESTES' | 'QA' | 'DEV';
}

const PUBLIC_AUTH_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/health',
]);

export function createAuthContextMiddleware(jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Strip any external spoofed internal headers before processing
    delete req.headers['x-user-id'];
    delete req.headers['x-user-role'];
    delete req.headers['x-user-email'];

    const normalizedPath = req.originalUrl.split('?')[0] ?? req.path;

    if (req.method === 'OPTIONS' || PUBLIC_AUTH_PATHS.has(normalizedPath)) {
      next();
      return;
    }

    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const cookieToken = cookies?.accessToken ?? cookies?.access_token;
    const authHeader = req.headers.authorization;
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined;

    const token = cookieToken ?? bearerToken;

    if (!token) {
      next(
        new AppError(401, 'Authentication required. Missing valid AccessToken.', {
          path: normalizedPath,
        }),
      );
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as JwtUserPayload;
      if (!decoded.sub || !decoded.role) {
        next(
          new AppError(401, 'Invalid token claims: missing subject or role.', {
            path: normalizedPath,
          }),
        );
        return;
      }

      req.headers['x-user-id'] = decoded.sub;
      req.headers['x-user-role'] = decoded.role;
      if (decoded.email) {
        req.headers['x-user-email'] = decoded.email;
      }
      next();
    } catch {
      next(
        new AppError(401, 'Invalid or expired AccessToken.', {
          path: normalizedPath,
        }),
      );
    }
  };
}
