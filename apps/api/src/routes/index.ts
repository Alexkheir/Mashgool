import { Router } from 'express';
import { healthRouter } from './health.routes';
import { authRouter } from './auth.routes';
import { clientRouter } from './client.routes';
import { taskRouter, clientTaskRouter } from './task.routes';
import { aiRouter } from './ai.routes';

export const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/clients', clientRouter);
// Nested task routes are mounted with the client id in the path (mergeParams on
// the router exposes it). Declared before nothing else needs the prefix, so
// order here is not sensitive.
router.use('/clients/:clientId/tasks', clientTaskRouter);
router.use('/tasks', taskRouter);
router.use('/ai', aiRouter);
