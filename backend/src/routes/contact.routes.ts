import { Router } from 'express';
import { createContact, listContacts, updateContactStatus } from '../controllers/contact.controller';
import { validate } from '../middleware/validate';
import { contactSchema, contactStatusSchema } from '../validators/schemas';
import { requireAuth } from '../middleware/auth';
import { submissionLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

export const contactRoutes = Router();

contactRoutes.post('/', submissionLimiter, validate({ body: contactSchema }), asyncHandler(createContact));
contactRoutes.get('/', requireAuth, asyncHandler(listContacts));
contactRoutes.patch('/:id/status', requireAuth, validate({ body: contactStatusSchema }), asyncHandler(updateContactStatus));
