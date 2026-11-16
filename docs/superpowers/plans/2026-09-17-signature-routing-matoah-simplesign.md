# Signature Routing (Matoah vs SimpleSign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route only the 12 allowlisted forms through SimpleSign with a personal SimpleSign link for every signer, move תח״י back to in-app signing, let Matoah staff sign in-app or via emailed OTP link, and archive the complete document.

**Architecture:** `SIMPLESIGN_FORM_CONFIGS` is the allowlist and the signer list (parents and staff). The send dialog lists every signer with editable emails (extra addresses allowed). SimpleSign gets one personal signing URL per required signer; extras get the same URL by email. In-app forms keep `GreenSignatureField` for staff and `form-signature` + OTP for any emailed signer including staff. Completed in-app documents archive a full HTML snapshot to `student_documents`.

**Tech Stack:** Next.js App Router, Vitest, Supabase Edge Functions (`form-signature`), existing SimpleSign client/webhook, existing form-fill OTP pattern.

## Global Constraints

- Allowlist is exactly the 12 form IDs in the spec; `tachi` and `tachi-integrative` must leave SimpleSign.
- No mixed signing on a SimpleSign form (no Matoah-first staff gate).
- Do not invent a server-side PDF renderer; archive SimpleSign PDFs as today and in-app snapshots as HTML documents.
- Reuse `form-fill-otp` patterns for signature-link OTP; do not log emails, OTP codes, or tokens.
- Keep `parentSigners` field name in config (rename is out of scope); treat it as all signers.
- User-facing copy: «שלח לחתימה ב-SimpleSign» for allowlisted forms, not «שלח להורים לחתימה».
- Send dialog lists every signer with an editable email; extra emails allowed for the same signature field; required signer rows cannot be deleted.
- Matoah send includes staff signature fields (staff may sign in-app or via emailed link+OTP).
- SimpleSign send creates one personal SimpleSign signing URL per required signer; extra emails for that signer receive the same URL from Matoah mail.
- Manual SimpleSign template edits (additional signers) are a blocker for Task 3 forms; code can land first with tests, but live send will fail `simplesign:check` until templates match.

---

### Task 1: Allowlist and signer inventory tests

**Files:**
- Modify: `src/lib/simplesign/config.ts`
- Modify: `src/lib/simplesign/prefill.test.ts` (tachi describes)
- Create: `src/lib/simplesign/routing.test.ts`
- Modify: `src/content/forms/tachi.json` (remove `simplesign`)
- Modify: `src/content/forms/tachi-integrative.json` (remove `simplesign`)
- Modify: `.env.local.example`
- Modify: `docs/simplesign-setup.md`

**Interfaces:**
- Consumes: existing `SimpleSignFormConfig`
- Produces: allowlist without `tachi` / `tachi-integrative`; `formMayUseSimpleSign("referral-questionnaire-kindergarten")` still false until Task 2

- [ ] **Step 1: Write the failing routing test**

```ts
import { describe, expect, it } from "vitest";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { getFormLockedKeys } from "@/lib/form-schema-loader";
import {
  SIMPLESIGN_FORM_CONFIGS,
  formMayUseSimpleSign,
} from "@/lib/simplesign/config";

const ALLOWLIST = [
  "waiver-confidentiality",
  "waiver-multidisciplinary-team",
  "waiver-appeal-committee",
  "waiver-eligibility-characterization",
  "moe-psychologist-recommendation",
  "moe-inclusion-plan",
  "moe-exhaust-options",
  "referral-questionnaire-multidisciplinary",
  "referral-questionnaire-kindergarten",
  "referral-questionnaire",
  "moe-psychologist-code-change",
  "moe-parent-approval-committee-no-presence",
] as const;

describe("SimpleSign routing allowlist", () => {
  it("includes only the allowlisted forms", () => {
    expect(SIMPLESIGN_FORM_CONFIGS.map((c) => c.formId).sort()).toEqual(
      [...ALLOWLIST].sort()
    );
  });

  it("keeps tachi in Matoah", () => {
    expect(formMayUseSimpleSign("tachi")).toBe(false);
    expect(formMayUseSimpleSign("tachi-integrative")).toBe(false);
    expect(getFormLockedKeys("tachi")).toBeNull();
    expect(getFormLockedKeys("tachi-integrative")).toBeNull();
  });

  it("maps every signature field as a SimpleSign signer and requires no Matoah staff gate", () => {
    for (const config of SIMPLESIGN_FORM_CONFIGS) {
      expect(config.requiredStaffSignatureKeys).toEqual([]);
      const schema = getFormSchema(config.formId);
      expect(schema).toBeDefined();
      const signatureKeys = listFormFields(schema!)
        .filter((field) => field.type === "signature")
        .map((field) => field.key)
        .sort();
      const signerKeys = config.parentSigners
        .map((signer) => signer.signatureFieldKey)
        .sort();
      expect(signerKeys).toEqual(signatureKeys);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/simplesign/routing.test.ts`
Expected: FAIL — `tachi` still in configs; kindergarten missing; several forms still have `requiredStaffSignatureKeys` or missing signers.

- [ ] **Step 3: Remove tachi from SimpleSign**

In `src/lib/simplesign/config.ts` delete the `tachi` and `tachi-integrative` entries.

In `src/content/forms/tachi.json` and `src/content/forms/tachi-integrative.json` delete the `"simplesign": { ... }` blocks.

In `src/lib/simplesign/prefill.test.ts` change:

```ts
expect(formMayUseSimpleSign("tachi")).toBe(false);
```

and the `tachi-integrative SimpleSign template` block to assert `formMayUseSimpleSign("tachi-integrative") === false`. Keep the table-cell prefill tests (they test `buildSimpleSignPrefillForDocument`, not routing).

In `.env.local.example` remove `SIMPLESIGN_DOC_TACHI` and `SIMPLESIGN_DOC_TACHI_INT`. Add a comment that leftover local tokens are unused.

In `docs/simplesign-setup.md` delete the תח״י rows from both tables.

- [ ] **Step 4: Run tachi-related tests**

Run: `npx vitest run src/lib/simplesign/prefill.test.ts src/lib/simplesign/locked-keys.test.ts src/lib/simplesign/routing.test.ts`
Expected: locked-keys PASS; prefill PASS; routing still FAIL on kindergarten + staff signers (Task 2–3). tachi assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simplesign/config.ts src/lib/simplesign/routing.test.ts src/lib/simplesign/prefill.test.ts src/content/forms/tachi.json src/content/forms/tachi-integrative.json .env.local.example docs/simplesign-setup.md
git commit -m "$(cat <<'EOF'
fix(simplesign): keep tachi signatures inside Matoah

EOF
)"
```

---

### Task 2: Wire kindergarten referral to SimpleSign

**Files:**
- Modify: `src/lib/simplesign/config.ts`
- Modify: `src/content/forms/referral-questionnaire-kindergarten.json`
- Modify: `.env.local.example`
- Modify: `docs/simplesign-setup.md`
- Modify: `docs/simplesign-field-mapping.html` (add a short kindergarten section listing the three signature keys)

**Interfaces:**
- Consumes: `SIMPLESIGN_DOC_REFERRAL_KG` (already present in local env; add to example)
- Produces: `SimpleSignFormConfig` for `referral-questionnaire-kindergarten` with three signers

- [ ] **Step 1: Extend routing test expectations** (already in Task 1 allowlist)

- [ ] **Step 2: Add config entry after `referral-questionnaire`**

```ts
{
  formId: "referral-questionnaire-kindergarten",
  documentTokenEnv: "SIMPLESIGN_DOC_REFERRAL_KG",
  parentSigners: [
    {
      role: "teacher",
      signatureFieldKey: "signer_signature",
      signerSlot: 1,
      defaultSignerName: (_student, d) =>
        String(d.signer_name ?? "גננת").trim(),
    },
    {
      role: "parent1",
      signatureFieldKey: "parent1_signature",
      signerSlot: 2,
      defaultSignerName: (s, d) =>
        String(d.parent1_sign_name ?? d.father_name ?? s.father_name ?? "הורה 1").trim(),
    },
    {
      role: "parent2",
      signatureFieldKey: "parent2_signature",
      signerSlot: 3,
      defaultSignerName: (s, d) =>
        String(d.parent2_sign_name ?? d.mother_name ?? s.mother_name ?? "הורה 2").trim(),
    },
  ],
  requiredStaffSignatureKeys: [],
  signedPdfFolder: "שאלון הפנייה לוועדת אפיון וזכאות",
},
```

Add `"simplesign": { "lockedKeys": [ ...all prefill keys plus the three signature keys... ] }` to the JSON. Start from school referral lockedKeys and swap homeroom → `signer_name` / `signer_signature`.

Add `SIMPLESIGN_DOC_REFERRAL_KG=` to `.env.local.example` and a row in `docs/simplesign-setup.md`.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/lib/simplesign/routing.test.ts src/lib/simplesign/locked-keys.test.ts`
Expected: kindergarten present; locked-keys PASS. Routing still FAIL on staff signers of other forms.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(simplesign): route kindergarten referral through SimpleSign

EOF
)"
```

---

### Task 3: Move remaining staff signatures into SimpleSign signers

**Files:**
- Modify: `src/lib/simplesign/config.ts`
- Modify: `src/content/forms/referral-questionnaire.json` (`simplesign.lockedKeys`)
- Modify: `src/content/forms/referral-questionnaire-multidisciplinary.json`
- Modify: `src/content/forms/moe-parent-approval-committee-no-presence.json`
- Modify: `src/content/forms/moe-inclusion-plan.json`
- Modify: `docs/simplesign-setup.md`
- Modify: `src/app/api/simplesign/create-submissions/route.ts` (error copy if it still says «ההורים»)
- Modify: `src/lib/simplesign/check-keys.ts` if it only validates parent-named keys

**Interfaces:**
- Consumes: `validateStaffSignaturesBeforeSimpleSign` — becomes a no-op for allowlist (empty arrays)
- Produces: every signature field on allowlisted forms is a `parentSigners` entry

Signer slots (must match «הוספת חותם נוסף» order in SimpleSign):

| form_id | slot 1 | slot 2 | slot 3 | slot 4 |
|---|---|---|---|---|
| `referral-questionnaire` | `homeroom_signature` | `parent1_signature` | `parent2_signature` | — |
| `referral-questionnaire-multidisciplinary` | `homeroom_signature` | `principal_signature` | `supervisor_signature` | `parent_signature` |
| `moe-parent-approval-committee-no-presence` | `principal_sign` | `parent1_sign` | `parent2_sign` | — |
| `moe-inclusion-plan` | `coordinator_sign` | `teacher_sign` | `parent_sign` | — |

Keep existing slots for waivers, exhaust-options, appendix 8, psychologist code-change.

Add `role: "principal"` already exists. Reuse `teacher` for homeroom/gannenet. Add nothing new unless a role is missing — `principal` exists.

Empty every `requiredStaffSignatureKeys: []`.

Add the new signature keys to each form's `simplesign.lockedKeys`.

- [ ] **Step 1: Routing test should now be the failing spec** (already written)

- [ ] **Step 2: Update configs and lockedKeys**

Example inclusion signers:

```ts
parentSigners: [
  {
    role: "coordinator",
    signatureFieldKey: "coordinator_sign",
    signerSlot: 1,
    defaultSignerName: (_s, d) => String(d.coordinator_name ?? "רכזת שילוב").trim(),
  },
  {
    role: "teacher",
    signatureFieldKey: "teacher_sign",
    signerSlot: 2,
    defaultSignerName: (_s, d) => String(d.homeroom_teacher ?? "מחנך/ת").trim(),
  },
  {
    role: "parent",
    signatureFieldKey: "parent_sign",
    signerSlot: 3,
    defaultSignerName: (s, d) =>
      String(d.parent1_name ?? s.father_name ?? s.mother_name ?? "הורה").trim(),
  },
],
requiredStaffSignatureKeys: [],
```

In `create-submissions/route.ts` change the multi-signer error to:

```ts
error: "מסמך זה דורש שליחה לכל החותמים יחד — הזינו מייל לכל שדות החתימה ושלחו בבת אחת.",
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/lib/simplesign/`
Expected: routing PASS, locked-keys PASS, check-keys unit tests PASS. Live `npm run simplesign:check` will FAIL until the user marks the new signers in SimpleSign templates — that is expected and documented in the spec.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(simplesign): send every required signature, including staff, to SimpleSign

EOF
)"
```

---

### Task 4: Send-for-signature dialog — all signers, editable/extra emails

**Files:**
- Create: `src/lib/simplesign/signer-email-rows.ts`
- Create: `src/lib/simplesign/signer-email-rows.test.ts`
- Modify: `src/components/students/SignatureRequestDialog.tsx`
- Modify: `src/components/students/StudentFormFillPageClient.tsx`
- Modify: `src/app/api/simplesign/create-submissions/route.ts`

**Interfaces:**
- Consumes: `config.parentSigners`, `signatureFields`, `splitParentEmails`, `homeroomTeacherEmail` / `staffFillOptions`
- Produces: `buildSignerEmailRows(...)`; create-submissions accepts extra emails per `fieldKey`

```ts
export type SignerEmailRow = {
  fieldKey: string;
  email: string;
  required: boolean;
};

export function buildSignerEmailRows(input: {
  signatureKeys: string[];
  parentEmails: string[];
  staffEmailByFieldKey?: Record<string, string>;
}): SignerEmailRow[] {
  return input.signatureKeys.map((fieldKey, index) => {
    const staff = input.staffEmailByFieldKey?.[fieldKey]?.trim() ?? "";
    const parent = input.parentEmails[index] ?? "";
    const isParent = /^(parent\d*|parents|father|mother)(_sign|_signature)/.test(
      fieldKey
    );
    return {
      fieldKey,
      email: isParent ? parent : staff,
      required: true,
    };
  });
}

/** First email per fieldKey is the SimpleSign slot recipient; the rest are copies. */
export function partitionSignerAssignments<T extends { fieldKey: string }>(
  requiredKeys: string[],
  assignments: T[]
): { primary: T[]; extras: T[]; missingKeys: string[] } {
  const primary: T[] = [];
  const extras: T[] = [];
  const seen = new Set<string>();
  for (const row of assignments) {
    if (!requiredKeys.includes(row.fieldKey)) continue;
    if (seen.has(row.fieldKey)) extras.push(row);
    else {
      seen.add(row.fieldKey);
      primary.push(row);
    }
  }
  return {
    primary,
    extras,
    missingKeys: requiredKeys.filter((key) => !seen.has(key)),
  };
}
```

- [ ] **Step 1: Write failing tests** for `buildSignerEmailRows` and `partitionSignerAssignments`

- parent-only: two keys get split parent emails
- mixed: `homeroom_signature` gets staff email, parents get parent emails
- partition: three assignments for two required keys → two primary, one extra, no missing
- partition missing a required key → `missingKeys` contains it

- [ ] **Step 2: Run** `npx vitest run src/lib/simplesign/signer-email-rows.test.ts` — Expected: FAIL (module missing)

- [ ] **Step 3: Implement the helper**

- [ ] **Step 4: Dialog behavior**

In `SignatureRequestDialog`:
- Required rows (from `initialRows` with `required: true`, or all `fields` when `requireAllSigners`): show signer **label**, editable email, no delete.
- `hideFieldSelect` stays true for those required rows (label is the signer name).
- `canAdd` is **true** even with `hideFieldSelect`: extra row picks a signer from `fields` (dropdown) + email. Extra rows can be deleted.
- Description: «לכל חותם יישלח קישור אישי. אפשר לערוך מייל או להוסיף כתובת נוספת לאותו חותם.»

In `StudentFormFillPageClient`:
- Matoah dialog: `initialRows` = every `signatureFields` key (staff included), prefill parent/staff emails. Pass `requireAllSigners`.
- SimpleSign dialog: `initialRows` = every `config.parentSigners` key (not filtered to parent-named fields). Same add/edit behavior.
- Button: «שלח לחתימה ב-SimpleSign». Matoah button stays «שלח לחתימה».

- [ ] **Step 5: create-submissions accepts extra emails**

Replace the exact-length check with `partitionSignerAssignments`:
- `missingKeys.length > 0` → 400 «יש להזין מייל לכל החותמים»
- unknown `fieldKey` → 400 as today
- `primary` goes to SimpleSign multi-signer API (one email per slot → personal SimpleSign link)
- after URLs exist, `extras` call `sendSimpleSignSigningEmail` with the **same** `signingUrl` as that field's primary row
- error copy without «ההורים»

- [ ] **Step 6: Run** `npx vitest run src/lib/simplesign/`
Expected: helper tests PASS; existing create-submissions tests updated if they assume exact assignment count

- [ ] **Step 7: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(signatures): list every signer with editable and extra emails

EOF
)"
```

---

### Task 5: In-app signature link OTP

**Files:**
- Create: `supabase/migrations/042_form_signature_otp.sql`
- Create: `src/lib/form-signature-otp.ts` (cookie name + token hash re-export from fill OTP helpers where possible)
- Create: `src/app/api/signature/otp/request/route.ts`
- Create: `src/app/api/signature/otp/verify/route.ts`
- Modify: `supabase/functions/form-signature/index.ts` (`get` requires verified OTP session)
- Modify: `src/components/students/PublicFormSignaturePage.tsx`
- Modify: `src/lib/form-signature-otp.test.ts`
- Create: `src/lib/form-signature-otp-email.ts` (copy `form-fill-otp-email.ts`, change subject to חתימה)

**Interfaces:**
- Consumes: `form_signature_requests.token_hash`, recipient email on the request row (add `recipient_email` if missing — check migration 019)
- Produces: cookie `form_signature_otp` after verify; `GET` of signature request returns 401-equivalent `{ ok:false, error, otpRequired:true, maskedEmail }` until verified
- Staff Matoah links use this same OTP gate (Task 4 sends those links).

- [ ] **Step 1: Inspect `019_form_signature_requests.sql` for `recipient_email`**

If the column exists, skip the alter. If not:

```sql
alter table public.form_signature_requests
  add column if not exists recipient_email text;

alter table dev.form_signature_requests
  add column if not exists recipient_email text;
```

OTP tables (mirror fill OTP):

```sql
create table if not exists public.form_signature_otp_codes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.form_signature_requests(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.form_signature_otp_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.form_signature_requests(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

Repeat for `dev` schema. Enable RLS deny-all; service role only.

- [ ] **Step 2: Write tests for hash/mask helpers** (re-export `maskRecipientEmail`, `hashFormFillToken` — do not duplicate crypto).

- [ ] **Step 3: Implement request/verify API routes** copying `src/app/api/fill/otp/request/route.ts` and `verify/route.ts`:
  - Rate limit buckets `form-signature-otp:${ip}` and `form-signature-otp-email:${email}`
  - Never log the code except existing `DEV_OTP_BYPASS`
  - Cookie httpOnly, secure, sameSite=lax, path=`/signature` or the public signature path used today

- [ ] **Step 4: Gate `action: "get"` and `action: "submit"`** in the edge function: require the OTP session cookie hash to match. Until then return `otpRequired` without snapshot HTML.

- [ ] **Step 5: PublicFormSignaturePage** — reuse the OTP UI block from `PublicFormFillPage.tsx` (code input, resend, masked email). After verify, load snapshot and signature pad.

- [ ] **Step 6: Run**

Run: `npx vitest run src/lib/form-signature-otp.test.ts src/lib/form-fill-otp.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(signatures): require email OTP before in-app signature links

EOF
)"
```

---

### Task 6: Archive the full in-app document after the last signature

**Files:**
- Modify: `supabase/functions/form-signature/index.ts`
- Modify: `src/components/students/StudentFormFillPageClient.tsx` (`handleSave` after staff signatures)
- Create: `src/lib/form-signed-archive.ts`
- Create: `src/lib/form-signed-archive.test.ts`
- Create: `src/app/api/forms/archive-signed/route.ts` (session-auth, used from the fill page after staff signs the last field)

**Interfaces:**
- Consumes: `buildFormSnapshotHtml` output (client) or stored `snapshotHtml` from signature requests
- Produces: `student_documents` row, `mime_type: "text/html"`, name `${schema.title} — ${student} — חתום.html`, folder = `schema.categoryFolder ?? schema.folder`, `archived_at` set (same as SimpleSign PDF store)

```ts
export function allSignatureFieldsFilled(
  signatureKeys: string[],
  data: Record<string, string>
): boolean {
  return signatureKeys.every((key) => Boolean(String(data[key] ?? "").trim()));
}

export function signedArchiveFileName(formTitle: string, studentName: string): string {
  return `${formTitle} — ${studentName} — חתום.html`;
}
```

- [ ] **Step 1: Write failing tests for `allSignatureFieldsFilled` and file name**

- [ ] **Step 2: Implement helper**

- [ ] **Step 3: On signature submit (edge function)** after updating fill data, if every signature key on that form's schema is filled (pass `signatureKeys` at create time, stored on the request, or load schema JSON — edge function does not import Next app schemas; **store `signature_keys text[]` on create**):

Add column `signature_keys text[]` on `form_signature_requests` in the same migration as Task 5 if convenient, populated in `handleCreate` from the assignments plus any already-filled staff keys sent by the client.

When complete, insert `student_documents` with the latest `snapshotHtml` (re-rendered is nicer but edge has only the original snapshot). **Better:** client `archive-signed` API uses current fill data + `buildFormSnapshotHtml` so staff ink is included.

Recommended path (one implementation, used from both places):

`POST /api/forms/archive-signed` `{ formFillId }` — server loads fill + student, builds HTML with `buildFormSnapshotHtml`, stores via the same insert shape as `storeSignedPdfDocument` but `mime_type: "text/html"` and `data_url: data:text/html;base64,...`. Idempotent: skip if a document with the same name exists for that student/folder/year.

Call it:
1. From fill page `handleSave` when form is not SimpleSign and all signature fields filled
2. From `PublicFormSignaturePage` after successful submit (client)

Do not call it from the edge function (no snapshot builder there).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/form-signed-archive.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(forms): archive a full signed snapshot in the student folder

EOF
)"
```

---

### Task 7: Keep in-app staff signing working on Matoah forms

**Files:**
- Modify: `src/components/students/StudentFormFillPageClient.tsx` (`readOnly={isSimpleSignSignerField(...)}` already correct once tachi leaves the allowlist)
- Modify: `src/lib/form-fields.ts` only if kindergarten `signer_signature` is misclassified as parent

**Interfaces:**
- Consumes: `isParentSignatureField`, `isSimpleSignSignerField`
- Produces: staff pads editable on tachi/tla/accommodations; parent pads still sendable via «שלח לחתימה»

- [ ] **Step 1: Add tests in `src/lib/form-fields.ts` companion test file if one exists, else `src/lib/form-fields-signature.test.ts`**

```ts
expect(isParentSignatureField("homeroom_signature")).toBe(false);
expect(isParentSignatureField("signer_signature")).toBe(false);
expect(isParentSignatureField("parents_signature")).toBe(true);
expect(isParentSignatureField("parent_sign")).toBe(true);
```

- [ ] **Step 2: Confirm `isSimpleSignSignerField("tachi", "parents_signature") === false` in routing test**

- [ ] **Step 3: Commit if any code changed**

```bash
git commit -m "$(cat <<'EOF'
fix(forms): classify staff signature keys for in-app signing

EOF
)"
```

---

### Task 8: Docs, env example, CI secrets list

**Files:**
- Modify: `docs/simplesign-setup.md` (full allowlist table with all signers, not just parents)
- Modify: `docs/simplesign-field-mapping.html` (kindergarten + parent_sign on inclusion + homeroom on school referral)
- Modify: `.env.local.example`
- Modify: `.github/workflows/form-schema-ci.yml` if it lists `SIMPLESIGN_DOC_*` secrets — drop TACHI, add `SIMPLESIGN_DOC_REFERRAL_KG`

- [ ] **Step 1: Update the setup table** so each row lists every signer key and slot count (3 or 4 where needed).

- [ ] **Step 2: Add a «חתימות שחסר לסמן ב-SimpleSign» box** pointing to the four mixed forms + inclusion parent field.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs(simplesign): document allowlist and required staff signers

EOF
)"
```

---

### Task 9: Verification

- [ ] **Step 1: Unit suite**

Run: `npx vitest run src/lib/simplesign src/lib/form-signature-otp.test.ts src/lib/form-signed-archive.test.ts src/lib/form-fields-signature.test.ts`
Expected: all PASS

- [ ] **Step 2: Live key check (needs user templates)**

Run: `npm run simplesign:check`
Expected: PASS only after the user marks the new signers in SimpleSign. Until then, record which document tokens fail and stop — do not bypass.

- [ ] **Step 3: Manual UI**

1. Open תח״י — staff can sign in the form; «שלח לחתימה» (not SimpleSign); parent link asks for OTP; after last signature a `… — חתום.html` appears in the folder.
2. Open ויתור סודיות — SimpleSign button; no in-app parent pads.
3. Open שאלון הפניה בית ספר — SimpleSign dialog lists מחנך + שני הורים, emails editable, «הוספת כתובת» works; cannot send without all three.
4. Open תח״י — «שלח לחתימה» lists מחנכת + מורת שילוב + הורים; sending a staff row emails a Matoah link.
5. After a SimpleSign webhook (or sync), PDF still lands in `signedPdfFolder`.

- [ ] **Step 4: Browser pass** on fill + public signature OTP using the Cursor browser tools against the local dev server.

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| Allowlist of 12 forms | 1, 2 |
| תח״י back to Matoah | 1, 7 |
| All SimpleSign signatures including staff | 3, 4 |
| Kindergarten SimpleSign | 2 |
| Tell user about unmarked staff/parent fields | spec + Task 8 docs |
| Full document saved (SimpleSign PDF) | existing webhook; verified in 9 |
| Full document saved (Matoah) | 6 |
| Staff sign in-app **or** receive Matoah email | 4, 7 |
| Send dialog: all signers, edit/add emails | 4 |
| Personal SimpleSign link per signer | 4 |
| Parent/staff email link + OTP | 5 |

## Placeholder scan

None. Live `simplesign:check` depends on the user updating templates; the plan states that explicitly instead of leaving a TBD.
