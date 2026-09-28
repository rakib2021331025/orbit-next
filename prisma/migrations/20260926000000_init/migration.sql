-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'branch_admin');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('active', 'locked');

-- CreateEnum
CREATE TYPE "AdmissionBatchType" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "AdmissionGender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "AdmissionPaymentMethod" AS ENUM ('bkash', 'nagad');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('pending', 'under_review', 'payment_verified', 'payment_rejected', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('user', 'model', 'blocked');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'late', 'half_day');

-- CreateEnum
CREATE TYPE "AuthRememberTokenUserType" AS ENUM ('admin', 'teacher', 'student', 'guardian');

-- CreateEnum
CREATE TYPE "BatchBatchType" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "BranchCourseStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "CourseCourseType" AS ENUM ('online', 'offline', 'hybrid');

-- CreateEnum
CREATE TYPE "CourseEnrollmentStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "DbBackupScope" AS ENUM ('full', 'selected');

-- CreateEnum
CREATE TYPE "DbBackupStatus" AS ENUM ('success', 'failed');

-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('sent', 'failed');

-- CreateEnum
CREATE TYPE "EnrollmentBatchType" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ExamAnswerFileFileType" AS ENUM ('image', 'pdf');

-- CreateEnum
CREATE TYPE "ExamAnswerSelectedOption" AS ENUM ('a', 'b', 'c', 'd');

-- CreateEnum
CREATE TYPE "ExamAttemptStatus" AS ENUM ('in_progress', 'submitted', 'evaluated');

-- CreateEnum
CREATE TYPE "ExamAttemptSubmitMode" AS ENUM ('manual', 'auto');

-- CreateEnum
CREATE TYPE "ExamCreatedByType" AS ENUM ('admin', 'teacher');

-- CreateEnum
CREATE TYPE "ExamExamType" AS ENUM ('mcq', 'cq', 'mixed');

-- CreateEnum
CREATE TYPE "ExamQuestionCorrectOption" AS ENUM ('a', 'b', 'c', 'd');

-- CreateEnum
CREATE TYPE "ExamQuestionQuestionType" AS ENUM ('mcq', 'cq');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('draft', 'published', 'cancelled');

-- CreateEnum
CREATE TYPE "FeeDiscountDiscountType" AS ENUM ('fixed', 'percent');

-- CreateEnum
CREATE TYPE "FeeReminderChannel" AS ENUM ('email', 'whatsapp');

-- CreateEnum
CREATE TYPE "FeeReminderStatus" AS ENUM ('sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('pending', 'approved');

-- CreateEnum
CREATE TYPE "GalleryCategoryStatus" AS ENUM ('active', 'hidden');

-- CreateEnum
CREATE TYPE "GalleryStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "GuardianStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('new', 'called', 'admitted', 'not_interested');

-- CreateEnum
CREATE TYPE "InstallmentPlanStatus" AS ENUM ('active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "LiveClassClassMode" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "LiveClassCreatedByType" AS ENUM ('admin', 'teacher');

-- CreateEnum
CREATE TYPE "LiveClassMaterialUploadedByType" AS ENUM ('admin', 'teacher');

-- CreateEnum
CREATE TYPE "LiveClassStatus" AS ENUM ('scheduled', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "MonthlyExamStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "NoteEmailLogStatus" AS ENUM ('sent', 'failed');

-- CreateEnum
CREATE TYPE "NoticeStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "NotificationLogType" AS ENUM ('email', 'sms');

-- CreateEnum
CREATE TYPE "NotificationUserType" AS ENUM ('admin', 'teacher', 'student', 'guardian');

-- CreateEnum
CREATE TYPE "PasswordResetUserType" AS ENUM ('admin', 'teacher', 'student', 'guardian');

-- CreateEnum
CREATE TYPE "PaymentPaymentStatus" AS ENUM ('paid', 'unpaid');

-- CreateEnum
CREATE TYPE "PromotionDisplayPosition" AS ENUM ('top_bar', 'hero', 'home_section', 'popup');

-- CreateEnum
CREATE TYPE "PromotionStyle" AS ENUM ('green', 'yellow', 'dark', 'light');

-- CreateEnum
CREATE TYPE "RecordedClassStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "StudentGender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('pending', 'approved');

-- CreateEnum
CREATE TYPE "StudentStudentStatus" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "SubjectStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "TeacherStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "TrialClassStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "UserPreferenceTheme" AS ENUM ('light', 'dark');

-- CreateEnum
CREATE TYPE "UserPreferenceUserType" AS ENUM ('admin', 'teacher', 'student', 'guardian');

-- CreateEnum
CREATE TYPE "VisitorLogDeviceType" AS ENUM ('desktop', 'mobile', 'tablet');

-- CreateTable
CREATE TABLE "achievements" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "image" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notes" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT,
    "pdf_path" VARCHAR(255) NOT NULL,
    "batch" VARCHAR(100) NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(191),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branch_id" INTEGER,
    "role" "AdminRole" NOT NULL DEFAULT 'super_admin',
    "status" "AdminStatus" NOT NULL DEFAULT 'active',
    "last_login" TIMESTAMP(3),
    "created_by" INTEGER,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admissions" (
    "id" SERIAL NOT NULL,
    "application_no" VARCHAR(30),
    "fullname" VARCHAR(255) NOT NULL,
    "fullname_bn" VARCHAR(255),
    "father_name" VARCHAR(255) NOT NULL,
    "mother_name" VARCHAR(255) NOT NULL,
    "mobile" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "address" TEXT NOT NULL,
    "qualification" VARCHAR(255) NOT NULL,
    "course" VARCHAR(255) NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guardian_phone" VARCHAR(20),
    "date_of_birth" DATE,
    "gender" "AdmissionGender",
    "institution" VARCHAR(255),
    "photo" VARCHAR(255),
    "course_id" INTEGER,
    "batch_id" INTEGER,
    "batch_label" VARCHAR(150),
    "batch_type" "AdmissionBatchType",
    "payment_method" "AdmissionPaymentMethod",
    "transaction_id" VARCHAR(100),
    "sender_number" VARCHAR(20),
    "payment_amount" DECIMAL(10,2),
    "payment_screenshot" VARCHAR(255),
    "status" "AdmissionStatus" NOT NULL DEFAULT 'pending',
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" INTEGER,
    "student_id" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicant_student_id" INTEGER,
    "student_id_input" VARCHAR(30),
    "enrollment_id" INTEGER,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "submitted_lang" VARCHAR(5),
    "branch_id" INTEGER,

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_answer_cache" (
    "question_hash" CHAR(64) NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "ai_answer_cache_pkey" PRIMARY KEY ("question_hash")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "title" VARCHAR(191),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "image_path" VARCHAR(255),
    "tokens" INTEGER,
    "from_cache" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_schema_version" (
    "id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_schema_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" SERIAL NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marks" DECIMAL(5,2),
    "feedback" TEXT,

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "course" VARCHAR(255) NOT NULL,
    "batch" VARCHAR(100),
    "due_date" DATE NOT NULL,
    "file_path" VARCHAR(500),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branch_id" INTEGER,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "course_id" INTEGER,
    "batch_id" INTEGER NOT NULL DEFAULT 0,
    "attendance_date" DATE NOT NULL,
    "class_label" VARCHAR(150),
    "status" "AttendanceStatus" DEFAULT 'present',
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marked_by" INTEGER,
    "updated_at" TIMESTAMP(3),
    "branch_id" INTEGER,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_remember_tokens" (
    "id" SERIAL NOT NULL,
    "user_type" "AuthRememberTokenUserType" NOT NULL,
    "user_id" INTEGER NOT NULL,
    "selector" CHAR(32) NOT NULL,
    "validator_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "auth_remember_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER,
    "name" VARCHAR(150) NOT NULL,
    "name_bn" VARCHAR(150),
    "batch_type" "BatchBatchType" NOT NULL DEFAULT 'offline',
    "schedule_info" VARCHAR(255),
    "schedule_info_bn" VARCHAR(255),
    "start_date" DATE,
    "capacity" INTEGER,
    "fee" DECIMAL(10,2),
    "status" "BatchStatus" NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branch_id" INTEGER,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_courses" (
    "branch_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "status" "BranchCourseStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_courses_pkey" PRIMARY KEY ("branch_id","course_id")
);

-- CreateTable
CREATE TABLE "branch_teachers" (
    "branch_id" INTEGER NOT NULL,
    "teacher_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_teachers_pkey" PRIMARY KEY ("branch_id","teacher_id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "name_bn" VARCHAR(191) NOT NULL,
    "name_en" VARCHAR(191) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "address_bn" VARCHAR(500),
    "address_en" VARCHAR(500),
    "description_bn" TEXT,
    "description_en" TEXT,
    "phone" VARCHAR(30),
    "email" VARCHAR(191),
    "image" VARCHAR(255),
    "map_url" VARCHAR(1000),
    "status" "BranchStatus" NOT NULL DEFAULT 'active',
    "is_main" BOOLEAN NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_routine" (
    "id" SERIAL NOT NULL,
    "course" VARCHAR(255) NOT NULL,
    "batch" VARCHAR(100),
    "day_of_week" VARCHAR(20) NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "teacher_name" VARCHAR(255) NOT NULL,
    "room_number" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branch_id" INTEGER,

    CONSTRAINT "class_routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_bn" VARCHAR(255),
    "description" TEXT NOT NULL,
    "image" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fee" DECIMAL(10,2),
    "duration" VARCHAR(100),
    "status" "CourseStatus" NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "short_description" VARCHAR(500),
    "short_description_bn" VARCHAR(500),
    "description_bn" TEXT,
    "course_type" "CourseCourseType" NOT NULL DEFAULT 'offline',
    "duration_bn" VARCHAR(100),
    "batch_info" VARCHAR(255),
    "batch_info_bn" VARCHAR(255),
    "teacher_id" INTEGER,
    "instructor_name" VARCHAR(255),
    "enrollment_status" "CourseEnrollmentStatus" NOT NULL DEFAULT 'open',
    "is_featured" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "db_backups" (
    "id" SERIAL NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "scope" "DbBackupScope" NOT NULL DEFAULT 'full',
    "tables_included" TEXT,
    "table_count" INTEGER NOT NULL DEFAULT 0,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "file_size" BIGINT NOT NULL,
    "db_size" BIGINT NOT NULL,
    "status" "DbBackupStatus" NOT NULL,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "db_backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" SERIAL NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "template" VARCHAR(60),
    "status" "EmailLogStatus" NOT NULL,
    "error_message" TEXT,
    "related_type" VARCHAR(40),
    "related_id" INTEGER,
    "student_id" INTEGER,
    "sent_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "course_id" INTEGER,
    "batch_id" INTEGER,
    "admission_id" INTEGER,
    "course_name" VARCHAR(255),
    "batch_name" VARCHAR(150),
    "batch_type" "EnrollmentBatchType",
    "fee" DECIMAL(10,2),
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'active',
    "enrolled_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_answer_files" (
    "id" SERIAL NOT NULL,
    "attempt_id" INTEGER NOT NULL,
    "question_id" INTEGER,
    "file_path" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255),
    "file_type" "ExamAnswerFileFileType" NOT NULL DEFAULT 'image',
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_answer_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_answers" (
    "id" SERIAL NOT NULL,
    "attempt_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "selected_option" "ExamAnswerSelectedOption",
    "answer_text" TEXT,
    "is_correct" BOOLEAN,
    "awarded_marks" DECIMAL(5,2),
    "teacher_comment" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" SERIAL NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "submit_mode" "ExamAttemptSubmitMode",
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'in_progress',
    "mcq_score" DECIMAL(6,2) NOT NULL,
    "cq_score" DECIMAL(6,2) NOT NULL,
    "total_score" DECIMAL(6,2) NOT NULL,
    "teacher_comment" TEXT,
    "evaluated_by" INTEGER,
    "evaluated_at" TIMESTAMP(3),

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" SERIAL NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "question_type" "ExamQuestionQuestionType" NOT NULL DEFAULT 'mcq',
    "question_text" TEXT NOT NULL,
    "question_image" VARCHAR(255),
    "marks" DECIMAL(5,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "option_a" VARCHAR(500),
    "option_b" VARCHAR(500),
    "option_c" VARCHAR(500),
    "option_d" VARCHAR(500),
    "correct_option" "ExamQuestionCorrectOption",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_results" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "exam_name" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "marks_obtained" DECIMAL(5,2) NOT NULL,
    "total_marks" DECIMAL(5,2) NOT NULL,
    "grade" VARCHAR(10),
    "feedback" TEXT,
    "exam_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monthly_exam_id" INTEGER,
    "exam_subject_id" INTEGER,
    "is_absent" BOOLEAN NOT NULL,
    "entered_by" INTEGER,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "exam_type" "ExamExamType" NOT NULL DEFAULT 'mcq',
    "subject" VARCHAR(150) NOT NULL,
    "batch" VARCHAR(150),
    "course" VARCHAR(150),
    "teacher_id" INTEGER,
    "instructions" TEXT,
    "total_marks" DECIMAL(6,2) NOT NULL,
    "pass_marks" DECIMAL(6,2) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "start_datetime" TIMESTAMP(3) NOT NULL,
    "end_datetime" TIMESTAMP(3) NOT NULL,
    "negative_marking" DECIMAL(4,2) NOT NULL,
    "allow_file_upload" BOOLEAN NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'draft',
    "result_published" BOOLEAN NOT NULL,
    "created_by_type" "ExamCreatedByType" NOT NULL DEFAULT 'admin',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branch_id" INTEGER,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_discounts" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "discount_type" "FeeDiscountDiscountType" NOT NULL DEFAULT 'fixed',
    "value" DECIMAL(10,2) NOT NULL,
    "applies_to" VARCHAR(20) NOT NULL DEFAULT 'monthly',
    "reason" VARCHAR(255),
    "starts_on" DATE,
    "ends_on" DATE,
    "is_active" BOOLEAN NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_reminders" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "channel" "FeeReminderChannel" NOT NULL DEFAULT 'email',
    "recipient" VARCHAR(255),
    "due_amount" DECIMAL(10,2) NOT NULL,
    "status" "FeeReminderStatus" NOT NULL,
    "error" VARCHAR(255),
    "sent_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "course_name" VARCHAR(255) NOT NULL,
    "rating" INTEGER NOT NULL,
    "feedback" TEXT NOT NULL,
    "status" "FeedbackStatus" DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100) NOT NULL,
    "category_id" INTEGER,
    "image" VARCHAR(255) NOT NULL,
    "event_date" DATE,
    "featured" BOOLEAN,
    "status" "GalleryStatus" DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "gallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "cover_image" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "GalleryCategoryStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gifts" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "name_bn" VARCHAR(150),
    "description" VARCHAR(500),
    "description_bn" VARCHAR(500),
    "image" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_students" (
    "id" SERIAL NOT NULL,
    "guardian_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "relation" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" SERIAL NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255),
    "email" VARCHAR(255),
    "password" VARCHAR(255) NOT NULL,
    "must_change_password" BOOLEAN NOT NULL,
    "status" "GuardianStatus" NOT NULL DEFAULT 'active',
    "last_login" TIMESTAMP(3),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "course_id" INTEGER,
    "course_name" VARCHAR(255),
    "preferred_time" VARCHAR(20),
    "message" TEXT,
    "source" VARCHAR(30) NOT NULL DEFAULT 'page',
    "status" "InquiryStatus" NOT NULL DEFAULT 'new',
    "admin_note" TEXT,
    "follow_up_date" DATE,
    "called_at" TIMESTAMP(3),
    "admitted_at" TIMESTAMP(3),
    "handled_by" INTEGER,
    "admission_id" INTEGER,
    "student_id" INTEGER,
    "lang" VARCHAR(5),
    "ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "enrollment_id" INTEGER,
    "title" VARCHAR(150) NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "installments" INTEGER NOT NULL,
    "first_due_date" DATE NOT NULL,
    "interval_months" INTEGER NOT NULL,
    "note" TEXT,
    "status" "InstallmentPlanStatus" NOT NULL DEFAULT 'active',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_materials" (
    "id" SERIAL NOT NULL,
    "live_class_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "file_path" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(20),
    "file_size" INTEGER DEFAULT 0,
    "uploaded_by_type" "LiveClassMaterialUploadedByType" NOT NULL DEFAULT 'teacher',
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_class_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_classes" (
    "id" SERIAL NOT NULL,
    "subject" VARCHAR(150) NOT NULL,
    "topic" VARCHAR(255),
    "teacher_id" INTEGER,
    "teacher_name" VARCHAR(255),
    "batch" VARCHAR(150),
    "course" VARCHAR(150),
    "class_date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "description" TEXT,
    "meet_url" VARCHAR(500),
    "status" "LiveClassStatus" NOT NULL DEFAULT 'scheduled',
    "created_by_type" "LiveClassCreatedByType" NOT NULL DEFAULT 'admin',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batch_id" INTEGER,
    "class_mode" "LiveClassClassMode" NOT NULL DEFAULT 'online',
    "provider" VARCHAR(50),
    "external_id" VARCHAR(191),
    "branch_id" INTEGER,

    CONSTRAINT "live_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" SERIAL NOT NULL,
    "scope" VARCHAR(20) NOT NULL,
    "identifier_hash" CHAR(64) NOT NULL,
    "ip" VARCHAR(45) NOT NULL,
    "attempted_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_exam_subjects" (
    "id" SERIAL NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "subject_id" INTEGER,
    "subject_name" VARCHAR(150) NOT NULL,
    "subject_name_bn" VARCHAR(150),
    "full_marks" DECIMAL(6,2) NOT NULL,
    "pass_marks" DECIMAL(6,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "monthly_exam_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_exams" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "title_bn" VARCHAR(255),
    "exam_month" CHAR(7) NOT NULL,
    "course_id" INTEGER,
    "batch_id" INTEGER,
    "exam_date" DATE,
    "total_marks" DECIMAL(8,2) NOT NULL,
    "full_marks" DECIMAL(6,2) NOT NULL,
    "pass_marks" DECIMAL(6,2) NOT NULL,
    "show_position" BOOLEAN NOT NULL,
    "status" "MonthlyExamStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "remarks" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_email_logs" (
    "id" SERIAL NOT NULL,
    "note_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "student_email" VARCHAR(255),
    "status" "NoteEmailLogStatus" DEFAULT 'failed',
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "NoticeStatus" DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branch_id" INTEGER,

    CONSTRAINT "notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "type" "NotificationLogType" NOT NULL,
    "message" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_type" "NotificationUserType" NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT,
    "link" VARCHAR(255),
    "icon" VARCHAR(50) DEFAULT 'bell',
    "is_read" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" SERIAL NOT NULL,
    "user_type" "PasswordResetUserType" NOT NULL,
    "user_id" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "request_ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_month" VARCHAR(20) NOT NULL,
    "payment_status" "PaymentPaymentStatus" DEFAULT 'unpaid',
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_amount" DECIMAL(10,0) NOT NULL,
    "receipt_number" VARCHAR(50),
    "payment_method" VARCHAR(30) NOT NULL DEFAULT 'Cash',
    "notes" TEXT,
    "transaction_id" VARCHAR(100),
    "admission_id" INTEGER,
    "enrollment_id" INTEGER,
    "fee_type" VARCHAR(20),
    "due_date" DATE,
    "original_amount" DECIMAL(10,2),
    "discount_amount" DECIMAL(10,2),
    "installment_plan_id" INTEGER,
    "installment_no" INTEGER,
    "parent_payment_id" INTEGER,
    "created_by" INTEGER,
    "branch_id" INTEGER,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printable_documents" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(80) NOT NULL DEFAULT 'general',
    "description" TEXT,
    "image_path" VARCHAR(255) NOT NULL,
    "thumb_path" VARCHAR(255),
    "image_width" INTEGER NOT NULL DEFAULT 0,
    "image_height" INTEGER NOT NULL DEFAULT 0,
    "student_visible" BOOLEAN NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "printable_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "title_bn" VARCHAR(255),
    "description" TEXT,
    "description_bn" TEXT,
    "image" VARCHAR(255),
    "offer_text" VARCHAR(60),
    "offer_text_bn" VARCHAR(60),
    "discount_percent" DECIMAL(5,2),
    "button_text" VARCHAR(80),
    "button_text_bn" VARCHAR(80),
    "button_url" VARCHAR(500),
    "display_position" "PromotionDisplayPosition" NOT NULL DEFAULT 'home_section',
    "style" "PromotionStyle" NOT NULL DEFAULT 'green',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recorded_classes" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "subject" VARCHAR(150),
    "course" VARCHAR(150),
    "batch" VARCHAR(150),
    "batch_id" INTEGER,
    "branch_id" INTEGER,
    "teacher_id" INTEGER,
    "teacher_name" VARCHAR(255),
    "class_date" DATE,
    "duration_minutes" INTEGER,
    "drive_file_id" VARCHAR(128) NOT NULL,
    "status" "RecordedClassStatus" NOT NULL DEFAULT 'draft',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recorded_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "setting_key" VARCHAR(100) NOT NULL,
    "setting_value" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("setting_key")
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "mobile" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_id_sequence" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_id_sequence_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "student_login" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "must_change_password" BOOLEAN NOT NULL,

    CONSTRAINT "student_login_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" SERIAL NOT NULL,
    "student_id_no" VARCHAR(30),
    "name" VARCHAR(255) NOT NULL,
    "name_bn" VARCHAR(255),
    "phone" VARCHAR(20) NOT NULL,
    "guardian_phone" VARCHAR(20),
    "email" VARCHAR(255) NOT NULL,
    "institution" VARCHAR(255) NOT NULL,
    "address" TEXT NOT NULL,
    "course" VARCHAR(100) NOT NULL,
    "image" VARCHAR(255) NOT NULL,
    "status" "StudentStatus" DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "student_status" "StudentStudentStatus" NOT NULL DEFAULT 'Active',
    "batch" VARCHAR(100),
    "roll_number" VARCHAR(20),
    "father_name" VARCHAR(255),
    "mother_name" VARCHAR(255),
    "date_of_birth" DATE,
    "gender" "StudentGender",
    "batch_id" INTEGER,
    "id_card_issued_at" TIMESTAMP(3),
    "emergency_contact" VARCHAR(30),
    "blood_group" VARCHAR(5),
    "id_card_valid_until" DATE,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branch_id" INTEGER,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_materials" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "file_path" VARCHAR(500) NOT NULL,
    "file_type" VARCHAR(50) NOT NULL,
    "course" VARCHAR(255) NOT NULL,
    "batch" VARCHAR(100),
    "uploaded_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branch_id" INTEGER,

    CONSTRAINT "study_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "name_bn" VARCHAR(150),
    "code" VARCHAR(30),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "SubjectStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_batches" (
    "id" SERIAL NOT NULL,
    "teacher_id" INTEGER NOT NULL,
    "batch" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subjects" (
    "id" SERIAL NOT NULL,
    "teacher_id" INTEGER NOT NULL,
    "subject" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_bn" VARCHAR(255),
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30),
    "password_hash" VARCHAR(255) NOT NULL,
    "designation" VARCHAR(150),
    "designation_bn" VARCHAR(150),
    "qualification" VARCHAR(255),
    "qualification_bn" VARCHAR(255),
    "experience" VARCHAR(200),
    "experience_bn" VARCHAR(200),
    "photo" VARCHAR(255),
    "bio" TEXT,
    "bio_bn" TEXT,
    "status" "TeacherStatus" NOT NULL DEFAULT 'active',
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "show_on_website" BOOLEAN NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_classes" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "teacher_name" VARCHAR(255),
    "course_name" VARCHAR(255),
    "description" TEXT,
    "thumbnail" VARCHAR(255),
    "video_url" VARCHAR(500),
    "status" "TrialClassStatus" DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" SERIAL NOT NULL,
    "user_type" "UserPreferenceUserType" NOT NULL,
    "user_id" INTEGER NOT NULL,
    "theme" "UserPreferenceTheme" NOT NULL DEFAULT 'light',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lang" VARCHAR(5),

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_logs" (
    "id" SERIAL NOT NULL,
    "visitor_identifier" CHAR(32) NOT NULL,
    "session_id" CHAR(32) NOT NULL,
    "page_url" VARCHAR(191) NOT NULL,
    "visit_date" DATE NOT NULL,
    "visit_time" TIME(0) NOT NULL,
    "device_type" "VisitorLogDeviceType" NOT NULL DEFAULT 'desktop',
    "browser" VARCHAR(30) NOT NULL DEFAULT 'Other',
    "is_new_visitor" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_monthly_summary" (
    "month_start" DATE NOT NULL,
    "page_views" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "unique_visitors" INTEGER NOT NULL DEFAULT 0,
    "new_visitors" INTEGER NOT NULL DEFAULT 0,
    "active_days" INTEGER NOT NULL DEFAULT 0,
    "avg_daily_visits" DECIMAL(10,2) NOT NULL,
    "peak_date" DATE,
    "peak_visits" INTEGER NOT NULL DEFAULT 0,
    "top_page" VARCHAR(191),
    "top_page_views" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitor_monthly_summary_pkey" PRIMARY KEY ("month_start")
);

-- CreateIndex
CREATE INDEX "achievements_created_at_idx" ON "achievements"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admins_branch_id_idx" ON "admins"("branch_id");

-- CreateIndex
CREATE INDEX "admins_role_status_idx" ON "admins"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admissions_application_no_key" ON "admissions"("application_no");

-- CreateIndex
CREATE INDEX "admissions_status_idx" ON "admissions"("status");

-- CreateIndex
CREATE INDEX "admissions_batch_id_idx" ON "admissions"("batch_id");

-- CreateIndex
CREATE INDEX "admissions_mobile_idx" ON "admissions"("mobile");

-- CreateIndex
CREATE INDEX "admissions_created_at_idx" ON "admissions"("created_at");

-- CreateIndex
CREATE INDEX "admissions_transaction_id_idx" ON "admissions"("transaction_id");

-- CreateIndex
CREATE INDEX "admissions_student_id_idx" ON "admissions"("student_id");

-- CreateIndex
CREATE INDEX "admissions_applicant_student_id_idx" ON "admissions"("applicant_student_id");

-- CreateIndex
CREATE INDEX "admissions_branch_id_status_created_at_idx" ON "admissions"("branch_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ai_answer_cache_created_at_idx" ON "ai_answer_cache"("created_at");

-- CreateIndex
CREATE INDEX "ai_conversations_student_id_updated_at_idx" ON "ai_conversations"("student_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_id_idx" ON "ai_messages"("conversation_id", "id");

-- CreateIndex
CREATE INDEX "ai_messages_student_id_role_created_at_idx" ON "ai_messages"("student_id", "role", "created_at");

-- CreateIndex
CREATE INDEX "assignment_submissions_assignment_id_idx" ON "assignment_submissions"("assignment_id");

-- CreateIndex
CREATE INDEX "assignment_submissions_student_id_idx" ON "assignment_submissions"("student_id");

-- CreateIndex
CREATE INDEX "assignments_created_by_idx" ON "assignments"("created_by");

-- CreateIndex
CREATE INDEX "assignments_course_due_date_idx" ON "assignments"("course", "due_date");

-- CreateIndex
CREATE INDEX "assignments_branch_id_idx" ON "assignments"("branch_id");

-- CreateIndex
CREATE INDEX "attendance_batch_id_attendance_date_idx" ON "attendance"("batch_id", "attendance_date");

-- CreateIndex
CREATE INDEX "attendance_course_id_attendance_date_idx" ON "attendance"("course_id", "attendance_date");

-- CreateIndex
CREATE INDEX "attendance_attendance_date_status_idx" ON "attendance"("attendance_date", "status");

-- CreateIndex
CREATE INDEX "attendance_branch_id_attendance_date_status_student_id_idx" ON "attendance"("branch_id", "attendance_date", "status", "student_id");

-- CreateIndex
CREATE INDEX "attendance_attendance_date_branch_id_status_student_id_idx" ON "attendance"("attendance_date", "branch_id", "status", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_student_id_attendance_date_batch_id_key" ON "attendance"("student_id", "attendance_date", "batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_remember_tokens_selector_key" ON "auth_remember_tokens"("selector");

-- CreateIndex
CREATE INDEX "auth_remember_tokens_user_type_user_id_idx" ON "auth_remember_tokens"("user_type", "user_id");

-- CreateIndex
CREATE INDEX "auth_remember_tokens_expires_at_idx" ON "auth_remember_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "batches_course_id_idx" ON "batches"("course_id");

-- CreateIndex
CREATE INDEX "batches_batch_type_idx" ON "batches"("batch_type");

-- CreateIndex
CREATE INDEX "batches_status_idx" ON "batches"("status");

-- CreateIndex
CREATE INDEX "batches_branch_id_status_idx" ON "batches"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "batches_course_id_branch_id_name_batch_type_key" ON "batches"("course_id", "branch_id", "name", "batch_type");

-- CreateIndex
CREATE INDEX "branch_courses_course_id_status_idx" ON "branch_courses"("course_id", "status");

-- CreateIndex
CREATE INDEX "branch_teachers_teacher_id_idx" ON "branch_teachers"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_slug_key" ON "branches"("slug");

-- CreateIndex
CREATE INDEX "branches_status_sort_order_idx" ON "branches"("status", "sort_order");

-- CreateIndex
CREATE INDEX "class_routine_branch_id_idx" ON "class_routine"("branch_id");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- CreateIndex
CREATE INDEX "courses_course_type_idx" ON "courses"("course_type");

-- CreateIndex
CREATE INDEX "courses_enrollment_status_idx" ON "courses"("enrollment_status");

-- CreateIndex
CREATE INDEX "courses_teacher_id_idx" ON "courses"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "db_backups_filename_key" ON "db_backups"("filename");

-- CreateIndex
CREATE INDEX "db_backups_created_at_idx" ON "db_backups"("created_at");

-- CreateIndex
CREATE INDEX "email_logs_created_at_idx" ON "email_logs"("created_at");

-- CreateIndex
CREATE INDEX "email_logs_related_type_related_id_idx" ON "email_logs"("related_type", "related_id");

-- CreateIndex
CREATE INDEX "email_logs_student_id_idx" ON "email_logs"("student_id");

-- CreateIndex
CREATE INDEX "email_logs_status_created_at_idx" ON "email_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");

-- CreateIndex
CREATE INDEX "enrollments_course_id_idx" ON "enrollments"("course_id");

-- CreateIndex
CREATE INDEX "enrollments_batch_id_idx" ON "enrollments"("batch_id");

-- CreateIndex
CREATE INDEX "enrollments_admission_id_idx" ON "enrollments"("admission_id");

-- CreateIndex
CREATE INDEX "enrollments_status_idx" ON "enrollments"("status");

-- CreateIndex
CREATE INDEX "exam_answer_files_attempt_id_idx" ON "exam_answer_files"("attempt_id");

-- CreateIndex
CREATE INDEX "exam_answer_files_question_id_idx" ON "exam_answer_files"("question_id");

-- CreateIndex
CREATE INDEX "exam_answers_question_id_idx" ON "exam_answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_answers_attempt_id_question_id_key" ON "exam_answers"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "exam_attempts_student_id_idx" ON "exam_attempts"("student_id");

-- CreateIndex
CREATE INDEX "exam_attempts_status_idx" ON "exam_attempts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_exam_id_student_id_key" ON "exam_attempts"("exam_id", "student_id");

-- CreateIndex
CREATE INDEX "exam_questions_exam_id_idx" ON "exam_questions"("exam_id");

-- CreateIndex
CREATE INDEX "exam_questions_exam_id_sort_order_idx" ON "exam_questions"("exam_id", "sort_order");

-- CreateIndex
CREATE INDEX "exam_results_student_id_idx" ON "exam_results"("student_id");

-- CreateIndex
CREATE INDEX "exam_results_monthly_exam_id_idx" ON "exam_results"("monthly_exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_results_exam_subject_id_student_id_key" ON "exam_results"("exam_subject_id", "student_id");

-- CreateIndex
CREATE INDEX "exams_batch_idx" ON "exams"("batch");

-- CreateIndex
CREATE INDEX "exams_subject_idx" ON "exams"("subject");

-- CreateIndex
CREATE INDEX "exams_status_idx" ON "exams"("status");

-- CreateIndex
CREATE INDEX "exams_start_datetime_end_datetime_idx" ON "exams"("start_datetime", "end_datetime");

-- CreateIndex
CREATE INDEX "exams_teacher_id_idx" ON "exams"("teacher_id");

-- CreateIndex
CREATE INDEX "exams_branch_id_idx" ON "exams"("branch_id");

-- CreateIndex
CREATE INDEX "fee_discounts_student_id_is_active_idx" ON "fee_discounts"("student_id", "is_active");

-- CreateIndex
CREATE INDEX "fee_reminders_student_id_channel_status_created_at_idx" ON "fee_reminders"("student_id", "channel", "status", "created_at");

-- CreateIndex
CREATE INDEX "fee_reminders_created_at_idx" ON "fee_reminders"("created_at");

-- CreateIndex
CREATE INDEX "gallery_category_idx" ON "gallery"("category");

-- CreateIndex
CREATE INDEX "gallery_status_idx" ON "gallery"("status");

-- CreateIndex
CREATE INDEX "gallery_featured_idx" ON "gallery"("featured");

-- CreateIndex
CREATE INDEX "gallery_created_at_idx" ON "gallery"("created_at");

-- CreateIndex
CREATE INDEX "gallery_category_id_idx" ON "gallery"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_categories_name_key" ON "gallery_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_categories_slug_key" ON "gallery_categories"("slug");

-- CreateIndex
CREATE INDEX "gallery_categories_status_idx" ON "gallery_categories"("status");

-- CreateIndex
CREATE INDEX "gallery_categories_sort_order_idx" ON "gallery_categories"("sort_order");

-- CreateIndex
CREATE INDEX "gifts_is_active_sort_order_idx" ON "gifts"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "guardian_students_student_id_idx" ON "guardian_students"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_students_guardian_id_student_id_key" ON "guardian_students"("guardian_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_phone_key" ON "guardians"("phone");

-- CreateIndex
CREATE INDEX "guardians_status_idx" ON "guardians"("status");

-- CreateIndex
CREATE INDEX "inquiries_status_created_at_idx" ON "inquiries"("status", "created_at");

-- CreateIndex
CREATE INDEX "inquiries_phone_idx" ON "inquiries"("phone");

-- CreateIndex
CREATE INDEX "inquiries_ip_created_at_idx" ON "inquiries"("ip", "created_at");

-- CreateIndex
CREATE INDEX "installment_plans_student_id_idx" ON "installment_plans"("student_id");

-- CreateIndex
CREATE INDEX "installment_plans_status_idx" ON "installment_plans"("status");

-- CreateIndex
CREATE INDEX "live_class_materials_live_class_id_idx" ON "live_class_materials"("live_class_id");

-- CreateIndex
CREATE INDEX "live_classes_class_date_idx" ON "live_classes"("class_date");

-- CreateIndex
CREATE INDEX "live_classes_batch_idx" ON "live_classes"("batch");

-- CreateIndex
CREATE INDEX "live_classes_status_idx" ON "live_classes"("status");

-- CreateIndex
CREATE INDEX "live_classes_teacher_id_idx" ON "live_classes"("teacher_id");

-- CreateIndex
CREATE INDEX "live_classes_batch_id_idx" ON "live_classes"("batch_id");

-- CreateIndex
CREATE INDEX "live_classes_status_course_idx" ON "live_classes"("status", "course");

-- CreateIndex
CREATE INDEX "live_classes_branch_id_idx" ON "live_classes"("branch_id");

-- CreateIndex
CREATE INDEX "login_attempts_scope_identifier_hash_attempted_at_idx" ON "login_attempts"("scope", "identifier_hash", "attempted_at");

-- CreateIndex
CREATE INDEX "login_attempts_ip_attempted_at_idx" ON "login_attempts"("ip", "attempted_at");

-- CreateIndex
CREATE INDEX "monthly_exam_subjects_subject_id_idx" ON "monthly_exam_subjects"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_exam_subjects_exam_id_subject_name_key" ON "monthly_exam_subjects"("exam_id", "subject_name");

-- CreateIndex
CREATE INDEX "monthly_exams_exam_month_idx" ON "monthly_exams"("exam_month");

-- CreateIndex
CREATE INDEX "monthly_exams_course_id_idx" ON "monthly_exams"("course_id");

-- CreateIndex
CREATE INDEX "monthly_exams_batch_id_idx" ON "monthly_exams"("batch_id");

-- CreateIndex
CREATE INDEX "monthly_exams_status_idx" ON "monthly_exams"("status");

-- CreateIndex
CREATE INDEX "notice_status_created_at_idx" ON "notice"("status", "created_at");

-- CreateIndex
CREATE INDEX "notice_branch_id_status_created_at_idx" ON "notice"("branch_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "notification_logs_student_id_idx" ON "notification_logs"("student_id");

-- CreateIndex
CREATE INDEX "notifications_user_type_user_id_is_read_idx" ON "notifications"("user_type", "user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "password_resets_user_type_user_id_idx" ON "password_resets"("user_type", "user_id");

-- CreateIndex
CREATE INDEX "password_resets_expires_at_idx" ON "password_resets"("expires_at");

-- CreateIndex
CREATE INDEX "payments_admission_id_idx" ON "payments"("admission_id");

-- CreateIndex
CREATE INDEX "payments_enrollment_id_idx" ON "payments"("enrollment_id");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- CreateIndex
CREATE INDEX "payments_payment_status_due_date_idx" ON "payments"("payment_status", "due_date");

-- CreateIndex
CREATE INDEX "payments_student_id_payment_month_idx" ON "payments"("student_id", "payment_month");

-- CreateIndex
CREATE INDEX "payments_installment_plan_id_idx" ON "payments"("installment_plan_id");

-- CreateIndex
CREATE INDEX "payments_parent_payment_id_idx" ON "payments"("parent_payment_id");

-- CreateIndex
CREATE INDEX "payments_payment_status_payment_date_idx" ON "payments"("payment_status", "payment_date");

-- CreateIndex
CREATE INDEX "payments_branch_id_payment_status_payment_date_idx" ON "payments"("branch_id", "payment_status", "payment_date");

-- CreateIndex
CREATE INDEX "printable_documents_category_idx" ON "printable_documents"("category");

-- CreateIndex
CREATE INDEX "printable_documents_created_at_idx" ON "printable_documents"("created_at");

-- CreateIndex
CREATE INDEX "promotions_is_active_display_position_idx" ON "promotions"("is_active", "display_position");

-- CreateIndex
CREATE INDEX "promotions_start_at_end_at_idx" ON "promotions"("start_at", "end_at");

-- CreateIndex
CREATE INDEX "recorded_classes_status_class_date_idx" ON "recorded_classes"("status", "class_date");

-- CreateIndex
CREATE INDEX "recorded_classes_batch_id_idx" ON "recorded_classes"("batch_id");

-- CreateIndex
CREATE INDEX "recorded_classes_branch_id_idx" ON "recorded_classes"("branch_id");

-- CreateIndex
CREATE INDEX "recorded_classes_teacher_id_idx" ON "recorded_classes"("teacher_id");

-- CreateIndex
CREATE INDEX "sms_logs_student_id_idx" ON "sms_logs"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_login_username_key" ON "student_login"("username");

-- CreateIndex
CREATE INDEX "student_login_student_id_idx" ON "student_login"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_student_id_no_key" ON "students"("student_id_no");

-- CreateIndex
CREATE UNIQUE INDEX "students_phone_key" ON "students"("phone");

-- CreateIndex
CREATE INDEX "students_batch_idx" ON "students"("batch");

-- CreateIndex
CREATE INDEX "students_batch_id_idx" ON "students"("batch_id");

-- CreateIndex
CREATE INDEX "students_name_bn_idx" ON "students"("name_bn");

-- CreateIndex
CREATE INDEX "students_created_at_idx" ON "students"("created_at");

-- CreateIndex
CREATE INDEX "students_email_idx" ON "students"("email");

-- CreateIndex
CREATE INDEX "students_branch_id_status_student_status_idx" ON "students"("branch_id", "status", "student_status");

-- CreateIndex
CREATE INDEX "study_materials_uploaded_by_idx" ON "study_materials"("uploaded_by");

-- CreateIndex
CREATE INDEX "study_materials_course_created_at_idx" ON "study_materials"("course", "created_at");

-- CreateIndex
CREATE INDEX "study_materials_branch_id_idx" ON "study_materials"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_key" ON "subjects"("name");

-- CreateIndex
CREATE INDEX "subjects_status_idx" ON "subjects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_batches_teacher_id_batch_key" ON "teacher_batches"("teacher_id", "batch");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_subjects_teacher_id_subject_key" ON "teacher_subjects"("teacher_id", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_email_key" ON "teachers"("email");

-- CreateIndex
CREATE INDEX "teachers_status_idx" ON "teachers"("status");

-- CreateIndex
CREATE INDEX "teachers_show_on_website_status_sort_order_idx" ON "teachers"("show_on_website", "status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_type_user_id_key" ON "user_preferences"("user_type", "user_id");

-- CreateIndex
CREATE INDEX "visitor_logs_visit_date_visitor_identifier_session_id_is_ne_idx" ON "visitor_logs"("visit_date", "visitor_identifier", "session_id", "is_new_visitor");

-- CreateIndex
CREATE INDEX "visitor_logs_visit_date_page_url_idx" ON "visitor_logs"("visit_date", "page_url");

-- CreateIndex
CREATE INDEX "visitor_logs_created_at_visitor_identifier_idx" ON "visitor_logs"("created_at", "visitor_identifier");

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_courses" ADD CONSTRAINT "branch_courses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_courses" ADD CONSTRAINT "branch_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_teachers" ADD CONSTRAINT "branch_teachers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_teachers" ADD CONSTRAINT "branch_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_routine" ADD CONSTRAINT "class_routine_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "admissions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exam_answer_files" ADD CONSTRAINT "exam_answer_files_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exam_answer_files" ADD CONSTRAINT "exam_answer_files_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_exam_subject_id_fkey" FOREIGN KEY ("exam_subject_id") REFERENCES "monthly_exam_subjects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_monthly_exam_id_fkey" FOREIGN KEY ("monthly_exam_id") REFERENCES "monthly_exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fee_reminders" ADD CONSTRAINT "fee_reminders_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "guardian_students" ADD CONSTRAINT "guardian_students_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "guardian_students" ADD CONSTRAINT "guardian_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "live_class_materials" ADD CONSTRAINT "live_class_materials_live_class_id_fkey" FOREIGN KEY ("live_class_id") REFERENCES "live_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monthly_exam_subjects" ADD CONSTRAINT "monthly_exam_subjects_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "monthly_exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monthly_exam_subjects" ADD CONSTRAINT "monthly_exam_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monthly_exams" ADD CONSTRAINT "monthly_exams_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monthly_exams" ADD CONSTRAINT "monthly_exams_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notice" ADD CONSTRAINT "notice_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recorded_classes" ADD CONSTRAINT "recorded_classes_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recorded_classes" ADD CONSTRAINT "recorded_classes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recorded_classes" ADD CONSTRAINT "recorded_classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "student_login" ADD CONSTRAINT "student_login_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_batches" ADD CONSTRAINT "teacher_batches_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
