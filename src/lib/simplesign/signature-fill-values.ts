import { downloadSimpleSignFile } from "@/lib/simplesign/client";
import { getSimpleSignFormConfig } from "@/lib/simplesign/config";
import { isSimpleSignSignedValue } from "@/lib/simplesign/constants";
import {
  decodePngDataUrl,
  isInkPathSignature,
  isPngDataUrl,
  isSvgSignature,
  isValidSubmittedSignature,
  rgbaToStrokes,
  strokesToInkPath,
} from "@/lib/green-signature";

export function parseSimpleSignSubmissionValues(
  raw: unknown
): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function simpleSignSignatureFieldKeys(formId: string): string[] {
  const config = getSimpleSignFormConfig(formId);
  if (!config) return [];
  return config.parentSigners.map((signer) => signer.signatureFieldKey);
}

export function shouldReplaceWithSimpleSignInk(
  current: string | undefined
): boolean {
  const trimmed = String(current ?? "").trim();
  if (!trimmed) return true;
  if (isSimpleSignSignedValue(trimmed)) return true;
  if (isInkPathSignature(trimmed) || isSvgSignature(trimmed) || isPngDataUrl(trimmed)) {
    return false;
  }
  return false;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function pngDataUrlFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 8) return null;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpeg) return null;
  const mime = isPng ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

async function pngDataUrlToInkOrOriginal(
  dataUrl: string
): Promise<string | null> {
  const decoded = await decodePngDataUrl(dataUrl);
  if (!decoded) return null;
  const strokes = rgbaToStrokes(decoded.rgba, decoded.width, decoded.height);
  if (strokes.length > 0) {
    const ink = strokesToInkPath(strokes, decoded.width, decoded.height);
    if (isValidSubmittedSignature(ink)) return ink;
  }
  return isValidSubmittedSignature(dataUrl) ? dataUrl : null;
}

async function simpleSignRawValueToInk(raw: string): Promise<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (isInkPathSignature(trimmed) || isSvgSignature(trimmed)) {
    return isValidSubmittedSignature(trimmed) ? trimmed : null;
  }

  if (isPngDataUrl(trimmed)) {
    return pngDataUrlToInkOrOriginal(trimmed);
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const bytes = new Uint8Array(await downloadSimpleSignFile(trimmed));
      const dataUrl = pngDataUrlFromBytes(bytes);
      if (!dataUrl) return null;
      return pngDataUrlToInkOrOriginal(dataUrl);
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("<svg")) {
    return isValidSubmittedSignature(trimmed) ? trimmed : null;
  }

  return null;
}

export function formFillNeedsSimpleSignSignatureBackfill(
  formId: string,
  data: Record<string, string>
): boolean {
  return simpleSignSignatureFieldKeys(formId).some((fieldKey) =>
    shouldReplaceWithSimpleSignInk(data[fieldKey])
  );
}

/** ממיר values מ-SimpleSign לערכי ink/svg לשדות חתימה בלבד */
export async function buildSignatureInkPatchFromSimpleSignValues(
  formId: string,
  values: Record<string, string>,
  currentData: Record<string, string>
): Promise<Record<string, string>> {
  const patch: Record<string, string> = {};
  for (const fieldKey of simpleSignSignatureFieldKeys(formId)) {
    if (!shouldReplaceWithSimpleSignInk(currentData[fieldKey])) continue;
    const raw = values[fieldKey];
    if (!raw) continue;
    const ink = await simpleSignRawValueToInk(raw);
    if (ink) patch[fieldKey] = ink;
  }
  return patch;
}
