"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  FileDown,
  Eye,
  FileText,
  Mail,
  Maximize2,
  Printer,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableText } from "@/components/editable/EditableText";
import { PageShell } from "@/components/layout/PageShell";
import { StudentsListBackLink } from "@/components/students/StudentsListBackLink";
import { readNavBackHref } from "@/lib/navigation-back";
import {
  fillPageUrlFromParam,
  resolveFillFolderBackHref,
  resolveFillStudentsListBackHref,
} from "@/lib/student-fill-back";
import {
  createFillSaveTracker,
  leaveFillPageAfterSaves,
  mergeSavedFillIntoCurrentData,
  resolveFillSaveLocalState,
  waitForInFlightFillSave,
} from "@/lib/fill-page-save";
import { ConfidentialityWaiverRequiredDialog } from "@/components/students/ConfidentialityWaiverRequiredDialog";
import type { WaiverRequiredReason } from "@/components/students/ConfidentialityWaiverRequiredDialog";
import { WaiverSignerLockedStatus } from "@/components/students/WaiverSignerLockedStatus";
import { PaperWaiverScanPanel } from "@/components/students/PaperWaiverScanPanel";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { TextScope } from "@/components/providers/TextScope";
import { HomeroomReportGrid } from "@/components/students/HomeroomReportGrid";
import { ScheduleGrid } from "@/components/students/ScheduleGrid";
import { FormRowTable } from "@/components/students/FormRowTable";
import { AccommodationsPickerField } from "@/components/students/AccommodationsPickerField";
import {
  HolisticProfileGrid,
  isHolisticProfileFieldKey,
} from "@/components/students/HolisticProfileGrid";
import {
  IntegrativeTachiGrid,
  isIntegrativeTachiOwnedField,
} from "@/components/students/IntegrativeTachiGrid";
import {
  ClassProfileGrid,
  isClassProfileFieldKey,
} from "@/components/students/ClassProfileGrid";
import {
  LearningClustersGrid,
  isLearningClusterFieldKey,
} from "@/components/students/LearningClustersGrid";
import { StudentCalendarYearField } from "@/components/students/StudentCalendarYearField";
import { GreenSignatureField } from "@/components/students/GreenSignatureField";
import { VoiceRecordButton, VoiceRecorderPromoBanner, TypedTextRefineButton } from "@/components/students/VoiceRecordButton";
import { FormAiFillPanel } from "@/components/students/FormAiFillPanel";
import { ParentQuestionnaireSendPanel } from "@/components/students/ParentQuestionnaireSendPanel";
import { HomeroomFillRequestDialog } from "@/components/students/HomeroomFillRequestDialog";
import { SendForViewingDialog } from "@/components/students/SendForViewingDialog";
import { SignatureRequestDialog } from "@/components/students/SignatureRequestDialog";
import { SimpleSignSignedDocumentPanel } from "@/components/students/SimpleSignSignedDocumentPanel";
import { StudentTeamStaffPickerDialog } from "@/components/students/StudentTeamStaffPickerDialog";
import {
  TachiBulkCreateDialog,
  formatTachiBulkResultMessage,
} from "@/components/students/TachiBulkCreateDialog";
import type { TachiBulkCreateResult } from "@/lib/personal-basket-tachi-bulk";
import { formSupportsAiFill } from "@/lib/form-ai-fill";
import {
  createFormAiFillSession,
  type FormAiFillSession,
} from "@/lib/form-ai-fill-session";
import {
  HOLISTIC_RUBRIC_DOWNLOAD_NAME,
  HOLISTIC_RUBRIC_HREF,
} from "@/lib/holistic-rubric";
import { isParentQuestionnaireForm, STAFF_ONLY_FIELD_KEYS } from "@/lib/parent-questionnaire-email";
import { buildParentEmailMapping } from "@/lib/parent-email";
import { isStaffMeetingsForm } from "@/lib/staff-meeting-parent-email";
import { isStaffFillForm } from "@/lib/homeroom-fill-forms";
import { createFormFillRequest } from "@/lib/form-fill-request";
import {
  createFormViewRequest,
  isViewableForm,
  getViewRecipientRoles,
  resolvePrincipalStaffName,
  type ViewRecipientRole,
} from "@/lib/form-view-request";
import {
  canUseSupabase,
  fetchInstitutionStaffForFill,
  fetchInstitutionStaffForPicker,
} from "@/lib/supabase-db";
import {
  toInstitutionStaffPickerRow,
  type StaffFillRecipient,
} from "@/lib/student-team-staff";
import { getTableIdFromFieldKey } from "@/lib/form-table-grids";
import { ParentQuestionnaireReadOnlyFields } from "@/components/students/ParentQuestionnaireReadOnlyFields";
import {
  addStudentFormArchiveSnapshot,
  archiveStudentDocument,
  addStudentCustomField,
  getCanManageStudents,
  getStaffTeachers,
  getStudents,
  getUser,
  loadStudentCustomFieldsForUi,
  loadStudentFormFill,
  loadStudentFormFillById,
  loadStudentFormFills,
  resolveInstitutionCode,
  resolveInstitutionDetails,
  deleteStudentFormFill,
  saveStudentFormFill,
  updateStudent,
  updateStudentCustomField,
} from "@/lib/mock-store";
import { PlanLimitError } from "@/lib/plan-limits";
import { rememberDocumentFolder } from "@/lib/student-card";
import { setDocumentRole, setDocumentSlot } from "@/lib/folder-actions";
import {
  formSupportsVoiceRecording,
  formSupportsVoiceAutoSave,
  getFormSchema,
  listFormFields,
  studentPortfolioFillHref,
  type FormSchema,
} from "@/lib/form-schemas";
import {
  createSignatureRequests,
  requestArchiveSignedForm,
  type SignatureAssignment,
} from "@/lib/form-signature-request";
import { allSignatureFieldsFilled } from "@/lib/form-signed-archive";
import {
  archiveErrorMessage,
  archiveFolderForSchema,
  formArchiveSoftNotice,
  logFormArchiveError,
  retryHtmlArchivePipeline,
} from "@/lib/form-fill-archive";
import {
  formFillDeleteErrorMessage,
  formFillDeletionBlocked,
  isDeletablePortfolioFormId,
  portfolioFormFillListLabel,
} from "@/lib/form-fill-delete";
import {
  createSimpleSignSubmissions,
  loadSimpleSignSubmissions,
  resendSimpleSignEmail,
  simpleSignSignedPdfUrl,
  type SimpleSignSubmissionStatus,
} from "@/lib/simplesign-signature-request";
import { formMayUseSimpleSign, getSimpleSignFormConfig, isSimpleSignSignerField } from "@/lib/simplesign/config";
import {
  hasPendingSimpleSignSubmission,
  useSimpleSignSubmissionsSync,
} from "@/lib/simplesign/use-simple-sign-submissions-sync";
import {
  buildSignerEmailRows,
  isHiddenSingleParentWaiverField,
  prepareSignerEmailRowsForSend,
  resolveInstitutionManagerSignatureEmail,
  resolveVisibleParentSignerKeys,
} from "@/lib/simplesign/signer-email-rows";
import { hasFilledSignatureValue } from "@/lib/simplesign/constants";
import { getNextSiblingPortfolioNav } from "@/lib/portfolio-form-nav";
import {
  isConfidentialityWaiverCompleted,
  isConfidentialityWaiverFormId,
  isExtraDocumentsTarget,
  isSingleResponsiblePartyStudent,
  loadCanAccessPortfolioForm,
} from "@/lib/confidentiality-waiver-gate";
import {
  FREE_ACCESS_PRINT_BLOCKED,
  FREE_ACCESS_SAVE_BLOCKED,
  FREE_ACCESS_SEND_BLOCKED,
  getFreeAccessEmail,
  isFreeAccessMode,
  isFreeAccessStudentFillable,
} from "@/lib/free-access";
import {
  pollFreeAccessWaiverSignatures,
  sendFreeAccessWaiverForSignature,
} from "@/lib/free-access-waiver-signature";
import {
  CLASS_STUDENT_LIST_FORM_ID,
  syncClassStudentListFromRoster,
  syncStudentsFromClassCurriculum,
} from "@/lib/class-curriculum-import";
import { isClassCurriculumStudent } from "@/lib/special-ed-mode";
import {
  getKnownSpecialEdClassNames,
  normalizeSpecialEdClassName,
} from "@/lib/special-ed-classes";
import {
  categorySpecialEdClassModeHref,
  isPersonalSector,
  sectorSpecialEdModeHref,
} from "@/lib/personal-sector";
import { applyStudentCardBackedScheduleFields, buildFormInitialData, studentPatchFromFormData, syncFormFieldsToCustomCardFields, applyLearningClusterSubjectPrefill, formUsesLearningClusterSubjects } from "@/lib/form-sync";
import {
  buildFormSnapshotHtml,
  formSnapshotToFile,
  validateRequiredFormFields,
} from "@/lib/form-snapshot";
import { openDetachedPrintWindow, POPUP_BLOCKED_MESSAGE } from "@/lib/detached-print";
import {
  downloadFormSnapshotAsWord,
  FORM_WORD_DOWNLOAD_FAILED,
} from "@/lib/form-word-download";
import { prepareFormSnapshotHtmlForWordExport } from "@/lib/form-export-logos";
import { downloadBlob } from "@/lib/blob-download";
import {
  snapshotHtmlWithoutBlockedImages,
  stripScriptsForView,
} from "@/lib/green-signature";
import { fillsForPortfolioCreateNew } from "@/lib/portfolio-form-fills";
import {
  loadFormFooterLogoDataUrl,
  MOE_LOGO_PUBLIC_PATH,
  resolveAssociationLogoDataUrl,
  resolveSchoolLogoDataUrl,
  signatureDocumentBrandLogos,
  type SchoolLogoScopeInput,
} from "@/lib/document-branding";
import { formatStudentDisplayName } from "@/lib/person-name";
import { studentPortfolioHref } from "@/lib/student-portfolio";
import { buildVoiceRefineContext } from "@/lib/voice-refine-context";
import {
  formatStaffScheduleSyncMessage,
  syncStaffScheduleToLinkedStudents,
} from "@/lib/staff-schedule-sync";
import {
  getFormsFolderTemplateHref,
  isReferralProtocolFolder,
  REFERRAL_PROTOCOL_FOLDER,
} from "@/lib/portfolio-folder-templates";
import type { FormFieldDef } from "@/lib/form-fields";
import {
  buildMisfiledContactRepairPatch,
  isParentCompanionIdField,
  isParentSignatureField,
  isReturnedParentField,
  isSignaturePadField,
  interpolateFormStaticLabel,
  preserveParentSignatures,
  resolveFormFieldLabel,
  resolveSignatureRequestLabel,
} from "@/lib/form-fields";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import type {
  FormFillStatus,
  Student,
  StudentFormFill,
} from "@/lib/supabase/types";
import {
  formFillStatusAfterParentSignatureSend,
  formFillStatusLabel,
} from "@/lib/form-fill-status";
import { cn } from "@/lib/utils";

async function downloadHolisticRubric(
  event: MouseEvent<HTMLAnchorElement>
) {
  event.preventDefault();
  try {
    const res = await fetch(HOLISTIC_RUBRIC_HREF);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    downloadBlob(blob, HOLISTIC_RUBRIC_DOWNLOAD_NAME);
  } catch {
    window.alert("הורדת המחוון נכשלה — הקובץ לא זמין באתר");
  }
}

interface StudentFormFillPageClientProps {
  id: string;
  formId: string;
  backHref: string;
  /** ?from= המקורי — לחישוב רשימת תלמידים בנפרד מיעד «חזרה לתיקיות» */
  fromParam?: string | null;
  fillId?: string;
  createNew?: boolean;
  /** Parent folder from navigation — for access checking. */
  parentFolder?: string;
}

function resolveLogoScope(student: Student): SchoolLogoScopeInput {
  const user = getUser();
  const teacherName =
    student.teacher_name?.trim() ||
    (student.status === "integration-teacher"
      ? student.full_name?.trim()
      : null) ||
    user?.full_name?.trim() ||
    null;
  return {
    teacherName,
    userId: user?.id ?? null,
    institutionId: student.institution_id ?? user?.institution_id ?? null,
  };
}

export function StudentFormFillPageClient({
  id,
  formId,
  backHref,
  fromParam = null,
  fillId,
  createNew = false,
  parentFolder,
}: StudentFormFillPageClientProps) {
  const router = useRouter();
  const { ready, guestDemo } = useDataStore();
  const { texts } = useSiteText();
  const schema = useMemo(() => getFormSchema(formId), [formId]);
  const folderBackHref = useMemo(
    () =>
      resolveFillFolderBackHref({
        from: fromParam ?? backHref,
        studentId: id,
      }),
    [fromParam, backHref, id]
  );
  const [student, setStudent] = useState<Student | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [data, setData] = useState<Record<string, string>>({});
  const [teamDetailsFormData, setTeamDetailsFormData] = useState<
    Record<string, string>
  >({});
  const [status, setStatus] = useState<FormFillStatus>("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [wordDownloading, setWordDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoScope, setLogoScope] = useState<SchoolLogoScopeInput>({});
  const [waiverDialogOpen, setWaiverDialogOpen] = useState(false);
  const [waiverReason, setWaiverReason] =
    useState<WaiverRequiredReason>("waiver");
  const [paperWaiverTick, setPaperWaiverTick] = useState(0);
  const [hydrateKey, setHydrateKey] = useState(0);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [fileArchived, setFileArchived] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [sendingForSignature, setSendingForSignature] = useState(false);
  const [fullscreenEditOpen, setFullscreenEditOpen] = useState(false);
  const [simpleSignDialogOpen, setSimpleSignDialogOpen] = useState(false);
  const [simpleSignSendWarning, setSimpleSignSendWarning] = useState<
    string | null
  >(null);
  const [simpleSignSigningLinks, setSimpleSignSigningLinks] = useState<
    Array<{ fieldKey: string; label: string; url: string }>
  >([]);
  const [sendingForSimpleSign, setSendingForSimpleSign] = useState(false);
  const [resendingSimpleSignField, setResendingSimpleSignField] = useState<
    string | null
  >(null);
  const [simpleSignSubmissions, setSimpleSignSubmissions] = useState<
    SimpleSignSubmissionStatus[]
  >([]);
  const [homeroomDialogOpen, setHomeroomDialogOpen] = useState(false);
  const [sendingForHomeroom, setSendingForHomeroom] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [sendingForView, setSendingForView] = useState(false);
  const [staffForFill, setStaffForFill] = useState<StaffFillRecipient[]>([]);
  const [teamStaffPickerOpen, setTeamStaffPickerOpen] = useState(false);
  const [tachiBulkDialogOpen, setTachiBulkDialogOpen] = useState(false);
  const [tachiBulkResult, setTachiBulkResult] =
    useState<TachiBulkCreateResult | null>(null);
  const [activeFillId, setActiveFillId] = useState<string | undefined>(fillId);
  const [freeAccessSignatureFillId, setFreeAccessSignatureFillId] = useState<
    string | null
  >(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);
  const [fillDeleteOpen, setFillDeleteOpen] = useState(false);
  const [fillDeleteBusy, setFillDeleteBusy] = useState(false);
  const [fillDeleteDialogError, setFillDeleteDialogError] = useState<
    string | null
  >(null);
  const dataRef = useRef(data);
  const activeFillIdRef = useRef(activeFillId);
  const voiceDraftSavingRef = useRef(false);
  const formAiFillSessionRef = useRef<FormAiFillSession>(createFormAiFillSession());
  const draftAutosaveBusyRef = useRef(false);
  const draftAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const fillSaveTrackerRef = useRef(createFillSaveTracker());
  const lastAutosavedJsonRef = useRef<string | null>(null);
  const autosaveBaselineReadyRef = useRef(false);
  const freeAccessSessionEmail = useMemo(
    () => (guestDemo || isFreeAccessMode() ? getFreeAccessEmail() : null),
    [guestDemo]
  );
  const freeAccess = guestDemo || isFreeAccessMode();

  const voiceRefineContext = useMemo(
    () =>
      buildVoiceRefineContext({
        studentName: student?.full_name,
        studentGender: student?.gender ?? data.gender,
        formId: schema?.id,
        formTitle: schema?.title,
      }),
    [
      data.gender,
      student?.full_name,
      student?.gender,
      schema?.id,
      schema?.title,
    ]
  );

  const voiceAutoSaveEnabled = useMemo(
    () => Boolean(schema && formSupportsVoiceAutoSave(schema)),
    [schema]
  );

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    activeFillIdRef.current = activeFillId;
  }, [activeFillId]);

  useEffect(() => {
    autosaveBaselineReadyRef.current = false;
    lastAutosavedJsonRef.current = null;
    setAutoSaveStatus("idle");
    setArchiveNotice(null);
    if (draftAutosaveTimerRef.current) {
      clearTimeout(draftAutosaveTimerRef.current);
      draftAutosaveTimerRef.current = null;
    }
  }, [id, formId, fillId, createNew]);

  useEffect(() => {
    if (!canUseSupabase()) return;
    let cancelled = false;
    const category = student?.category;
    const staffCategory =
      category != null && isPersonalSector(category) ? category : undefined;
    void (async () => {
      try {
        const list = await fetchInstitutionStaffForFill(staffCategory);
        if (!cancelled) setStaffForFill(list);
      } catch {
        if (!cancelled) setStaffForFill([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [student?.category]);

  useEffect(() => {
    if (!archiveNotice) return;
    const timer = window.setTimeout(() => setArchiveNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [archiveNotice]);

  const signatureFields = useMemo(
    () =>
      schema
        ? listFormFields(schema)
            .filter((field) => field.type === "signature")
            .map((field) => {
              const sectionTitle =
                schema.sections.find((section) =>
                  section.fields.some((item) => item.key === field.key)
                )?.title ?? null;
              return {
                key: field.key,
                label: resolveSignatureRequestLabel(field, sectionTitle),
              };
            })
        : [],
    [schema]
  );

  const simpleSignParentFields = useMemo(() => {
    if (!schema) return [];
    const config = getSimpleSignFormConfig(schema.id);
    if (!config) return [];
    const parentKeys = config.parentSigners.map(
      (signer) => signer.signatureFieldKey
    );
    const { parentEmailByFieldKey, parentEmailsFallback } = student
      ? buildParentEmailMapping(student)
      : { parentEmailByFieldKey: {}, parentEmailsFallback: [] };
    const built = buildSignerEmailRows({
      signatureKeys: parentKeys,
      parentEmails: parentEmailsFallback,
      parentEmailByFieldKey,
    });
    const visibleKeys = new Set(
      resolveVisibleParentSignerKeys({
        formId: schema.id,
        singleResponsibleParty: student?.single_responsible_party,
        parentSignerKeys: parentKeys,
        filledParentKeys: built
          .filter((row) => row.email.trim())
          .map((row) => row.fieldKey),
      })
    );
    for (const row of simpleSignSubmissions) {
      if (parentKeys.includes(row.signatureFieldKey)) {
        visibleKeys.add(row.signatureFieldKey);
      }
    }
    return signatureFields.filter((field) => visibleKeys.has(field.key));
  }, [schema, signatureFields, student, simpleSignSubmissions]);

  const simpleSignInitialRows = useMemo(() => {
    if (!student || !schema) return null;
    const config = getSimpleSignFormConfig(schema.id);
    if (!config) return null;
    const { parentEmailByFieldKey, parentEmailsFallback } = buildParentEmailMapping(student);
    const staff = getStaffTeachers();
    const homeroomName =
      student.teacher_name?.trim() ||
      String(data.homeroom_teacher ?? data.homeroom_sign_name ?? data.signer_name ?? "").trim();
    const homeroomEmail =
      staff.find((teacher) => teacher.full_name.trim() === homeroomName)?.email?.trim() ??
      "";
    return prepareSignerEmailRowsForSend(
      buildSignerEmailRows({
        signatureKeys: config.parentSigners.map((signer) => signer.signatureFieldKey),
        parentEmails: parentEmailsFallback,
        parentEmailByFieldKey,
        staffEmailByFieldKey: {
          homeroom_signature: homeroomEmail,
          signer_signature: homeroomEmail,
          teacher_sign: homeroomEmail,
        },
      }),
      {
        formId: schema.id,
        singleResponsibleParty: student.single_responsible_party,
      }
    );
  }, [student, schema, data.homeroom_teacher, data.homeroom_sign_name, data.signer_name]);

  const matoahSignatureInitialRows = useMemo(() => {
    if (!student || !schema || signatureFields.length === 0) return null;
    const { parentEmailByFieldKey, parentEmailsFallback } = buildParentEmailMapping(student);
    const staff = getStaffTeachers();
    const homeroomName = student.teacher_name?.trim() || "";
    const homeroomEmail =
      staff.find((teacher) => teacher.full_name.trim() === homeroomName)?.email?.trim() ??
      "";
    const principalName = String(data.principal_name ?? "").trim();
    const principalEmail =
      staff.find((teacher) => teacher.full_name.trim() === principalName)?.email?.trim() ??
      "";
    const accommodationsManagerEmail =
      schema.id === "accommodations"
        ? resolveInstitutionManagerSignatureEmail({
            staff,
            sessionUser: getUser(),
            canManageStudents: getCanManageStudents(),
            principalName,
          })
        : "";
    return prepareSignerEmailRowsForSend(
      buildSignerEmailRows({
        signatureKeys: signatureFields.map((field) => field.key),
        parentEmails: parentEmailsFallback,
        parentEmailByFieldKey,
        staffEmailByFieldKey: {
          homeroom_signature: homeroomEmail,
          integration_teacher_signature: homeroomEmail,
          support_teacher_signature: homeroomEmail,
          signer_signature: homeroomEmail,
          teacher_sign: homeroomEmail,
          principal_sign: principalEmail,
          report_author: homeroomEmail,
          ...(schema.id === "accommodations"
            ? { student_signature: accommodationsManagerEmail }
            : {}),
        },
      }),
      {
        formId: schema.id,
        singleResponsibleParty: student.single_responsible_party,
      }
    );
  }, [student, schema, signatureFields, data.principal_name]);

  const showSimpleSignButton = Boolean(
    schema &&
      formMayUseSimpleSign(schema.id) &&
      simpleSignParentFields.length > 0 &&
      !freeAccess
  );

  const portfolioFillDeleteBlocked = useMemo(() => {
    if (!schema || !student || !activeFillId) return true;
    const fill: StudentFormFill = {
      id: activeFillId,
      student_id: student.id,
      form_id: schema.id,
      data,
      status,
      document_id: null,
      created_at: "",
      updated_at: "",
    };
    return formFillDeletionBlocked(fill, {
      simpleSignRows: simpleSignSubmissions,
    });
  }, [
    schema,
    student,
    activeFillId,
    data,
    status,
    simpleSignSubmissions,
  ]);

  const portfolioFillDeleteLabel = useMemo(() => {
    if (!schema) return "";
    const domain = (data.domain ?? "").trim();
    return portfolioFormFillListLabel(schema.id, {
      ordinal: 1,
      domain: domain || null,
    });
  }, [schema, data.domain]);

  const hasSimpleSignSend = simpleSignSubmissions.length > 0;
  /** ה-PDF החתום כבר חזר מ-SimpleSign — אפשר להציג את החתימות עצמן */
  const hasSimpleSignSignedPdf = simpleSignSubmissions.some(
    (row) => Boolean(row.signedPdfDocumentId ?? row.signedPdfStored)
  );
  const simpleSignSignedCount = simpleSignSubmissions.filter(
    (row) => row.status === "signed"
  ).length;
  /** כולם חתמו אבל ה-PDF עוד לא נשמר — מציגים לצוות למה */
  const simpleSignPdfIssue =
    hasSimpleSignSend &&
    !hasSimpleSignSignedPdf &&
    simpleSignSubmissions.every((row) => row.status === "signed")
      ? simpleSignSubmissions.find((row) => row.errorMessage)?.errorMessage ??
        "המסמך החתום עדיין לא התקבל מ-SimpleSign — הדף ממשיך לבדוק."
      : null;

  const bothParentsUnsigned = useMemo(() => {
    if (!schema || !isConfidentialityWaiverFormId(schema.id)) return false;
    return (
      !hasFilledSignatureValue(data.father_signature) &&
      !hasFilledSignatureValue(data.mother_signature)
    );
  }, [schema, data.father_signature, data.mother_signature]);

  function resolveParentSignStatus(fieldKey: string): "signed" | "pending" | "expired" | "renewing" | "not_sent" {
    if (hasFilledSignatureValue(data[fieldKey])) return "signed";
    const submission = simpleSignSubmissions.find(
      (row) => row.signatureFieldKey === fieldKey
    );
    if (submission?.status === "signed") return "signed";
    if (submission?.status === "pending") return "pending";
    if (submission?.status === "expired") return "expired";
    if (submission?.status === "renewing") return "renewing";
    return "not_sent";
  }

  const nextSibling = useMemo(() => {
    if (!student || !schema) return null;
    return getNextSiblingPortfolioNav({
      studentId: student.id,
      currentLabel: schema.folder,
      status: student.status,
      category: student.category,
      preferredParent: schema.categoryFolder,
      backHref: folderBackHref,
      preferFill: true,
    });
  }, [student, schema, folderBackHref]);

  /**
   * בטופס ויתור — מעבר הלאה רק אחרי חתימות נדרשות (בכניסה חופשית לא חוסמים).
   * TZ-30: אחראי יחיד → חתימה אחת מספיקה; אחרת → שתי חתימות.
   */
  const canGoToNextAfterWaiver = useMemo(() => {
    if (freeAccess) return true;
    if (!schema || !student) return true;
    if (!isConfidentialityWaiverFormId(schema.id)) return true;
    const hasFather = Boolean(String(data.father_signature ?? "").trim());
    const hasMother = Boolean(String(data.mother_signature ?? "").trim());
    const isSingleParty = isSingleResponsiblePartyStudent(student.id);
    const fromForm = isSingleParty
      ? hasFather || hasMother
      : hasFather && hasMother;
    return fromForm || isConfidentialityWaiverCompleted(student.id);
  }, [
    freeAccess,
    schema,
    student,
    data.father_signature,
    data.mother_signature,
    paperWaiverTick,
  ]);

  /**
   * TZ-30: הודעת חסימה דינמית — אחראי יחיד דורש חתימה אחת, אחרת שתיים.
   */
  const waiverNextFormBlockedMessage = useMemo(() => {
    const isSingleParty =
      student?.single_responsible_party === true ||
      (student != null && isSingleResponsiblePartyStudent(student.id));
    if (isSingleParty) {
      return "לא ניתן לעבור לטופס הבא — עדיין לא התקבלה חתימה על ויתור הסודיות.";
    }
    return (
      getTextByPath(texts, "studentPortfolio.waiverNextFormBlocked") ||
      "לא ניתן לעבור לטופס הבא — שני ההורים עדיין לא חתמו על ויתור הסודיות."
    );
  }, [student, texts]);

  const hasPendingSubmission = useMemo(
    () => hasPendingSimpleSignSubmission(simpleSignSubmissions),
    [simpleSignSubmissions]
  );

  const { refresh: refreshSimpleSignSubmissions } = useSimpleSignSubmissionsSync({
    activeFillId,
    formId: schema?.id,
    studentId: student?.id,
    enabled: Boolean(
      schema && student && formMayUseSimpleSign(schema.id) && !freeAccess
    ),
    hasPendingSubmission,
    setSubmissions: setSimpleSignSubmissions,
    setData,
  });

  function showWaiverNextFormBlocked() {
    setMessage(null);
    setError(waiverNextFormBlockedMessage);
    setWaiverReason("both-parents");
    setWaiverDialogOpen(true);
  }

  function fieldLabel(field: FormFieldDef): string {
    return resolveFormFieldLabel(field, (path) => getTextByPath(texts, path));
  }

  /** בכניסה חופשית — סריקת חתימות מהשרת אחרי שליחת קישורי מייל */
  useEffect(() => {
    if (!freeAccessSignatureFillId || !schema || !student) return;
    if (!isConfidentialityWaiverFormId(schema.id)) return;
    let cancelled = false;

    async function syncFromRemote() {
      if (!schema || !student || !freeAccessSignatureFillId) return;
      if (document.visibilityState !== "visible") return;
      const result = await pollFreeAccessWaiverSignatures(
        freeAccessSignatureFillId
      );
      if (cancelled || !result.ok || !result.data) return;

      const remote = result.data;
      const father = String(remote.father_signature ?? "").trim();
      const mother = String(remote.mother_signature ?? "").trim();
      if (!father && !mother) return;

      let mergedForSave: Record<string, string> | null = null;
      setData((prev) => {
        const merged = preserveParentSignatures(prev, remote);
        mergedForSave = merged;
        if (
          (merged.father_signature ?? "") === (prev.father_signature ?? "") &&
          (merged.mother_signature ?? "") === (prev.mother_signature ?? "")
        ) {
          return prev;
        }
        return merged;
      });

      if (father && mother && mergedForSave) {
        try {
          const base: Record<string, string> = mergedForSave;
          const dataToSave: Record<string, string> = {
            ...base,
            father_signature: father,
            mother_signature: mother,
          };
          const saved = await saveStudentFormFill({
            fillId: activeFillId,
            studentId: student.id,
            formId: schema.id,
            data: dataToSave,
            status: "completed",
          });
          if (cancelled) return;
          setActiveFillId(saved.id);
          setStatus("completed");
          setFreeAccessSignatureFillId(null);
          setMessage("שתי החתימות התקבלו — שאר הטפסים נפתחו");
        } catch {
          // נשאיר polling פעיל
        }
      }
    }

    void syncFromRemote();
    const interval = window.setInterval(() => {
      void syncFromRemote();
    }, 4000);
    function onFocus() {
      void syncFromRemote();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [freeAccessSignatureFillId, schema, student, activeFillId]);

  useEffect(() => {
    if (!ready || !schema || !student || accessBlocked || loading) return;
    let cancelled = false;
    const externalFillForm =
      isParentQuestionnaireForm(schema) || isStaffFillForm(schema);

    async function pullRemoteFillUpdates() {
      if (!schema || !student) return;
      if (
        fillSaveTrackerRef.current.isBusy() ||
        draftAutosaveBusyRef.current ||
        draftAutosaveTimerRef.current ||
        voiceDraftSavingRef.current
      ) {
        return;
      }
      // טאב ברקע — לא מרעננים; ה-visibilitychange ירענן כשחוזרים
      if (document.visibilityState !== "visible") return;
      try {
        const latest = activeFillId
          ? await loadStudentFormFillById(student.id, activeFillId, { quiet: true })
          : await loadStudentFormFill(student.id, schema.id, { quiet: true });
        if (cancelled || !latest?.data) return;

        const localJson = JSON.stringify(dataRef.current);
        const hasUnsavedLocalEdits =
          lastAutosavedJsonRef.current != null &&
          localJson !== lastAutosavedJsonRef.current;

        if (externalFillForm) {
          if (hasUnsavedLocalEdits) return;

          const remoteJson = JSON.stringify(latest.data);
          if (remoteJson !== localJson) {
            lastAutosavedJsonRef.current = remoteJson;
            if (isParentQuestionnaireForm(schema)) {
              setData((prev) => {
                const next = { ...prev };
                let changed = false;
                for (const [key, value] of Object.entries(latest.data)) {
                  if (STAFF_ONLY_FIELD_KEYS.has(key)) continue;
                  if ((next[key] ?? "") !== (value ?? "")) {
                    next[key] = value ?? "";
                    changed = true;
                  }
                }
                return changed ? next : prev;
              });
            } else {
              setData(latest.data);
            }
            if (latest.status === "completed") {
              setMessage("הטופס עודכן מהמילוי בקישור — בלי צורך בריענון");
            }
          }
          setStatus(latest.status);
          return;
        }

        // טופס צוות — סנכרון מלא בין מורות באותו מוסד כשאין עריכה מקומית לא שמורה
        if (!hasUnsavedLocalEdits) {
          const mergedRemote = applyStudentCardBackedScheduleFields(
            schema,
            student,
            latest.data
          );
          const remoteJson = JSON.stringify(mergedRemote);
          if (remoteJson !== localJson) {
            lastAutosavedJsonRef.current = remoteJson;
            setData(mergedRemote);
            setStatus(latest.status);
          }
          return;
        }

        setData((prev) => {
          const merged = preserveParentSignatures(prev, latest.data);
          let changed = false;
          for (const key of Object.keys(latest.data)) {
            if (!isReturnedParentField(key)) continue;
            if ((merged[key] ?? "") !== (prev[key] ?? "")) {
              changed = true;
              break;
            }
          }
          return changed ? merged : prev;
        });
      } catch {
        // ignore transient refresh errors
      }
    }

    function onFocus() {
      void pullRemoteFillUpdates();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void pullRemoteFillUpdates();
      }
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(() => {
      void pullRemoteFillUpdates();
    }, 5_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [
    ready,
    schema,
    student,
    accessBlocked,
    loading,
    activeFillId,
  ]);

  useEffect(() => {
    formAiFillSessionRef.current = createFormAiFillSession();
  }, [id, formId]);

  useEffect(() => {
    if (!ready || !schema) return;
    let cancelled = false;

    async function hydrate(formSchema: FormSchema) {
      setLoading(true);
      setError(null);
      setActiveFillId(undefined);
      try {
        const found = getStudents().find((s) => s.id === id);
        if (!found) {
          if (!cancelled) setNotFound(true);
          return;
        }

        if (found.archived_at) {
          if (!cancelled) {
            setStudent(found);
            setFileArchived(true);
          }
          return;
        }

        if (
          !(await loadCanAccessPortfolioForm(id, {
            formId: formSchema.id,
            targetLabel: formSchema.folder,
            parentFolder,
          }))
        ) {
          if (!cancelled) {
            setStudent(found);
            setAccessBlocked(true);
            setWaiverReason(
              isExtraDocumentsTarget({
                formId: formSchema.id,
                targetLabel: formSchema.folder,
              })
                ? "both-parents"
                : "waiver"
            );
            setWaiverDialogOpen(true);
          }
          return;
        }

        const requestedFill =
          !createNew && fillId
            ? await loadStudentFormFillById(id, fillId)
            : null;
        const saved = createNew
          ? null
          : requestedFill?.form_id === formSchema.id
            ? requestedFill
            : await loadStudentFormFill(id, formSchema.id);
        if (cancelled) return;

        let syncedClassList: Record<string, string> | null = null;
        if (
          formSchema.id === CLASS_STUDENT_LIST_FORM_ID &&
          isClassCurriculumStudent(found)
        ) {
          try {
            syncedClassList = await syncClassStudentListFromRoster({
              category: found.category,
              className: normalizeSpecialEdClassName(
                found.class_name || found.teacher_name
              ),
              teacherName: found.teacher_name,
            });
          } catch {
            syncedClassList = null;
          }
        }
        if (cancelled) return;

        let card = found;
        const repair = buildMisfiledContactRepairPatch(found);
        if (repair) {
          const updated = await updateStudent(found.id, repair);
          if (updated) card = updated;
        }
        if (cancelled) return;

        const scope = resolveLogoScope(card);
        setLogoScope(scope);
        setStudent(card);
        setAccessBlocked(false);
        const customFields = await loadStudentCustomFieldsForUi(id);
        if (cancelled) return;

        let institutionPrefill: {
          school_name?: string | null;
          institution_name?: string | null;
          institution_code?: string | null;
        } | null = null;
        const sessionUser = getUser();
        if (sessionUser) {
          try {
            const [code, details] = await Promise.all([
              resolveInstitutionCode(sessionUser),
              resolveInstitutionDetails(sessionUser),
            ]);
            institutionPrefill = {
              institution_code:
                code && code !== "—"
                  ? code
                  : sessionUser.institution_code ?? null,
              institution_name:
                details.institution_name ?? sessionUser.institution_name,
              school_name: details.school_name ?? sessionUser.school_name,
            };
          } catch {
            institutionPrefill = {
              institution_code: sessionUser.institution_code ?? null,
              institution_name: sessionUser.institution_name ?? null,
              school_name: sessionUser.school_name ?? null,
            };
          }
        }
        if (cancelled) return;

        const allFills = await loadStudentFormFills(id);
        if (cancelled) return;

        const teamFill = allFills.find(
          (fill) => fill.form_id === "student-team-details"
        );
        setTeamDetailsFormData(teamFill?.data ?? {});

        const fillsForInitial = fillsForPortfolioCreateNew(
          formSchema.id,
          allFills,
          createNew
        );

        let institutionStaffForTeam:
          | ReturnType<typeof toInstitutionStaffPickerRow>[]
          | undefined;
        if (formSchema.id === "student-team-details") {
          try {
            const staffCategory =
              card.category != null && isPersonalSector(card.category)
                ? card.category
                : undefined;
            institutionStaffForTeam = canUseSupabase()
              ? await fetchInstitutionStaffForPicker(staffCategory)
              : getStaffTeachers(staffCategory).map(toInstitutionStaffPickerRow);
          } catch (err) {
            console.warn(
              "TZ-207: failed to load institution staff for homeroom prefill",
              err
            );
            institutionStaffForTeam = undefined;
          }
        }

        const initial = applyStudentCardBackedScheduleFields(
          formSchema,
          card,
          buildFormInitialData(
            formSchema,
            card,
            syncedClassList ?? saved?.data,
            fillsForInitial,
            customFields,
            institutionPrefill,
            institutionStaffForTeam
          )
        );
        if (cancelled) return;
        setData(initial);
        setStatus(saved?.status ?? "draft");
        setActiveFillId(saved?.id);
        rememberDocumentFolder(id, formSchema.folder);

        if (!saved?.id && isParentQuestionnaireForm(formSchema)) {
          try {
            const draft = await saveStudentFormFill({
              studentId: id,
              formId: formSchema.id,
              data: initial,
              status: "draft",
              createNew: true,
            });
            if (!cancelled) {
              setActiveFillId(draft.id);
              rememberFillInUrl(draft.id);
            }
          } catch {
            // draft creation failed — user can still save manually later
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "שגיאה בטעינת הטופס"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void hydrate(schema);
    return () => {
      cancelled = true;
    };
  }, [ready, id, schema, fillId, createNew, hydrateKey]);

  function unlockAfterPaperWaiver() {
    setWaiverDialogOpen(false);
    setAccessBlocked(false);
    setPaperWaiverTick((value) => value + 1);
    setHydrateKey((value) => value + 1);
  }

  async function confirmDeleteFormFill() {
    if (!activeFillId) return;
    setFillDeleteBusy(true);
    setFillDeleteDialogError(null);
    try {
      await deleteStudentFormFill(activeFillId);
      setFillDeleteOpen(false);
      await leaveFillPage(folderBackHref);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setFillDeleteDialogError(formFillDeleteErrorMessage(code));
    } finally {
      setFillDeleteBusy(false);
    }
  }

  function setField(key: string, value: string) {
    if (guestDemo || isFreeAccessMode()) {
      if (student && !isFreeAccessStudentFillable(student.id)) return;
    }
    // חתימות — רק מקישור שנשלח למייל; לא מציור במסך המילוי
    if (isSignaturePadField(key)) return;
    setData((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  }

  function patchFields(patch: Record<string, string>) {
    if (guestDemo || isFreeAccessMode()) {
      if (student && !isFreeAccessStudentFillable(student.id)) return;
    }
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (isSignaturePadField(key)) continue;
      next[key] = value;
    }
    setData((prev) => ({ ...prev, ...next }));
    setMessage(null);
  }

  function fillHrefWithId(nextFillId: string) {
    return studentPortfolioFillHref(
      id,
      formId,
      fillPageUrlFromParam({ originalFrom: fromParam, folderBackHref }),
      { fillId: nextFillId }
    );
  }

  function rememberFillInUrl(nextFillId: string) {
    if (!createNew && activeFillId === nextFillId) return;
    setActiveFillId(nextFillId);
    router.replace(fillHrefWithId(nextFillId));
  }

  async function resolveFormLogos(nextStudent: Student) {
    const user = getUser();
    const footerLogo = await loadFormFooterLogoDataUrl();
    const saveLogoScope = {
      ...logoScope,
      institutionId:
        nextStudent.institution_id ?? logoScope.institutionId ?? null,
      userId: logoScope.userId ?? user?.id ?? null,
    };
    return {
      schoolLogoUrl: resolveSchoolLogoDataUrl(saveLogoScope),
      associationLogoUrl: resolveAssociationLogoDataUrl({
        institutionId: saveLogoScope.institutionId,
        institutionCode: user?.institution_code ?? null,
      }),
      protocolLogoUrl: footerLogo.url,
      moeLogoUrl: MOE_LOGO_PUBLIC_PATH,
    };
  }

  async function dataWithReturnedParentSignatures(
    local: Record<string, string>
  ): Promise<Record<string, string>> {
    if (!schema || !student) return local;
    const latest = activeFillId
      ? await loadStudentFormFillById(student.id, activeFillId)
      : createNew
        ? null
        : await loadStudentFormFill(student.id, schema.id);
    const merged = preserveParentSignatures(local, latest?.data);
    setData((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(local)) return merged;
      return mergeSavedFillIntoCurrentData(prev, local, merged);
    });
    return merged;
  }

  const persistFormDraftAfterVoice = useCallback(
    async (nextData: Record<string, string>) => {
      if (!schema || !student || !voiceAutoSaveEnabled) return;
      if (guestDemo || isFreeAccessMode()) {
        if (!isFreeAccessStudentFillable(student.id)) return;
      }
      if (
        fillSaveTrackerRef.current.isBusy() ||
        voiceDraftSavingRef.current
      ) {
        return;
      }
      voiceDraftSavingRef.current = true;
      const token = fillSaveTrackerRef.current.begin("autosave");
      const submittedJson = JSON.stringify(nextData);
      try {
        if (!fillSaveTrackerRef.current.shouldCommitDraft(token, submittedJson)) {
          return;
        }
        const savedFill = await saveStudentFormFill({
          fillId: activeFillIdRef.current,
          createNew: Boolean(createNew) && !activeFillIdRef.current,
          studentId: student.id,
          formId: schema.id,
          data: nextData,
          status: "draft",
        });
        if (!fillSaveTrackerRef.current.shouldCommitDraft(token, submittedJson)) {
          return;
        }
        activeFillIdRef.current = savedFill.id;
        setActiveFillId(savedFill.id);
        rememberFillInUrl(savedFill.id);
        setStatus(savedFill.status);
        const resolved = resolveFillSaveLocalState({
          submittedJson,
          savedJson: submittedJson,
          currentJson: JSON.stringify(dataRef.current),
        });
        dataRef.current = JSON.parse(resolved.dataRefJson) as Record<string, string>;
        lastAutosavedJsonRef.current = resolved.lastSavedJson;
        fillSaveTrackerRef.current.markCommitted(token, {
          json: resolved.lastSavedJson,
          status: "draft",
        });
        setAutoSaveStatus("saved");
      } catch {
        // שקט — אפשר לשמור ידנית
      } finally {
        fillSaveTrackerRef.current.end(token);
        voiceDraftSavingRef.current = false;
      }
    },
    [schema, student, voiceAutoSaveEnabled, guestDemo, createNew]
  );

  const persistDraftAutosave = useCallback(
    async (nextData: Record<string, string>): Promise<boolean> => {
      if (!schema || !student) return false;
      if (guestDemo || isFreeAccessMode()) return false;
      if (
        fillSaveTrackerRef.current.isBusy() ||
        draftAutosaveBusyRef.current ||
        voiceDraftSavingRef.current
      ) {
        return false;
      }
      const json = JSON.stringify(nextData);
      if (json === lastAutosavedJsonRef.current) return true;

      draftAutosaveBusyRef.current = true;
      setAutoSaveStatus("saving");
      const token = fillSaveTrackerRef.current.begin("autosave");
      try {
        if (!fillSaveTrackerRef.current.shouldCommitDraft(token, json)) {
          setAutoSaveStatus("saved");
          return true;
        }
        const previousFillId = activeFillIdRef.current;
        const savedFill = await saveStudentFormFill({
          fillId: previousFillId,
          createNew: Boolean(createNew) && !previousFillId,
          studentId: student.id,
          formId: schema.id,
          data: nextData,
          status: "draft",
        });
        if (!fillSaveTrackerRef.current.shouldCommitDraft(token, json)) {
          setAutoSaveStatus("saved");
          return true;
        }
        activeFillIdRef.current = savedFill.id;
        setActiveFillId(savedFill.id);
        if (createNew || previousFillId !== savedFill.id) {
          router.replace(fillHrefWithId(savedFill.id));
        }
        setStatus(savedFill.status);
        lastAutosavedJsonRef.current = JSON.stringify(nextData);
        fillSaveTrackerRef.current.markCommitted(token, {
          json: lastAutosavedJsonRef.current,
          status: "draft",
        });
        setAutoSaveStatus("saved");
        return true;
      } catch {
        setAutoSaveStatus("error");
        return false;
      } finally {
        fillSaveTrackerRef.current.end(token);
        draftAutosaveBusyRef.current = false;
      }
    },
    [schema, student, guestDemo, createNew, router, id, formId, folderBackHref, fromParam]
  );

  const leaveFillPage = useCallback(
    async (href: string) => {
      const target = href.trim() || folderBackHref || studentPortfolioHref(id);
      if (!guestDemo && !isFreeAccessMode()) {
        const outcome = await leaveFillPageAfterSaves({
          isBusy: () => fillSaveTrackerRef.current.isBusy(),
          currentJson: () => JSON.stringify(dataRef.current),
          lastSavedJson: () => lastAutosavedJsonRef.current,
          lastSavedStatus: () =>
            fillSaveTrackerRef.current.lastCommitted()?.status ?? null,
          lastCommitted: () => fillSaveTrackerRef.current.lastCommitted(),
          persistDraft: async () => persistDraftAutosave(dataRef.current),
          confirmLeaveUnsaved: () =>
            window.confirm("יש שינויים שלא נשמרו. לצאת בכל זאת?"),
        });
        if (outcome === "stay") return;
      }
      router.push(target);
    },
    [folderBackHref, id, guestDemo, persistDraftAutosave, router]
  );

  useEffect(() => {
    if (loading || !ready || !schema || !student) return;
    if (guestDemo || isFreeAccessMode()) return;

    const json = JSON.stringify(data);
    if (!autosaveBaselineReadyRef.current) {
      lastAutosavedJsonRef.current = json;
      autosaveBaselineReadyRef.current = true;
      return;
    }
    if (json === lastAutosavedJsonRef.current) return;
    if (saving || printing) return;

    if (draftAutosaveTimerRef.current) {
      clearTimeout(draftAutosaveTimerRef.current);
    }
    draftAutosaveTimerRef.current = setTimeout(() => {
      draftAutosaveTimerRef.current = null;
      void persistDraftAutosave(dataRef.current);
    }, 1500);

    return () => {
      if (draftAutosaveTimerRef.current) {
        clearTimeout(draftAutosaveTimerRef.current);
        draftAutosaveTimerRef.current = null;
      }
    };
  }, [
    data,
    loading,
    ready,
    schema,
    student,
    guestDemo,
    saving,
    printing,
    persistDraftAutosave,
  ]);

  useEffect(() => {
    return () => {
      if (draftAutosaveTimerRef.current) {
        clearTimeout(draftAutosaveTimerRef.current);
        draftAutosaveTimerRef.current = null;
      }
    };
  }, []);

  async function handleSave() {
    if (!schema || !student) return;
    setError(null);
    setMessage(null);
    setArchiveNotice(null);

    const requiredError = validateRequiredFormFields(schema, data);
    if (requiredError) {
      setError(requiredError);
      return;
    }

    const freeAccess = guestDemo || isFreeAccessMode();
    if (freeAccess && !isConfidentialityWaiverFormId(schema.id)) {
      setError(FREE_ACCESS_SAVE_BLOCKED);
      return;
    }

    await waitForInFlightFillSave(() =>
      fillSaveTrackerRef.current.hasKind("autosave")
    );

    if (freeAccess && isConfidentialityWaiverFormId(schema.id)) {
      setSaving(true);
      const token = fillSaveTrackerRef.current.begin("manual");
      const submittedJson = JSON.stringify(data);
      try {
        const dataToSave = await dataWithReturnedParentSignatures(data);
        const savedFill = await saveStudentFormFill({
          fillId: activeFillId,
          createNew: Boolean(createNew) && !activeFillId,
          studentId: student.id,
          formId: schema.id,
          data: dataToSave,
          status: "completed",
        });
        setActiveFillId(savedFill.id);
        rememberFillInUrl(savedFill.id);
        setStatus("completed");
        const resolved = resolveFillSaveLocalState({
          submittedJson,
          savedJson: JSON.stringify(dataToSave),
          currentJson: JSON.stringify(dataRef.current),
        });
        dataRef.current = JSON.parse(resolved.dataRefJson) as Record<
          string,
          string
        >;
        lastAutosavedJsonRef.current = resolved.lastSavedJson;
        fillSaveTrackerRef.current.markCommitted(token, {
          json: resolved.lastSavedJson,
          status: "completed",
        });
        const bothSigned =
          Boolean(String(dataToSave.father_signature ?? "").trim()) &&
          Boolean(String(dataToSave.mother_signature ?? "").trim());
        setMessage(
          bothSigned
            ? "ויתור הסודיות נשמר מקומית"
            : "ויתור הסודיות נשמר מקומית — בשימוש מלא נדרשות חתימות של שני ההורים"
        );
      } catch (err) {
        const raw = err instanceof Error ? err.message : "";
        setError(
          raw === "DEMO_READ_ONLY" ? FREE_ACCESS_SAVE_BLOCKED : "שמירה נכשלה — נסו שוב"
        );
      } finally {
        fillSaveTrackerRef.current.end(token);
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    const saveToken = fillSaveTrackerRef.current.begin("manual");
    const submittedJson = JSON.stringify(data);
    let fillSaved = false;
    let nextStudent = student;
    let staffScheduleSyncNote = "";
    try {
      const dataToSave = await dataWithReturnedParentSignatures(data);
      const patch = studentPatchFromFormData(
        schema,
        dataToSave,
        student,
        student?.category
          ? getKnownSpecialEdClassNames(student.category, {
              includePlaceholder: false,
            })
          : undefined
      );
      if (Object.keys(patch).length > 0) {
        try {
          const updated = await updateStudent(student.id, patch);
          if (updated) {
            nextStudent = updated;
            setStudent(updated);
          }
        } catch (err) {
          if (!(err instanceof PlanLimitError)) throw err;
        }
      }

      await syncFormFieldsToCustomCardFields({
        studentId: student.id,
        schema,
        data: dataToSave,
        customFields: await loadStudentCustomFieldsForUi(student.id),
        updateCustomField: updateStudentCustomField,
        addCustomField: addStudentCustomField,
      });

      const savedFill = await saveStudentFormFill({
        fillId: activeFillId,
        createNew: Boolean(createNew) && !activeFillId,
        studentId: student.id,
        formId: schema.id,
        data: dataToSave,
        status: "completed",
      });
      setActiveFillId(savedFill.id);
      rememberFillInUrl(savedFill.id);
      fillSaved = true;
      setStatus("completed");
      const resolved = resolveFillSaveLocalState({
        submittedJson,
        savedJson: JSON.stringify(dataToSave),
        currentJson: JSON.stringify(dataRef.current),
      });
      dataRef.current = JSON.parse(resolved.dataRefJson) as Record<
        string,
        string
      >;
      lastAutosavedJsonRef.current = resolved.lastSavedJson;
      fillSaveTrackerRef.current.markCommitted(saveToken, {
        json: resolved.lastSavedJson,
        status: "completed",
      });
      setAutoSaveStatus("saved");

      // סנכרון מערכת שעות צוות — מיד אחרי שמירת המילוי (גם אם הארכיון ייכשל)
      if (schema.id === "staff-schedule") {
        try {
          const syncResult = await syncStaffScheduleToLinkedStudents({
            staffName: formatStudentDisplayName(nextStudent.full_name),
            staffCategory: nextStudent.category,
            data: dataToSave,
          });
          const syncMsg = formatStaffScheduleSyncMessage(syncResult);
          if (syncMsg) {
            staffScheduleSyncNote = ` ${syncMsg.replace(/\n/g, " · ")}`;
          } else {
            const hasStudentNames = Object.entries(dataToSave).some(
              ([key, value]) =>
                key.endsWith("_student") && String(value).trim()
            );
            if (hasStudentNames) {
              staffScheduleSyncNote =
                " המערכות כבר מעודכנות — לא נדרש שינוי.";
            }
          }
        } catch {
          staffScheduleSyncNote =
            " השמירה הצליחה, אך סנכרון למערכות התלמידים נכשל — נסו שוב.";
        }
      }

      const signatureKeys = listFormFields(schema)
        .filter((field) => field.type === "signature")
        .map((field) => field.key);
      // השרת מחליט אם הטופס נחתם ב-SimpleSign (ואז ה-PDF מגיע מה-webhook) או במתוה
      let pdfArchived = false;
      if (allSignatureFieldsFilled(signatureKeys, dataToSave)) {
        const signed = await requestArchiveSignedForm(savedFill.id);
        pdfArchived = signed.archived;
        if (!pdfArchived && signed.error) {
          logFormArchiveError({
            formId: schema.id,
            studentId: student.id,
            step: "signed-pdf",
            error: signed.error,
          });
        }
      }

      if (!pdfArchived) {
        await retryHtmlArchivePipeline({
          upload: async () => {
            const displayName = formatStudentDisplayName(nextStudent.full_name);
            const logos = await resolveFormLogos(nextStudent);
            const file = formSnapshotToFile(
              schema,
              dataToSave,
              displayName,
              logos
            );
            const saveFolder = archiveFolderForSchema({
              formId: schema.id,
              folder: schema.folder,
              categoryFolder: schema.categoryFolder,
              studentStatus: student.status,
              isReferralProtocol: isReferralProtocolFolder(schema.folder),
              referralProtocolFolder: REFERRAL_PROTOCOL_FOLDER,
            });
            const doc = await addStudentFormArchiveSnapshot(
              student.id,
              file,
              saveFolder
            );
            return { id: doc.id, saveFolder };
          },
          afterUpload: ({ id: docId, saveFolder }) => {
            setDocumentRole(docId, "fill");
            const waiverSlot =
              isConfidentialityWaiverFormId(schema.id) &&
              student.status === "special-ed-class"
                ? "טופס ויתור סודיות חתום"
                : schema.folder;
            setDocumentSlot(docId, waiverSlot);
            rememberDocumentFolder(student.id, saveFolder);
          },
          flag: ({ id: docId }) => archiveStudentDocument(docId),
          link: ({ id: docId }) =>
            saveStudentFormFill({
              fillId: savedFill.id,
              studentId: student.id,
              formId: schema.id,
              data: dataToSave,
              status: "completed",
              documentId: docId,
            }).then(() => undefined),
          onStepError: (step, archiveErr) => {
            logFormArchiveError({
              formId: schema.id,
              studentId: student.id,
              step,
              error: archiveErr,
            });
          },
        });
      }

      let rosterSyncNote = "";
      let clusterSyncNote = "";
      if (schema.id === "learning-clusters") {
        try {
          const fills = await loadStudentFormFills(student.id);
          let updatedForms = 0;
          for (const targetFormId of ["tlk-summary", "adapted-curriculum"] as const) {
            const targetSchema = getFormSchema(targetFormId);
            if (!targetSchema) continue;
            const existing = await loadStudentFormFill(student.id, targetFormId);
            if (!existing) continue;
            const nextData = { ...existing.data };
            const added = applyLearningClusterSubjectPrefill(
              targetSchema,
              nextData,
              fills
            );
            if (added <= 0) continue;
            await saveStudentFormFill({
              fillId: existing.id,
              studentId: student.id,
              formId: targetFormId,
              data: nextData,
              status: existing.status,
            });
            updatedForms += 1;
          }
          if (updatedForms > 0) {
            clusterSyncNote =
              ' המקצועות עודכנו גם בריכוז תל"כ ובתוכנית ההלימה.';
          }
        } catch {
          // השמירה הצליחה גם אם סנכרון המקצועות נכשל
        }
      }
      if (
        schema.id === CLASS_STUDENT_LIST_FORM_ID &&
        isClassCurriculumStudent(nextStudent)
      ) {
        const classKey = normalizeSpecialEdClassName(
          nextStudent.class_name || nextStudent.teacher_name
        );
        try {
          const syncResult = await syncStudentsFromClassCurriculum({
            category: nextStudent.category,
            className: classKey,
            teacherName: nextStudent.teacher_name || classKey,
            formData: dataToSave,
          });
          if (syncResult.created > 0) {
            rosterSyncNote =
              syncResult.created === 1
                ? " נפתח תיק תלמיד כיתה לתלמיד החדש."
                : ` נפתחו תיקי תלמיד כיתה ל־${syncResult.created} תלמידים חדשים.`;
          } else if (syncResult.failed > 0) {
            rosterSyncNote =
              syncResult.failed === 1
                ? " לא הצלחנו לפתוח תיק לתלמיד אחד — בדקו את מכסת החבילה ונסו שוב."
                : ` לא הצלחנו לפתוח תיק ל־${syncResult.failed} תלמידים — בדקו את מכסת החבילה ונסו שוב.`;
          }
          if (syncResult.warnings.length > 0) {
            rosterSyncNote += ` ${syncResult.warnings.join(" ")}`;
          }
        } catch (syncErr) {
          const syncMsg =
            syncErr instanceof Error ? syncErr.message.trim() : "";
          rosterSyncNote = syncMsg
            ? ` שמירת הרשימה הצליחה, אך פתיחת התיקים נכשלה: ${syncMsg}`
            : " שמירת הרשימה הצליחה, אך פתיחת תיקי התלמידים נכשלה — נסו שוב.";
        }
      }

      setMessage(
        `הטופס נשמר בארכיון.${rosterSyncNote}${clusterSyncNote}${staffScheduleSyncNote}`
      );

      const bothSignedOnWaiver =
        !isConfidentialityWaiverFormId(schema.id) ||
        (Boolean(String(dataToSave.father_signature ?? "").trim()) &&
          Boolean(String(dataToSave.mother_signature ?? "").trim()));

      if (!bothSignedOnWaiver) {
        setMessage(
          `הטופס נשמר — לא ניתן לעבור לטופס הבא כי שני ההורים עדיין לא חתמו${rosterSyncNote}${clusterSyncNote}${staffScheduleSyncNote}`
        );
        return;
      }

      if (schema.id === "staff-schedule") {
        return;
      }

      const next = getNextSiblingPortfolioNav({
        studentId: student.id,
        currentLabel: schema.folder,
        status: nextStudent.status,
        category: nextStudent.category,
        preferredParent: schema.categoryFolder,
        backHref: folderBackHref,
        preferFill: true,
      });
      if (next) {
        setMessage(
          next.kind === "folder"
            ? `הטופס נשמר${rosterSyncNote}${clusterSyncNote} — מעביר לתיקייה הבאה: ${next.label}`
            : `הטופס נשמר${rosterSyncNote}${clusterSyncNote} — מעביר לטופס הבא: ${next.label}`
        );
        window.setTimeout(() => {
          router.push(next.href);
        }, 600);
      } else if (
        schema.id === CLASS_STUDENT_LIST_FORM_ID &&
        isClassCurriculumStudent(nextStudent)
      ) {
        const classKey = normalizeSpecialEdClassName(
          nextStudent.class_name || nextStudent.teacher_name
        );
        if (classKey && rosterSyncNote) {
          const studentListHref = isPersonalSector(nextStudent.category)
            ? sectorSpecialEdModeHref(
                nextStudent.category,
                "student",
                "special",
                "personal-area",
                classKey
              )
            : categorySpecialEdClassModeHref("student", classKey);
          window.setTimeout(() => {
            router.push(studentListHref);
          }, 900);
        }
      }
    } catch (err) {
      const raw = archiveErrorMessage(err);
      if (fillSaved) {
        setError(null);
        logFormArchiveError({
          formId: schema.id,
          studentId: student.id,
          step: raw === "FILE_TOO_LARGE" ? "html-snapshot" : "upload",
          error: err,
        });
        setMessage(null);
        setArchiveNotice(formArchiveSoftNotice({ fileTooLarge: raw === "FILE_TOO_LARGE" }));
        return;
      }
      if (raw === "FILE_TOO_LARGE") {
        setError("הקובץ גדול מדי לשמירה בארכיון — נסי שוב בלי לוגואים כבדים, או פני לתמיכה");
      } else if (raw === "DEMO_READ_ONLY" || isFreeAccessMode()) {
        setError(FREE_ACCESS_SAVE_BLOCKED);
      } else if (err instanceof PlanLimitError) {
        setError(err.message);
      } else {
        setError("שמירה נכשלה — נסו שוב");
      }
      console.error("[form-save]", err);
    } finally {
      fillSaveTrackerRef.current.end(saveToken);
      setSaving(false);
    }
  }

  async function handleDownloadWord() {
    if (guestDemo || isFreeAccessMode() || !schema || !student) {
      if (guestDemo || isFreeAccessMode()) setError(FREE_ACCESS_PRINT_BLOCKED);
      return;
    }
    setError(null);
    setMessage(null);
    setWordDownloading(true);
    try {
      const dataToExport = await dataWithReturnedParentSignatures(data);
      const logos = await resolveFormLogos(student);
      const displayName = formatStudentDisplayName(student.full_name);
      const rawHtml = buildFormSnapshotHtml(
        schema,
        dataToExport,
        displayName,
        logos
      );
      const html = prepareFormSnapshotHtmlForWordExport(
        stripScriptsForView(snapshotHtmlWithoutBlockedImages(rawHtml)),
        {
          schoolLogoUrl: logos.schoolLogoUrl,
          associationLogoUrl: logos.associationLogoUrl,
        },
        { formId: schema.id }
      );
      const result = downloadFormSnapshotAsWord(html, schema.title);
      if (!result.ok) {
        setError(result.error ?? FORM_WORD_DOWNLOAD_FAILED);
        return;
      }
      const { reportClientAudit } = await import("@/lib/client-audit");
      reportClientAudit({
        action: "download.form_word",
        entityType: "form_fill",
        entityId: activeFillId ?? student.id,
        summary: `הורדת Word: ${schema.title}`,
        metadata: { form_id: schema.id, student_id: student.id },
      });
    } catch (err) {
      setError(FORM_WORD_DOWNLOAD_FAILED);
      console.error("[form-word-download]", err);
    } finally {
      setWordDownloading(false);
    }
  }

  async function handlePrint() {
    if (guestDemo || isFreeAccessMode() || !schema || !student) {
      if (guestDemo || isFreeAccessMode()) setError(FREE_ACCESS_PRINT_BLOCKED);
      return;
    }
    setError(null);
    setMessage(null);

    // חלון מנותק (noopener) — דיאלוג ההדפסה לא מקפיא את הדף הראשי
    const printWindow = openDetachedPrintWindow(schema.title);
    if (!printWindow) {
      window.alert(POPUP_BLOCKED_MESSAGE);
      return;
    }

    setPrinting(true);
    try {
      const dataToPrint = await dataWithReturnedParentSignatures(data);
      const logos = await resolveFormLogos(student);
      const displayName = formatStudentDisplayName(student.full_name);
      const html = buildFormSnapshotHtml(schema, dataToPrint, displayName, logos);
      if (!(await printWindow.whenReady())) {
        printWindow.close();
        window.alert(POPUP_BLOCKED_MESSAGE);
        return;
      }
      printWindow.deliver(html, { autoPrint: true });
      printWindow.dispose();
      const { reportClientAudit } = await import("@/lib/client-audit");
      reportClientAudit({
        action: "print.form",
        entityType: "form_fill",
        entityId: student.id,
        summary: `הודפס טופס: ${schema.title}`,
        metadata: { form_id: schema.id, student_id: student.id },
      });
    } catch (err) {
      printWindow.close();
      setError("הדפסה נכשלה — נסו שוב");
      console.error("[form-print]", err);
    } finally {
      setPrinting(false);
    }
  }

  async function handleSendForSignature(assignments: SignatureAssignment[]) {
    if (!schema || !student) return;

    const freeAccess = guestDemo || isFreeAccessMode();
    if (freeAccess && !isConfidentialityWaiverFormId(schema.id)) {
      setError(FREE_ACCESS_SEND_BLOCKED);
      setSignatureDialogOpen(false);
      return;
    }

    if (freeAccess && isConfidentialityWaiverFormId(schema.id)) {
      const sessionEmail = (getFreeAccessEmail() ?? "").trim().toLowerCase();
      if (!sessionEmail) {
        setError("חסר מייל בכניסה חופשית — חזרו לדף הכניסה והזינו כתובת מייל");
        setSignatureDialogOpen(false);
        return;
      }
      if (assignments.some((a) => a.email.trim().toLowerCase() !== sessionEmail)) {
        setError("בכניסה חופשית אפשר לשלוח לחתימה רק למייל שנרשמתם איתו");
        return;
      }

      setSendingForSignature(true);
      setError(null);
      setMessage(null);
      try {
        const dataToSend = await dataWithReturnedParentSignatures(data);
        // שמירה מקומית — כדי שהשער ייפתח אחרי שהחתימות יחזרו
        const localFill = await saveStudentFormFill({
          fillId: activeFillId,
          createNew: Boolean(createNew) && !activeFillId,
          studentId: student.id,
          formId: schema.id,
          data: dataToSend,
          status: formFillStatusAfterParentSignatureSend(status),
        });
        setActiveFillId(localFill.id);
        rememberFillInUrl(localFill.id);
        setStatus(localFill.status);

        const sessionUser = getUser();
        const snapshotHtml = buildFormSnapshotHtml(
          schema,
          dataToSend,
          formatStudentDisplayName(student.full_name),
          signatureDocumentBrandLogos({
            origin: window.location.origin,
            schoolLogoUrl: resolveSchoolLogoDataUrl({
              ...logoScope,
              institutionId:
                student.institution_id ?? logoScope.institutionId ?? null,
              userId: logoScope.userId ?? sessionUser?.id ?? null,
            }),
            associationLogoUrl: resolveAssociationLogoDataUrl({
              institutionId:
                student.institution_id ?? logoScope.institutionId ?? null,
              institutionCode: sessionUser?.institution_code ?? null,
            }),
          })
        );
        const result = await sendFreeAccessWaiverForSignature({
          email: sessionEmail,
          formTitle: schema.title,
          studentName: formatStudentDisplayName(student.full_name),
          snapshotHtml,
          formData: dataToSend,
          assignments,
        });
        if (!result.ok || !result.fillId) {
          throw new Error(result.error || "שליחת הבקשה נכשלה");
        }
        setFreeAccessSignatureFillId(result.fillId);
        setSignatureDialogOpen(false);
        setMessage(
          `נשלחו קישורי חתימה ל־${sessionEmail} (אב + אם). לאחר החתימה בשני הקישורים ייפתחו שאר הטפסים.`
        );
      } catch (err) {
        const raw = err instanceof Error ? err.message : "";
        const message = raw || "שליחת הבקשה נכשלה";
        setError(message);
        throw new Error(message);
      } finally {
        setSendingForSignature(false);
      }
      return;
    }

    setSendingForSignature(true);
    setError(null);
    setMessage(null);
    try {
      const dataToSend = await dataWithReturnedParentSignatures(data);
      const fill = await saveStudentFormFill({
        fillId: activeFillId,
        createNew: Boolean(createNew) && !activeFillId,
        studentId: student.id,
        formId: schema.id,
        data: dataToSend,
        status: formFillStatusAfterParentSignatureSend(status),
        requireRemote: true,
      });
      setActiveFillId(fill.id);
      rememberFillInUrl(fill.id);
      setStatus(fill.status);
      // לוגואים: פרוטוקל/משה״ח ככתובות ציבוריות; בי״ס/עמותה אם לא כבדים מדי
      const sessionUser = getUser();
      const snapshotHtml = buildFormSnapshotHtml(
        schema,
        dataToSend,
        formatStudentDisplayName(student.full_name),
        signatureDocumentBrandLogos({
          origin: window.location.origin,
          schoolLogoUrl: resolveSchoolLogoDataUrl({
            ...logoScope,
            institutionId:
              student.institution_id ?? logoScope.institutionId ?? null,
            userId: logoScope.userId ?? sessionUser?.id ?? null,
          }),
          associationLogoUrl: resolveAssociationLogoDataUrl({
            institutionId:
              student.institution_id ?? logoScope.institutionId ?? null,
            institutionCode: sessionUser?.institution_code ?? null,
          }),
        })
      );
      const result = await createSignatureRequests({
        formFillId: fill.id,
        formTitle: schema.title,
        studentName: formatStudentDisplayName(student.full_name),
        snapshotHtml,
        assignments,
      });
      if (!result.ok) {
        throw new Error(result.error || "שליחת הבקשה נכשלה");
      }
      setSignatureDialogOpen(false);
      setMessage(`הטופס נשלח לחתימה ל־${assignments.length} כתובות`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const message =
        raw === "DEMO_READ_ONLY" || isFreeAccessMode()
          ? FREE_ACCESS_SEND_BLOCKED
          : raw || "שליחת הבקשה נכשלה";
      setError(message);
      throw new Error(message);
    } finally {
      setSendingForSignature(false);
    }
  }

  async function handleSendForSimpleSign(assignments: SignatureAssignment[]) {
    if (!schema || !student) return;
    if (guestDemo || isFreeAccessMode()) {
      setError(FREE_ACCESS_SEND_BLOCKED);
      setSimpleSignDialogOpen(false);
      return;
    }

    setSendingForSimpleSign(true);
    setError(null);
    setMessage(null);
    setSimpleSignSendWarning(null);
    setSimpleSignSigningLinks([]);
    try {
      const dataToSend = await dataWithReturnedParentSignatures(data);
      const fill = await saveStudentFormFill({
        fillId: activeFillId,
        createNew: Boolean(createNew) && !activeFillId,
        studentId: student.id,
        formId: schema.id,
        data: dataToSend,
        status: formFillStatusAfterParentSignatureSend(status),
        requireRemote: true,
      });
      setActiveFillId(fill.id);
      rememberFillInUrl(fill.id);
      setStatus(fill.status);

      const result = await createSimpleSignSubmissions({
        formFillId: fill.id,
        assignments: assignments.map((assignment) => ({
          email: assignment.email,
          fieldKey: assignment.fieldKey,
        })),
      });
      if (!result.ok) {
        throw new Error(result.error || "שליחה ל-SimpleSign נכשלה");
      }

      const refreshed = await loadSimpleSignSubmissions(fill.id);
      if (refreshed.ok) setSimpleSignSubmissions(refreshed.submissions);
      refreshSimpleSignSubmissions();

      const sentCount = result.emailsSent ?? 0;
      const totalCount = result.count ?? assignments.length;
      if (result.warning) {
        const labelByKey = new Map(
          simpleSignParentFields.map((field) => [field.key, field.label])
        );
        setSimpleSignSendWarning(result.warning);
        setSimpleSignSigningLinks(
          (result.createdLinks ?? []).map((link) => ({
            fieldKey: link.fieldKey,
            label: labelByKey.get(link.fieldKey) ?? link.fieldKey,
            url: link.signingUrl,
          }))
        );
        setMessage(result.warning);
        return;
      }
      setSimpleSignDialogOpen(false);
      setMessage(
        sentCount > 0
          ? `נשלחו ${totalCount} קישורי חתימה — ${sentCount} מיילים נשלחו מהמערכת.`
          : `נוצרו ${totalCount} קישורי חתימה. המייל לא נשלח — פתחי את הקישורים למטה או בדקי את הגדרות Resend.`
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const message = raw || "שליחה ל-SimpleSign נכשלה";
      setError(message);
      throw new Error(message);
    } finally {
      setSendingForSimpleSign(false);
    }
  }

  async function handleResendSimpleSignEmail(signatureFieldKey: string) {
    if (!activeFillId) return;
    setResendingSimpleSignField(signatureFieldKey);
    setError(null);
    setMessage(null);
    try {
      const result = await resendSimpleSignEmail({
        formFillId: activeFillId,
        signatureFieldKey,
      });
      if (!result.ok) {
        setError(result.error || "שליחת מייל חוזרת נכשלה");
        return;
      }
      refreshSimpleSignSubmissions();
      setMessage(
        result.renewed
          ? "קישור חדש נוצר ונשלח."
          : "מייל חוזר עם קישור החתימה נשלח."
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(raw || "שליחת מייל חוזרת נכשלה");
    } finally {
      setResendingSimpleSignField(null);
    }
  }

  const homeroomTeacherName = useMemo(() => {
    if (!student) return "";
    return (
      student.homeroom_teacher?.trim() ||
      student.teacher_name?.trim() ||
      ""
    );
  }, [student]);

  const homeroomTeacherEmail = useMemo(() => {
    const name = homeroomTeacherName;
    if (!name) return "";
    const match = staffForFill.find((s) => s.name.trim() === name);
    return match?.email?.trim() ?? "";
  }, [homeroomTeacherName, staffForFill]);

  const staffFillOptions = useMemo(() => {
    const byEmail = new Map<string, { name: string; email: string }>();
    for (const { name, email } of staffForFill) {
      byEmail.set(email.toLowerCase(), { name, email });
    }
    if (homeroomTeacherName && homeroomTeacherEmail) {
      byEmail.set(homeroomTeacherEmail.toLowerCase(), {
        name: homeroomTeacherName,
        email: homeroomTeacherEmail,
      });
    }
    return Array.from(byEmail.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "he")
    );
  }, [staffForFill, homeroomTeacherName, homeroomTeacherEmail]);

  const principalViewEmail = useMemo(() => {
    const principalName = resolvePrincipalStaffName(data, [teamDetailsFormData]);
    if (!principalName) return "";
    return (
      staffFillOptions.find(
        (option) => option.name.trim() === principalName.trim()
      )?.email ?? ""
    );
  }, [data, teamDetailsFormData, staffFillOptions]);

  async function handleSendForHomeroomFill(email: string, note: string) {
    if (!schema || !student) return;
    if (guestDemo || isFreeAccessMode()) {
      setError(FREE_ACCESS_SEND_BLOCKED);
      setHomeroomDialogOpen(false);
      return;
    }
    setSendingForHomeroom(true);
    setError(null);
    setMessage(null);
    try {
      const fill = await saveStudentFormFill({
        fillId: activeFillId,
        createNew: Boolean(createNew) && !activeFillId,
        studentId: student.id,
        formId: schema.id,
        data,
        status: "draft",
        requireRemote: true,
      });
      setActiveFillId(fill.id);
      rememberFillInUrl(fill.id);
      setStatus(fill.status);
      const result = await createFormFillRequest({
        formFillId: fill.id,
        formId: schema.id,
        formTitle: schema.title,
        studentName: formatStudentDisplayName(student.full_name),
        recipientEmail: email,
        note,
      });
      if (!result.ok) {
        throw new Error(result.error || "שליחת הבקשה נכשלה");
      }
      setHomeroomDialogOpen(false);
      setMessage(`הטופס נשלח למילוי ל־${email}`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        raw === "DEMO_READ_ONLY" || isFreeAccessMode()
          ? FREE_ACCESS_SEND_BLOCKED
          : raw || "שליחת הבקשה נכשלה"
      );
    } finally {
      setSendingForHomeroom(false);
    }
  }

  async function handleSendForView(
    recipients: Array<{ email: string; role: ViewRecipientRole }>
  ) {
    if (!schema || !student) return;
    if (guestDemo || isFreeAccessMode()) {
      setError(FREE_ACCESS_SEND_BLOCKED);
      setViewDialogOpen(false);
      return;
    }
    setSendingForView(true);
    setError(null);
    setMessage(null);
    try {
      const fill = await saveStudentFormFill({
        fillId: activeFillId,
        createNew: Boolean(createNew) && !activeFillId,
        studentId: student.id,
        formId: schema.id,
        data,
        status: "draft",
        requireRemote: true,
      });
      setActiveFillId(fill.id);
      rememberFillInUrl(fill.id);
      setStatus(fill.status);

      const sessionUser = getUser();
      const snapshotHtml = buildFormSnapshotHtml(
        schema,
        data,
        formatStudentDisplayName(student.full_name),
        signatureDocumentBrandLogos({
          origin: window.location.origin,
          schoolLogoUrl: resolveSchoolLogoDataUrl({
            ...logoScope,
            institutionId:
              student.institution_id ?? logoScope.institutionId ?? null,
            userId: logoScope.userId ?? sessionUser?.id ?? null,
          }),
          associationLogoUrl: resolveAssociationLogoDataUrl({
            institutionId:
              student.institution_id ?? logoScope.institutionId ?? null,
            institutionCode: sessionUser?.institution_code ?? null,
          }),
        })
      );

      const result = await createFormViewRequest({
        formFillId: fill.id,
        formId: schema.id,
        formTitle: schema.title,
        studentName: formatStudentDisplayName(student.full_name),
        studentId: student.id,
        snapshotHtml,
        recipients,
      });

      if (!result.ok) {
        throw new Error(result.error || "שליחה לצפייה נכשלה");
      }

      setViewDialogOpen(false);
      const count = result.sentCount ?? recipients.length;
      if (result.failedRoles && result.failedRoles.length > 0) {
        const roleLabels: Record<string, string> = {
          parent: "הורים",
          homeroom: "מחנכת",
          principal: "מנהלת",
        };
        const failedLabels = result.failedRoles
          .map((r) => roleLabels[r] || r)
          .join(", ");
        setMessage(
          `הטופס נשלח ל־${count} נמענים. שליחה נכשלה עבור: ${failedLabels}`
        );
      } else {
        setMessage(`הטופס נשלח לצפייה ל־${count} נמענים`);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        raw === "DEMO_READ_ONLY" || isFreeAccessMode()
          ? FREE_ACCESS_SEND_BLOCKED
          : raw || "שליחה לצפייה נכשלה"
      );
    } finally {
      setSendingForView(false);
    }
  }

  async function pullSubjectsFromLearningClusters() {
    if (!schema || !student || guestDemo || isFreeAccessMode()) return;
    setError(null);
    setMessage(null);
    try {
      const fills = await loadStudentFormFills(student.id);
      const next = { ...data };
      const added = applyLearningClusterSubjectPrefill(schema, next, fills);
      if (added <= 0) {
        setMessage(
          'לא נמצאו מקצועות חדשים — ודאי שאשכולות לימוד מולאו ונשמרו, או שהשדות כבר מלאים'
        );
        return;
      }
      setData(next);
      setMessage(`נוספו ${added} מקצועות מאשכולות לימוד`);
    } catch {
      setError("לא ניתן למשוך מאשכולות לימוד — נסו שוב");
    }
  }

  function renderField(field: FormFieldDef) {
    const value = data[field.key] ?? "";
    const idAttr = `form-field-${field.key}`;
    const label = fieldLabel(field);

    if (field.type === "rating-grid") {
      return (
        <HomeroomReportGrid
          key={field.key}
          data={data}
          onChange={setField}
        />
      );
    }

    if (field.type === "schedule-grid") {
      return (
        <ScheduleGrid
          key={field.key}
          data={data}
          onChange={setField}
          onPatch={patchFields}
          variant={field.scheduleVariant ?? "detailed"}
          hint={field.hint}
        />
      );
    }

    if (field.type === "row-table") {
      const tableId = getTableIdFromFieldKey(field.key);
      if (!tableId) return null;
      const showTeamStaffPicker =
        tableId === "student-team" &&
        schema?.id === "student-team-details" &&
        Boolean(student);
      const showClusterPull =
        schema != null &&
        formUsesLearningClusterSubjects(schema) &&
        (tableId === "tlk-summary-subjects" || tableId === "adapted-curriculum");
      return (
        <div key={field.key} className="flex flex-col gap-3">
          {showClusterPull ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void pullSubjectsFromLearningClusters()}
              >
                <RefreshCw className="h-4 w-4" />
                מילוי מאשכולות לימוד
              </Button>
            </div>
          ) : null}
          {showTeamStaffPicker ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
                onClick={() => setTeamStaffPickerOpen(true)}
              >
                <Users className="h-4 w-4" />
                בחירה מצוות המוסד
              </Button>
            </div>
          ) : null}
          <FormRowTable
            tableId={tableId}
            data={data}
            onChange={setField}
            allowVoice={formSupportsVoiceRecording(schema)}
            allowRefineTyped={!isParentQuestionnaireForm(schema)}
            voiceRefineContext={voiceRefineContext}
            autoSaveOnVoice={voiceAutoSaveEnabled}
            onVoiceTranscriptSaved={(cellKey, text) =>
              void persistFormDraftAfterVoice({
                ...dataRef.current,
                [cellKey]: text,
              })
            }
            staffMeetingStudent={
              isStaffMeetingsForm(schema) &&
              student &&
              !(guestDemo || isFreeAccessMode())
                ? student
                : null
            }
            staffMeetingActionsDisabled={guestDemo}
          />
        </div>
      );
    }

    if (field.type === "accommodations-picker") {
      return (
        <AccommodationsPickerField
          key={field.key}
          data={data}
          onChange={setField}
          onPatch={patchFields}
        />
      );
    }

    if (field.type === "static") {
      return (
        <p
          key={field.key}
          className="py-3 text-right text-base leading-8 text-ink sm:text-lg"
        >
          {interpolateFormStaticLabel(field.label, data)}
        </p>
      );
    }

    if (field.type === "signature") {
      if (!schema) return null;
      const isSimpleSignSigner = isSimpleSignSignerField(schema.id, field.key);
      if (showSimpleSignButton && isSimpleSignSigner) {
        return null;
      }
      return (
        <GreenSignatureField
          key={field.key}
          id={idAttr}
          label={label}
          required={field.required}
          value={value}
          onChange={(next) => setField(field.key, next)}
          // במסך המילוי אין «חתמו כאן» — רק «שלח לחתימה» (מייל + OTP)
          readOnly
          lockedHint={isParentSignatureField(field.key) ? "parent" : "third-party"}
        />
      );
    }

    if (field.type === "checkbox") {
      const checked =
        value === "true" || value === "1" || value === "on";
      return (
        <label
          key={field.key}
          className="flex items-start gap-2 rounded-lg border border-border bg-white px-3 py-2"
        >
          <input
            id={idAttr}
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={checked}
            onChange={(e) =>
              setField(field.key, e.target.checked ? "true" : "false")
            }
          />
          <span className="text-sm font-bold text-ink">
            {label}
            {field.required ? " *" : ""}
          </span>
        </label>
      );
    }

    if (field.type === "select") {
      return (
        <div key={field.key} className="flex flex-col gap-1.5">
          <Label htmlFor={idAttr}>
            {label}
            {field.required ? " *" : ""}
          </Label>
          <select
            id={idAttr}
            value={value}
            onChange={(e) => setField(field.key, e.target.value)}
            className="h-10 w-full rounded-md border-2 border-brand-200 bg-white px-3 text-sm focus-visible:border-brand-500 focus-visible:outline-none"
          >
            <option value="">— בחרו —</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <div key={field.key} className="flex flex-col gap-1.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <Label htmlFor={idAttr} className="pt-1">
              {label}
              {field.required ? " *" : ""}
            </Label>
            {formSupportsVoiceRecording(schema) ? (
              <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto sm:justify-end">
                {!isParentQuestionnaireForm(schema) ? (
                  <TypedTextRefineButton
                    value={value}
                    fieldLabel={label}
                    refineContext={voiceRefineContext}
                    onInsert={(t) => setField(field.key, t)}
                  />
                ) : null}
                <VoiceRecordButton
                  value={value}
                  fieldLabel={label}
                  refineTranscript={!isParentQuestionnaireForm(schema)}
                  refineContext={voiceRefineContext}
                  onInsert={(t) => setField(field.key, t)}
                  size="md"
                  className="shrink-0"
                />
              </div>
            ) : null}
          </div>
          <textarea
            id={idAttr}
            value={value}
            rows={field.rows ?? 3}
            onChange={(e) => setField(field.key, e.target.value)}
            className="min-h-[80px] w-full rounded-md border-2 border-brand-200 bg-white px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none"
          />
        </div>
      );
    }

    return (
      <div key={field.key} className="flex flex-col gap-1.5">
        <Label htmlFor={idAttr}>
          {label}
          {field.required ? " *" : ""}
        </Label>
        <Input
          id={idAttr}
          type={field.type === "date" ? "date" : "text"}
          inputMode={
            field.key === "student_id_number" ||
            isParentCompanionIdField(field.key)
              ? "numeric"
              : undefined
          }
          dir={
            field.key === "student_id_number" ||
            isParentCompanionIdField(field.key)
              ? "ltr"
              : undefined
          }
          className={
            field.key === "student_id_number" ||
            isParentCompanionIdField(field.key)
              ? "text-left"
              : undefined
          }
          value={value}
          onChange={(e) => setField(field.key, e.target.value)}
        />
      </div>
    );
  }

  if (!schema || notFound) {
    return (
      <PageShell lockPageScroll>
        <div className="menu-box p-8 text-center">
          <EditableText
            path="common.notFound"
            as="p"
            block
            className="mb-4 text-pink"
          />
          <Button asChild>
            <Link
              href={folderBackHref || studentPortfolioHref(id)}
              onClick={(event) => {
                event.preventDefault();
                void leaveFillPage(folderBackHref || studentPortfolioHref(id));
              }}
            >
              <EditableText path="studentPortfolio.backToPortfolio" />
            </Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  if (!student || loading) {
    return (
      <PageShell lockPageScroll>
        <div className="menu-box p-8 text-center text-pink">
          <EditableText path="common.loading" />
        </div>
      </PageShell>
    );
  }

  if (fileArchived) {
    return (
      <PageShell lockPageScroll>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link
              href={folderBackHref}
              onClick={(event) => {
                event.preventDefault();
                void leaveFillPage(folderBackHref);
              }}
            >
              <ArrowRight className="h-4 w-4" />
              <EditableText path="studentPortfolio.backToFolder" />
            </Link>
          </Button>
          <StudentsListBackLink
            href={resolveFillStudentsListBackHref({
              from: fromParam,
              stored: readNavBackHref(),
              student,
            })}
            hideIf={folderBackHref}
            student={student}
            onNavigate={(href) => {
              void leaveFillPage(href);
            }}
          />
        </div>
        <div className="menu-box p-8 text-center">
          <EditableText
            path="studentCard.archivedBanner"
            as="p"
            block
            className="mb-4 text-sm text-pink"
          />
          <Button asChild>
            <Link href={`/personal-area/students/view/${id}`}>
              <EditableText path="personalArea.studentsArchiveOpenCard" />
            </Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  if (accessBlocked) {
    return (
      <PageShell lockPageScroll>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link
              href={folderBackHref}
              onClick={(event) => {
                event.preventDefault();
                void leaveFillPage(folderBackHref);
              }}
            >
              <ArrowRight className="h-4 w-4" />
              <EditableText path="studentPortfolio.backToFolder" />
            </Link>
          </Button>
          <StudentsListBackLink
            href={resolveFillStudentsListBackHref({
              from: fromParam,
              stored: readNavBackHref(),
              student,
            })}
            hideIf={folderBackHref}
            student={student}
            onNavigate={(href) => {
              void leaveFillPage(href);
            }}
          />
        </div>
        <div className="menu-box p-8 text-center">
          <EditableText
            path={
              waiverReason === "both-parents"
                ? "studentPortfolio.waiverBothParentsRequiredTitle"
                : "studentPortfolio.waiverRequiredTitle"
            }
            as="p"
            block
            className="mb-2 text-xl font-bold text-ink"
          />
          <EditableText
            path={
              waiverReason === "both-parents"
                ? "studentPortfolio.waiverBothParentsRequiredDescription"
                : "studentPortfolio.waiverRequiredDescription"
            }
            as="p"
            block
            className="mb-4 text-sm text-pink"
          />
          <WaiverSignerLockedStatus studentId={id} />
          <div className="mx-auto mt-4 max-w-xl">
            <PaperWaiverScanPanel
              studentId={id}
              onChanged={() => {
                if (isConfidentialityWaiverCompleted(id)) {
                  unlockAfterPaperWaiver();
                } else {
                  setPaperWaiverTick((value) => value + 1);
                }
              }}
            />
          </div>
        </div>
        <ConfidentialityWaiverRequiredDialog
          open={waiverDialogOpen}
          onOpenChange={setWaiverDialogOpen}
          studentId={id}
          reason={waiverReason}
          onUnlocked={unlockAfterPaperWaiver}
        />
      </PageShell>
    );
  }

  const freeAccessFillLocked =
    Boolean(student) && freeAccess && !isFreeAccessStudentFillable(student.id);

  const content = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link
              href={folderBackHref}
              onClick={(event) => {
                event.preventDefault();
                void leaveFillPage(folderBackHref);
              }}
            >
              <ArrowRight className="h-4 w-4" />
              <EditableText path="studentPortfolio.backToFolder" />
            </Link>
          </Button>
          <StudentsListBackLink
            href={resolveFillStudentsListBackHref({
              from: fromParam,
              stored: readNavBackHref(),
              student,
            })}
            hideIf={folderBackHref}
            student={student}
            onNavigate={(href) => {
              void leaveFillPage(href);
            }}
          />
          {isDeletablePortfolioFormId(schema.id) &&
          activeFillId &&
          !createNew ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={guestDemo || fillDeleteBusy || portfolioFillDeleteBlocked}
              onClick={() => {
                setFillDeleteDialogError(null);
                setFillDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              מחיקת תוכנית
            </Button>
          ) : null}
        </div>
        <h1 className="mb-1 text-center text-2xl font-bold text-ink sm:text-3xl">
          {schema.title}
        </h1>
        {schema.id === "tachi-prep" || schema.id === "tla-prep" ? (
          <div className="mb-2 flex justify-center">
            <a
              href={HOLISTIC_RUBRIC_HREF}
              download={HOLISTIC_RUBRIC_DOWNLOAD_NAME}
              className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-800 hover:bg-brand-50"
              onClick={downloadHolisticRubric}
            >
              <Download className="h-3.5 w-3.5" />
              הורדת מחוון עזר למילוי
            </a>
          </div>
        ) : null}
        {schema.id === "tachi-integrative" ||
        schema.id === "tla-integrative" ? (
          <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
            <a
              href="/portfolio-templates/tachi-integrative.docx"
              download="תחי אינטגרטיבי.docx"
              className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-800 hover:bg-brand-50"
            >
              <Download className="h-3.5 w-3.5" />
              הורדת תבנית Word
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFullscreenEditOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              עריכה במסך מלא
            </Button>
          </div>
        ) : null}
        {isReferralProtocolFolder(schema.folder) ? (
          <div className="mb-2 flex justify-center">
            <a
              href={
                getFormsFolderTemplateHref(
                  schema.folder,
                  student.status,
                  student.category
                ) || "/portfolio-templates/sheelon-hafnaya.docx"
              }
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-800 hover:bg-brand-50"
            >
              <Download className="h-3.5 w-3.5" />
              הורדת תבנית ריקה
            </a>
          </div>
        ) : null}
        <p className="mb-1 text-center text-sm font-bold text-pink">
          {formatStudentDisplayName(student.full_name)}
        </p>
        {isConfidentialityWaiverFormId(schema.id) && !freeAccess ? (
          <div className="mb-3">
            <PaperWaiverScanPanel
              studentId={student.id}
              folderName={schema.folder}
              onChanged={() => setPaperWaiverTick((value) => value + 1)}
            />
          </div>
        ) : null}
        {!isParentQuestionnaireForm(schema) ? (
          <p className="text-center text-xs text-pink/80">
            {`סטטוס: ${formFillStatusLabel(status)}`}
          </p>
        ) : null}
      </div>

      <div className="scroll-visible menu-box flex min-h-0 flex-1 flex-col gap-5 p-4 pb-8">
        {isParentQuestionnaireForm(schema) ? (
          <>
            {status !== "completed" ? (
              <ParentQuestionnaireSendPanel
                schema={schema}
                student={student}
                data={data}
                formFillId={activeFillId}
                fillStatus={status}
              />
            ) : null}
            <div className="rounded-2xl border border-border bg-white p-4">
              <ParentQuestionnaireReadOnlyFields
                schema={schema}
                data={data}
                hiddenKeys={STAFF_ONLY_FIELD_KEYS}
              />
            </div>
            {nextSibling && canGoToNextAfterWaiver ? (
              <div className="flex justify-center pb-2">
                <Button asChild size="lg" variant="outline">
                  <Link
                    href={nextSibling.href}
                    onClick={(event) => {
                      event.preventDefault();
                      void leaveFillPage(nextSibling.href);
                    }}
                  >
                    <EditableText
                      path={
                        nextSibling.kind === "folder"
                          ? "studentPortfolio.goToNextFolder"
                          : "studentPortfolio.goToNextForm"
                      }
                    />
                    <span className="font-bold">: {nextSibling.label}</span>
                    <ArrowLeft className="h-5 w-5" />
                  </Link>
                </Button>
              </div>
            ) : nextSibling && isConfidentialityWaiverFormId(schema.id) ? (
              <div className="flex flex-col items-center gap-2 pb-2">
                <p className="text-center text-sm font-medium text-destructive">
                  {waiverNextFormBlockedMessage}
                </p>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={showWaiverNextFormBlocked}
                >
                  <EditableText
                    path={
                      nextSibling.kind === "folder"
                        ? "studentPortfolio.goToNextFolder"
                        : "studentPortfolio.goToNextForm"
                    }
                  />
                  <span className="font-bold">: {nextSibling.label}</span>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <>
        {formSupportsVoiceRecording(schema) ? (
          <VoiceRecorderPromoBanner className="shrink-0" />
        ) : null}

        {!isClassCurriculumStudent(student) ? (
          <EditableText
            path="studentPortfolio.fillFormHint"
            as="p"
            block
            className="shrink-0 text-center text-sm text-pink"
          />
        ) : null}

        {freeAccess ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm text-brand-800">
            {freeAccessFillLocked
              ? "בכניסה חופשית אפשר לנסות למלא רק את התלמיד הראשון שיובא מאקסל. כאן ניתן לצפות בלבד — ללא עריכה וללא הדפסה."
              : isConfidentialityWaiverFormId(schema.id)
                ? "בכניסה חופשית: שלחו את ויתור הסודיות לחתימה למייל שנרשמתם איתו, חתמו בשני הקישורים (אב + אם), ואז ייפתחו שאר הטפסים. אין אפשרות להדפסה."
                : "בכניסה חופשית אפשר לנסות למלא את הדוגמה בתלמיד זה, בלי שמירה או הדפסה."}
          </div>
        ) : null}

        <StudentCalendarYearField
          student={student}
          onStudentChange={setStudent}
        />

        {schema.sections.map((section, idx) => {
          const isHolistic = section.layout === "holistic-profile";
          const isIntegrative = section.layout === "integrative-tachi";
          const isClassProfile = section.layout === "class-profile";
          const isClusters = section.layout === "learning-clusters";
          const profileFields = isHolistic
            ? section.fields.filter((f) => isHolisticProfileFieldKey(f.key))
            : isClassProfile
              ? section.fields.filter((f) => isClassProfileFieldKey(f.key))
              : isClusters
                ? section.fields.filter((f) => isLearningClusterFieldKey(f.key))
                : [];
          const otherFields = isHolistic
            ? section.fields.filter((f) => !isHolisticProfileFieldKey(f.key))
            : isIntegrative
              ? section.fields.filter((f) => !isIntegrativeTachiOwnedField(f))
              : isClassProfile
                ? section.fields.filter((f) => !isClassProfileFieldKey(f.key))
                : isClusters
                  ? section.fields.filter((f) => !isLearningClusterFieldKey(f.key))
                  : section.fields;

          return (
            <div key={section.title ?? idx} className="flex flex-col gap-3">
              {section.title && (
                <h2 className="border-b border-border pb-1 text-center text-base font-bold text-ink">
                  {section.title}
                </h2>
              )}

              {isHolistic && profileFields.length > 0 ? (
                <HolisticProfileGrid
                  fields={profileFields}
                  data={data}
                  onChange={setField}
                  fieldLabel={fieldLabel}
                  allowVoice={formSupportsVoiceRecording(schema)}
                  voiceRefineContext={voiceRefineContext}
                />
              ) : null}

              {isClassProfile && profileFields.length > 0 ? (
                <ClassProfileGrid
                  fields={profileFields}
                  data={data}
                  onChange={setField}
                  fieldLabel={fieldLabel}
                  allowVoice={formSupportsVoiceRecording(schema)}
                  voiceRefineContext={voiceRefineContext}
                />
              ) : null}

              {isClusters && profileFields.length > 0 ? (
                <LearningClustersGrid
                  fields={profileFields}
                  data={data}
                  onChange={setField}
                  fieldLabel={fieldLabel}
                  allowVoice={formSupportsVoiceRecording(schema)}
                  voiceRefineContext={voiceRefineContext}
                />
              ) : null}

              {isIntegrative && !fullscreenEditOpen ? (
                <IntegrativeTachiGrid
                  fields={section.fields}
                  data={data}
                  onChange={setField}
                  fieldLabel={fieldLabel}
                  allowVoice={formSupportsVoiceRecording(schema)}
                  voiceRefineContext={voiceRefineContext}
                  renderSignature={(field) => renderField(field)}
                />
              ) : null}

              {otherFields.length > 0 ? (
                <div
                  className={cn(
                    "grid gap-3",
                    schema.id.startsWith("waiver-")
                      ? "sm:grid-cols-3"
                      : "sm:grid-cols-2"
                  )}
                >
                  {otherFields
                    .filter(
                      (field) =>
                        !(
                          showSimpleSignButton &&
                          field.type === "signature" &&
                          isSimpleSignSignerField(schema.id, field.key)
                        ) &&
                        !isHiddenSingleParentWaiverField(
                          field.key,
                          student.single_responsible_party === true &&
                            isConfidentialityWaiverFormId(schema.id)
                            ? simpleSignParentFields.map((item) => item.key)
                            : null
                        )
                    )
                    .map((field) => (
                    <div
                      key={field.key}
                      className={cn(
                        (field.type === "textarea" ||
                          field.type === "checkbox" ||
                          field.type === "static" ||
                          field.type === "rating-grid" ||
                          field.type === "schedule-grid" ||
                          field.type === "row-table" ||
                          field.type === "accommodations-picker") &&
                          (schema.id.startsWith("waiver-")
                            ? "sm:col-span-3"
                            : "sm:col-span-2"),
                        schema.id.startsWith("waiver-") &&
                          (field.key === "student_name" ||
                            field.key === "institution_name") &&
                          "sm:col-span-2",
                        schema.id.startsWith("waiver-") &&
                          field.key === "father_name" &&
                          "sm:col-span-2",
                        schema.id.startsWith("waiver-") &&
                          field.key === "father_id" &&
                          "sm:col-span-1",
                        schema.id.startsWith("waiver-") &&
                          field.key === "mother_name" &&
                          "sm:col-span-2",
                        schema.id.startsWith("waiver-") &&
                          field.key === "mother_id" &&
                          "sm:col-span-1"
                      )}
                    >
                      {renderField(field)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        {error && (
          <p className="text-center text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p className="text-center text-sm font-medium text-brand-700">
            {message}
          </p>
        )}
        {archiveNotice ? (
          <p
            className="text-center text-xs text-muted-foreground"
            aria-live="polite"
          >
            {archiveNotice}
          </p>
        ) : null}
        {!freeAccess && autoSaveStatus !== "idle" ? (
          <p
            className={`text-center text-xs ${
              autoSaveStatus === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
            aria-live="polite"
          >
            {autoSaveStatus === "saving"
              ? "שומר אוטומטית…"
              : autoSaveStatus === "saved"
                ? "נשמר אוטומטית"
                : "השמירה האוטומטית נכשלה — אפשר לשמור ידנית"}
          </p>
        ) : null}

        {formSupportsAiFill(schema, { freeAccess }) &&
          !freeAccessFillLocked && (
          <FormAiFillPanel
            schema={schema}
            data={data}
            studentContext={{
              gender: student.gender ?? "",
              class_name: student.class_name ?? "",
              notes: student.notes ?? "",
              status: student.status ?? "",
            }}
            studentName={student.full_name ?? ""}
            onApply={setData}
            freeAccess={freeAccess}
            fillSessionRef={formAiFillSessionRef}
          />
        )}

        {showSimpleSignButton && !freeAccessFillLocked ? (
          <div className="mx-auto w-full max-w-3xl pt-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {simpleSignParentFields.map((field) => {
                const status = resolveParentSignStatus(field.key);
                const submission = simpleSignSubmissions.find(
                  (row) => row.signatureFieldKey === field.key
                );
                const parentLabel = field.label;
                const isSigned = status === "signed";
                const statusLabel = isSigned
                  ? "חתום"
                  : status === "pending"
                    ? "ממתין לחתימה"
                    : status === "expired"
                      ? "הקישור פג"
                      : status === "renewing"
                        ? "מחדש קישור..."
                        : "טרם נחתם";
                return (
                  <div
                    key={field.key}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-4 py-3 text-right shadow-sm",
                      isSigned
                        ? "border-green-200 bg-green-50"
                        : "border-red-200 bg-red-50"
                    )}
                  >
                    {isSigned ? (
                      <CheckCircle2
                        className="h-6 w-6 shrink-0 text-green-600"
                        aria-hidden
                      />
                    ) : (
                      <Circle
                        className="h-6 w-6 shrink-0 text-red-600"
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "font-bold",
                          isSigned ? "text-green-900" : "text-red-900"
                        )}
                      >
                        {parentLabel}
                      </p>
                      <p
                        className={cn(
                          "text-sm",
                          isSigned ? "text-green-700" : "text-red-700"
                        )}
                      >
                        {statusLabel}
                        {submission?.signerName
                          ? ` · ${submission.signerName}`
                          : ""}
                      </p>
                    </div>
                    {isSigned && hasSimpleSignSignedPdf ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-green-300 text-green-800 hover:bg-green-100"
                        onClick={() =>
                          document
                            .getElementById("simplesign-signed-document")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                      >
                        <Eye className="h-4 w-4" />
                        צפייה בחתימה
                      </Button>
                    ) : null}
                    {hasSimpleSignSend &&
                    (status === "pending" || status === "expired" || status === "renewing") &&
                    submission?.signerEmail ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={resendingSimpleSignField === field.key}
                        onClick={() =>
                          void handleResendSimpleSignEmail(field.key)
                        }
                      >
                        {status === "expired" || status === "renewing" ? (
                          <RefreshCw className="h-4 w-4" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                        {resendingSimpleSignField === field.key
                          ? "שולח..."
                          : status === "expired" || status === "renewing"
                            ? "שליחת קישור חדש"
                            : "שליחה חוזרת"}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {simpleSignPdfIssue ? (
              <p
                role="status"
                className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                {simpleSignPdfIssue}
              </p>
            ) : null}
            {hasSimpleSignSignedPdf && activeFillId ? (
              <div className="pt-3">
                <SimpleSignSignedDocumentPanel
                  id="simplesign-signed-document"
                  formFillId={activeFillId}
                  signedCount={simpleSignSignedCount}
                  totalCount={simpleSignParentFields.length}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 border-t border-border pt-4 pb-2">
          {nextSibling &&
          isConfidentialityWaiverFormId(schema.id) &&
          !canGoToNextAfterWaiver &&
          bothParentsUnsigned ? (
            <p className="mb-2 text-center text-sm font-medium text-destructive">
              {waiverNextFormBlockedMessage}
            </p>
          ) : null}
          <div className="flex w-full flex-wrap items-center justify-center gap-2">
          {isStaffFillForm(schema) && !freeAccess ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={saving || printing || sendingForHomeroom}
              onClick={() => setHomeroomDialogOpen(true)}
            >
              <Mail className="h-5 w-5" />
              שליחה למילוי
            </Button>
          ) : null}
          {isViewableForm(schema.id) && !freeAccess ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={saving || printing || sendingForView}
              onClick={() => setViewDialogOpen(true)}
            >
              <Eye className="h-5 w-5" />
              שליחה לצפייה
            </Button>
          ) : null}
          {signatureFields.length > 0 &&
          !showSimpleSignButton &&
          !freeAccessFillLocked &&
          (!freeAccess || isConfidentialityWaiverFormId(schema.id)) ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={
                saving ||
                printing ||
                sendingForSignature ||
                (freeAccess && !freeAccessSessionEmail)
              }
              onClick={() => setSignatureDialogOpen(true)}
            >
              <Mail className="h-5 w-5" />
              שלח לחתימה
            </Button>
          ) : null}
          {showSimpleSignButton && !freeAccessFillLocked && !hasSimpleSignSend ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={saving || printing || sendingForSimpleSign}
              onClick={() => setSimpleSignDialogOpen(true)}
            >
              <ShieldCheck className="h-5 w-5" />
              שלח לחתימה
            </Button>
          ) : null}
          {schema.id === "personal-basket-card" && !freeAccess ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={saving || printing}
              onClick={() => setTachiBulkDialogOpen(true)}
            >
              <FileText className="h-5 w-5" />
              פתיחת תח״י לכל תחום
            </Button>
          ) : null}
          {!freeAccess && !freeAccessFillLocked ? (
            <Button
              type="button"
              size="lg"
              disabled={saving || printing}
              onClick={() => void handleSave()}
            >
              <Save className="h-5 w-5" />
              <EditableText path="studentPortfolio.saveForm" />
            </Button>
          ) : freeAccess &&
            !freeAccessFillLocked &&
            isConfidentialityWaiverFormId(schema.id) ? (
            <Button
              type="button"
              size="lg"
              disabled={saving || printing}
              onClick={() => void handleSave()}
            >
              <Save className="h-5 w-5" />
              <EditableText path="studentPortfolio.saveForm" />
            </Button>
          ) : null}
          {!freeAccess ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={saving || printing || wordDownloading}
              onClick={() => void handlePrint()}
            >
              <Printer className="h-5 w-5" />
              <EditableText path="studentPortfolio.printForm" />
            </Button>
          ) : null}
          {!freeAccess ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={saving || printing || wordDownloading}
              onClick={() => void handleDownloadWord()}
            >
              <FileDown className="h-5 w-5" />
              הורדה ל-Word
            </Button>
          ) : null}
          {!freeAccess && hasSimpleSignSignedPdf && activeFillId ? (
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              title="פותח את ה-PDF החתום מ-SimpleSign — עם החתימות עצמן — להדפסה"
            >
              <a
                href={simpleSignSignedPdfUrl(activeFillId)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Printer className="h-5 w-5" />
                הדפסת המסמך החתום
              </a>
            </Button>
          ) : null}
          {nextSibling && canGoToNextAfterWaiver ? (
            <Button asChild size="lg" variant="outline">
              <Link
                href={nextSibling.href}
                onClick={(event) => {
                  event.preventDefault();
                  void leaveFillPage(nextSibling.href);
                }}
              >
                <EditableText
                  path={
                    nextSibling.kind === "folder"
                      ? "studentPortfolio.goToNextFolder"
                      : "studentPortfolio.goToNextForm"
                  }
                />
                <span className="font-bold">: {nextSibling.label}</span>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
          ) : nextSibling && isConfidentialityWaiverFormId(schema.id) && !canGoToNextAfterWaiver ? (
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={showWaiverNextFormBlocked}
              >
                <EditableText
                  path={
                    nextSibling.kind === "folder"
                      ? "studentPortfolio.goToNextFolder"
                      : "studentPortfolio.goToNextForm"
                  }
                />
                <span className="font-bold">: {nextSibling.label}</span>
                <ArrowLeft className="h-5 w-5" />
              </Button>
          ) : null}
          </div>
        </div>
        <Dialog
          open={fillDeleteOpen}
          onOpenChange={(open) => {
            setFillDeleteOpen(open);
            if (!open) setFillDeleteDialogError(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>מחיקת תוכנית חינוכית</DialogTitle>
              <DialogDescription>
                {`למחוק את ${portfolioFillDeleteLabel}? פעולה זו אינה ניתנת לביטול. מסמך חתום שנשמר בארכיון לא ניתן למחיקה.`}
              </DialogDescription>
            </DialogHeader>
            {fillDeleteDialogError ? (
              <p className="text-center text-sm font-medium text-destructive">
                {fillDeleteDialogError}
              </p>
            ) : null}
            <DialogFooter className="gap-2 sm:justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={fillDeleteBusy}
                onClick={() => setFillDeleteOpen(false)}
              >
                ביטול
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={fillDeleteBusy}
                onClick={() => void confirmDeleteFormFill()}
              >
                <Trash2 className="h-4 w-4" />
                מחיקה
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <SignatureRequestDialog
          open={signatureDialogOpen}
          onOpenChange={setSignatureDialogOpen}
          fields={signatureFields}
          sending={sendingForSignature}
          onSend={handleSendForSignature}
          initialRows={matoahSignatureInitialRows}
          allowExtraEmails
          lockedEmail={
            freeAccess && isConfidentialityWaiverFormId(schema.id)
              ? freeAccessSessionEmail
              : null
          }
          description={
            freeAccess && isConfidentialityWaiverFormId(schema.id)
              ? "בכניסה חופשית נשלחים שני קישורי חתימה (אב + אם) למייל שנרשמתם איתו — כדי שתוכלו להתנסות בזרימה המלאה."
              : null
          }
        />
        <SignatureRequestDialog
          open={simpleSignDialogOpen}
          onOpenChange={(open) => {
            setSimpleSignDialogOpen(open);
            if (!open) {
              setSimpleSignSendWarning(null);
              setSimpleSignSigningLinks([]);
            }
          }}
          fields={simpleSignParentFields}
          sending={sendingForSimpleSign}
          onSend={handleSendForSimpleSign}
          initialRows={simpleSignInitialRows}
          hideFieldSelect
          allowExtraEmails
          sendWarning={simpleSignSendWarning}
          signingLinks={simpleSignSigningLinks}
          description={
            student.single_responsible_party === true &&
            isConfidentialityWaiverFormId(schema.id)
              ? "לתלמיד עם אחראי יחיד מספיקה כתובת של הורה אחד. לכל חותם יישלח קישור אישי מ-SimpleSign."
              : "לכל חותם יישלח קישור אישי מ-SimpleSign. אפשר לערוך מייל או להוסיף כתובת נוספת לאותו חותם."
          }
        />
        <HomeroomFillRequestDialog
          open={homeroomDialogOpen}
          onOpenChange={setHomeroomDialogOpen}
          sending={sendingForHomeroom}
          defaultEmail={homeroomTeacherEmail}
          teacherName={homeroomTeacherName}
          staffOptions={staffFillOptions}
          onSend={handleSendForHomeroomFill}
        />
        {isViewableForm(schema.id) ? (
          <SendForViewingDialog
            open={viewDialogOpen}
            onOpenChange={setViewDialogOpen}
            sending={sendingForView}
            formId={schema.id}
            parentEmails={{
              father: student.father_email ?? undefined,
              mother: student.mother_email ?? undefined,
            }}
            homeroomEmail={homeroomTeacherEmail}
            principalEmail={principalViewEmail}
            staffOptions={staffFillOptions}
            onSend={handleSendForView}
          />
        ) : null}
        {schema.id === "student-team-details" ? (
          <StudentTeamStaffPickerDialog
            open={teamStaffPickerOpen}
            onOpenChange={setTeamStaffPickerOpen}
            category={
              student.category != null && isPersonalSector(student.category)
                ? student.category
                : undefined
            }
            data={data}
            onApply={(next) => {
              if (guestDemo || isFreeAccessMode()) {
                if (!isFreeAccessStudentFillable(student.id)) return;
              }
              setData(next);
              setMessage(null);
            }}
          />
        ) : null}
        <Dialog open={fullscreenEditOpen} onOpenChange={setFullscreenEditOpen}>
          <DialogContent className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] flex-col overflow-hidden p-0">
            <DialogHeader className="shrink-0 border-b border-border bg-card px-6 py-4">
              <DialogTitle className="text-xl font-bold">
                {schema.title} — עריכה במסך מלא
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {schema.sections
                .filter((sec) => sec.layout === "integrative-tachi")
                .map((section, sectionIndex) => (
                  <IntegrativeTachiGrid
                    key={sectionIndex}
                    fields={section.fields}
                    data={data}
                    onChange={setField}
                    fieldLabel={fieldLabel}
                    allowVoice={formSupportsVoiceRecording(schema)}
                    voiceRefineContext={voiceRefineContext}
                    renderSignature={(field) => renderField(field)}
                  />
                ))}
            </div>
          </DialogContent>
        </Dialog>
        {schema.id === "personal-basket-card" ? (
          <TachiBulkCreateDialog
            open={tachiBulkDialogOpen}
            onOpenChange={setTachiBulkDialogOpen}
            studentId={student.id}
            formData={data}
            onComplete={(result) => {
              setTachiBulkResult(result);
              setMessage(formatTachiBulkResultMessage(result));
            }}
          />
        ) : null}
          </>
        )}
      </div>
    </div>
  );

  return (
    <PageShell lockPageScroll>
      {isPersonalSector(student.category) ? (
        <TextScope sector={student.category}>{content}</TextScope>
      ) : (
        content
      )}
    </PageShell>
  );
}
