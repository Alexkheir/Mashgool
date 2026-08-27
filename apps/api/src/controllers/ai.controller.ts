import { Request, Response } from 'express';
import * as extractionService from '../services/ai/extraction.service';
import * as transcriptionService from '../services/ai/transcription.service';
import type { AudioInput } from '../services/ai/types';

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
  const result = await extractionService.extractTaskFromText(req.user!.id, req.body.text, 'paste');
  res.status(200).json(result);
}

// Step one of voice-to-task: audio in, transcript out. Also a 200 with nothing
// persisted — the transcript is shown to the user to correct before it goes any
// further, and a note they discard at that point should leave no trace.
//
// The audio has already been parsed, size-checked and format-checked by the
// upload middleware; the controller only hands it on.
export async function transcribe(req: Request, res: Response) {
  const audio = res.locals.audio as AudioInput;
  const result = await transcriptionService.transcribeAudio(req.user!.id, audio);
  res.status(200).json(result);
}

// Step two: the transcript the user confirmed, through the same extraction the
// pasted message gets. Splitting it from /transcribe is what lets the UI show
// two-step progress, and what lets a failure here be retried from the transcript
// without re-recording (both Feature 14 rules).
export async function structureTask(req: Request, res: Response) {
  const result = await extractionService.extractTaskFromText(req.user!.id, req.body.transcript, 'voice');
  res.status(200).json(result);
}
