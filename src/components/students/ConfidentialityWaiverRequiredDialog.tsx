"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditableText } from "@/components/editable/EditableText";
import { WaiverSignerLockedStatus } from "@/components/students/WaiverSignerLockedStatus";
import { PaperWaiverScanPanel } from "@/components/students/PaperWaiverScanPanel";
import {
  confidentialityWaiverFormsHref,
  isConfidentialityWaiverCompleted,
} from "@/lib/confidentiality-waiver-gate";

export type WaiverRequiredReason = "waiver" | "both-parents";

interface ConfidentialityWaiverRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  /** מסמכים נוספים דורשים חתימות שני ההורים */
  reason?: WaiverRequiredReason;
  /** After a scan satisfies the waiver — unlock the parent page, not only close. */
  onUnlocked?: () => void;
}

export function ConfidentialityWaiverRequiredDialog({
  open,
  onOpenChange,
  studentId,
  reason = "waiver",
  onUnlocked,
}: ConfidentialityWaiverRequiredDialogProps) {
  const titlePath =
    reason === "both-parents"
      ? "studentPortfolio.waiverBothParentsRequiredTitle"
      : "studentPortfolio.waiverRequiredTitle";
  const descriptionPath =
    reason === "both-parents"
      ? "studentPortfolio.waiverBothParentsRequiredDescription"
      : "studentPortfolio.waiverRequiredDescription";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            <EditableText path={titlePath} as="span" />
          </DialogTitle>
          <DialogDescription>
            <EditableText path={descriptionPath} as="span" />
          </DialogDescription>
        </DialogHeader>

        <WaiverSignerLockedStatus studentId={studentId} />

        <PaperWaiverScanPanel
          studentId={studentId}
          onChanged={() => {
            if (isConfidentialityWaiverCompleted(studentId)) {
              onOpenChange(false);
              onUnlocked?.();
            }
          }}
        />

        <DialogFooter className="gap-2 sm:justify-center">
          <Button asChild>
            <Link
              href={confidentialityWaiverFormsHref(studentId)}
              onClick={() => onOpenChange(false)}
            >
              <ClipboardList className="h-4 w-4" />
              <EditableText path="studentPortfolio.waiverRequiredGoFill" />
            </Link>
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            <EditableText path="studentPortfolio.waiverRequiredClose" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
