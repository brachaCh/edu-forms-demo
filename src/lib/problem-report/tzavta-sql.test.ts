import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "docs/tzavta-giti-bug-report.sql"),
  "utf8"
);

function insertBlock(table: string): string {
  const match = sql.match(
    new RegExp(`INSERT INTO ${table} \\([\\s\\S]*?VALUES \\([\\s\\S]*?\\);`)
  );
  if (!match?.[0]) {
    throw new Error(`missing INSERT INTO ${table}`);
  }
  return match[0];
}

describe("create_giti_bug_report SQL privacy contract", () => {
  it("mirrors report body into bugs.description for Tzavta staff UI", () => {
    const bugsInsert = insertBlock("bugs");
    expect(bugsInsert).toContain("'דיווח מפרוטוקל'");
    expect(bugsInsert).toMatch(/btrim\(p_description\)/);
    expect(bugsInsert).not.toMatch(/v_path/);
    expect(bugsInsert).not.toMatch(/v_browser/);
  });

  it("stores description, path and user-agent only on bug_reporter_contacts", () => {
    const contactsInsert = insertBlock("bug_reporter_contacts");
    expect(contactsInsert).toMatch(/description/);
    expect(contactsInsert).toMatch(/page_path/);
    expect(contactsInsert).toMatch(/browser/);
    expect(contactsInsert).toMatch(/p_description/);
    expect(contactsInsert).toMatch(/v_path/);
    expect(contactsInsert).toMatch(/v_browser/);
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.bug_reporter_contacts FROM anon, authenticated/
    );
    expect(sql).toMatch(
      /ENABLE ROW LEVEL SECURITY/
    );
  });

  it("refuses public /fill and /sign paths inside the RPC", () => {
    expect(sql).toMatch(/\^\/\(fill\|sign\)\(\/\|\$\)/);
  });

  it("wraps the script in a single transaction so REVOKEs cannot be skipped", () => {
    const executable = sql
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");
    expect(executable).toMatch(/^\s*BEGIN;/);
    expect(executable.trimEnd()).toMatch(/COMMIT;\s*$/);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(
      sql.match(/SET search_path = public, pg_temp/g)?.length
    ).toBe(2);
  });
});
