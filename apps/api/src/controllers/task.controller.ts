import { Request, Response } from 'express';
import * as taskService from '../services/task.service';
import type { ListTasksQuery } from '../dtos/task.dto';

// Controllers stay thin: pull the authenticated user + params off the request,
// call a service, shape the HTTP response. `req.user` is guaranteed by
// requireAuth; `req.body` is validated by `validate`; the list query is
// validated by `validateQuery`, which leaves the parsed result on res.locals.

export async function listTasks(req: Request, res: Response) {
  const result = await taskService.listTasks(
    req.user!.id,
    req.params.clientId as string,
    res.locals.query as ListTasksQuery
  );
  res.status(200).json(result);
}

export async function createTask(req: Request, res: Response) {
  const task = await taskService.createTask(
    req.user!.id,
    req.params.clientId as string,
    req.body
  );
  res.status(201).json({ task });
}

export async function getClientBoard(req: Request, res: Response) {
  const columns = await taskService.getClientBoard(
    req.user!.id,
    req.params.clientId as string
  );
  res.status(200).json({ columns });
}

export async function getGlobalBoard(req: Request, res: Response) {
  const columns = await taskService.getGlobalBoard(req.user!.id);
  res.status(200).json({ columns });
}

export async function moveTask(req: Request, res: Response) {
  const task = await taskService.moveTask(
    req.user!.id,
    req.params.taskId as string,
    req.body
  );
  res.status(200).json({ task });
}

export async function getTask(req: Request, res: Response) {
  const task = await taskService.getTask(req.user!.id, req.params.taskId as string);
  res.status(200).json({ task });
}

export async function updateTask(req: Request, res: Response) {
  const task = await taskService.updateTask(
    req.user!.id,
    req.params.taskId as string,
    req.body
  );
  res.status(200).json({ task });
}

export async function changeTaskStatus(req: Request, res: Response) {
  const task = await taskService.changeTaskStatus(
    req.user!.id,
    req.params.taskId as string,
    req.body.status
  );
  res.status(200).json({ task });
}

export async function deleteTask(req: Request, res: Response) {
  await taskService.deleteTask(req.user!.id, req.params.taskId as string);
  res.status(204).send();
}
