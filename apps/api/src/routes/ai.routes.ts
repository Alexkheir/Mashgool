import { Router } from 'express';
import * as aiController from '../controllers/ai.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { ExtractTaskDto } from '../dtos/ai.dto';

// The AI pipeline is deliberately several endpoints rather than one (CLAUDE.md).
// Feature 13 adds the first: text in, structured task out, nothing persisted.
// Features 14 adds `/transcribe` and `/structure` alongside it, so voice can
// show two-step progress and let the user correct the transcript in between.
export const aiRouter = Router();
aiRouter.use(requireAuth);

aiRouter.post('/extract', validate(ExtractTaskDto), aiController.extractTask);
