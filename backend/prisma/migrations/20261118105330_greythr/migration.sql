-- CreateTable
CREATE TABLE "hr_employee" (
    "id" INTEGER NOT NULL,
    "employee_no" TEXT NOT NULL,
    "date_of_join" DATE,
    "leaving_date" DATE,
    "left_org" BOOLEAN NOT NULL DEFAULT false,
    "status" INTEGER,
    "last_modified" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employee_category" (
    "id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "category_type" INTEGER NOT NULL,
    "value_id" INTEGER NOT NULL,
    "effective_from" DATE,
    "effective_to" DATE,

    CONSTRAINT "hr_employee_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_category_label" (
    "category_type" INTEGER NOT NULL,
    "value_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "property_code" TEXT,

    CONSTRAINT "hr_category_label_pkey" PRIMARY KEY ("category_type","value_id")
);

-- CreateTable
CREATE TABLE "hr_attendance_day" (
    "employee_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "shift_name" TEXT,
    "first_in" TIMESTAMP(3),
    "last_out" TIMESTAMP(3),
    "session1" TEXT,
    "session2" TEXT,
    "day_type" TEXT,
    "work_min" INTEGER,
    "actual_work_min" INTEGER,
    "leave_code" TEXT,
    "on_leave" BOOLEAN NOT NULL DEFAULT false,
    "late_in" BOOLEAN NOT NULL DEFAULT false,
    "early_out" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_attendance_day_pkey" PRIMARY KEY ("employee_id","date")
);

-- CreateIndex
CREATE INDEX "hr_employee_category_employee_id_idx" ON "hr_employee_category"("employee_id");

-- CreateIndex
CREATE INDEX "hr_attendance_day_date_idx" ON "hr_attendance_day"("date");
