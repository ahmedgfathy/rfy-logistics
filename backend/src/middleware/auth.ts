import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env, isProduction } from '../config/env';
import { ApiError } from './error';
import { prisma } from '../lib/prisma';

export const AUTH_COOKIE = 'marsa_session';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

interface TokenPayload {
  sub: string;
  role: Role;
}

export function signSessionToken(user: AuthUser): string {
  const payload: TokenPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, { httpOnly: true, sameSite: isProduction ? 'none' : 'lax', secure: isProduction, path: '/' });
}

function extractToken(req: Request): string | null {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Populates req.user when a valid session exists; never throws. */
export const attachUser: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (user && user.isActive) {
      (req as AuthenticatedRequest).user = { id: user.id, email: user.email, name: user.name, role: user.role };
    }
  } catch {
    // invalid/expired token -> treated as anonymous
  }
  return next();
};

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    next(ApiError.unauthorized());
    return;
  }
  next();
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) return next(ApiError.unauthorized());
    if (!roles.includes(user.role)) return next(ApiError.forbidden());
    return next();
  };
}

export function requirePermission(...required: string[]): RequestHandler {
  return async (req, _res, next) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) return next(ApiError.unauthorized());
    if (user.role === 'ADMIN') return next();

    const roles = await prisma.userAccessRole.findMany({
      where: { userId: user.id },
      select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } },
    });
    const granted = new Set(roles.flatMap((row) => row.role.permissions.map((item) => item.permission.key)));
    if (!required.some((permission) => granted.has(permission))) return next(ApiError.forbidden());
    return next();
  };
}

export function currentUser(req: Request): AuthUser {
  const user = (req as AuthenticatedRequest).user;
  if (!user) throw ApiError.unauthorized();
  return user;
}
