export type WorkspaceFile = {
  id: string;
  path: string;
  content: string;
  updatedAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  files: WorkspaceFile[];
};

export const defaultWorkspace: Workspace = {
  id: "default",
  name: "My workspace",
  files: [
    {
      id: "overview",
      path: "docs/overview.md",
      updatedAt: new Date(0).toISOString(),
      content: "# Overview\n\nStart writing your design document here.",
    },
  ],
};
