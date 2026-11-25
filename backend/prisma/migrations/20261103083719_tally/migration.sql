-- CreateTable
CREATE TABLE "tally_company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "books_from" DATE,
    "property_id" INTEGER,
    "last_alter_id" BIGINT NOT NULL DEFAULT 0,
    "last_voucher_sync" TIMESTAMP(3),
    "last_master_sync" TIMESTAMP(3),
    "last_full_check" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tally_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_group" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "parent" TEXT,
    "primary_group" TEXT NOT NULL,
    "is_revenue" BOOLEAN NOT NULL,
    "affects_gross_profit" BOOLEAN NOT NULL,
    "is_deemed_positive" BOOLEAN NOT NULL,
    "category" TEXT,

    CONSTRAINT "tally_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_ledger" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "parent" TEXT,
    "primary_group" TEXT NOT NULL,
    "is_revenue" BOOLEAN NOT NULL,
    "opening_balance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "closing_balance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "alter_id" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "tally_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_voucher" (
    "id" BIGSERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "guid" TEXT NOT NULL,
    "alter_id" BIGINT NOT NULL,
    "master_id" BIGINT,
    "date" DATE NOT NULL,
    "voucher_type" TEXT NOT NULL,
    "voucher_number" TEXT,
    "party_ledger" TEXT,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tally_voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_voucher_line" (
    "id" BIGSERIAL NOT NULL,
    "voucher_id" BIGINT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "ledger_name" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "is_deemed_positive" BOOLEAN NOT NULL,
    "cost_centres" JSONB,

    CONSTRAINT "tally_voucher_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_heartbeat" (
    "agent_id" TEXT NOT NULL,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "info" JSONB NOT NULL,

    CONSTRAINT "agent_heartbeat_pkey" PRIMARY KEY ("agent_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tally_company_name_key" ON "tally_company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tally_group_company_id_name_key" ON "tally_group"("company_id", "name");

-- CreateIndex
CREATE INDEX "tally_ledger_company_id_primary_group_idx" ON "tally_ledger"("company_id", "primary_group");

-- CreateIndex
CREATE UNIQUE INDEX "tally_ledger_company_id_name_key" ON "tally_ledger"("company_id", "name");

-- CreateIndex
CREATE INDEX "tally_voucher_company_id_date_idx" ON "tally_voucher"("company_id", "date");

-- CreateIndex
CREATE INDEX "tally_voucher_company_id_alter_id_idx" ON "tally_voucher"("company_id", "alter_id");

-- CreateIndex
CREATE UNIQUE INDEX "tally_voucher_company_id_guid_key" ON "tally_voucher"("company_id", "guid");

-- CreateIndex
CREATE INDEX "tally_voucher_line_voucher_id_idx" ON "tally_voucher_line"("voucher_id");

-- CreateIndex
CREATE INDEX "tally_voucher_line_ledger_name_idx" ON "tally_voucher_line"("ledger_name");

-- AddForeignKey
ALTER TABLE "tally_company" ADD CONSTRAINT "tally_company_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_group" ADD CONSTRAINT "tally_group_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "tally_company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_ledger" ADD CONSTRAINT "tally_ledger_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "tally_company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_voucher" ADD CONSTRAINT "tally_voucher_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "tally_company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_voucher_line" ADD CONSTRAINT "tally_voucher_line_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "tally_voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
