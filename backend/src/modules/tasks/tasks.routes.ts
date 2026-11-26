import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { createTask, listAssignableUsers, listTasks, updateTask } from './tasks.controller';
import { taskCreateSchema, taskParamsSchema, taskQuerySchema, taskUpdateSchema } from './tasks.schemas';

export const taskRoutes = Router();
taskRoutes.use(requireAuth);
taskRoutes.get('/assignees', requirePermission('tasks.read', 'tasks.write'), asyncHandler(listAssignableUsers));
taskRoutes.get('/', requirePermission('tasks.read'), validate({ query: taskQuerySchema }), asyncHandler(listTasks));
taskRoutes.post('/', requirePermission('tasks.write'), validate({ body: taskCreateSchema }), asyncHandler(createTask));
taskRoutes.patch('/:id', requirePermission('tasks.write'), validate({ params: taskParamsSchema, body: taskUpdateSchema }), asyncHandler(updateTask));
