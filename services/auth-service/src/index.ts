import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';

import { evaluateFailedAttempt, FAILED_ATTEMPTS_THRESHOLD } from './bruteForce.js';
import { toPublicUser } from './db.js';
import { AppError, buildRfcError } from './errors.js';
import { UserRepository } from './userRepository.js';

import type { ThemePreference, UserRole } from './db.js';
import type { NextFunction, Request, Response } from 'express';

export const SERVICE_NAME = 'auth-service';

const PORT = Number(process.env.PORT ?? process.env.AUTH_SERVICE_PORT ?? 5001);
const JWT_SECRET = process.env.JWT_SECRET ?? 'super_jwt_secret_token';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? JWT_SECRET;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1h
const REFRESH_TOKEN_TTL_SECONDS = 3600; // 1h

const VALID_ROLES = new Set<UserRole>(['ADM', 'LIDER_TESTES', 'QA', 'DEV']);
const VALID_THEMES = new Set<ThemePreference>(['LIGHT', 'DARK']);

interface JwtClaims {
  sub: string;
  email: string;
  role: UserRole;
  type?: 'access' | 'refresh';
}

const userRepo = new UserRepository();
const app = express();

app.use(express.json());
app.use(cookieParser());

function issueSessionCookies(
  res: Response,
  user: { id: string; email: string; role: UserRole },
): { accessToken: string; refreshToken: string; csrfToken: string } {
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );

  const refreshToken = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL_SECONDS },
  );

  const csrfToken = crypto.randomBytes(24).toString('hex');

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'strict',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });

  res.cookie('csrfToken', csrfToken, {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: 'strict',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });

  return { accessToken, refreshToken, csrfToken };
}

function resolveAuthenticatedUser(req: Request): { userId: string; userRole: UserRole } {
  const headerUserId = req.headers['x-user-id'];
  const headerUserRole = req.headers['x-user-role'];

  if (
    typeof headerUserId === 'string' &&
    typeof headerUserRole === 'string' &&
    VALID_ROLES.has(headerUserRole as UserRole)
  ) {
    return { userId: headerUserId, userRole: headerUserRole as UserRole };
  }

  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const cookieToken = cookies?.accessToken;
  const authHeader = req.headers.authorization;
  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

  const token = cookieToken ?? bearerToken;
  if (!token) {
    throw new AppError(401, 'Authentication required. Missing valid AccessToken.');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtClaims;
    return { userId: decoded.sub, userRole: decoded.role };
  } catch {
    throw new AppError(401, 'Invalid or expired AccessToken.');
  }
}

// Healthcheck
app.get(['/health', '/api/v1/auth/health'], (_req: Request, res: Response) => {
  res.status(200).json({ service: SERVICE_NAME, status: 'UP' });
});

// [2.2.2, 2.2.3, 2.2.4] POST /api/v1/auth/login
app.post('/api/v1/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as { email?: unknown; password?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      throw new AppError(400, 'Both email and password are required.', {
        fields: ['email', 'password'],
      });
    }

    const user = await userRepo.findByEmail(email);
    if (!user) {
      throw new AppError(401, 'Invalid email or password.');
    }

    if (!user.is_active) {
      throw new AppError(403, 'User account is deactivated. Contact an administrator.');
    }

    const now = new Date();
    if (user.suspended_until && user.suspended_until.getTime() > now.getTime()) {
      const remainingSeconds = Math.ceil((user.suspended_until.getTime() - now.getTime()) / 1000);
      throw new AppError(
        429,
        `Account is temporarily suspended due to repeated failed login attempts. Try again in ${remainingSeconds} seconds.`,
        {
          suspendedUntil: user.suspended_until.toISOString(),
          suspensionLevel: user.suspension_level,
          remainingSeconds,
        },
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      // If a previous suspension expired, reset failed_attempts count for the new window while keeping suspension_level
      const baseFailedAttempts =
        user.failed_attempts >= FAILED_ATTEMPTS_THRESHOLD ? 0 : user.failed_attempts;
      const evaluation = evaluateFailedAttempt(baseFailedAttempts, user.suspension_level, now);

      await userRepo.recordFailedAttempt(
        user.id,
        evaluation.newFailedAttempts,
        evaluation.newSuspensionLevel,
        evaluation.suspendedUntil,
      );

      if (evaluation.locked && evaluation.suspendedUntil) {
        throw new AppError(
          429,
          `Account locked for ${evaluation.lockDurationMinutes} minutes after ${FAILED_ATTEMPTS_THRESHOLD} failed login attempts (Stage ${evaluation.newSuspensionLevel}).`,
          {
            failedAttempts: evaluation.newFailedAttempts,
            suspensionLevel: evaluation.newSuspensionLevel,
            lockDurationMinutes: evaluation.lockDurationMinutes,
            suspendedUntil: evaluation.suspendedUntil.toISOString(),
          },
        );
      }

      throw new AppError(401, 'Invalid email or password.', {
        failedAttempts: evaluation.newFailedAttempts,
        remainingAttemptsBeforeLockout: FAILED_ATTEMPTS_THRESHOLD - evaluation.newFailedAttempts,
      });
    }

    // Reset failures upon successful login
    if (user.failed_attempts > 0 || user.suspension_level > 0 || user.suspended_until !== null) {
      await userRepo.resetFailedAttempts(user.id);
    }

    const refreshedUser = (await userRepo.findById(user.id)) ?? user;
    const tokens = issueSessionCookies(res, refreshedUser);

    res.status(200).json({
      message: 'Authentication successful.',
      user: toPublicUser(refreshedUser),
      csrfToken: tokens.csrfToken,
    });
  } catch (err) {
    next(err);
  }
});

// [2.2.5] POST /api/v1/auth/refresh
app.post('/api/v1/auth/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const body = req.body as { refreshToken?: unknown } | undefined;
    const refreshToken =
      cookies?.refreshToken ??
      (typeof body?.refreshToken === 'string' ? body.refreshToken : undefined);

    if (!refreshToken) {
      throw new AppError(401, 'Missing RefreshToken cookie.');
    }

    let decoded: JwtClaims;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as JwtClaims;
    } catch {
      throw new AppError(401, 'Invalid or expired RefreshToken.');
    }

    const user = await userRepo.findById(decoded.sub);
    if (!user || !user.is_active) {
      throw new AppError(401, 'User session is no longer valid.');
    }

    const tokens = issueSessionCookies(res, user);
    res.status(200).json({
      message: 'Session tokens rotated successfully.',
      user: toPublicUser(user),
      csrfToken: tokens.csrfToken,
    });
  } catch (err) {
    next(err);
  }
});

// [2.2.6] POST /api/v1/auth/logout
app.post('/api/v1/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
  res.clearCookie('csrfToken', { path: '/' });
  res.status(200).json({ message: 'Logged out successfully.' });
});

// [2.2.7] GET /api/v1/auth/profile
app.get('/api/v1/auth/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = resolveAuthenticatedUser(req);
    const user = await userRepo.findById(userId);
    if (!user) {
      throw new AppError(404, 'Authenticated user profile not found.');
    }
    res.status(200).json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

// [2.2.7] PUT /api/v1/auth/profile
app.put('/api/v1/auth/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = resolveAuthenticatedUser(req);
    const body = req.body as {
      theme_preference?: unknown;
      font_scale_percent?: unknown;
    };

    let themePreference: ThemePreference | undefined;
    if (body.theme_preference !== undefined) {
      if (
        typeof body.theme_preference !== 'string' ||
        !VALID_THEMES.has(body.theme_preference as ThemePreference)
      ) {
        throw new AppError(422, 'theme_preference must be LIGHT or DARK.', {
          field: 'theme_preference',
          allowedValues: ['LIGHT', 'DARK'],
        });
      }
      themePreference = body.theme_preference as ThemePreference;
    }

    let fontScalePercent: number | undefined;
    if (body.font_scale_percent !== undefined) {
      const parsed = Number(body.font_scale_percent);
      if (!Number.isInteger(parsed) || parsed < 80 || parsed > 150) {
        throw new AppError(422, 'font_scale_percent must be an integer between 80 and 150.', {
          field: 'font_scale_percent',
          min: 80,
          max: 150,
        });
      }
      fontScalePercent = parsed;
    }

    const updated = await userRepo.updatePreferences(userId, themePreference, fontScalePercent);
    if (!updated) {
      throw new AppError(404, 'User profile not found.');
    }

    res.status(200).json({
      message: 'User profile preferences updated.',
      user: toPublicUser(updated),
    });
  } catch (err) {
    next(err);
  }
});

// [2.2.8] Admin CRUD Endpoints (/api/v1/auth/users) - Strictly restricted to ADM role
function requireAdminRole(req: Request): { userId: string; userRole: UserRole } {
  const auth = resolveAuthenticatedUser(req);
  if (auth.userRole !== 'ADM') {
    throw new AppError(403, 'Access denied. Only ADM role can manage user accounts.', {
      requiredRole: 'ADM',
      currentRole: auth.userRole,
    });
  }
  return auth;
}

app.get('/api/v1/auth/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminRole(req);
    const users = await userRepo.listAll();
    res.status(200).json({ users: users.map(toPublicUser) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/v1/auth/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminRole(req);
    const body = req.body as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
      role?: unknown;
    };

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = typeof body.role === 'string' ? (body.role as UserRole) : undefined;

    if (!name || !email || !password || !role || !VALID_ROLES.has(role)) {
      throw new AppError(
        422,
        'Invalid user provisioning payload. Required: name, email, password, role (ADM | LIDER_TESTES | QA | DEV).',
      );
    }

    const existing = await userRepo.findByEmail(email);
    if (existing) {
      throw new AppError(409, 'A user with this email already exists.', { email });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await userRepo.createUser({
      name,
      email,
      passwordHash,
      role,
    });

    res.status(201).json({
      message: 'User created successfully.',
      user: toPublicUser(created),
    });
  } catch (err) {
    next(err);
  }
});

app.put('/api/v1/auth/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminRole(req);
    const targetId = req.params.id;
    if (!targetId) {
      throw new AppError(400, 'Missing user id parameter.');
    }

    const body = req.body as {
      name?: unknown;
      role?: unknown;
      is_active?: unknown;
      password?: unknown;
      unlock_account?: unknown;
    };

    let role: UserRole | undefined;
    if (body.role !== undefined) {
      if (typeof body.role !== 'string' || !VALID_ROLES.has(body.role as UserRole)) {
        throw new AppError(422, 'Invalid role specified.');
      }
      role = body.role as UserRole;
    }

    const passwordHash =
      typeof body.password === 'string' && body.password.length >= 6
        ? await bcrypt.hash(body.password, 10)
        : undefined;

    const updated = await userRepo.updateUserByAdmin(targetId, {
      name: typeof body.name === 'string' ? body.name.trim() : undefined,
      role,
      isActive: typeof body.is_active === 'boolean' ? body.is_active : undefined,
      passwordHash,
      unlockAccount: body.unlock_account === true,
    });

    if (!updated) {
      throw new AppError(404, 'Target user not found.');
    }

    res.status(200).json({
      message: 'User updated successfully.',
      user: toPublicUser(updated),
    });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/v1/auth/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = requireAdminRole(req);
    const targetId = req.params.id;
    if (!targetId) {
      throw new AppError(400, 'Missing user id parameter.');
    }

    if (targetId === admin.userId) {
      throw new AppError(422, 'Administrators cannot delete their own active account.');
    }

    const deleted = await userRepo.softDeleteUser(targetId);
    if (!deleted) {
      throw new AppError(404, 'Target user not found.');
    }

    res.status(200).json({ message: 'User soft-deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// Global RFC Error Handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(buildRfcError(err.statusCode, err.message, err.details));
    return;
  }

  const fallbackMessage =
    err instanceof Error ? err.message : 'An unexpected error occurred in auth-service.';
  res.status(500).json(buildRfcError(500, fallbackMessage, { path: req.originalUrl }));
});

app.listen(PORT, '0.0.0.0', () => {
  console.info(`[${SERVICE_NAME}] Listening on port ${PORT}`);
});
