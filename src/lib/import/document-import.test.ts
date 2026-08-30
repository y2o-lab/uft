import { describe, expect, it } from "vitest";
import { cloneWorkspace, defaultWorkspace } from "../domain/workspace";
import {
  addImportedDocument,
  importDocuments,
  importFileName,
  nextImportName,
  validateDocumentFile,
  validateDocumentFiles,
} from "./document-import";

function file(name: string, size = 20): File {
  return new File([new Uint8Array(size)], name);
}

describe("document import", () => {
  it("accepts supported extensions and maps container variants", () => {
    expect(validateDocumentFile(file("report.docm"))).toEqual({
      valid: true,
      format: "docx",
    });
    expect(validateDocumentFile(file("slides.ppsm"))).toEqual({
      valid: true,
      format: "pptx",
    });
    expect(validateDocumentFile(file("sheet.xlsb"))).toEqual({
      valid: true,
      format: "xlsx",
    });
    expect(validateDocumentFile(file("archive.zip"))).toMatchObject({
      valid: false,
    });
    expect(
      validateDocumentFile(
        new File(["not a PDF"], "mismatch.pdf", { type: "text/html" }),
      ),
    ).toMatchObject({ valid: false });
  });

  it("normalizes output names and avoids names already in imports", () => {
    expect(importFileName(" My / report?.docx ")).toBe("My - report-.md");
    expect(nextImportName("meeting.docx", ["meeting.md", "meeting-2.md"])).toBe(
      "meeting-3.md",
    );
  });

  it("marks files exceeding the selected total limit independently", () => {
    const tooLarge = 201 * 1024 * 1024;
    expect(validateDocumentFiles([file("one.pdf", tooLarge)])).toMatchObject([
      { valid: false },
    ]);
  });

  it("creates editable Markdown documents in imports with unique paths", () => {
    const workspace = cloneWorkspace(defaultWorkspace);
    const first = addImportedDocument(workspace, "meeting.docx", "# First");
    const second = addImportedDocument(workspace, "meeting.docx", "# Second");
    expect(first.path).toBe("imports/meeting.md");
    expect(second.path).toBe("imports/meeting-2.md");
    expect(workspace.documents[second.id]?.content).toBe("# Second");
  });

  it("keeps successful conversions when a later document fails", async () => {
    const workspace = cloneWorkspace(defaultWorkspace);
    const results = await importDocuments({
      workspace,
      files: [file("ok.docx"), file("bad.docx")],
      convert: async (candidate) => {
        if (candidate.name === "bad.docx") {
          const error = new Error("broken") as Error & { code: string };
          error.code = "malformed";
          throw error;
        }
        return "# Imported";
      },
    });
    expect(results.map((result) => result.status)).toEqual([
      "imported",
      "failed",
    ]);
    expect(
      workspace.entries.some((entry) => entry.path === "imports/ok.md"),
    ).toBe(true);
    expect(results[1]?.reason).toContain("破損");
  });

  it("stops unstarted conversions when cancelled", async () => {
    const workspace = cloneWorkspace(defaultWorkspace);
    const controller = new AbortController();
    const results = await importDocuments({
      workspace,
      files: [file("first.docx"), file("second.docx")],
      signal: controller.signal,
      convert: async () => {
        controller.abort();
        throw new DOMException("cancelled", "AbortError");
      },
    });
    expect(results.map((result) => result.status)).toEqual([
      "cancelled",
      "cancelled",
    ]);
    expect(workspace.entries.some((entry) => entry.path === "imports")).toBe(
      false,
    );
  });
});
