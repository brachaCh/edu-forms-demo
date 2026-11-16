"use client";

import { useEffect, useState } from "react";
import { Check, Clock, FileSignature, Mail, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createExternalDocumentSignature,
  loadExternalDocumentSignatures,
  resendExternalDocumentSignature,
  type ExternalDocumentSignatureRequest,
} from "@/lib/external-document-signature";
import type { StudentDocument } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

interface ExternalDocumentSignaturePanelProps {
  studentId: string;
  studentEmail?: string | null;
  documents: StudentDocument[];
  folderName: string;
  className?: string;
}

function statusLabel(status: ExternalDocumentSignatureRequest["status"]): string {
  switch (status) {
    case "pending":
      return "ממתין לחתימה";
    case "signed":
      return "נחתם";
    case "expired":
      return "פג תוקף";
    case "revoked":
      return "בוטל";
    default:
      return status;
  }
}

function StatusIcon({ status }: { status: ExternalDocumentSignatureRequest["status"] }) {
  switch (status) {
    case "signed":
      return <Check className="h-4 w-4 text-emerald-600" />;
    case "pending":
      return <Clock className="h-4 w-4 text-amber-600" />;
    case "expired":
    case "revoked":
      return <X className="h-4 w-4 text-gray-400" />;
    default:
      return null;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TLA_DOCUMENT_PATTERNS = [
  /תל"?א/i,
  /tla/i,
  /individual.*plan/i,
];

function isTlaDocument(name: string): boolean {
  return TLA_DOCUMENT_PATTERNS.some((pattern) => pattern.test(name));
}

export function ExternalDocumentSignaturePanel({
  studentId,
  studentEmail,
  documents,
  folderName,
  className,
}: ExternalDocumentSignaturePanelProps) {
  const [requests, setRequests] = useState<ExternalDocumentSignatureRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<StudentDocument | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [signerLabel, setSignerLabel] = useState("הורה");
  const [sending, setSending] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const relevantDocs = documents.filter(
    (doc) =>
      !doc.archived_at &&
      (isTlaDocument(doc.name) ||
        isTlaDocument(doc.folder) ||
        folderName.includes('תל"א') ||
        folderName.toLowerCase().includes("tla"))
  );

  async function refresh() {
    setLoading(true);
    try {
      const result = await loadExternalDocumentSignatures(studentId);
      if (result.ok) {
        setRequests(result.requests);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  function openSendDialog(doc: StudentDocument) {
    setSelectedDoc(doc);
    setRecipientEmail((studentEmail ?? "").trim());
    setSignerLabel("הורה");
    setError(null);
    setMessage(null);
    setDialogOpen(true);
  }

  async function handleSend() {
    if (!selectedDoc) return;
    const email = recipientEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("נא להזין כתובת מייל תקינה");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await createExternalDocumentSignature({
        studentId,
        documentId: selectedDoc.id,
        documentName: selectedDoc.name,
        recipientEmail: email,
        signerLabel: signerLabel.trim() || "הורה",
      });
      if (!result.ok) {
        setError(result.error || "שליחה נכשלה");
        return;
      }
      setDialogOpen(false);
      setMessage(`קישור לחתימה נשלח ל־${email}`);
      await refresh();
    } catch {
      setError("שגיאה בשליחה");
    } finally {
      setSending(false);
    }
  }

  async function handleResend(requestId: string) {
    setResendingId(requestId);
    setError(null);
    setMessage(null);
    try {
      const result = await resendExternalDocumentSignature(requestId);
      if (!result.ok) {
        setError(result.error || "שליחת תזכורת נכשלה");
        return;
      }
      setMessage("תזכורת נשלחה בהצלחה");
      await refresh();
    } catch {
      setError("שגיאה בשליחת תזכורת");
    } finally {
      setResendingId(null);
    }
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const hasPending = pendingRequests.length > 0;

  if (relevantDocs.length === 0 && requests.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-4",
        hasPending
          ? "border-amber-200 bg-amber-50/60"
          : "border-brand-200 bg-brand-50/60",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-brand-600" />
          <h3 className="font-bold text-ink">שליחת מסמך לחתימת הורים</h3>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => void refresh()}
          className="h-7 px-2"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <p className="mb-3 text-sm text-pink">
        {'אפשר להעלות תל"א שנכתב במערכת אחרת ולשלוח להורים קישור לחתימה דיגיטלית.'}
      </p>

      {relevantDocs.length > 0 ? (
        <div className="mb-4 space-y-2">
          <p className="text-sm font-medium text-ink">מסמכים זמינים לשליחה:</p>
          <ul className="space-y-1">
            {relevantDocs.map((doc) => {
              const latestRequest = requests.find((r) => r.documentId === doc.id);
              const status = latestRequest?.status;
              const canSend =
                !latestRequest || status === "expired" || status === "revoked";
              return (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2"
                >
                  <span className="truncate text-sm font-medium text-ink">
                    {doc.name}
                  </span>
                  {status === "pending" ? (
                    <span className="flex items-center gap-1 text-xs text-amber-700">
                      <Clock className="h-3.5 w-3.5" />
                      {statusLabel("pending")}
                    </span>
                  ) : status === "signed" && latestRequest ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-700">
                      <Check className="h-3.5 w-3.5" />
                      {statusLabel("signed")}
                      {latestRequest.signedAt
                        ? ` · ${formatDate(latestRequest.signedAt)}`
                        : null}
                    </span>
                  ) : status === "expired" || status === "revoked" ? (
                    <span className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-gray-600">
                        <StatusIcon status={status} />
                        {statusLabel(status)}
                      </span>
                      {canSend ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openSendDialog(doc)}
                        >
                          <Send className="h-4 w-4" />
                          שלח לחתימה
                        </Button>
                      ) : null}
                    </span>
                  ) : canSend ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openSendDialog(doc)}
                    >
                      <Send className="h-4 w-4" />
                      שלח לחתימה
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {pendingRequests.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">בקשות ממתינות:</p>
          <ul className="space-y-2">
            {pendingRequests.map((req) => (
              <li
                key={req.id}
                className="flex flex-col gap-2 rounded-lg bg-white/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={req.status} />
                    <span className="truncate font-medium text-ink">
                      {req.documentName}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-pink">
                    <span dir="ltr">{req.recipientEmail}</span>
                    {" · "}
                    נשלח: {formatDate(req.createdAt)}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={resendingId === req.id}
                  onClick={() => void handleResend(req.id)}
                >
                  <Mail className="h-4 w-4" />
                  {resendingId === req.id ? "שולח..." : "שלח תזכורת"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-center text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 text-center text-sm font-medium text-brand-700">
          {message}
        </p>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>שליחת מסמך לחתימה</DialogTitle>
            <DialogDescription>
              {selectedDoc?.name ?? "מסמך"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ext-sig-email">כתובת מייל ההורה</Label>
              <Input
                id="ext-sig-email"
                type="email"
                dir="ltr"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="parent@example.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ext-sig-label">תפקיד החותם</Label>
              <Input
                id="ext-sig-label"
                type="text"
                value={signerLabel}
                onChange={(e) => setSignerLabel(e.target.value)}
                placeholder="הורה / אב / אם"
              />
            </div>

            {error ? (
              <p className="text-sm font-medium text-destructive">{error}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              disabled={sending}
              onClick={() => void handleSend()}
            >
              <Send className="h-4 w-4" />
              {sending ? "שולח..." : "שליחה לחתימה"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={sending}
              onClick={() => setDialogOpen(false)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
