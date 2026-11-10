type WorkspaceShortcuts = {
  canUseWorkspaceCommands: () => boolean;
  createWorkspace: () => void;
  save: () => void;
  openLauncher: () => void;
  openPalette: () => void;
  dismissOverlayOnEscape: (event: KeyboardEvent) => void;
};

export function registerWorkspaceShortcuts({
  canUseWorkspaceCommands,
  createWorkspace,
  save,
  openLauncher,
  openPalette,
  dismissOverlayOnEscape,
}: WorkspaceShortcuts): () => void {
  function handleShortcut(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "k") {
      event.preventDefault();
      if (!event.shiftKey) openLauncher();
      else if (canUseWorkspaceCommands()) openPalette();
      return;
    }
    if (!canUseWorkspaceCommands()) return;
    if (key === "n" && event.altKey) {
      event.preventDefault();
      createWorkspace();
    } else if (key === "s") {
      event.preventDefault();
      save();
    }
  }

  window.addEventListener("keydown", dismissOverlayOnEscape, true);
  window.addEventListener("keydown", handleShortcut);
  return () => {
    window.removeEventListener("keydown", dismissOverlayOnEscape, true);
    window.removeEventListener("keydown", handleShortcut);
  };
}
