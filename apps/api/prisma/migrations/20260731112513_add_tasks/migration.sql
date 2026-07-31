-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "creation_method" AS ENUM ('MANUAL', 'PASTE_TO_TASK', 'VOICE_TO_TASK');

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "task_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'TODO',
    "priority" "priority" NOT NULL DEFAULT 'MEDIUM',
    "due_date" TIMESTAMP(3),
    "board_order" INTEGER NOT NULL DEFAULT 0,
    "creation_method" "creation_method" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_client_id_idx" ON "tasks"("client_id");

-- CreateIndex
CREATE INDEX "tasks_client_id_status_idx" ON "tasks"("client_id", "status");

-- CreateIndex
CREATE INDEX "tasks_client_id_due_date_idx" ON "tasks"("client_id", "due_date");

-- CreateIndex
CREATE INDEX "tasks_client_id_priority_idx" ON "tasks"("client_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_client_id_task_key_key" ON "tasks"("client_id", "task_key");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
