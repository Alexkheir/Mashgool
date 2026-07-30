-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('USER_SIGNED_IN', 'USER_SIGNED_OUT', 'USER_AUTH_FAILED', 'CLIENT_CREATED', 'CLIENT_UPDATED', 'CLIENT_ARCHIVED', 'CLIENT_UNARCHIVED', 'CLIENT_DELETED', 'TASK_CREATED', 'TASK_UPDATED', 'TASK_STATUS_CHANGED', 'TASK_DELETED', 'AI_EXTRACTION_TRIGGERED', 'AI_TRANSCRIPTION_TRIGGERED');

-- CreateEnum
CREATE TYPE "entity_type" AS ENUM ('USER', 'CLIENT', 'TASK');

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_code" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#4A90D9',
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "task_counter" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" "audit_action" NOT NULL,
    "entity_type" "entity_type",
    "entity_id" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_user_id_idx" ON "clients"("user_id");

-- CreateIndex
CREATE INDEX "clients_user_id_is_archived_idx" ON "clients"("user_id", "is_archived");

-- CreateIndex
CREATE UNIQUE INDEX "clients_user_id_name_key" ON "clients"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "clients_user_id_short_code_key" ON "clients"("user_id", "short_code");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_action_idx" ON "audit_logs"("user_id", "action");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_entity_type_idx" ON "audit_logs"("user_id", "entity_type");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
