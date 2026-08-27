import { Router } from 'express';
import * as aiController from '../controllers/ai.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { uploadAudio, validateAudioUpload } from '../middleware/upload.middleware';
import { ExtractTaskDto, StructureTaskDto } from '../dtos/ai.dto';

// The AI pipeline is deliberately several endpoints rather than one (CLAUDE.md).
// Feature 13 added the first: text in, structured task out, nothing persisted.
// Feature 14 adds `/transcribe` and `/structure` alongside it, so voice can show
// two-step progress and let the user correct the transcript in between.
//
// None of the three writes anything. The task is created afterwards, if the user
// accepts what came back, through the ordinary task-create endpoint.
export const aiRouter = Router();
aiRouter.use(requireAuth);

aiRouter.post('/extract', validate(ExtractTaskDto), aiController.extractTask);

// Multipart rather than JSON, so it takes the upload pair — parse, then
// validate — in place of the `validate` middleware every other route uses.
aiRouter.post('/transcribe', uploadAudio, validateAudioUpload, aiController.transcribe);
aiRouter.post('/structure', validate(StructureTaskDto), aiController.structureTask);
