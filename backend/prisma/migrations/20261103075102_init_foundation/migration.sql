-- CreateTable
CREATE TABLE "property" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_system" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "access_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_system_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run" (
    "id" BIGSERIAL NOT NULL,
    "source_id" INTEGER NOT NULL,
    "property_id" INTEGER,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "range_from" TIMESTAMP(3),
    "range_to" TIMESTAMP(3),
    "records_read" INTEGER NOT NULL DEFAULT 0,
    "records_written" INTEGER NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "error" TEXT,

    CONSTRAINT "sync_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_code_key" ON "property"("code");

-- CreateIndex
CREATE UNIQUE INDEX "source_system_code_key" ON "source_system"("code");

-- CreateIndex
CREATE INDEX "sync_run_source_id_started_at_idx" ON "sync_run"("source_id", "started_at");

-- AddForeignKey
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source_system"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
