import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { validateDiagramDocument } from "../diagrams/diagram";
import { normalizePath } from "../domain/tree";
import {
  type Asset,
  cloneWorkspace,
  newId,
  WORKSPACE_SCHEMA_VERSION,
  type Workspace,
} from "../domain/workspace";
import type { WorkspaceRepository } from "../storage/workspace-repository";

export const ZIP_FORMAT_VERSION = 1;
export const MAX_ZIP_BYTES = 200 * 1024 * 1024;
export const MAX_UNZIPPED_BYTES = 500 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 2_000;
const FOLDER_MARKER_PREFIX = "folders/";
const FOLDER_MARKER_SUFFIX = ".uft-folder";
const FOLDER_MARKER_MIME = "application/vnd.uft.folder";

export type ZipManifest = {
  formatVersion: number;
  workspace: Pick<Workspace, "id" | "name" | "createdAt" | "updatedAt">;
  files: Array<{
    path: string;
    mime: string;
    checksum: string;
    size: number;
    assetId?: string;
    entry?: { kind: "folder" | "markdown" | "diagram"; sortOrder: number };
  }>;
};

function isFolderMarker(path: string): boolean {
  return (
    path.startsWith(FOLDER_MARKER_PREFIX) && path.endsWith(FOLDER_MARKER_SUFFIX)
  );
}

function folderPathFromMarker(path: string): string {
  return path
    .slice(FOLDER_MARKER_PREFIX.length)
    .slice(0, -FOLDER_MARKER_SUFFIX.length);
}

function validateManifest(
  value: unknown,
  archive: Record<string, Uint8Array>,
): asserts value is ZipManifest {
  if (!value || typeof value !== "object")
    throw new Error("マニフェスト JSON が不正です。");
  const manifest = value as Partial<ZipManifest>;
  if (
    manifest.formatVersion !== ZIP_FORMAT_VERSION ||
    !manifest.workspace ||
    typeof manifest.workspace.name !== "string" ||
    !manifest.workspace.name.trim() ||
    !Array.isArray(manifest.files)
  )
    throw new Error("対応していないワークスペース形式です。");

  const listedPaths = new Set<string>();
  for (const file of manifest.files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      normalizePath(file.path) !== file.path ||
      file.path === "uft-manifest.json" ||
      typeof file.mime !== "string" ||
      typeof file.checksum !== "string" ||
      !/^[a-f0-9]{64}$/i.test(file.checksum) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      (file.assetId !== undefined && typeof file.assetId !== "string") ||
      (file.entry !== undefined &&
        (!file.entry ||
          !["folder", "markdown", "diagram"].includes(file.entry.kind) ||
          !Number.isSafeInteger(file.entry.sortOrder) ||
          file.entry.sortOrder < 0))
    )
      throw new Error("マニフェスト内のファイル情報が不正です。");
    if (listedPaths.has(file.path))
      throw new Error(`ZIP 内のファイルパスが重複しています: ${file.path}`);
    if (
      !file.path.endsWith(".md") &&
      !(file.path.startsWith("diagrams/") && file.path.endsWith(".uft.json")) &&
      !isFolderMarker(file.path) &&
      !file.path.startsWith("assets/")
    )
      throw new Error(`対応していない ZIP ファイルです: ${file.path}`);
    const content = archive[file.path];
    if (!content || content.byteLength !== file.size)
      throw new Error(`ファイル検証に失敗しました: ${file.path}`);
    if (
      isFolderMarker(file.path) &&
      (file.mime !== FOLDER_MARKER_MIME ||
        file.size !== 0 ||
        file.assetId !== undefined ||
        file.entry?.kind !== "folder" ||
        normalizePath(folderPathFromMarker(file.path)) !==
          folderPathFromMarker(file.path))
    )
      throw new Error(`フォルダ情報が不正です: ${file.path}`);
    listedPaths.add(file.path);
  }
  for (const path of Object.keys(archive)) {
    if (path !== "uft-manifest.json" && !listedPaths.has(path))
      throw new Error(
        `マニフェストにない ZIP ファイルが含まれています: ${path}`,
      );
  }
}

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
  const snapshot = cloneWorkspace(workspace);
  const output: Record<string, Uint8Array> = {};
  const files: ZipManifest["files"] = [];
  const addFile = async (
    path: string,
    bytes: Uint8Array,
    mime: string,
    assetId?: string,
    entry?: ZipManifest["files"][number]["entry"],
  ) => {
    if (normalizePath(path) !== path || path in output)
      throw new Error(`ZIP 内のファイルパスが重複または不正です: ${path}`);
    output[path] = bytes;
    files.push({
      path,
      mime,
      checksum: await checksum(bytes),
      size: bytes.byteLength,
      ...(assetId ? { assetId } : {}),
      ...(entry ? { entry } : {}),
    });
  };
  for (const entry of snapshot.entries.filter(
    (item) => !item.deletedAt && item.kind === "folder",
  )) {
    await addFile(
      `${FOLDER_MARKER_PREFIX}${entry.path}${FOLDER_MARKER_SUFFIX}`,
      new Uint8Array(),
      FOLDER_MARKER_MIME,
      undefined,
      { kind: "folder", sortOrder: entry.sortOrder },
    );
  }
  for (const entry of snapshot.entries.filter(
    (item) => !item.deletedAt && item.kind === "markdown",
  )) {
    const document = snapshot.documents[entry.id];
    if (!document)
      throw new Error(`Markdown 文書を読み出せませんでした: ${entry.path}`);
    const content = document.content;
    const bytes = strToU8(content);
    await addFile(entry.path, bytes, "text/markdown", undefined, {
      kind: "markdown",
      sortOrder: entry.sortOrder,
    });
  }
  for (const entry of snapshot.entries.filter(
    (item) => !item.deletedAt && item.kind === "diagram",
  )) {
    const diagram = snapshot.diagrams[entry.id];
    if (!diagram)
      throw new Error(`図表データを読み出せませんでした: ${entry.path}`);
    const path = `diagrams/${entry.path}.uft.json`;
    const bytes = strToU8(JSON.stringify(diagram));
    await addFile(path, bytes, "application/vnd.uft.diagram+json", undefined, {
      kind: "diagram",
      sortOrder: entry.sortOrder,
    });
  }
  for (const asset of snapshot.assets) {
    const data = await repository.getAsset(asset.id);
    if (!data) throw new Error(`アセットを読み出せませんでした: ${asset.path}`);
    const bytes = new Uint8Array(data);
    await addFile(asset.path, bytes, asset.mediaType, asset.id);
  }
  const manifest: ZipManifest = {
    formatVersion: ZIP_FORMAT_VERSION,
    workspace: {
      id: snapshot.id,
      name: snapshot.name,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    },
    files,
  };
  const manifestPath = "uft-manifest.json";
  if (manifestPath in output)
    throw new Error(
      `ZIP 内のファイルパスが重複または不正です: ${manifestPath}`,
    );
  output[manifestPath] = strToU8(JSON.stringify(manifest, null, 2));
  return new Blob([zipSync(output, { level: 6 })], { type: "application/zip" });
}

function safeZipEntries(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.byteLength > MAX_ZIP_BYTES)
    throw new Error("ZIP は 200 MB 以下にしてください。");
  let entries: Record<string, Uint8Array>;
  let declaredEntries = 0;
  let declaredTotal = 0;
  let preflightError: string | undefined;
  try {
    entries = unzipSync(bytes, {
      // fflate calls this while reading the central directory, before it
      // allocates the output buffer for a compressed entry. Never trust a ZIP
      // file enough to expand it before checking its declared output size.
      filter: (file) => {
        if (preflightError) return false;
        declaredEntries += 1;
        if (declaredEntries > MAX_ZIP_ENTRIES) {
          preflightError = "ZIP 内のファイル数が上限を超えています。";
          return false;
        }
        if (
          !Number.isSafeInteger(file.originalSize) ||
          file.originalSize < 0 ||
          file.originalSize > MAX_UNZIPPED_BYTES - declaredTotal
        ) {
          preflightError = "ZIP の展開サイズが上限を超えています。";
          return false;
        }
        declaredTotal += file.originalSize;
        return true;
      },
    });
  } catch {
    throw new Error("ZIP を読み取れません。壊れている可能性があります。");
  }
  if (preflightError) throw new Error(preflightError);
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
  validateManifest(manifest, entries);
  const source = cloneWorkspace({
    id: newId("workspace"),
    name: manifest.workspace.name,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastOpenedEntryId: null,
    entries: [],
    documents: {},
    assets: [],
    diagrams: {},
  });
  const directories = new Map<string, string>();
  const restoredAssetIds = new Map<string, string>();
  const ensureDirectory = (path: string) => {
    let parentId: string | null = null;
    let current = "";
    for (const name of path.split("/")) {
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
  const addDirectories = (path: string) => {
    const parentPath = path.split("/").slice(0, -1).join("/");
    return parentPath ? ensureDirectory(parentPath) : null;
  };
  const logicalEntries = new Map<string, "folder" | "markdown" | "diagram">();
  for (const file of manifest.files) {
    const kind = isFolderMarker(file.path)
      ? "folder"
      : file.path.endsWith(".md")
        ? "markdown"
        : file.path.startsWith("diagrams/") && file.path.endsWith(".uft.json")
          ? "diagram"
          : null;
    if (!kind) continue;
    const path =
      kind === "folder"
        ? folderPathFromMarker(file.path)
        : kind === "diagram"
          ? file.path.slice("diagrams/".length).replace(/\.uft\.json$/, "")
          : file.path;
    if (logicalEntries.has(path))
      throw new Error(`ZIP 内の項目パスが重複しています: ${path}`);
    logicalEntries.set(path, kind);
  }
  for (const path of logicalEntries.keys()) {
    let parentPath = "";
    for (const segment of path.split("/").slice(0, -1)) {
      parentPath = parentPath ? `${parentPath}/${segment}` : segment;
      const parentKind = logicalEntries.get(parentPath);
      if (parentKind && parentKind !== "folder")
        throw new Error(
          `ファイルをフォルダとして扱うことはできません: ${parentPath}`,
        );
    }
  }
  const binaries = new Map<string, ArrayBuffer>();
  for (const file of manifest.files) {
    const content = entries[file.path];
    if (!content || (await checksum(content)) !== file.checksum)
      throw new Error(`ファイル検証に失敗しました: ${file.path}`);
    if (isFolderMarker(file.path)) {
      const id = ensureDirectory(folderPathFromMarker(file.path));
      const folder = source.entries.find((entry) => entry.id === id);
      if (folder && file.entry) folder.sortOrder = file.entry.sortOrder;
    } else if (file.path.endsWith(".md")) {
      const id = newId("markdown");
      const name = file.path.split("/").at(-1);
      if (!name) throw new Error(`ファイル名が不正です: ${file.path}`);
      const parentId = addDirectories(file.path);
      source.entries.push({
        id,
        workspaceId: source.id,
        parentId,
        kind: "markdown",
        name,
        path: file.path,
        sortOrder: file.entry?.sortOrder ?? source.entries.length,
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
      let diagram: unknown;
      try {
        diagram = JSON.parse(strFromU8(content));
      } catch {
        throw new Error(`図表データが不正です: ${file.path}`);
      }
      if (!validateDiagramDocument(diagram))
        throw new Error(`図表データが不正です: ${file.path}`);
      const sourcePath = file.path
        .slice("diagrams/".length)
        .replace(/\.uft\.json$/, "");
      if (normalizePath(sourcePath) !== sourcePath)
        throw new Error(`図表名が不正です: ${file.path}`);
      const id = newId("diagram");
      const fileName = sourcePath.split("/").at(-1);
      if (!fileName) throw new Error(`図表名が不正です: ${file.path}`);
      const parentId = addDirectories(sourcePath);
      source.entries.push({
        id,
        workspaceId: source.id,
        parentId,
        kind: "diagram",
        name: fileName,
        path: sourcePath,
        sortOrder: file.entry?.sortOrder ?? source.entries.length,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
        deletedAt: null,
      });
      source.diagrams[id] = {
        ...(diagram as Workspace["diagrams"][string]),
        entryId: id,
      };
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
      if (file.assetId) restoredAssetIds.set(file.assetId, id);
      binaries.set(
        id,
        content.buffer.slice(
          content.byteOffset,
          content.byteOffset + content.byteLength,
        ) as ArrayBuffer,
      );
    }
  }
  for (const diagram of Object.values(source.diagrams)) {
    diagram.previewAssetId = diagram.previewAssetId
      ? (restoredAssetIds.get(diagram.previewAssetId) ?? null)
      : null;
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
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
