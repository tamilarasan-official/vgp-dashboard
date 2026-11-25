-- CreateTable
CREATE TABLE "app_user" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(3),

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "company" TEXT,
    "period_from" DATE,
    "period_to" DATE,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "sheets" JSONB,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "uploaded_by_id" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE INDEX "upload_source_uploaded_at_idx" ON "upload"("source", "uploaded_at");

-- AddForeignKey
ALTER TABLE "upload" ADD CONSTRAINT "upload_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
