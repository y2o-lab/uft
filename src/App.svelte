<svelte:head>
  <title>UFT — Markdown workspace</title>
  <meta name="description" content="A local-first workspace for Markdown design documents." />
</svelte:head>

<main class="app-shell">
  <header class="topbar">
    <div class="brand"><span class="brand-mark">u</span><span>uft</span></div>
    <p>Local-first Markdown workspace</p>
  </header>

  <section class="workspace" aria-label="Workspace setup">
    <aside class="sidebar">
      <p class="eyebrow">EXPLORER</p>
      <div class="tree-folder">docs</div>
      <div class="tree-item active">overview.md</div>
      <div class="tree-folder">assets</div>
      <div class="tree-folder">diagrams</div>
    </aside>
    <section class="main-pane">
      <div class="editor-toolbar">
        <div class="mode-switch" aria-label="Editor mode">
          <button>Source</button>
          <button class="selected">Split</button>
          <button>Preview</button>
        </div>
        <span class="status"><span class="local-dot"></span> Local workspace initialization</span>
      </div>
      <div class="setup-card">
        <p class="eyebrow">FOUNDATION READY</p>
        <h1>UFT is ready for its local-first workspace.</h1>
        <p>Next: SQLite WASM + OPFS persistence, then ZIP import and export.</p>
      </div>
    </section>
  </section>
</main>
