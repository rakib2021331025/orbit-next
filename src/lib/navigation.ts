import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  LayoutDashboard,
  Megaphone,
  MessageSquareQuote,
  PenSquare,
  Settings,
  Star,
  Users,
  Video,
} from "lucide-react";

import type { Role } from "@/generated/prisma/enums";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/**
 * Sidebar contents per role. This is presentation only — it decides what a user
 * *sees*, never what they may *do*. Authorisation is enforced by middleware and
 * by the guards in `lib/guards.ts`.
 */
export const NAVIGATION: Record<Role, NavGroup[]> = {
  ADMIN: [
    {
      label: "Overview",
      items: [{ title: "Dashboard", href: "/admin", icon: LayoutDashboard }],
    },
    {
      label: "People",
      items: [
        { title: "Students", href: "/admin/students", icon: Users },
        { title: "Teachers", href: "/admin/teachers", icon: GraduationCap },
        { title: "Admissions", href: "/admin/admissions", icon: ClipboardList },
      ],
    },
    {
      label: "Academics",
      items: [
        { title: "Courses & Batches", href: "/admin/courses", icon: BookOpen },
        { title: "Class Routine", href: "/admin/routine", icon: CalendarDays },
        { title: "Attendance", href: "/admin/attendance", icon: CalendarCheck },
        { title: "Live Classes", href: "/admin/live-classes", icon: Video },
        { title: "Materials", href: "/admin/materials", icon: FileText },
        { title: "Assignments", href: "/admin/assignments", icon: PenSquare },
      ],
    },
    {
      label: "Examinations",
      items: [
        { title: "MCQ Exams", href: "/admin/exams", icon: ClipboardList },
        { title: "CQ Exams", href: "/admin/cq-exams", icon: PenSquare },
        { title: "Results", href: "/admin/results", icon: BarChart3 },
      ],
    },
    {
      label: "Quality",
      items: [
        { title: "Teacher Evaluation", href: "/admin/evaluations", icon: Star },
      ],
    },
    {
      label: "Finance",
      items: [{ title: "Payments", href: "/admin/payments", icon: CreditCard }],
    },
    {
      label: "Website",
      items: [
        { title: "Notices", href: "/admin/notices", icon: Megaphone },
        { title: "Gallery", href: "/admin/gallery", icon: ImageIcon },
        { title: "Testimonials", href: "/admin/testimonials", icon: MessageSquareQuote },
        { title: "Settings", href: "/admin/settings", icon: Settings },
      ],
    },
  ],

  TEACHER: [
    {
      label: "Overview",
      items: [{ title: "Dashboard", href: "/teacher", icon: LayoutDashboard }],
    },
    {
      label: "Teaching",
      items: [
        { title: "My Courses", href: "/teacher/courses", icon: BookOpen },
        { title: "Schedule", href: "/teacher/routine", icon: CalendarDays },
        { title: "Attendance", href: "/teacher/attendance", icon: CalendarCheck },
        { title: "Live Classes", href: "/teacher/live-classes", icon: Video },
        { title: "Materials", href: "/teacher/materials", icon: FileText },
      ],
    },
    {
      label: "Examinations",
      items: [
        { title: "MCQ Exams", href: "/teacher/exams", icon: ClipboardList },
        { title: "CQ Exams", href: "/teacher/cq-exams", icon: PenSquare },
      ],
    },
    {
      label: "Feedback",
      items: [{ title: "My Evaluations", href: "/teacher/evaluations", icon: Star }],
    },
  ],

  STUDENT: [
    {
      label: "Overview",
      items: [{ title: "Dashboard", href: "/student", icon: LayoutDashboard }],
    },
    {
      label: "Learning",
      items: [
        { title: "Routine", href: "/student/routine", icon: CalendarDays },
        { title: "Live Classes", href: "/student/live-classes", icon: Video },
        { title: "Materials", href: "/student/materials", icon: FileText },
        { title: "Assignments", href: "/student/assignments", icon: PenSquare },
        { title: "Attendance", href: "/student/attendance", icon: CalendarCheck },
      ],
    },
    {
      label: "Examinations",
      items: [
        { title: "MCQ Exams", href: "/student/exams", icon: ClipboardList },
        { title: "CQ Exams", href: "/student/cq-exams", icon: PenSquare },
        { title: "Results", href: "/student/results", icon: BarChart3 },
      ],
    },
    {
      label: "Account",
      items: [
        { title: "Payments", href: "/student/payments", icon: CreditCard },
        { title: "Rate Teachers", href: "/student/evaluations", icon: Star },
        { title: "Settings", href: "/student/settings", icon: Settings },
      ],
    },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  TEACHER: "Teacher",
  STUDENT: "Student",
};
