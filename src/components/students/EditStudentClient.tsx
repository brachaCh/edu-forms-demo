"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StudentWizard } from "@/components/students/StudentWizard";
import { TextScope } from "@/components/providers/TextScope";
import { getStudents } from "@/lib/mock-store";
import type { Student } from "@/lib/supabase/types";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { statusUsesTeacherStep } from "@/lib/labels";
import {
  categoryTeacherHref,
  isPersonalSector,
  sectorHomeHref,
  sectorStatusHref,
  sectorTeacherHref,
} from "@/lib/personal-sector";

interface EditStudentClientProps {
  id: string;
}

function continueHrefForStudent(student: Student): string {
  const sector = isPersonalSector(student.category) ? student.category : null;
  if (!student.status) {
    return sector ? sectorHomeHref(sector) : "/personal-area";
  }
  if (
    statusUsesTeacherStep(student.status) &&
    student.status !== "integration-teacher" &&
    student.teacher_name?.trim()
  ) {
    if (sector) {
      return sectorTeacherHref(
        sector,
        student.status,
        student.teacher_name.trim()
      );
    }
    return categoryTeacherHref(student.status, student.teacher_name.trim());
  }
  if (sector) {
    return sectorStatusHref(sector, student.status);
  }
  return `/personal-area/category/${student.status}`;
}

export function EditStudentClient({ id }: EditStudentClientProps) {
  const { ready } = useDataStore();
  const [student, setStudent] = useState<Student | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const found = getStudents().find((s) => s.id === id);
    if (!found) {
      setNotFound(true);
      return;
    }
    setStudent(found);
  }, [id, ready]);

  if (notFound) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="mb-3 text-brand-700">כרטיס תלמיד לא נמצא.</p>
          <Button asChild>
            <Link href={`/personal-area/students/view/${id}`}>
              חזרה לכרטיס
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!student) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-brand-600">
          טוען כרטיס...
        </CardContent>
      </Card>
    );
  }

  const wizard = (
    <div className="h-full min-h-0">
      <StudentWizard
        initial={student}
        continueHref={continueHrefForStudent(student)}
      />
    </div>
  );
  return isPersonalSector(student.category) ? (
    <TextScope sector={student.category}>{wizard}</TextScope>
  ) : (
    wizard
  );
}
