// This describes the serialized workspace object, independently from the
// SQLite/IndexedDB container schema. Keep migrations additive so an emergency
// frontend rollback can still open data written by a newer release.
export const WORKSPACE_SCHEMA_VERSION = 2;

export type EntryKind = "folder" | "markdown" | "diagram";

export type WorkspaceEntry = {
  id: string;
  workspaceId: string;
  parentId: string | null;
  kind: EntryKind;
  name: string;
  path: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type Document = {
  entryId: string;
  content: string;
  revision: number;
  updatedAt: string;
};

export type Asset = {
  id: string;
  workspaceId: string;
  path: string;
  mediaType: string;
  byteSize: number;
  checksum: string;
  createdAt: string;
};

export type DiagramNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: { label: string; [key: string]: unknown };
};

export type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
};

export type DiagramGraph = {
  formatVersion: 1;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  viewport: { x: number; y: number; zoom: number };
};

export type DiagramDocument = {
  entryId: string;
  formatVersion: number;
  graph: DiagramGraph;
  previewAssetId: string | null;
  mermaidSource: string | null;
  updatedAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  entries: WorkspaceEntry[];
  documents: Record<string, Document>;
  assets: Asset[];
  diagrams: Record<string, DiagramDocument>;
  lastOpenedEntryId: string | null;
};

export type WorkspaceFile = Document & { id: string; path: string };

const epoch = new Date(0).toISOString();

export const defaultWorkspace: Workspace = {
  id: "default",
  name: "My workspace",
  schemaVersion: WORKSPACE_SCHEMA_VERSION,
  createdAt: epoch,
  updatedAt: epoch,
  lastOpenedEntryId: "overview",
  entries: [
    {
      id: "docs",
      workspaceId: "default",
      parentId: null,
      kind: "folder",
      name: "docs",
      path: "docs",
      sortOrder: 0,
      createdAt: epoch,
      updatedAt: epoch,
      deletedAt: null,
    },
    {
      id: "overview",
      workspaceId: "default",
      parentId: "docs",
      kind: "markdown",
      name: "overview.md",
      path: "docs/overview.md",
      sortOrder: 0,
      createdAt: epoch,
      updatedAt: epoch,
      deletedAt: null,
    },
  ],
  documents: {
    overview: {
      entryId: "overview",
      revision: 1,
      updatedAt: epoch,
      content:
        "# Overview\n\nStart writing your design document here.\n\n> Your workspace stays in this browser. Export a ZIP backup before clearing browser data.",
    },
  },
  assets: [],
  diagrams: {},
};

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function cloneWorkspace(workspace: Workspace): Workspace {
  // JSON also unwraps Svelte's reactive proxies before the snapshot crosses Worker/IDB boundaries.
  return JSON.parse(JSON.stringify(workspace)) as Workspace;
}
