import { describe, expect, it } from "vitest";
import {
  checkSimpleSignLockedKeys,
  fetchInputsWithRetry,
} from "@/lib/simplesign/check-keys";
import type { SimpleSignDocumentInput } from "@/lib/simplesign/prefill";

const WAIVER_INPUTS: SimpleSignDocumentInput[] = [
  { key: "student_name", label: "student_name", type: "text" },
  { key: "father_signature", label: "חתימת האב", type: "signature" },
];

describe("checkSimpleSignLockedKeys", () => {
  it("fails when the API key is missing", async () => {
    const errors = await checkSimpleSignLockedKeys({
      apiKey: "",
      forms: [
        {
          formId: "waiver-confidentiality",
          documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_BASIC",
          documentToken: "token",
          lockedKeys: ["student_name"],
        },
      ],
      fetchInputs: async () => WAIVER_INPUTS,
    });
    expect(errors.some((error) => error.includes("SIMPLESIGN_API_KEY"))).toBe(
      true
    );
  });

  it("fails when a document token is missing", async () => {
    const errors = await checkSimpleSignLockedKeys({
      apiKey: "key",
      forms: [
        {
          formId: "waiver-confidentiality",
          documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_BASIC",
          documentToken: null,
          lockedKeys: ["student_name"],
        },
      ],
      fetchInputs: async () => WAIVER_INPUTS,
    });
    expect(errors.some((error) => error.includes("SIMPLESIGN_DOC_WAIVER_BASIC"))).toBe(
      true
    );
  });

  it("fails when a locked key is missing from SimpleSign inputs", async () => {
    const errors = await checkSimpleSignLockedKeys({
      apiKey: "key",
      forms: [
        {
          formId: "waiver-confidentiality",
          documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_BASIC",
          documentToken: "token",
          lockedKeys: ["student_name", "father_name"],
        },
      ],
      fetchInputs: async () => WAIVER_INPUTS,
    });
    expect(errors.join("\n")).toContain("father_name");
    expect(errors.join("\n")).toContain("SIMPLESIGN_DOC_WAIVER_BASIC");
  });

  it("requires parent signature locked keys to be signature fields", async () => {
    const errors = await checkSimpleSignLockedKeys({
      apiKey: "key",
      forms: [
        {
          formId: "waiver-confidentiality",
          documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_BASIC",
          documentToken: "token",
          lockedKeys: ["father_signature"],
        },
      ],
      fetchInputs: async () => [
        { key: "father_signature", label: "father_signature", type: "text" },
      ],
    });
    expect(errors.join("\n")).toContain("father_signature");
  });

  it("covers a signer signature locked key by signer slot", async () => {
    const errors = await checkSimpleSignLockedKeys({
      apiKey: "key",
      forms: [
        {
          formId: "moe-exhaust-options",
          documentTokenEnv: "SIMPLESIGN_DOC_EXHAUST_OPTIONS",
          documentToken: "token",
          lockedKeys: ["principal_sign"],
          signerSlots: [{ signatureFieldKey: "principal_sign", slot: 1 }],
        },
      ],
      fetchInputs: async () => [
        { key: "signature", label: "חתימה", type: "signature", signer: 1 },
      ],
    });
    expect(errors).toEqual([]);
  });

  it("passes when every locked key is present", async () => {
    const errors = await checkSimpleSignLockedKeys({
      apiKey: "key",
      forms: [
        {
          formId: "waiver-confidentiality",
          documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_BASIC",
          documentToken: "token",
          lockedKeys: ["student_name", "father_signature"],
        },
      ],
      fetchInputs: async () => WAIVER_INPUTS,
    });
    expect(errors).toEqual([]);
  });

  it("retries until success after transient failures", async () => {
    let calls = 0;
    const sleepCalls: number[] = [];
    const errors = await checkSimpleSignLockedKeys({
      apiKey: "key",
      forms: [
        {
          formId: "waiver-confidentiality",
          documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_BASIC",
          documentToken: "token",
          lockedKeys: ["student_name"],
        },
      ],
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      fetchInputs: async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error("service unavailable"), { status: 503 });
        }
        return WAIVER_INPUTS;
      },
    });
    expect(calls).toBe(2);
    expect(sleepCalls).toEqual([1000]);
    expect(errors).toEqual([]);
  });

  it("warns instead of failing when the API stays unavailable", async () => {
    const warnings: string[] = [];
    const errors = await checkSimpleSignLockedKeys({
      apiKey: "key",
      forms: [
        {
          formId: "waiver-confidentiality",
          documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_BASIC",
          documentToken: "token",
          lockedKeys: ["student_name"],
        },
      ],
      sleep: async () => {},
      emitWarning: (line) => warnings.push(line),
      fetchInputs: async () => {
        throw Object.assign(new Error("service unavailable"), { status: 503 });
      },
    });
    expect(errors).toEqual([]);
    expect(warnings.some((line) => line.includes("::warning::"))).toBe(true);
    expect(warnings.join("\n")).toContain("SIMPLESIGN_DOC_WAIVER_BASIC");
  });

  it("fails immediately on 401 without retrying", async () => {
    let calls = 0;
    const sleepCalls: number[] = [];
    const errors = await checkSimpleSignLockedKeys({
      apiKey: "key",
      forms: [
        {
          formId: "waiver-confidentiality",
          documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_BASIC",
          documentToken: "token",
          lockedKeys: ["student_name"],
        },
      ],
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      fetchInputs: async () => {
        calls += 1;
        throw Object.assign(new Error("unauthorized"), { status: 401 });
      },
    });
    expect(calls).toBe(1);
    expect(sleepCalls).toEqual([]);
    expect(errors.join("\n")).toContain("auth failed");
  });
});

describe("fetchInputsWithRetry", () => {
  it("passes after 503 then 200", async () => {
    let calls = 0;
    const result = await fetchInputsWithRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error("bad gateway"), { status: 503 });
        }
        return WAIVER_INPUTS;
      },
      "token",
      { sleep: async () => {} }
    );
    expect(calls).toBe(2);
    expect(result).toEqual({ kind: "success", inputs: WAIVER_INPUTS });
  });

  it("returns unavailable after repeated 503 responses", async () => {
    const result = await fetchInputsWithRetry(
      async () => {
        throw Object.assign(new Error("service unavailable"), { status: 503 });
      },
      "token",
      { sleep: async () => {} }
    );
    expect(result).toEqual({ kind: "unavailable" });
  });

  it("returns auth on 401 without further retries", async () => {
    let calls = 0;
    const result = await fetchInputsWithRetry(
      async () => {
        calls += 1;
        throw Object.assign(new Error("unauthorized"), { status: 401 });
      },
      "token",
      { sleep: async () => {} }
    );
    expect(calls).toBe(1);
    expect(result).toEqual({ kind: "auth", message: "unauthorized" });
  });
});
