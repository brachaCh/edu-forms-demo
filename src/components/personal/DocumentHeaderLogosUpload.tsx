"use client";

import { useEffect, useState } from "react";
import { InstitutionFooterLogoUpload } from "@/components/personal/InstitutionFooterLogoUpload";
import { SharedAiExamplesUpload } from "@/components/personal/SharedAiExamplesUpload";
import {
  SchoolLogoUploadField,
  readInitialSchoolLogo,
} from "@/components/students/SchoolLogoUploadField";
import { EditableText } from "@/components/editable/EditableText";
import { getUser } from "@/lib/mock-store";
import type { SchoolLogoScopeInput } from "@/lib/document-branding";

/**
 * העלאת לוגו בי״ס + לוגו עמותה + דוגמאות AI — במסך «ניהול איזור אישי» בלבד.
 * שניהם יופיעו בראש המסמכים; לוגו פרוטוקל נשאר תמיד בתחתית.
 */
export function DocumentHeaderLogosUpload() {
  const user = getUser();
  const institutionScope = {
    institutionId: user?.institution_id ?? null,
    institutionCode: user?.institution_code ?? null,
  };
  const schoolScope: SchoolLogoScopeInput = {
    userId: user?.id ?? null,
    institutionId: user?.institution_id ?? null,
    teacherName: user?.full_name ?? null,
  };
  const [schoolLogoUrl, setSchoolLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    setSchoolLogoUrl(readInitialSchoolLogo(schoolScope));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when identity changes
  }, [user?.id, user?.institution_id, user?.full_name]);

  return (
    <div className="space-y-3">
      <div className="menu-box shrink-0 space-y-3 p-3">
        <p className="text-center text-sm font-bold text-ink">
          <EditableText path="personalArea.documentLogosTitle" />
        </p>
        <p className="text-center text-xs text-pink/70">
          <EditableText path="personalArea.documentLogosHint" />
        </p>
        {/* LTR: שמאל = עמותה, ימין = בית ספר */}
        <div className="grid gap-3 sm:grid-cols-2" dir="ltr">
          <InstitutionFooterLogoUpload scope={institutionScope} />
          <SchoolLogoUploadField
            scope={schoolScope}
            logoUrl={schoolLogoUrl}
            onLogoChange={setSchoolLogoUrl}
          />
        </div>
      </div>
      <SharedAiExamplesUpload scope={institutionScope} />
    </div>
  );
}
