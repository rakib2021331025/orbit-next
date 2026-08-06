import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { TeacherFormDialog } from "./teacher-form-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Teachers" };
export const dynamic = "force-dynamic";

const STATUS_VARIANT = {
  ACTIVE: "default",
  ON_LEAVE: "secondary",
  INACTIVE: "outline",
} as const;

export default async function AdminTeachersPage() {
  const teachers = await prisma.teacher.findMany({
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
    include: {
      user: { select: { email: true, isActive: true } },
      _count: { select: { assignments: true, evaluations: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Teachers"
        description="Add teachers, assign them to batches and subjects, and manage their portal access."
        action={<TeacherFormDialog mode="create" />}
      />

      {teachers.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
            <div className="bg-muted flex size-12 items-center justify-center rounded-full">
              <GraduationCap className="size-6" />
            </div>
            <div>
              <p className="text-foreground font-medium">No teachers yet</p>
              <p className="text-sm">
                Add your first teacher to start assigning courses and schedules.
              </p>
            </div>
            <TeacherFormDialog mode="create" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead className="hidden md:table-cell">Designation</TableHead>
                  <TableHead className="hidden lg:table-cell">Joined</TableHead>
                  <TableHead className="text-center">Assignments</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((teacher) => (
                  <TableRow key={teacher.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          {teacher.photoUrl && (
                            <AvatarImage src={teacher.photoUrl} alt="" />
                          )}
                          <AvatarFallback>
                            {teacher.fullName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{teacher.fullName}</p>
                          <p className="text-muted-foreground truncate text-xs">
                            {teacher.user.email ?? "No email"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">
                      {teacher.designation ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell tabular-nums">
                      {formatDate(teacher.joiningDate)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {teacher._count.assignments}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[teacher.status]}>
                        {teacher.status === "ON_LEAVE" ? "On leave" : teacher.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/admin/teachers/${teacher.id}`}>Manage</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
