import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { quoteRoutes } from './quote.routes';
import { contactRoutes } from './contact.routes';
import { careerRoutes } from './career.routes';
import { catalogRoutes } from './catalog.routes';
import { adminRoutes } from './admin.routes';
import { erpRoutes } from '../modules/erp.routes';

export const apiRoutes = Router();

apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/quotes', quoteRoutes);
apiRoutes.use('/contact', contactRoutes);
apiRoutes.use('/careers', careerRoutes);
apiRoutes.use('/erp', erpRoutes);
apiRoutes.use('/admin', adminRoutes);
// services, news, settings, tracking live at the API root
apiRoutes.use('/', catalogRoutes);
