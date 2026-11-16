import { describe, expect, it } from "vitest";
import { getFormSchema } from "@/lib/form-schemas";
import { buildSignedFormPdf } from "./form-signed-pdf";

describe("buildSignedFormPdf", () => {
  it("writes a PDF for a Matoah form snapshot", async () => {
    const schema = getFormSchema("tachi");
    expect(schema).toBeDefined();
    const bytes = await buildSignedFormPdf({
      schema: schema!,
      data: { full_name: "נועה כהן", parents_signature: "נחתם" },
      studentName: "נועה כהן",
    });
    const header = Buffer.from(bytes.slice(0, 5)).toString("utf8");
    expect(header).toBe("%PDF-");
  });
});
