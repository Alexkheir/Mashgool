#!/bin/sh
# Production entrypoint for the API container.
#
# Applies any pending database migrations, then hands off to the CMD (the
# server). `prisma migrate deploy` is idempotent — a no-op when the schema is
# already current — so it is safe to run on every container start. The db
# service is marked healthy by docker-compose before this container starts, so
# the database is reachable by the time we get here.
set -e

echo "[entrypoint] Applying database migrations..."
./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma

echo "[entrypoint] Starting API server..."
exec "$@"
