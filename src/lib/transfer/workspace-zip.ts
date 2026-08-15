import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { normalizePath } from "../domain/tree";
import {
  type Asset,
  cloneWorkspace,
  newId,
  type Workspace,
} from "../domain/workspace";
import type { WorkspaceRepository } from "../storage/workspace-repository";

export const ZIP_FORMAT_VERSION = 1;
export const MAX_ZIP_BYTES = 200 * 1024 * 1024;
export const MAX_UNZIPPED_BYTES = 500 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 2_000;

export type ZipManifest = {
  formatVersion: number;
  workspace: Pick<Workspace, "id" | "name" | "createdAt" | "updatedAt">;
  files: Array<{
    path: string;
    mime: string;
    checksum: string;
    size: number;
    assetId?: string;
  }>;
};

async function checksum(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function exportWorkspace(
  workspace: Workspace,
  repository: WorkspaceRepository,
): Promise<Blob> {
  const output: Record<string, Uint8Array> = {};
  const files: ZipManifest["files"] = [];
  for (const entry of workspace.entries.filter(
    (item) => !item.deletedAt && item.kind === "markdown",
  )) {
    const content = workspace.documents[entry.id]?.content ?? "";
    const bytes = strToU8(content);
    output[entry.path] = bytes;
    files.push({
      path: entry.path,
      mime: "text/markdown",
      checksum: await checksum(bytes),
      size: bytes.byteLength,
    });
  }
  for (const entry of workspace.entries.filter(
    (item) => !item.deletedAt && item.kind === "diagram",
  )) {
    const diagram = workspace.diagrams[entry.id];
    if (!diagram) continue;
    const path = `diagrams/${entry.name.replace(/\.[^.]+$/, "")}.uft.json`;
    const bytes = strToU8(JSON.stringify(diagram));
    output[path] = bytes;
    files.push({
      path,
      mime: "application/vnd.uft.diagram+json",
      checksum: await checksum(bytes),
      size: bytes.byteLength,
    });
  }
  for (const asset of workspace.assets) {
    const data = await repository.getAsset(asset.id);
    if (!data) continue;
    const bytes = new Uint8Array(data);
    output[asset.path] = bytes;
    files.push({
      path: asset.path,
      mime: asset.mediaType,
      checksum: await checksum(bytes),
      size: bytes.byteLength,
      assetId: asset.id,
    });
  }
  const manifest: ZipManifest = {
    formatVersion: ZIP_FORMAT_VERSION,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    },
    files,
  };
  output["uft-manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return new Blob([zipSync(output, { level: 6 })], { type: "application/zip" });
}

function safeZipEntries(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.byteLength > MAX_ZIP_BYTES)
    throw new Error("ZIP は 200 MB 以下にしてください。");
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("ZIP を読み取れません。壊れている可能性があります。");
  }
  const paths = Object.keys(entries);
  if (paths.length > MAX_ZIP_ENTRIES)
    throw new Error("ZIP 内のファイル数が上限を超えています。");
  let total = 0;
  for (const path of paths) {
    if (normalizePath(path) !== path || path.startsWith("/"))
      throw new Error("安全でない ZIP パスが含まれています。");
    total += entries[path]?.byteLength ?? 0;
  }
  if (total > MAX_UNZIPPED_BYTES)
    throw new Error("ZIP の展開サイズが上限を超えています。");
  return entries;
}

export async function importWorkspace(
  blob: Blob,
): Promise<{ workspace: Workspace; binaries: Map<string, ArrayBuffer> }> {
  const entries = safeZipEntries(new Uint8Array(await blob.arrayBuffer()));
  const manifestBytes = entries["uft-manifest.json"];
  if (!manifestBytes) throw new Error("uft-manifest.json がありません。");
  let manifest: ZipManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as ZipManifest;
  } catch {
    throw new Error("マニフェスト JSON が不正です。");
  }
  if (
    manifest.formatVersion !== ZIP_FORMAT_VERSION ||
    !manifest.workspace?.name ||
    !Array.isArray(manifest.files)
  )
    throw new Error("対応していないワークスペース形式です。");
  const source = cloneWorkspace({
    id: newId("workspace"),
    name: manifest.workspace.name,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastOpenedEntryId: null,
    entries: [],
    documents: {},
    assets: [],
    diagrams: {},
  });
  const directories = new Map<string, string>();
  const addDirectories = (path: string) => {
    let parentId: string | null = null;
    let current = "";
    for (const name of path.split("/").slice(0, -1)) {
      current = current ? `${current}/${name}` : name;
      let id = directories.get(current);
      if (!id) {
        id = newId("folder");
        directories.set(current, id);
        source.entries.push({
          id,
          workspaceId: source.id,
          parentId,
          kind: "folder",
          name,
          path: current,
          sortOrder: source.entries.length,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
          deletedAt: null,
        });
      }
      parentId = id;
    }
    return parentId;
  };
  const binaries = new Map<string, ArrayBuffer>();
  for (const file of manifest.files) {
    const content = entries[file.path];
    if (!content || (await checksum(content)) !== file.checksum)
      throw new Error(`ファイル検証に失敗しました: ${file.path}`);
    const parentId = addDirectories(file.path);
    if (file.path.endsWith(".md")) {
      const id = newId("markdown");
      const name = file.path.split("/").at(-1);
      if (!name) throw new Error(`ファイル名が不正です: ${file.path}`);
      source.entries.push({
        id,
        workspaceId: source.id,
        parentId,
        kind: "markdown",
        name,
        path: file.path,
        sortOrder: source.entries.length,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
        deletedAt: null,
      });
      source.documents[id] = {
        entryId: id,
        content: strFromU8(content),
        revision: 1,
        updatedAt: source.updatedAt,
      };
      source.lastOpenedEntryId ??= id;
    } else if (
      file.path.startsWith("diagrams/") &&
      file.path.endsWith(".uft.json")
    ) {
      const diagram = JSON.parse(strFromU8(content));
      if (!diagram.graph?.nodes || !Array.isArray(diagram.graph.nodes))
        throw new Error(`図表データが不正です: ${file.path}`);
      const id = newId("diagram");
      const fileName = file.path.split("/").at(-1);
      if (!fileName) throw new Error(`図表名が不正です: ${file.path}`);
      const name = fileName.replace(".uft.json", "");
      source.entries.push({
        id,
        workspaceId: source.id,
        parentId,
        kind: "diagram",
        name,
        path: `diagrams/${name}`,
        sortOrder: source.entries.length,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
        deletedAt: null,
      });
      source.diagrams[id] = { ...diagram, entryId: id };
    } else if (file.path.startsWith("assets/")) {
      const id = newId("asset");
      const asset: Asset = {
        id,
        workspaceId: source.id,
        path: file.path,
        mediaType: file.mime,
        byteSize: content.byteLength,
        checksum: file.checksum,
        createdAt: source.createdAt,
      };
      source.assets.push(asset);
      binaries.set(
        id,
        content.buffer.slice(
          content.byteOffset,
          content.byteOffset + content.byteLength,
        ) as ArrayBuffer,
      );
    }
  }
  if (!Object.keys(source.documents).length)
    throw new Error("Markdown 文書を含む ZIP を選択してください。");
  return { workspace: source, binaries };
}

export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
