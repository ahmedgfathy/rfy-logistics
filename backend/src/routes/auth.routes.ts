import { Router } from 'express';
import { login, logout, me } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { loginSchema } from '../validators/schemas';
import { authLimiter } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

export const authRoutes = Router();

authRoutes.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(login));
authRoutes.post('/logout', asyncHandler(logout));
authRoutes.get('/me', requireAuth, asyncHandler(me));
