import { PrismaClient } from '@prisma/client';

// A single PrismaClient per process. In dev, `tsx watch` reloads the module
// tree on every change; without caching the instance on globalThis each reload
// would open a new connection pool and eventually exhaust Postgres connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
