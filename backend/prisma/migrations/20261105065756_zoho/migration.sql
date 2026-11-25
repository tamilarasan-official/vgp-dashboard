-- CreateTable
CREATE TABLE "zoho_lead" (
    "id" BIGINT NOT NULL,
    "created_time" TIMESTAMP(3) NOT NULL,
    "modified_time" TIMESTAMP(3) NOT NULL,
    "industry" TEXT,
    "lead_source" TEXT,
    "lead_status" TEXT,
    "offer" TEXT,
    "vgp_line" TEXT,
    "owner_id" TEXT,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zoho_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zoho_call" (
    "id" BIGINT NOT NULL,
    "start_time" TIMESTAMP(3),
    "created_time" TIMESTAMP(3) NOT NULL,
    "modified_time" TIMESTAMP(3) NOT NULL,
    "call_type" TEXT NOT NULL,
    "call_result" TEXT,
    "call_purpose" TEXT,
    "outgoing_status" TEXT,
    "duration_sec" INTEGER,
    "vgp_line" TEXT,
    "lead_id" BIGINT,
    "owner_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zoho_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zoho_user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zoho_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zoho_line" (
    "number" TEXT NOT NULL,
    "property_code" TEXT,
    "label" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zoho_line_pkey" PRIMARY KEY ("number")
);

-- CreateIndex
CREATE INDEX "zoho_lead_created_time_idx" ON "zoho_lead"("created_time");

-- CreateIndex
CREATE INDEX "zoho_lead_modified_time_idx" ON "zoho_lead"("modified_time");

-- CreateIndex
CREATE INDEX "zoho_call_start_time_idx" ON "zoho_call"("start_time");

-- CreateIndex
CREATE INDEX "zoho_call_modified_time_idx" ON "zoho_call"("modified_time");
