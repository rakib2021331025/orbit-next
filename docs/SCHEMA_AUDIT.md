# Schema audit — indexes, defaults, constraints

Date: 2026-09-26. Scope: all 65 models in `prisma/schema.prisma`, checked against every
`prisma.<model>.*` / `tx.<model>.*` call in `app/` and `lib/` (about 700 call sites) and the raw SQL in
`lib/analytics/*`, `lib/backup/dump.ts`, `lib/students/id.ts`. MySQL defaults come from the latest full
dump of the PHP app (`Orbit/backups/orbit_db_full_20260920_034610_d030a78c.sql`), cross-checked with
`Orbit/includes/schema_*.php` and `Orbit/migrate_*.sql`.

Migration produced by this audit: `prisma/migrations/20260926100000_indexes_defaults/migration.sql`
(only `ALTER COLUMN … SET DEFAULT` and `CREATE INDEX`; no drops, no table rewrites; not yet applied).

Legend. Growth: **L** low (tens–hundreds of rows, admin-entered), **M** medium (grows with students or
classes), **H** high (grows with students × time, or per request). Cache: **pub** = public, cacheable
and tag-invalidated on admin write; **user** = per-user dynamic, do not share; **admin** = admin-only,
dynamic, no cache needed.

## 1. Changes applied

### Indexes added (4)

| Index | Query it serves | Why the existing indexes did not |
|---|---|---|
| `note_email_logs (note_id, status)` | `lib/notes/admin.ts:236` groupBy `note_id IN (…) AND status='sent'`; `lib/notes/admin.ts:363` `note_id=? AND status='sent'`; `app/(admin)/admin/notes/actions.ts:131` deleteMany by `note_id` | Table had **no index besides the PK** (the MySQL table had none either). One row per student per emailed note — the fastest-growing log after visitor_logs. |
| `note_email_logs (sent_at)` | `lib/notes/admin.ts:261` log page `ORDER BY sent_at DESC, id DESC LIMIT n` | Same: without it every page view sorts the whole table. |
| `live_classes (teacher_id, class_date)` | `lib/teacher/data.ts:32` (today), `:53` (next 7 days), `:70` (history, `ORDER BY class_date DESC`) — the teacher dashboard | `[teacher_id]` alone forces a sort / filter of every class the teacher ever had. Makes `live_classes(teacher_id)` redundant (left in place; see §4). |
| `exam_results (exam_date)` | `lib/exams/results.ts:105` admin results list, `ORDER BY exam_date DESC, id DESC` paged, usually unfiltered | exam_results grows students × subjects × months; no index had `exam_date`, so every page was a full sort. |

### Defaults added (37) — all match the MySQL `DEFAULT` of the source column

Booleans (MySQL `TINYINT(1) NOT NULL DEFAULT n` unless noted):

| Model.field | Default |
|---|---|
| AiMessage.from_cache | false (schema_2039) |
| Branch.is_main | false |
| Course.is_featured | false |
| Exam.allow_file_upload | **true** |
| Exam.result_published | false |
| ExamResult.is_absent | false |
| FeeDiscount.is_active | **true** |
| Gallery.featured | false (nullable in MySQL too: `DEFAULT 0`) |
| Gift.is_active | **true** |
| Guardian.must_change_password | **true** |
| MonthlyExam.show_position | **true** |
| Notification.is_read | false |
| PrintableDocument.student_visible | false |
| Promotion.is_active | **true** |
| StudentLogin.must_change_password | false |
| Teacher.show_on_website | false |
| VisitorLog.is_new_visitor | false |

ExamAnswer.is_correct has no default in MySQL (`DEFAULT NULL`) — left as is.

Decimals / integers:

| Model.field | Default | | Model.field | Default |
|---|---|---|---|---|
| Exam.total_marks | 0 | | MonthlyExam.total_marks | 0 |
| Exam.pass_marks | 0 | | MonthlyExam.full_marks | 100 |
| Exam.negative_marking | 0 | | MonthlyExam.pass_marks | 33 |
| Exam.duration_minutes (int) | 60 | | MonthlyExamSubject.full_marks | 100 |
| ExamAttempt.mcq_score / cq_score / total_score | 0 | | MonthlyExamSubject.pass_marks | 33 |
| ExamQuestion.marks | 1 | | Payment.due_amount | 0 |
| FeeReminder.due_amount | 0 | | VisitorMonthlySummary.avg_daily_visits | 0 |
| LiveClass.duration_minutes (int) | 60 | | InstallmentPlan.interval_months (int) | 1 |
| DbBackup.file_size / db_size (bigint) | 0 | | | |

Required columns that have **no** default in MySQL either (callers must always supply them):
ExamResult.marks_obtained, ExamResult.total_marks, FeeDiscount.value, InstallmentPlan.total_amount,
InstallmentPlan.installments, Payment.amount, DbBackup.status, EmailLog.status, FeeReminder.status,
LoginAttempt.attempted_at, VisitorLog.created_at (MySQL `DATETIME NOT NULL`, no default).

## 2. Per-model audit

### Students, enrolment, auth

| Model | Purpose | Growth | Hot queries (file:line) | Existing indexes | Recommendation | Cache |
|---|---|---|---|---|---|---|
| Student | Student master record | M | `lib/students/list.ts:95` (branch, status, search; `ORDER BY id DESC`); `lib/admin/dashboard.ts:98` (`status='approved' AND student_status='Active'` + branch); `lib/results/lookup.ts:70` (`student_id_no`); `lib/enrollment/approve.ts:116` (`phone`) | PK; unique `student_id_no`, `phone`; `batch`, `batch_id`, `name_bn`, `created_at`, `email`, `(branch_id,status,student_status)` | None. `guardian_phone IN (…)` (`lib/inquiries/admin.ts:270`) and `course IN (…)` (`lib/teacher/data.ts:171`) are unindexed but admin-only on a table of a few thousand rows. Search uses `contains`/ILIKE — no btree helps; add `pg_trgm` GIN only if search gets slow. | admin / user |
| StudentLogin | Portal credentials | M | `lib/auth/guards.ts:101` (`student_id` ORDER BY id DESC — every student request); `lib/auth/login.ts:62` (`username`) | unique `username`; `student_id` | None | user |
| StudentIdSequence | Per-year ID counter (raw upsert, `lib/students/id.ts:48`) | L | PK `year` | PK | None | — |
| Enrollment | Student ↔ course/batch | M | `lib/student/scope.ts:65` (`student_id`); `lib/attendance/register.ts:137` (`batch_id`,`status`); `lib/enrollment/approve.ts:331` | `student_id`, `course_id`, `batch_id`, `admission_id`, `status` | None | user |
| Admission | Online applications | M | `lib/enrollment/list.ts:112` (filters, `ORDER BY created_at DESC`); `lib/site/apply.ts:275` (`mobile`,`batch_id`,`status`); `:329` (`transaction_id`); `app/(student)/student/page.tsx:367` (`applicant_student_id` OR `mobile`) | unique `application_no`; `status`, `batch_id`, `mobile`, `created_at`, `transaction_id`, `student_id`, `applicant_student_id`, `(branch_id,status,created_at)` | None. Note `application_no LIKE 'APP-YYYY-%'` (`lib/site/apply.ts:114`, `lib/students/id.ts:129`) can only use the unique btree under C collation; fine at this size. | admin (status check page: user) |
| Guardian | Guardian accounts | L–M | `lib/auth/login.ts:160` (`phone`); `lib/auth/guards.ts:192` (`id`,`status`) | unique `phone`; `status` | None | user |
| GuardianStudent | Guardian ↔ student | M | `lib/auth/guards.ts:225` (`guardian_id`); media route `:224` (`guardian_id`,`student_id`) | unique `(guardian_id,student_id)`; `student_id` | None | user |
| Admin | Staff accounts | L | `lib/auth/guards.ts:295` (`id`,`status`); `lib/auth/login.ts:209` (`email`) | unique `email`; `branch_id`, `(role,status)` | None | admin |
| Teacher | Teacher accounts + public profiles | L | `lib/site/home.ts:150` (`show_on_website`,`status` ORDER BY `sort_order,name`); `lib/auth/login.ts:113` (`email`) | unique `email`; `status`, `(show_on_website,status,sort_order)` | None | pub (profiles) / user |
| TeacherBatch, TeacherSubject | Teacher assignment | L | `lib/teacher/data.ts:164/182/191` (`teacher_id`) | unique `(teacher_id,batch)` / `(teacher_id,subject)` | None | user |
| AuthRememberToken | Remember-me tokens | M | `lib/auth/remember.ts:92` (`selector`); `:184` delete by `(user_type,user_id)`; `:209` purge `expires_at <` | unique `selector`; `(user_type,user_id)`, `expires_at` | None | — |
| PasswordReset | Reset tokens | L | `lib/auth/reset.ts:155` (`token_hash`); `:112` (`user_type,user_id,created_at`) | unique `token_hash`; `(user_type,user_id)`, `expires_at` | None | — |
| LoginAttempt | Throttle log | M (pruned daily) | `lib/security/throttle.ts:50` (`scope,identifier_hash,attempted_at`); `:53` (`ip,attempted_at`); `:78` purge `attempted_at <` | `(scope,identifier_hash,attempted_at)`, `(ip,attempted_at)` | None (purge scan is on a table kept to 24 h) | — |
| UserPreference | Theme / language | M | `lib/i18n/actions.ts:47` upsert; `lib/classes/manage.ts:573` (`user_type`,`user_id IN`) | unique `(user_type,user_id)` | None | user |

### Academic: classes, exams, results, attendance

| Model | Purpose | Growth | Hot queries (file:line) | Existing indexes | Recommendation | Cache |
|---|---|---|---|---|---|---|
| Attendance | Daily register | **H** (students × class days) | `lib/attendance/register.ts:211` (`batch_id`,`attendance_date`); `:313` upsert on unique; `lib/student/data.ts:325` (`student_id`, date range, `ORDER BY attendance_date DESC`); `lib/attendance/report.ts:196` (branch/date/status, `ORDER BY attendance_date DESC`); `lib/admin/dashboard.ts:164`, `lib/branch/stats.ts:154` (`attendance_date = today`) | unique `(student_id,attendance_date,batch_id)`; `(batch_id,attendance_date)`, `(course_id,attendance_date)`, `(attendance_date,status)`, `(branch_id,attendance_date,status,student_id)`, `(attendance_date,branch_id,status,student_id)` | None — already well covered (5 secondary indexes; do not add more, writes are bulk). | admin / user |
| Batch | Course batches | L | `app/(site)/branches/[slug]/page.tsx:72` (`branch_id`,`status`); `lib/students/list.ts:189` | unique `(course_id,branch_id,name,batch_type)`; `course_id`, `batch_type`, `status`, `(branch_id,status)` | None (tiny) | pub |
| Course | Courses | L | `lib/site/courses.ts:23` (`status`) | `status`, `course_type`, `enrollment_status`, `teacher_id` | None | pub |
| BranchCourse, BranchTeacher | Branch links | L | `lib/branch/manage.ts:93/159`, `app/(site)/branches/[slug]/page.tsx:86` | composite PKs; `(course_id,status)` / `teacher_id` | None | pub |
| Subject | Subject catalogue | L | `lib/exams/monthly.ts:295` | unique `name`; `status` | None | pub |
| ClassRoutine | Weekly routine | L | `lib/student/data.ts:171` (course/batch name match, `ORDER BY day_of_week,start_time`) | `branch_id` | None (tiny; audience filter is OR of string lists) | user |
| LiveClass | Scheduled classes | M | `lib/teacher/data.ts:32/53/70` (`teacher_id` + `class_date`); `lib/admin/dashboard.ts:326` (`class_date=today`,`status`); `app/(site)/online-classes/page.tsx:52` (`status`,`class_mode`,`class_date >=`); `lib/classes/data.ts:96` | `class_date`, `batch`, `status`, `teacher_id`, `batch_id`, `(status,course)`, `branch_id` | **Added** `(teacher_id,class_date)` | pub (online-classes, no meet_url) / user |
| LiveClassMaterial | Class files | M | `lib/classes/data.ts:117` (`live_class_id IN`) | `live_class_id` | None | user |
| RecordedClass | Drive recordings | M | `lib/student/data.ts:259` (`status='published'`, `ORDER BY class_date DESC`) | `(status,class_date)`, `batch_id`, `branch_id`, `teacher_id` | None | user |
| StudyMaterial | Uploaded notes | M | `lib/student/data.ts:33` (course/batch audience, `ORDER BY created_at DESC`) | `uploaded_by`, `(course,created_at)`, `branch_id` | None | user |
| AdminNote | PDF notes by group | L | `lib/student/data.ts:66` (`batch IN`, `ORDER BY created_at DESC`); `lib/notes/admin.ts:215` | PK only | None (low growth). Add `(batch, created_at)` if it passes ~10k rows. | user |
| NoteEmailLog | Per-student note emails | **H** | `lib/notes/admin.ts:236/261/363`; delete by `note_id` | PK only | **Added** `(note_id,status)`, `(sent_at)` | admin |
| Assignment | Homework | L–M | `lib/student/data.ts:91` (audience, `ORDER BY due_date`) | `created_by`, `(course,due_date)`, `branch_id` | None | user |
| AssignmentSubmission | Submitted work | M | `app/(student)/student/assignments/actions.ts:72` (`assignment_id`,`student_id`); nested `where student_id` (`lib/student/data.ts:106`) | `assignment_id`, `student_id` | None | user |
| Exam | Online exams | L–M | `lib/student/data.ts:288` (audience + `status='published'`, `ORDER BY start_datetime DESC`); `lib/teacher/data.ts:85/101` (`teacher_id`); `lib/exams/admin.ts:53` | `batch`, `subject`, `status`, `(start_datetime,end_datetime)`, `teacher_id`, `branch_id` | None (considered `(teacher_id,start_datetime)`; rejected — exam counts are small) | user |
| ExamQuestion | Questions | M | `lib/exams/engine.ts:76` (`exam_id` ORDER BY `sort_order,id`); `lib/exams/evaluation.ts:179` | `exam_id`, `(exam_id,sort_order)` | None (`exam_id` is redundant, §4) | user |
| ExamAttempt | Student attempts | M–H | `lib/exams/engine.ts:93` (unique `exam_id,student_id`); `lib/nav/admin.ts:71`, `lib/teacher/data.ts:139` (`status='submitted'` + exam.teacher_id); `lib/exams/engine.ts:277` (`status='in_progress'`) | unique `(exam_id,student_id)`; `student_id`, `status` | None | user |
| ExamAnswer | Answers per question | **H** | `lib/exams/engine.ts:155/312`, `lib/exams/evaluation.ts:121` (`attempt_id`) | unique `(attempt_id,question_id)`; `question_id` | None | user |
| ExamAnswerFile | Uploaded answer images | M | `lib/exams/evaluation.ts:122` (`attempt_id`) | `attempt_id`, `question_id` | None | user |
| MonthlyExam | Offline monthly exams | L | `app/(site)/results/page.tsx:54` (`status='published'` ORDER BY `exam_month DESC`); `lib/exams/monthly.ts:114` | `exam_month`, `course_id`, `batch_id`, `status` | None | pub (published list) |
| MonthlyExamSubject | Subjects per exam | L | `lib/exams/monthly.ts:217`, `lib/results/exam.ts:243` (`exam_id`) | unique `(exam_id,subject_name)`; `subject_id` | None | pub |
| ExamResult | Marks per student/subject | **H** | `lib/exams/results.ts:105` (`ORDER BY exam_date DESC, id DESC` paged); `lib/results/exam.ts:204` (`monthly_exam_id`); `lib/results/progress.ts:88` (`student_id`); `lib/exams/marks.ts:107` upsert | unique `(exam_subject_id,student_id)`; `student_id`, `monthly_exam_id` | **Added** `(exam_date)` | pub (published results) / user |

### Money

| Model | Purpose | Growth | Hot queries (file:line) | Existing indexes | Recommendation | Cache |
|---|---|---|---|---|---|---|
| Payment | Charges and receipts | **H** (students × months) | `lib/admin/dashboard.ts:213` (`payment_status='paid'`, `payment_date` range, branch); `:368` (paid, `ORDER BY payment_date DESC`); `lib/student/data.ts:400`, `lib/fees/dues.ts:229` (`student_id`); `lib/fees/core.ts:233` (`installment_plan_id`); `lib/payments/tracking.ts:157` (`ORDER BY id DESC`); raw `lib/analytics/coaching.ts:239+` (paid + date range) | `admission_id`, `enrollment_id`, `payment_date`, `(payment_status,due_date)`, `(student_id,payment_month)`, `installment_plan_id`, `parent_payment_id`, `(payment_status,payment_date)`, `(branch_id,payment_status,payment_date)` | None — covered. `app/(admin)/admin/reports/page.tsx:99` and `lib/reports/data.ts:638` read **every** payment row (no where) — an app-level bottleneck, fix with an aggregate query rather than an index. | admin / user |
| FeeDiscount | Standing discounts | L | `lib/fees/discounts.ts:63` (`student_id`,`is_active`, …) | `(student_id,is_active)` | None | admin |
| FeeReminder | Sent reminders | M | `lib/fees/dues.ts:133` (`student_id IN`, `channel`, `status`) | `(student_id,channel,status,created_at)`, `created_at` | None | admin |
| InstallmentPlan | Instalment plans | L | `lib/fees/dues.ts:238` (`student_id`) | `student_id`, `status` | None | admin |

### Content, site, logs

| Model | Purpose | Growth | Hot queries (file:line) | Existing indexes | Recommendation | Cache |
|---|---|---|---|---|---|---|
| Notice | Notices | L–M | `app/(site)/notices/page.tsx:64`, `lib/student/data.ts:153` (`status='active'` ± branch, `ORDER BY created_at DESC`) | `(status,created_at)`, `(branch_id,status,created_at)` | None | pub |
| Notification | In-app notifications | **H** (createMany per audience) | `lib/notifications/counts.ts:17` (`user_type,user_id,is_read=false` — every portal page); `:52`, `lib/student/data.ts:457` (`user_type,user_id` ORDER BY `created_at DESC`) | `(user_type,user_id,is_read)`, `created_at` | None. Considered `(user_type,user_id,created_at)`; rejected — per-user row counts are small, the existing index narrows to one user first. Revisit if a user exceeds ~1k rows (or purge read rows). | user |
| NotificationLog, SmsLog | Legacy send logs | L | Not queried by the Next app | `student_id` | None | — |
| EmailLog | Outbound email log | M–H | `app/(admin)/admin/email-log/page.tsx:91` (`created_at` range, `ORDER BY created_at DESC`); `lib/admin/dashboard.ts:287` (`status='failed'`,`created_at >=`); purge `created_at <` | `created_at`, `(related_type,related_id)`, `student_id`, `(status,created_at)` | None | admin |
| Inquiry | Leads | L–M | `lib/inquiries/admin.ts:169` (status, `ORDER BY created_at DESC` or `follow_up_date`); `lib/site/inquiry.ts:164` (`phone`,`status`,`created_at`) | `(status,created_at)`, `phone`, `(ip,created_at)` | None (follow-up count at `:198` is fine at this size) | admin |
| Feedback | Testimonials | L | `lib/site/home.ts:95` (`status='approved'` ORDER BY id DESC LIMIT 12); `lib/admin/dashboard.ts:426` | PK only | None (tiny; home page is cached) | pub |
| Gallery | Photos | L–M | `app/(site)/gallery/page.tsx:87` (`status` ± `category_id`, `ORDER BY sort_order, created_at DESC`); `lib/site/home.ts:103` | `category`, `status`, `featured`, `created_at`, `category_id` | None (hundreds of rows; `featured`/`category` indexes are unused by the Next app) | pub |
| GalleryCategory | Categories | L | `app/(site)/gallery/page.tsx:47` | unique `name`,`slug`; `status`, `sort_order` | None | pub |
| Achievement | Home-page achievements | L | `lib/site/home.ts:118` | `created_at` | None | pub |
| Gift, Promotion, TrialClass | Home-page marketing | L | `lib/site/home.ts:48/24/111`, `app/(site)/trial-classes/page.tsx:42` | `(is_active,sort_order)` / `(is_active,display_position)`,`(start_at,end_at)` / PK | None | pub |
| PrintableDocument | Printable images | L | by PK only | `category`, `created_at` | None | admin / user |
| Branch | Branches | L | `lib/site/branches.ts:19` (`status`) | unique `slug`; `(status,sort_order)` | None | pub |
| SiteSetting | Key/value settings | L | `lib/settings/index.ts:22` (all rows) | PK | None | pub (cache whole map) |
| AppSchemaVersion | Schema version row | L | unused by app | PK | None | — |
| DbBackup | Backup log | L | `lib/backup/dump.ts:283` (`ORDER BY created_at DESC`) | unique `filename`; `created_at` | None | admin |
| AiConversation | AI threads | M | `app/(student)/student/academic-ai/page.tsx:67` (`student_id` ORDER BY `updated_at DESC`) | `(student_id,updated_at)` | None | user |
| AiMessage | AI messages | **H** | `lib/ai/quota.ts:105/112` (`student_id,role,created_at`); `page.tsx:80` / `actions.ts:253` (`conversation_id` ORDER BY id) | `(conversation_id,id)`, `(student_id,role,created_at)` | None. `poolUsed()` (`lib/ai/quota.ts:207`, `role='user' AND from_cache=false AND created_at > now-24h`) has no matching index, but it is **not called anywhere** — add `(role, created_at)` if it gets wired up. | user |
| AiAnswerCache | Shared answer cache | M | `lib/ai/quota.ts:157` (PK) | PK; `created_at` | None | — |
| VisitorLog | Page-view log | **H** (per request) | raw `lib/analytics/read.ts:160-257` (`visit_date BETWEEN … GROUP BY …`); `:271` (`created_at >=`); `:281` `MIN(visit_date)` | `(visit_date,visitor_identifier,session_id,is_new_visitor)`, `(visit_date,page_url)`, `(created_at,visitor_identifier)` | None — covered. Largest table; roll old days into VisitorMonthlySummary and delete, as the PHP app did. | admin |
| VisitorMonthlySummary | Monthly roll-up | L | `lib/analytics/read.ts:398` (PK range) | PK | None | admin |

## 3. Relationships (FKs present)

61 FKs, all mirrored from MySQL. Main trees: Student → {Attendance, Enrollment, Payment (RESTRICT), ExamAttempt,
ExamResult, AssignmentSubmission, FeeDiscount, FeeReminder, InstallmentPlan, GuardianStudent, StudentLogin,
AiConversation, AiMessage, NotificationLog, SmsLog} (CASCADE except Payment); Exam → ExamQuestion/ExamAttempt →
ExamAnswer/ExamAnswerFile (CASCADE); MonthlyExam → MonthlyExamSubject → ExamResult (CASCADE); Branch → 15 tables
(RESTRICT, SET NULL for RecordedClass); Course/Batch → Enrollment, MonthlyExam (SET NULL).

## 4. Constraints and follow-ups (not applied)

**FKs worth adding** (all were plain INTs in MySQL too; verify orphan rows before adding):

| Column | Target | Note |
|---|---|---|
| note_email_logs.note_id, .student_id | admin_notes, students | `migrate_enhanced.sql` declared both FKs + `UNIQUE(note_id,student_id)`, but the live MySQL table had neither. Deleting a note already deletes its logs in app code (`notes/actions.ts:131`). |
| live_classes.batch_id | batches | Filtered on (`lib/classes/data.ts`) with no FK. |
| payments.admission_id / enrollment_id / installment_plan_id | admissions / enrollments / installment_plans | Joined in fees code; SET NULL would be the safe action. |
| admissions.student_id, .applicant_student_id, .course_id, .batch_id | students / courses / batches | SET NULL. |
| installment_plans.enrollment_id, exam_results.entered_by, *.created_by | … | Low value; `created_by` columns hold admin **or** teacher ids in some tables — do not FK those. |

Not FK-able as-is: `attendance.batch_id` uses `0` for "no batch" (NOT NULL DEFAULT 0); `notifications`,
`auth_remember_tokens`, `password_resets`, `user_preferences` are polymorphic `(user_type,user_id)`.

**NOT NULL candidates** — nullable only because MySQL had `DEFAULT x` without `NOT NULL`; every writer sets them:
attendance.status, notice.status, students.status, payments.payment_status, gallery.status, gallery.featured,
feedback.status, trial_classes.status, note_email_logs.status, live_class_materials.file_size. Tighten after
checking `SELECT count(*) … WHERE col IS NULL` = 0 on the imported data.

**Unique candidates**: `assignment_submissions (assignment_id, student_id)` (app does find-then-update at
`app/(student)/student/assignments/actions.ts:72`, so a race can create duplicates);
`note_email_logs (note_id, student_id)` (see above). Both need a dedupe check before adding.

**Redundant indexes** (safe to drop later to save write cost; left in place per this task's no-drop rule):
`exam_questions(exam_id)` (covered by `(exam_id, sort_order)`), `live_classes(teacher_id)` (covered by the new
`(teacher_id, class_date)`), `live_classes(status)` (covered by `(status, course)`).

**Bug noticed while auditing (not schema)**: `lib/analytics/coaching.ts:575` filters attendance with
`{ batch: { course_id } }`, but `Attendance` has no `batch` relation (only a plain `batch_id`). Prisma throws a
validation error, `safe()` swallows it, and the attendance analytics return empty whenever a course filter is set.
Use `{ batch_id: { in: <batch ids of the course> } }` instead.
