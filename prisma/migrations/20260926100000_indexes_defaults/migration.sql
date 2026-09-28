-- AlterTable
ALTER TABLE "ai_messages" ALTER COLUMN "from_cache" SET DEFAULT false;

-- AlterTable
ALTER TABLE "branches" ALTER COLUMN "is_main" SET DEFAULT false;

-- AlterTable
ALTER TABLE "courses" ALTER COLUMN "is_featured" SET DEFAULT false;

-- AlterTable
ALTER TABLE "db_backups" ALTER COLUMN "file_size" SET DEFAULT 0,
ALTER COLUMN "db_size" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "exam_attempts" ALTER COLUMN "mcq_score" SET DEFAULT 0,
ALTER COLUMN "cq_score" SET DEFAULT 0,
ALTER COLUMN "total_score" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "exam_questions" ALTER COLUMN "marks" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "exam_results" ALTER COLUMN "is_absent" SET DEFAULT false;

-- AlterTable
ALTER TABLE "exams" ALTER COLUMN "total_marks" SET DEFAULT 0,
ALTER COLUMN "pass_marks" SET DEFAULT 0,
ALTER COLUMN "duration_minutes" SET DEFAULT 60,
ALTER COLUMN "negative_marking" SET DEFAULT 0,
ALTER COLUMN "allow_file_upload" SET DEFAULT true,
ALTER COLUMN "result_published" SET DEFAULT false;

-- AlterTable
ALTER TABLE "fee_discounts" ALTER COLUMN "is_active" SET DEFAULT true;

-- AlterTable
ALTER TABLE "fee_reminders" ALTER COLUMN "due_amount" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "gallery" ALTER COLUMN "featured" SET DEFAULT false;

-- AlterTable
ALTER TABLE "gifts" ALTER COLUMN "is_active" SET DEFAULT true;

-- AlterTable
ALTER TABLE "guardians" ALTER COLUMN "must_change_password" SET DEFAULT true;

-- AlterTable
ALTER TABLE "installment_plans" ALTER COLUMN "interval_months" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "live_classes" ALTER COLUMN "duration_minutes" SET DEFAULT 60;

-- AlterTable
ALTER TABLE "monthly_exam_subjects" ALTER COLUMN "full_marks" SET DEFAULT 100,
ALTER COLUMN "pass_marks" SET DEFAULT 33;

-- AlterTable
ALTER TABLE "monthly_exams" ALTER COLUMN "total_marks" SET DEFAULT 0,
ALTER COLUMN "full_marks" SET DEFAULT 100,
ALTER COLUMN "pass_marks" SET DEFAULT 33,
ALTER COLUMN "show_position" SET DEFAULT true;

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "is_read" SET DEFAULT false;

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "due_amount" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "printable_documents" ALTER COLUMN "student_visible" SET DEFAULT false;

-- AlterTable
ALTER TABLE "promotions" ALTER COLUMN "is_active" SET DEFAULT true;

-- AlterTable
ALTER TABLE "student_login" ALTER COLUMN "must_change_password" SET DEFAULT false;

-- AlterTable
ALTER TABLE "teachers" ALTER COLUMN "show_on_website" SET DEFAULT false;

-- AlterTable
ALTER TABLE "visitor_logs" ALTER COLUMN "is_new_visitor" SET DEFAULT false;

-- AlterTable
ALTER TABLE "visitor_monthly_summary" ALTER COLUMN "avg_daily_visits" SET DEFAULT 0;

-- CreateIndex
CREATE INDEX "exam_results_exam_date_idx" ON "exam_results"("exam_date");

-- CreateIndex
CREATE INDEX "live_classes_teacher_id_class_date_idx" ON "live_classes"("teacher_id", "class_date");

-- CreateIndex
CREATE INDEX "note_email_logs_note_id_status_idx" ON "note_email_logs"("note_id", "status");

-- CreateIndex
CREATE INDEX "note_email_logs_sent_at_idx" ON "note_email_logs"("sent_at");

