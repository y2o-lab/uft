import { childPath } from "../domain/tree";
import {
  cloneWorkspace,
  type Workspace,
  type WorkspaceEntry,
} from "../domain/workspace";
import type {
  RequestReceipt,
  WorkspaceRepository,
} from "../storage/workspace-repository";
import { MAX_CONTENT_BYTES, type ToolInput } from "../webmcp/markdown-tools";
import { CommandError, type ToolResult } from "../webmcp/types";
import {
  contentRange,
  digest,
  documentVersion,
  markdownEntry,
  sameVersion,
  versionToken,
} from "../webmcp/version";
import { createEntry, updateDocument } from "./workspace-service";
import { mergeWorkspaces } from "./workspace-sync";

export type WorkspaceCommandContext = {
  getWorkspace: () => Workspace | null;
  getRepository: () => WorkspaceRepository | null;
  isEnabled: () => boolean;
  getSelection: () => string | null;
  applySaved: (workspace: Workspace, selected?: string) => void;
  confirm: (
    before: string,
    after: string,
    signal: AbortSignal,
  ) => Promise<boolean>;
  guard: (entryId: string | null, busy: boolean) => void;
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>;
};
export type WorkspaceCommands = {
  execute: (
    index: number,
    input: ToolInput,
    signal: AbortSignal,
  ) => Promise<ToolResult>;
};

export function createWorkspaceCommands(
  context: WorkspaceCommandContext,
): WorkspaceCommands {
  let mutating = false;
  function current(input: ToolInput, signal: AbortSignal) {
    if (signal.aborted) throw new CommandError("CANCELLED");
    const workspace = context.getWorkspace();
    if (workspace && workspace.id !== input.workspaceId)
      throw new CommandError("WORKSPACE_CHANGED");
    const repository = context.getRepository();
    if (!workspace || !repository || !context.isEnabled())
      throw new CommandError("NOT_READY");
    return { workspace, repository };
  }
  async function snapshot(input: ToolInput, signal: AbortSignal) {
    // Hash asynchronously, then verify the local version did not change meanwhile.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { workspace, repository } = current(input, signal);
      const local = cloneWorkspace(workspace);
      markdownEntry(local, input.entryId ?? "");
      const stored = await repository.read(local.id);
      const token = await versionToken(local, stored, input.entryId ?? "");
      const latest = current(input, signal).workspace;
      if (
        sameVersion(
          documentVersion(local, input.entryId ?? ""),
          documentVersion(latest, input.entryId ?? ""),
        )
      )
        return { local, stored, token };
    }
    throw new CommandError("BUSY");
  }
  function replay(
    receipts: RequestReceipt[],
    input: ToolInput,
    fingerprint: string,
  ) {
    const receipt = receipts.find((item) => item.requestId === input.requestId);
    if (!receipt) return null;
    if (receipt.fingerprint !== fingerprint)
      throw new CommandError("REQUEST_ID_REUSED");
    return { ...receipt.result, replayed: true } as ToolResult;
  }
  async function execute(
    index: number,
    input: ToolInput,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const { workspace, repository } = current(input, signal);
    if (index === 0) {
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 5;
      const entries = workspace.entries
        .filter((item) => !item.deletedAt && item.workspaceId === workspace.id)
        .sort(
          (a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id),
        );
      const documents = entries
        .filter((item) => item.kind === "markdown")
        .map((item) => ({
          entryId: item.id,
          path: item.path,
          parentId: item.parentId,
          revision: workspace.documents[item.id]?.revision,
          updatedAt: workspace.documents[item.id]?.updatedAt,
        }));
      const folders = entries
        .filter((item) => item.kind === "folder")
        .map((item) => ({ parentId: item.id, path: item.path }));
      return {
        ok: true,
        data: {
          workspaceId: workspace.id,
          selectedEntryId: context.getSelection(),
          documents: documents.slice(offset, offset + limit),
          folders: folders.slice(offset, offset + limit),
          nextOffset: offset + limit < documents.length ? offset + limit : null,
          nextFolderOffset:
            offset + limit < folders.length ? offset + limit : null,
        },
      };
    }
    if (index === 1) {
      const state = await snapshot(input, signal);
      const doc = state.local.documents[input.entryId ?? ""];
      return {
        ok: true,
        data: {
          workspaceId: workspace.id,
          entryId: input.entryId,
          revision: doc.revision,
          versionToken: state.token,
          ...contentRange(doc.content, input.offset ?? 0, input.limit ?? 1000),
        },
      };
    }
    if (mutating) throw new CommandError("BUSY");
    mutating = true;
    let guarded = false;
    try {
      const fingerprint = await digest({
        index,
        input: Object.fromEntries(
          Object.entries(input).sort(([a], [b]) => a.localeCompare(b)),
        ),
      });
      current(input, signal);
      if (index >= 3) {
        const prior = replay(
          await repository.receipts(input.workspaceId),
          input,
          fingerprint,
        );
        current(input, signal);
        if (prior) return prior;
      }
      const state = index === 4 ? await snapshot(input, signal) : null;
      if (state && state.token !== input.versionToken) {
        const prior = replay(
          await repository.receipts(input.workspaceId),
          input,
          fingerprint,
        );
        current(input, signal);
        if (prior) return prior;
        throw new CommandError("CONFLICT");
      }
      if (
        state &&
        new TextEncoder().encode(
          state.local.documents[input.entryId ?? ""].content,
        ).length > MAX_CONTENT_BYTES
      )
        throw new CommandError("INVALID_INPUT");
      if (
        state &&
        !(await context.confirm(
          state.local.documents[input.entryId ?? ""].content,
          input.content ?? "",
          signal,
        ))
      )
        throw new CommandError("CANCELLED");
      return await context.enqueue(async () => {
        current(input, signal);
        if (index >= 3) {
          const prior = replay(
            await repository.receipts(input.workspaceId),
            input,
            fingerprint,
          );
          current(input, signal);
          if (prior) return prior;
        }
        const latest = current(input, signal).workspace;
        context.guard(input.entryId ?? null, true);
        guarded = true;
        const local = cloneWorkspace(latest);
        let candidate: Workspace;
        let entryId = input.entryId ?? "";
        if (state) {
          if (
            !sameVersion(
              documentVersion(state.local, entryId),
              documentVersion(local, entryId),
            )
          )
            throw new CommandError("CONFLICT");
          markdownEntry(local, entryId);
          candidate = cloneWorkspace(local);
          const selection = candidate.lastOpenedEntryId;
          updateDocument(candidate, entryId, input.content ?? "");
          candidate.lastOpenedEntryId = selection;
          const before = state.local.documents[entryId];
          const persisted = state.stored?.documents[entryId];
          const timestamp = new Date(
            Math.max(
              Date.now(),
              Date.parse(before.updatedAt) + 1,
              Date.parse(markdownEntry(state.local, entryId).updatedAt) + 1,
              Date.parse(
                documentVersion(state.stored, entryId)?.entryUpdatedAt ??
                  before.updatedAt,
              ) + 1,
              Date.parse(persisted?.updatedAt ?? before.updatedAt) + 1,
            ),
          ).toISOString();
          candidate.documents[entryId].updatedAt = timestamp;
          markdownEntry(candidate, entryId).updatedAt = timestamp;
          candidate.updatedAt = timestamp;
        } else if (index === 3) {
          candidate = cloneWorkspace(local);
          const name = input.name?.trim() ?? "";
          const normalized = /\.md$/i.test(name) ? name : `${name}.md`;
          let entry: WorkspaceEntry;
          try {
            entry = createEntry(
              candidate,
              "markdown",
              input.parentId ?? null,
              normalized,
            );
          } catch {
            throw new CommandError("INVALID_INPUT");
          }
          entryId = entry.id;
          candidate.documents[entryId].content = input.content ?? "";
          candidate.lastOpenedEntryId = entryId;
        } else {
          markdownEntry(local, entryId);
          candidate = local;
          candidate.lastOpenedEntryId = entryId;
        }
        const token =
          index >= 3
            ? await versionToken(candidate, candidate, entryId)
            : undefined;
        current(input, signal);
        const result: ToolResult = {
          ok: true,
          data: {
            workspaceId: local.id,
            entryId,
            path: markdownEntry(candidate, entryId).path,
            revision: candidate.documents[entryId].revision,
            ...(token ? { versionToken: token } : {}),
            saved: true,
          },
        };
        const committed = await repository.atomic<{
          saved: Workspace | null;
          response: ToolResult;
        }>(
          local.id,
          (stored, receipts) => {
            const live = current(input, signal).workspace;
            if (index >= 3) {
              const prior = replay(receipts, input, fingerprint);
              if (prior)
                return {
                  workspace: null,
                  result: { saved: null, response: prior },
                };
            }
            if (
              state &&
              !sameVersion(
                documentVersion(state.local, entryId),
                documentVersion(live, entryId),
              )
            )
              throw new CommandError("CONFLICT");
            if (
              state &&
              !sameVersion(
                documentVersion(state.stored, entryId),
                documentVersion(stored, entryId),
              )
            )
              throw new CommandError("CONFLICT");
            const merged = stored
              ? mergeWorkspaces(stored, live)
              : cloneWorkspace(live);
            if (index === 3) {
              const entry = { ...markdownEntry(candidate, entryId) };
              const parent = entry.parentId
                ? merged.entries.find(
                    (item) =>
                      item.id === entry.parentId &&
                      !item.deletedAt &&
                      item.kind === "folder" &&
                      item.workspaceId === merged.id,
                  )
                : true;
              if (
                !parent ||
                merged.entries.some(
                  (item) =>
                    !item.deletedAt &&
                    item.parentId === entry.parentId &&
                    item.name.toLocaleLowerCase() ===
                      entry.name.toLocaleLowerCase(),
                )
              )
                throw new CommandError("INVALID_INPUT");
              entry.path = childPath(
                parent === true ? null : parent,
                entry.name,
              );
              entry.sortOrder = merged.entries.filter(
                (item) => !item.deletedAt && item.parentId === entry.parentId,
              ).length;
              merged.entries.push(entry);
              merged.documents[entryId] = candidate.documents[entryId];
            } else {
              markdownEntry(merged, entryId);
              if (state) {
                merged.documents[entryId] = candidate.documents[entryId];
                const entry = markdownEntry(merged, entryId);
                entry.updatedAt = candidate.documents[entryId].updatedAt;
              }
            }
            if (index !== 4) merged.lastOpenedEntryId = entryId;
            merged.updatedAt =
              candidate.updatedAt > merged.updatedAt
                ? candidate.updatedAt
                : merged.updatedAt;
            result.data.path = markdownEntry(merged, entryId).path;
            result.data.revision = merged.documents[entryId].revision;
            return {
              workspace: merged,
              result: { saved: merged, response: result },
              ...(index >= 3
                ? {
                    receipt: {
                      requestId: input.requestId ?? "",
                      fingerprint,
                      result,
                    },
                  }
                : {}),
            };
          },
          signal,
        );
        // Commit is authoritative: a cancellation arriving now must not claim rollback.
        if (committed.saved)
          context.applySaved(
            committed.saved,
            index === 4 ? undefined : entryId,
          );
        return committed.response;
      });
    } finally {
      if (guarded) context.guard(null, false);
      mutating = false;
    }
  }
  return { execute };
}
