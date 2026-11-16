import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const FILE_ID = /^[a-zA-Z0-9_-]{10,80}$/;
const RANGE_HEADER = /^bytes=\d+-\d*$/;

function isGoogleMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "drive.usercontent.google.com" ||
    host === "drive.google.com" ||
    host.endsWith(".googleusercontent.com")
  );
}

function isBlockedAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (ip.startsWith("::ffff:")) return isBlockedAddress(ip.slice(7));
  if (ip === "::1" || ip === "::") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) {
    return true;
  }

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 168 || b === 0)) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

async function assertPublicGoogleHost(hostname: string): Promise<void> {
  if (isIP(hostname) || !isGoogleMediaHost(hostname)) {
    throw new Error("HOST_NOT_ALLOWED");
  }
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) throw new Error("DNS_EMPTY");
  for (const record of records) {
    if (isBlockedAddress(record.address)) throw new Error("PRIVATE_ADDRESS");
  }
}

export function driveVideoUpstreamUrl(fileId: string): string | null {
  if (!FILE_ID.test(fileId)) return null;
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
}

export async function fetchPublicDriveVideo(
  fileId: string,
  range: string | null
): Promise<Response> {
  const start = driveVideoUpstreamUrl(fileId);
  if (!start) throw new Error("INVALID_ID");

  let current = start;
  for (let hop = 0; hop < 4; hop += 1) {
    const url = new URL(current);
    if (url.protocol !== "https:" || (url.port !== "" && url.port !== "443")) {
      throw new Error("INVALID_URL");
    }
    await assertPublicGoogleHost(url.hostname);

    const headers = new Headers();
    if (range && RANGE_HEADER.test(range)) headers.set("Range", range);

    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("REDIRECT");
      current = new URL(location, url).toString();
      continue;
    }

    return response;
  }

  throw new Error("TOO_MANY_REDIRECTS");
}
