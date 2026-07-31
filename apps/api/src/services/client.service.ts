import { Prisma, type Client } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { writeAuditLog } from './audit.service';
import type { CreateClientInput, UpdateClientInput } from '../dtos/client.dto';

// The public shape of a client — an explicit whitelist so internal columns
// (userId, taskCounter) can never leak into an API response by accident.
// `openTaskCount` is the number of not-Done tasks, surfaced on the client card
// (Feature 8 spec). It's populated on the list endpoints; mutation responses
// return 0 and rely on the frontend refetching the list for the live figure.
export interface ClientResponse {
  id: string;
  name: string;
  shortCode: string;
  description: string | null;
  color: string;
  isArchived: boolean;
  openTaskCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function toClientResponse(client: Client, openTaskCount = 0): ClientResponse {
  return {
    id: client.id,
    name: client.name,
    shortCode: client.shortCode,
    description: client.description,
    color: client.color,
    isArchived: client.isArchived,
    openTaskCount,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt
  };
}

// A Prisma include that counts only the client's open (not-Done) tasks. Kept in
// one place so the active and archived list queries stay in sync.
const openTaskCountInclude = {
  _count: { select: { tasks: { where: { status: { not: 'DONE' as const } } } } }
} satisfies Prisma.ClientInclude;

// Every read/write is scoped to the owner. A client the user doesn't own is
// indistinguishable from one that doesn't exist — we return 404, never 403, so
// we never confirm the existence of another user's resource (a CLAUDE.md rule).
async function findOwnedClientOrThrow(
  userId: string,
  clientId: string
): Promise<Client> {
  const client = await prisma.client.findFirst({ where: { id: clientId, userId } });
  if (!client) {
    throw new AppError(404, 'Client not found');
  }
  return client;
}

// Translates a Postgres unique-constraint violation into a clean 409 the user
// can act on. `(userId, name)` and `(userId, shortCode)` are the two unique
// indexes; P2002's target tells us which one tripped. Anything else is rethrown
// untouched for the global handler to deal with.
function mapClientWriteError(err: unknown, shortCode?: string): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = String(
      (err.meta as { target?: string[] | string } | undefined)?.target ?? ''
    );
    if (target.includes('short_code') || target.includes('shortCode')) {
      return new AppError(
        409,
        `Short code "${shortCode ?? ''}" is already in use. Choose a different one.`
      );
    }
    if (target.includes('name')) {
      return new AppError(409, 'A client with this name already exists.');
    }
    return new AppError(409, 'That client already exists.');
  }
  return err;
}

export async function listClients(userId: string): Promise<ClientResponse[]> {
  const clients = await prisma.client.findMany({
    where: { userId, isArchived: false },
    include: openTaskCountInclude,
    orderBy: { createdAt: 'asc' }
  });
  return clients.map((client) => toClientResponse(client, client._count.tasks));
}

export async function listArchivedClients(userId: string): Promise<ClientResponse[]> {
  const clients = await prisma.client.findMany({
    where: { userId, isArchived: true },
    include: openTaskCountInclude,
    orderBy: { updatedAt: 'desc' }
  });
  return clients.map((client) => toClientResponse(client, client._count.tasks));
}

export async function getClient(
  userId: string,
  clientId: string
): Promise<ClientResponse> {
  return toClientResponse(await findOwnedClientOrThrow(userId, clientId));
}

export async function createClient(
  userId: string,
  input: CreateClientInput
): Promise<ClientResponse> {
  try {
    const client = await prisma.client.create({
      data: {
        userId,
        name: input.name,
        shortCode: input.shortCode,
        description: input.description ?? null,
        // Omit when absent so the schema default (#4A90D9) applies.
        ...(input.color ? { color: input.color } : {})
      }
    });

    writeAuditLog({
      userId,
      action: 'CLIENT_CREATED',
      entityType: 'CLIENT',
      entityId: client.id,
      description: `Created client "${client.name}" (${client.shortCode})`,
      metadata: { name: client.name, shortCode: client.shortCode }
    });

    return toClientResponse(client);
  } catch (err) {
    throw mapClientWriteError(err, input.shortCode);
  }
}

export async function updateClient(
  userId: string,
  clientId: string,
  input: UpdateClientInput
): Promise<ClientResponse> {
  await findOwnedClientOrThrow(userId, clientId);

  try {
    const client = await prisma.client.update({
      where: { id: clientId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.color !== undefined ? { color: input.color } : {})
      }
    });

    writeAuditLog({
      userId,
      action: 'CLIENT_UPDATED',
      entityType: 'CLIENT',
      entityId: client.id,
      description: `Updated client "${client.name}"`,
      metadata: { fields: Object.keys(input) }
    });

    return toClientResponse(client);
  } catch (err) {
    throw mapClientWriteError(err);
  }
}

export async function archiveClient(
  userId: string,
  clientId: string
): Promise<ClientResponse> {
  const existing = await findOwnedClientOrThrow(userId, clientId);
  if (existing.isArchived) {
    return toClientResponse(existing); // idempotent — already archived
  }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: { isArchived: true }
  });

  writeAuditLog({
    userId,
    action: 'CLIENT_ARCHIVED',
    entityType: 'CLIENT',
    entityId: client.id,
    description: `Archived client "${client.name}"`
  });

  return toClientResponse(client);
}

export async function unarchiveClient(
  userId: string,
  clientId: string
): Promise<ClientResponse> {
  const existing = await findOwnedClientOrThrow(userId, clientId);
  if (!existing.isArchived) {
    return toClientResponse(existing); // idempotent — already active
  }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: { isArchived: false }
  });

  writeAuditLog({
    userId,
    action: 'CLIENT_UNARCHIVED',
    entityType: 'CLIENT',
    entityId: client.id,
    description: `Unarchived client "${client.name}"`
  });

  return toClientResponse(client);
}

// Permanent — cascades to the client's tasks (Feature 9) via the FK. The
// retired short code / task numbers are never reused: taskCounter lives on the
// client row and dies with it, and a brand-new client starts its own counter.
export async function deleteClient(userId: string, clientId: string): Promise<void> {
  const existing = await findOwnedClientOrThrow(userId, clientId);

  await prisma.client.delete({ where: { id: clientId } });

  writeAuditLog({
    userId,
    action: 'CLIENT_DELETED',
    entityType: 'CLIENT',
    entityId: existing.id,
    description: `Deleted client "${existing.name}" (${existing.shortCode})`,
    metadata: { name: existing.name, shortCode: existing.shortCode }
  });
}
