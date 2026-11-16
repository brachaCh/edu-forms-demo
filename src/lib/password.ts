import bcrypt from "bcryptjs";

/** bcrypt — האש איטי ייעודי (צ'קליסט #08). PBKDF2 נתמך לאימות hashes ישנים בלבד. */
const BCRYPT_ROUNDS = 12;
const LEGACY_PBKDF2_ITERATIONS = 100_000;

function base64ToBuffer(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, "base64"));
}

async function derivePbkdf2Bits(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return `bcrypt:${hash}`;
}

async function verifyLegacyPbkdf2(
  password: string,
  stored: string
): Promise<boolean> {
  const [prefix, iterationsValue, saltValue, hashValue] = stored.split(":");
  if (prefix !== "pbkdf2" || !iterationsValue || !saltValue || !hashValue) {
    return false;
  }

  const iterations = Number(iterationsValue);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  const salt = base64ToBuffer(saltValue);
  const expected = base64ToBuffer(hashValue);
  const actual = await derivePbkdf2Bits(
    password,
    salt,
    iterations || LEGACY_PBKDF2_ITERATIONS
  );

  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  if (!stored) return false;

  if (stored.startsWith("pbkdf2:")) {
    return verifyLegacyPbkdf2(password, stored);
  }

  const bcryptHash = stored.startsWith("bcrypt:")
    ? stored.slice("bcrypt:".length)
    : stored.startsWith("$2")
      ? stored
      : null;

  if (!bcryptHash) return false;

  try {
    return await bcrypt.compare(password, bcryptHash);
  } catch {
    return false;
  }
}
