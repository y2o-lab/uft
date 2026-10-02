import { describe, expect, it } from "vitest";
import { cloneWorkspace, defaultWorkspace } from "../domain/workspace";
import { MAX_CONTENT_BYTES, validateInput } from "./markdown-tools";
import { contentRange, versionToken } from "./version";

describe("WebMCP contracts", () => {
  it.each([
    null,
    [],
    {},
    { workspaceId: "default", extra: true },
    { workspaceId: "default", offset: -1 },
    { workspaceId: "default", offset: 1.5 },
    { workspaceId: "default", limit: 21 },
    { workspaceId: "default", offset: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects malformed list input %j", (input) => {
    expect(() => validateInput(0, input)).toThrow("INVALID_INPUT");
  });
  it.each([
    "",
    "  ",
    ".",
    "..",
    "bad/name",
    "bad\\name",
    "bad\nname",
    "\tname",
    "a".repeat(256),
    "a".repeat(253),
  ])("rejects unsafe or excessive names %j", (name) => {
    expect(() =>
      validateInput(3, {
        workspaceId: "default",
        name,
        content: "",
        requestId: "create",
      }),
    ).toThrow("INVALID_INPUT");
  });
  it("measures the input byte budget in UTF-8", () => {
    expect(() =>
      validateInput(3, {
        workspaceId: "default",
        name: "valid",
        content: "🤖".repeat(MAX_CONTENT_BYTES / 4 + 1),
        requestId: "create",
      }),
    ).toThrow("INVALID_INPUT");
    expect(
      validateInput(3, {
        workspaceId: "default",
        name: "a".repeat(252),
        content: "a".repeat(MAX_CONTENT_BYTES),
        requestId: "create",
      }).content?.length,
    ).toBe(MAX_CONTENT_BYTES);
  });
  it("paginates long Unicode content without loss or split surrogates", () => {
    const content = `${"abc🤖".repeat(800)}終`;
    let offset = 0;
    let assembled = "";
    while (offset < content.length) {
      const part = contentRange(content, offset, 1000);
      expect(part.offset).toBe(offset);
      expect(part.content).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
      assembled += part.content;
      offset = part.nextOffset ?? content.length;
    }
    expect(assembled).toBe(content);
    expect(contentRange(content, 100000, 1000).content).toBe("");
    expect(contentRange("🤖x", 1, 1)).toMatchObject({
      content: "🤖",
      offset: 0,
      nextOffset: 2,
    });
  });
  it("binds tokens to local/persisted content, deletion and document identity", async () => {
    const local = cloneWorkspace(defaultWorkspace);
    const stored = cloneWorkspace(local);
    const original = await versionToken(local, stored, "overview");
    stored.documents.overview.content = "different but same revision and time";
    expect(await versionToken(local, stored, "overview")).not.toBe(original);
    expect(await versionToken(local, undefined, "overview")).not.toBe(original);
    expect(await versionToken(local, local, "other")).not.toBe(original);
    local.entries[1].deletedAt = "deleted";
    expect(await versionToken(local, stored, "overview")).not.toBe(original);
  });
});
