/**
 * DEMO data for trying the app on an empty database: `npm run db:demo`.
 *
 * Fills every portal with something to look at — courses and batches, a
 * teacher, six students with logins, two guardians (one with siblings), three
 * months of fees in every state (paid, partial, unpaid), a month of attendance,
 * notices, and one published monthly exam with marks.
 *
 * Every demo person has a phone in 01700-0000xx and an @demo.orbit address, so
 * they are easy to find and delete before going live. Running it twice changes
 * nothing: it stops if the first demo student already exists.
 *
 * NOT for a database you will import real data into — the import keeps the
 * original ids and these rows would collide with them.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../lib/auth/password';
import { loadEnv } from './env';

loadEnv();
const prisma = new PrismaClient();

/** The password every demo login gets. Demo only — delete these accounts before going live. */
const DEMO_PASSWORD = 'Demo1234';

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const ym = (monthsBack: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

async function main(): Promise<void> {
  if (await prisma.student.findUnique({ where: { phone: '01700000001' } })) {
    console.log('demo data already present — skipped');
    return;
  }

  const branch = await prisma.branch.findFirst({ where: { is_main: true } });
  if (!branch) throw new Error('No main branch — run `npm run db:seed` first.');
  const hash = await hashPassword(DEMO_PASSWORD);

  /* ------------------------------------------------------------ settings */
  const settings: Record<string, string> = {
    institute_name: 'Orbit Private Care',
    institute_name_bn: 'অরবিট প্রাইভেট কেয়ার',
    institute_tagline: 'Excellence in Coaching',
    institute_tagline_bn: 'মানসম্মত কোচিং',
    institute_address: 'Jahaj Company More, Rangpur',
    institute_address_bn: 'জাহাজ কোম্পানি মোড়, রংপুর',
    contact_phone: '01700000099',
    helpline_number: '01700000099',
    bkash_number: '01700000098',
    nagad_number: '01700000097',
    student_id_prefix: 'ORB',
  };
  for (const [setting_key, setting_value] of Object.entries(settings)) {
    await prisma.siteSetting.upsert({
      where: { setting_key },
      create: { setting_key, setting_value },
      update: {},
    });
  }

  /* ------------------------------------------------------------- teacher */
  const teacher = await prisma.teacher.create({
    data: {
      name: 'Rahim Uddin',
      name_bn: 'রহিম উদ্দিন',
      email: 'teacher@demo.orbit',
      phone: '01700000050',
      password_hash: hash,
      designation: 'Senior Teacher (Math)',
      designation_bn: 'সিনিয়র শিক্ষক (গণিত)',
      show_on_website: true,
    },
  });

  /* ---------------------------------------------------- courses, batches */
  const courseSpecs = [
    { name: 'SSC Science', name_bn: 'এসএসসি বিজ্ঞান', fee: 1500 },
    { name: 'HSC Science', name_bn: 'এইচএসসি বিজ্ঞান', fee: 2000 },
  ];
  const courses: Awaited<ReturnType<typeof prisma.course.create>>[] = [];
  const batches: Awaited<ReturnType<typeof prisma.batch.create>>[] = [];
  for (const [i, spec] of courseSpecs.entries()) {
    const course = await prisma.course.create({
      data: {
        name: spec.name,
        name_bn: spec.name_bn,
        description: `${spec.name} — full syllabus with weekly and monthly exams.`,
        description_bn: `${spec.name_bn} — সাপ্তাহিক ও মাসিক পরীক্ষাসহ পূর্ণ সিলেবাস।`,
        image: '',
        fee: spec.fee,
        duration: '12 months',
        duration_bn: '১২ মাস',
        course_type: 'offline',
        teacher_id: teacher.id,
        sort_order: i + 1,
        is_featured: true,
      },
    });
    courses.push(course);
    batches.push(
      await prisma.batch.create({
        data: {
          course_id: course.id,
          name: 'Morning Batch',
          name_bn: 'সকালের ব্যাচ',
          batch_type: 'offline',
          schedule_info: 'Sat, Mon, Wed — 8:00 AM',
          schedule_info_bn: 'শনি, সোম, বুধ — সকাল ৮টা',
          start_date: day(-90),
          capacity: 30,
          fee: spec.fee,
          branch_id: branch.id,
        },
      })
    );
  }

  /* ------------------------------------------------------------ students */
  const people = [
    { name: 'Ayesha Akter', name_bn: 'আয়েশা আক্তার', gender: 'female', c: 0, guardian: '01700000071' },
    { name: 'Tanvir Hasan', name_bn: 'তানভীর হাসান', gender: 'male', c: 0, guardian: '01700000071' },
    { name: 'Nusrat Jahan', name_bn: 'নুসরাত জাহান', gender: 'female', c: 0, guardian: '01700000072' },
    { name: 'Sabbir Ahmed', name_bn: 'সাব্বির আহমেদ', gender: 'male', c: 1, guardian: '01700000073' },
    { name: 'Mim Rahman', name_bn: 'মিম রহমান', gender: 'female', c: 1, guardian: '01700000074' },
    { name: 'Rakib Islam', name_bn: 'রাকিব ইসলাম', gender: 'male', c: 1, guardian: '01700000075' },
  ] as const;

  const students = [];
  for (const [i, p] of people.entries()) {
    const n = i + 1;
    const course = courses[p.c];
    const batch = batches[p.c];
    const student = await prisma.student.create({
      data: {
        student_id_no: `ORB-${String(n).padStart(5, '0')}`,
        name: p.name,
        name_bn: p.name_bn,
        phone: `017000000${String(n).padStart(2, '0')}`,
        guardian_phone: p.guardian,
        email: `student${n}@demo.orbit`,
        institution: p.c === 0 ? 'Rangpur Zilla School' : 'Carmichael College',
        address: 'Rangpur',
        course: course.name,
        batch: batch.name,
        batch_id: batch.id,
        image: '',
        status: 'approved',
        roll_number: String(n),
        father_name: `Md. ${p.name.split(' ')[1]}`,
        mother_name: 'Mst. Demo Begum',
        gender: p.gender,
        branch_id: branch.id,
      },
    });
    await prisma.studentLogin.create({
      data: { student_id: student.id, username: `student${n}`, password: hash, must_change_password: false },
    });
    await prisma.enrollment.create({
      data: {
        student_id: student.id,
        course_id: course.id,
        batch_id: batch.id,
        course_name: course.name,
        batch_name: batch.name,
        batch_type: 'offline',
        fee: course.fee,
        status: 'active',
        enrolled_at: day(-90),
        approved_at: day(-90),
      },
    });
    students.push({ ...student, courseId: course.id, fee: Number(course.fee) });
  }

  /* ----------------------------------------------------------- guardians */
  const guardianPhones = [...new Set(people.map((p) => p.guardian))];
  for (const phone of guardianPhones) {
    const children = students.filter((s) => s.guardian_phone === phone);
    const guardian = await prisma.guardian.create({
      data: {
        phone,
        name: children[0].father_name,
        password: hash,
        must_change_password: false,
        status: 'active',
      },
    });
    for (const child of children) {
      await prisma.guardianStudent.create({
        data: { guardian_id: guardian.id, student_id: child.id, relation: 'father' },
      });
    }
  }

  /* ------------------------------------------------------------ payments */
  let receipt = 1;
  for (const [i, s] of students.entries()) {
    for (const back of [2, 1, 0]) {
      const month = ym(back);
      // Older months paid; last month partial for some; this month unpaid for most.
      const state = back === 2 ? 'paid' : back === 1 ? (i % 3 === 0 ? 'partial' : 'paid') : i % 2 === 0 ? 'unpaid' : 'paid';
      const paidPart = state === 'partial' ? s.fee / 2 : s.fee;
      await prisma.payment.create({
        data: {
          student_id: s.id,
          amount: state === 'unpaid' ? s.fee : paidPart,
          due_amount: state === 'partial' ? s.fee - paidPart : 0,
          payment_month: month,
          payment_status: state === 'unpaid' ? 'unpaid' : 'paid',
          payment_date: new Date(`${month}-05T10:00:00Z`),
          payment_method: state === 'unpaid' ? 'Cash' : i % 2 === 0 ? 'bkash' : 'Cash',
          receipt_number: state === 'unpaid' ? null : `REC-DEMO-${String(receipt++).padStart(4, '0')}`,
          fee_type: 'monthly',
          due_date: new Date(`${month}-10T00:00:00Z`),
          original_amount: s.fee,
          branch_id: branch.id,
        },
      });
    }
  }

  /* ---------------------------------------------------------- attendance */
  const statuses = ['present', 'present', 'present', 'present', 'late', 'absent', 'present', 'half_day'] as const;
  for (let offset = -30; offset <= -1; offset++) {
    const date = day(offset);
    if (date.getUTCDay() === 5) continue; // Friday off
    for (const [i, s] of students.entries()) {
      const batch = batches[s.courseId === courses[0].id ? 0 : 1];
      await prisma.attendance.create({
        data: {
          student_id: s.id,
          course_id: s.courseId,
          batch_id: batch.id,
          attendance_date: date,
          status: statuses[(i + offset + 40) % statuses.length],
          branch_id: branch.id,
        },
      });
    }
  }

  /* ---------------------------------------------------- gallery category */
  // The admin Gallery page offers an upload form only once a category exists.
  if (!(await prisma.galleryCategory.findFirst({ where: { slug: 'events' } }))) {
    await prisma.galleryCategory.create({ data: { name: 'Events', slug: 'events', status: 'active', sort_order: 1 } });
  }

  /* ------------------------------------------------------------- notices */
  const notices = [
    ['Monthly exam schedule published', 'The monthly exam will be held next Saturday at 9 AM. Bring your admit card.'],
    ['Fees due by the 10th', 'Please pay this month’s fee by the 10th via bKash, Nagad or at the office.'],
    ['Holiday notice', 'The centre will remain closed on Friday for the weekly holiday.'],
  ];
  for (const [i, [title, description]] of notices.entries()) {
    await prisma.notice.create({
      data: { title, description, status: 'active', created_at: day(-i * 4) },
    });
  }

  /* ------------------------------------------------ subjects, one exam */
  const subjectSpecs = [
    ['Mathematics', 'গণিত'],
    ['Physics', 'পদার্থবিজ্ঞান'],
    ['English', 'ইংরেজি'],
  ];
  const subjects = [];
  for (const [i, [name, name_bn]] of subjectSpecs.entries()) {
    subjects.push(
      await prisma.subject.upsert({
        where: { name },
        create: { name, name_bn, sort_order: i + 1 },
        update: {},
      })
    );
  }

  const exam = await prisma.monthlyExam.create({
    data: {
      title: 'Monthly Exam',
      title_bn: 'মাসিক পরীক্ষা',
      exam_month: ym(1),
      course_id: courses[0].id,
      batch_id: batches[0].id,
      exam_date: new Date(`${ym(1)}-20T00:00:00Z`),
      total_marks: 300,
      full_marks: 100,
      pass_marks: 33,
      show_position: true,
      status: 'published',
      published_at: new Date(),
    },
  });
  const examSubjects = [];
  for (const [i, subject] of subjects.entries()) {
    examSubjects.push(
      await prisma.monthlyExamSubject.create({
        data: {
          exam_id: exam.id,
          subject_id: subject.id,
          subject_name: subject.name,
          subject_name_bn: subject.name_bn,
          full_marks: 100,
          pass_marks: 33,
          sort_order: i + 1,
        },
      })
    );
  }
  const marks = [
    [88, 76, 81],
    [65, 58, 72],
    [92, 85, 90],
  ];
  const sscStudents = students.filter((s) => s.courseId === courses[0].id);
  for (const [i, s] of sscStudents.entries()) {
    for (const [j, es] of examSubjects.entries()) {
      await prisma.examResult.create({
        data: {
          student_id: s.id,
          exam_name: exam.title,
          subject: es.subject_name,
          marks_obtained: marks[i][j],
          total_marks: 100,
          exam_date: exam.exam_date,
          monthly_exam_id: exam.id,
          exam_subject_id: es.id,
          is_absent: false,
          entered_by: teacher.id,
        },
      });
    }
  }

  console.log('demo data created:');
  console.log(`  ${courses.length} courses, ${batches.length} batches, 1 teacher, ${students.length} students, ${guardianPhones.length} guardians`);
  console.log(`  payments, ~a month of attendance, ${notices.length} notices, 1 published exam`);
  console.log(`  logins (password for all: ${DEMO_PASSWORD})`);
  console.log('    student   student1 … student6');
  console.log('    guardian  01700000071 (two children), 01700000072 …');
  console.log('    teacher   teacher@demo.orbit');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
