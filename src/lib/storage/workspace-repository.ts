import type { Workspace } from "../domain/workspace";

/** UI boundary to be implemented by the lazy SQLite WASM worker. */
export interface WorkspaceRepository {
  open(): Promise<Workspace>;
  save(workspace: Workspace): Promise<void>;
}
