import { describe, expect, it, vi } from "vitest";
import { assertReadOnly, MondayReadClient, MondayWriteBlockedError } from "@/lib/monday/client";
import { MASTER_COLUMNS, mapMasterItem, mapTaskItem } from "@/lib/monday/source";
import { DEFAULT_RULES } from "@/lib/rules/config";

describe("read-only guard", () => {
  it("allows queries", () => {
    expect(() => assertReadOnly("query { boards { id } }")).not.toThrow();
    expect(() => assertReadOnly("{ me { id } }")).not.toThrow();
  });
  it.each([
    "mutation { delete_item(item_id: 1) { id } }",
    "mutation M { change_column_value(board_id:1,item_id:1,column_id:\"s\",value:\"{}\") { id } }",
    "query { boards { id } } mutation { archive_board(board_id: 1) { id } }",
    "subscription { x }",
  ])("blocks %s", (doc) => {
    expect(() => assertReadOnly(doc)).toThrow(MondayWriteBlockedError);
  });
  it("never sends a mutation over the network", async () => {
    const fetchImpl = vi.fn();
    const c = new MondayReadClient({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(c.query("mutation { create_item(board_id:1,item_name:\"x\") { id } }")).rejects.toThrow(MondayWriteBlockedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("retry / rate limits", () => {
  it("retries 429 then succeeds", async () => {
    const responses = [
      new Response("", { status: 429, headers: { "retry-after": "0" } }),
      new Response(JSON.stringify({ errors: [{ message: "Complexity budget exhausted", extensions: { code: "ComplexityException", retry_in_seconds: 0 } }] }), { status: 200 }),
      new Response(JSON.stringify({ data: { ok: 1 } }), { status: 200 }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const c = new MondayReadClient({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    await expect(c.query("query { me { id } }")).resolves.toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("gives up after max retries", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 503 }));
    const c = new MondayReadClient({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, maxRetries: 2 });
    await expect(c.query("query { me { id } }")).rejects.toThrow(/503/);
  });
});

describe("column allowlist", () => {
  it("contains no sensitive columns", () => {
    const ids = Object.values(MASTER_COLUMNS);
    for (const banned of ["text_mm7h3814", "text_mm7hyy6v", "date_mm7hgvh5", "file_mm7hyv83", "text_mm7h93gm", "text_mkp1qn6t"]) expect(ids).not.toContain(banned);
  });
  it("maps a master item and ignores unknown columns", () => {
    const c = mapMasterItem({
      id: "1", name: "X", url: "u", created_at: "2026-01-01", updated_at: "2026-01-02", group: { title: "New Clients" },
      column_values: [
        { id: "color_mm394d4d", text: "Onboarding", type: "status" },
        { id: "numeric_mkqqbp1w", text: "25000", type: "numbers" },
        { id: "boolean_mkp4cb2q", text: "v", type: "checkbox" },
        { id: "link_to_properties2", text: "", type: "board_relation", linked_item_ids: ["p1"] },
        { id: "text_mm7h3814", text: "SECRET-ACCOUNT", type: "text" },
      ],
    });
    expect(c.masterStatus).toBe("Onboarding");
    expect(c.upfrontPaymentMade).toBe(25000);
    expect(c.signedAgreement).toBe(true);
    expect(c.linkedPropertyIds).toEqual(["p1"]);
    expect(JSON.stringify(c)).not.toContain("SECRET");
  });
  it("picks the real status column, not an 'Assignee' status column", () => {
    const t = mapTaskItem({ id: "t", name: "Task", url: "u", created_at: "a", updated_at: "b", group: null, column_values: [
      { id: "color_assignee", text: "Jann", type: "status" },
      { id: "status", text: "Stuck", type: "status" },
    ] }, "b1", null, DEFAULT_RULES);
    expect(t.state).toBe("blocked");
    expect(t.owner).toBe("Jann");
  });
});
