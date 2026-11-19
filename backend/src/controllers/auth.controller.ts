import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { clearSessionCookie, currentUser, setSessionCookie, signSessionToken } from '../middleware/auth';
import { recordAudit } from '../services/audit.service';

const GENERIC_LOGIN_ERROR = 'Invalid email or password';

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Constant-ish time: always run a comparison so timing does not reveal accounts.
  const hash = user?.passwordHash ?? '$2a$12$invalidsaltinvalidsaltuO8.Y7zH9p7n2ZQ0h8wq7oQ9cQb1uS';
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid || !user.isActive) {
    await recordAudit({ action: 'auth.login.failed', entity: 'User', entityId: user?.id ?? null, ip: req.ip });
    throw new ApiError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
  }

  const token = signSessionToken({ id: user.id, email: user.email, name: user.name, role: user.role });
  setSessionCookie(res, token);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({ userId: user.id, action: 'auth.login', entity: 'User', entityId: user.id, ip: req.ip });

  res.json({
    data: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const user = (req as Request & { user?: { id: string } }).user;
  clearSessionCookie(res);
  if (user) {
    await recordAudit({ userId: user.id, action: 'auth.logout', entity: 'User', entityId: user.id, ip: req.ip });
  }
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: currentUser(req) });
}
