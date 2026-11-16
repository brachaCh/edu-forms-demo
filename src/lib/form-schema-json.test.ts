import { describe, expect, it } from "vitest";
import {
  parseFormSchemaFile,
  serializeFormSchema,
} from "@/lib/form-schema-json";
import type { FormSchema } from "@/lib/form-schemas";

const MINIMAL_WAIVER = {
  id: "waiver-confidentiality",
  title: "טופס ויתור סודיות",
  folder: "טופס ויתור סודיות",
  categoryFolder: "אינפורמציה כללית",
  simplesign: {
    lockedKeys: ["student_name", "father_signature"],
  },
  sections: [
    {
      fields: [
        {
          key: "student_name",
          label: "אנו הורי התלמיד/ה",
          required: true,
          shared: true,
          studentKey: "full_name",
        },
        {
          key: "father_signature",
          label: "חתימת האב",
          type: "signature",
        },
      ],
    },
  ],
};

describe("parseFormSchemaFile", () => {
  it("loads a form JSON into FormSchema and locked keys", () => {
    const { schema, lockedKeys } = parseFormSchemaFile(
      MINIMAL_WAIVER,
      "waiver-confidentiality.json"
    );

    expect(schema.id).toBe("waiver-confidentiality");
    expect(schema.sections[0]?.fields[0]?.key).toBe("student_name");
    expect(schema.sections[0]?.fields[0]?.shared).toBe(true);
    expect(lockedKeys).toEqual(["student_name", "father_signature"]);
  });

  it("rejects a file whose id does not match the filename", () => {
    expect(() =>
      parseFormSchemaFile(MINIMAL_WAIVER, "other-form.json")
    ).toThrow(/waiver-confidentiality/);
  });

  it("expands func-scale into a 1–9 select", () => {
    const { schema } = parseFormSchemaFile(
      {
        id: "sample",
        title: "דוגמה",
        folder: "דוגמה",
        categoryFolder: "אינפורמציה כללית",
        sections: [
          {
            fields: [{ key: "func_reading", label: "קריאה", type: "func-scale" }],
          },
        ],
      },
      "sample.json"
    );
    const field = schema.sections[0]?.fields[0];
    expect(field?.type).toBe("select");
    expect(field?.options?.map((o) => o.value)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
  });

  it("rejects locked keys that are missing from the form", () => {
    expect(() =>
      parseFormSchemaFile(
        {
          ...MINIMAL_WAIVER,
          simplesign: { lockedKeys: ["student_name", "missing_key"] },
        },
        "waiver-confidentiality.json"
      )
    ).toThrow(/missing_key/);
  });

  it("allows locking exclusive-select option checkbox keys", () => {
    const { lockedKeys } = parseFormSchemaFile(
      {
        id: "sample",
        title: "דוגמה",
        folder: "דוגמה",
        categoryFolder: "אינפורמציה כללית",
        simplesign: { lockedKeys: ["gender_male", "gender_female"] },
        sections: [
          {
            fields: [
              {
                key: "gender",
                label: "המין",
                type: "select",
                options: [
                  { value: "male", label: "זכר" },
                  { value: "female", label: "נקבה" },
                ],
              },
            ],
          },
        ],
      },
      "sample.json"
    );
    expect(lockedKeys).toEqual(["gender_male", "gender_female"]);
  });
});

describe("serializeFormSchema", () => {
  it("round-trips a parsed schema including locked keys", () => {
    const parsed = parseFormSchemaFile(
      MINIMAL_WAIVER,
      "waiver-confidentiality.json"
    );
    const json = serializeFormSchema(parsed.schema, parsed.lockedKeys);
    const again = parseFormSchemaFile(json, "waiver-confidentiality.json");
    expect(again.schema).toEqual(parsed.schema);
    expect(again.lockedKeys).toEqual(parsed.lockedKeys);
  });

  it("serializes a 1–9 func select back to func-scale", () => {
    const schema: FormSchema = {
      id: "sample",
      title: "דוגמה",
      folder: "דוגמה",
      categoryFolder: "אינפורמציה כללית",
      sections: [
        {
          fields: [
            {
              key: "func_reading",
              label: "קריאה",
              type: "select",
              options: Array.from({ length: 9 }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              })),
            },
          ],
        },
      ],
    };
    const json = serializeFormSchema(schema, null);
    expect(json.sections[0]?.fields[0]?.type).toBe("func-scale");
    expect(json.sections[0]?.fields[0]?.options).toBeUndefined();
  });
});
