import { expect, it } from "vitest";
import { cloneWorkspace, defaultWorkspace } from "../domain/workspace";
import { updateDocument } from "./workspace-service";
import { mergeWorkspaces } from "./workspace-sync";

it("manual Undo after a tool update always advances the version timestamp", () => {
  const saved = cloneWorkspace(defaultWorkspace);
  saved.documents.overview.content = "# Agent";
  saved.documents.overview.updatedAt = new Date(
    Date.now() + 1000,
  ).toISOString();
  saved.entries[1].updatedAt = saved.documents.overview.updatedAt;
  const local = cloneWorkspace(saved);
  updateDocument(local, "overview", "# Undo");
  expect(
    local.documents.overview.updatedAt > saved.documents.overview.updatedAt,
  ).toBe(true);
  expect(mergeWorkspaces(saved, local).documents.overview.content).toBe(
    "# Undo",
  );
});
