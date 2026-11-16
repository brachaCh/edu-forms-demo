import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { InstitutionPickerPageClient } from "@/components/auth/InstitutionPickerPageClient";

export const metadata = {
  title: "בחירת מוסד | מתוה",
  description: "בחירת מוסד לכניסה",
};

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function SelectInstitutionPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <InstitutionPickerPageClient />
    </Suspense>
  );
}
