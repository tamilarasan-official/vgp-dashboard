-- CreateTable
CREATE TABLE "fs_payment" (
    "id" BIGSERIAL NOT NULL,
    "property_id" INTEGER NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "pre_amount" DECIMAL(12,2) NOT NULL,
    "recharge_amount" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "collect_amount" DECIMAL(12,2) NOT NULL,
    "taxable_amount" DECIMAL(12,2) NOT NULL,
    "cgst_amount" DECIMAL(12,2) NOT NULL,
    "sgst_amount" DECIMAL(12,2) NOT NULL,
    "main_amount" DECIMAL(12,2) NOT NULL,
    "bonus_amount" DECIMAL(12,2) NOT NULL,
    "post_amount" DECIMAL(12,2) NOT NULL,
    "cashier" TEXT,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "business_date" DATE NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fs_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fs_game_play" (
    "id" BIGSERIAL NOT NULL,
    "property_id" INTEGER NOT NULL,
    "billing_id" INTEGER NOT NULL,
    "game" TEXT NOT NULL,
    "pre_amount" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL,
    "post_amount" DECIMAL(12,2) NOT NULL,
    "played_at" TIMESTAMPTZ(6) NOT NULL,
    "business_date" DATE NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fs_game_play_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fs_daily_stat" (
    "id" BIGSERIAL NOT NULL,
    "property_id" INTEGER NOT NULL,
    "business_date" DATE NOT NULL,
    "cards_issued" INTEGER NOT NULL,
    "cards_returned" INTEGER NOT NULL,
    "card_collection" DECIMAL(12,2) NOT NULL,
    "direct_sale" DECIMAL(12,2) NOT NULL,
    "grand_total" DECIMAL(12,2) NOT NULL,
    "game_play_count" INTEGER NOT NULL,
    "game_play_amount" DECIMAL(12,2) NOT NULL,
    "by_payment_mode" JSONB NOT NULL,
    "by_game" JSONB NOT NULL,
    "direct_items" JSONB NOT NULL,
    "card_types" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fs_daily_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fs_tech_punch" (
    "id" BIGSERIAL NOT NULL,
    "property_id" INTEGER NOT NULL,
    "punch_id" INTEGER NOT NULL,
    "game" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "punched_at" TIMESTAMPTZ(6) NOT NULL,
    "business_date" DATE NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fs_tech_punch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fs_payment_property_id_business_date_idx" ON "fs_payment"("property_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "fs_payment_property_id_payment_id_key" ON "fs_payment"("property_id", "payment_id");

-- CreateIndex
CREATE INDEX "fs_game_play_property_id_business_date_idx" ON "fs_game_play"("property_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "fs_game_play_property_id_billing_id_key" ON "fs_game_play"("property_id", "billing_id");

-- CreateIndex
CREATE UNIQUE INDEX "fs_daily_stat_property_id_business_date_key" ON "fs_daily_stat"("property_id", "business_date");

-- CreateIndex
CREATE INDEX "fs_tech_punch_property_id_business_date_idx" ON "fs_tech_punch"("property_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "fs_tech_punch_property_id_punch_id_key" ON "fs_tech_punch"("property_id", "punch_id");

-- AddForeignKey
ALTER TABLE "fs_payment" ADD CONSTRAINT "fs_payment_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fs_game_play" ADD CONSTRAINT "fs_game_play_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fs_daily_stat" ADD CONSTRAINT "fs_daily_stat_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fs_tech_punch" ADD CONSTRAINT "fs_tech_punch_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
