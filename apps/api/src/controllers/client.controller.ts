import { Request, Response } from 'express';
import * as clientService from '../services/client.service';

// Controllers stay thin: pull the authenticated user + params off the request,
// call a service, shape the HTTP response. `req.user` is guaranteed by
// requireAuth on the router; `req.body` is already validated by the DTO
// middleware. All business logic and DB access lives in the service layer.

export async function listClients(req: Request, res: Response) {
  const clients = await clientService.listClients(req.user!.id);
  res.status(200).json({ clients });
}

export async function listArchivedClients(req: Request, res: Response) {
  const clients = await clientService.listArchivedClients(req.user!.id);
  res.status(200).json({ clients });
}

export async function getClient(req: Request, res: Response) {
  const client = await clientService.getClient(req.user!.id, req.params.clientId as string);
  res.status(200).json({ client });
}

export async function createClient(req: Request, res: Response) {
  const client = await clientService.createClient(req.user!.id, req.body);
  res.status(201).json({ client });
}

export async function updateClient(req: Request, res: Response) {
  const client = await clientService.updateClient(
    req.user!.id,
    req.params.clientId as string,
    req.body
  );
  res.status(200).json({ client });
}

export async function archiveClient(req: Request, res: Response) {
  const client = await clientService.archiveClient(req.user!.id, req.params.clientId as string);
  res.status(200).json({ client });
}

export async function unarchiveClient(req: Request, res: Response) {
  const client = await clientService.unarchiveClient(req.user!.id, req.params.clientId as string);
  res.status(200).json({ client });
}

export async function deleteClient(req: Request, res: Response) {
  await clientService.deleteClient(req.user!.id, req.params.clientId as string);
  res.status(204).send();
}
