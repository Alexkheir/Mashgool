import { Request, Response } from 'express';
import * as extractionService from '../services/ai/extraction.service';

// Thin as ever: the AI endpoints carry no more HTTP logic than the CRUD ones.

// A successful extraction is a 200, not a 201 — nothing was created. The task
// itself is created later, if the user accepts the result, through the ordinary
// task-create endpoint. That split is what lets the user edit the extraction
// before anything is written (Feature 13, "Review Before Save").
//
// "No actionable task" is also a 200: the pipeline worked and produced a
// well-formed answer, and the answer is "there's nothing here". The client
// branches on `extraction.hasActionableTask`, not on the status code.
export async function extractTask(req: Request, res: Response) {
  const result = await extractionService.extractTaskFromText(req.user!.id, req.body.text);
  res.status(200).json(result);
}
