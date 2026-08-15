import { ChangeEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { diagramTemplates, starterDocument, tableTemplates } from './content'

type Command = { id: string; title: string; subtitle: string; shortcut?: string; action: () => void }
type FileHandle = { getFile: () => Promise<File>; createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }

const icon = (name: string) => <span className={`icon icon-${name}`} aria-hidden="true" />
const stripFence = (value: string) => value.replace(/^```mermaid\n?|\n?```$/g, '')

function App() {
  const [markdown, setMarkdown] = useState(() => localStorage.getItem('uft-document') || starterDocument)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [picker, setPicker] = useState<'diagram' | 'table' | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [mode, setMode] = useState<'split' | 'preview' | 'source'>('split')
  const [activeDiagram, setActiveDiagram] = useState<number | null>(null)
  const [notice, setNotice] = useState('All changes are local')
  const [fileHandle, setFileHandle] = useState<FileHandle | null>(null)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { localStorage.setItem('uft-document', markdown) }, [markdown])
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette() }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveFile() }
      if (event.key === 'Escape') { setPaletteOpen(false); setPicker(null); setActiveDiagram(null) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const insertAtCursor = (text: string) => {
    const editor = editorRef.current
    const useCursor = !!editor && document.activeElement === editor
    const start = useCursor ? editor.selectionStart : markdown.length
    const end = useCursor ? editor.selectionEnd : markdown.length
    const prefix = markdown.slice(0, start)
    const suffix = markdown.slice(end)
    const spacer = prefix && !prefix.endsWith('\n\n') ? '\n\n' : ''
    const next = `${prefix}${spacer}${text}${suffix.startsWith('\n') ? '' : '\n\n'}${suffix}`
    setMarkdown(next)
    requestAnimationFrame(() => { editor?.focus(); const cursor = (prefix + spacer + text).length; editor?.setSelectionRange(cursor, cursor) })
  }

  const openPalette = () => { setPicker(null); setQuery(''); setSelected(0); setPaletteOpen(true) }
  const saveFile = async () => {
    try {
      if (fileHandle) {
        const writable = await fileHandle.createWritable(); await writable.write(markdown); await writable.close()
        setNotice('Saved to local file'); return
      }
      const blob = new Blob([markdown], { type: 'text/markdown' }); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'design.md'; a.click(); URL.revokeObjectURL(url)
      setNotice('Downloaded design.md')
    } catch { setNotice('Could not save this file') }
  }
  const openFile = async () => {
    try {
      const pickerApi = window as typeof window & { showOpenFilePicker?: () => Promise<FileHandle[]> }
      if (!pickerApi.showOpenFilePicker) { setNotice('Use Chrome or Edge to open local files'); return }
      const [handle] = await pickerApi.showOpenFilePicker!()
      const file = await handle.getFile(); setMarkdown(await file.text()); setFileHandle(handle as FileHandle); setNotice(`Opened ${file.name}`)
    } catch { /* user cancelled */ }
  }
  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return
    const assetPath = `assets/${file.name}`
    setImageUrls(urls => ({ ...urls, [assetPath]: URL.createObjectURL(file) }))
    insertAtCursor(`![${file.name}](${assetPath})\n\n### Behavior\n- Describe what this screen communicates\n- Keep critical behavior in text for AI context`)
    setNotice(`Added an image reference for ${file.name}`); event.target.value = ''
  }
  const addDiagram = (source: string) => { insertAtCursor(`\`\`\`mermaid\n${source}\n\`\`\``); setPaletteOpen(false); setPicker(null); setNotice('Mermaid diagram inserted') }
  const addTable = (source: string) => { insertAtCursor(source); setPaletteOpen(false); setPicker(null); setNotice('Markdown table inserted') }
  const commands: Command[] = [
    { id: 'diagram', title: 'Insert diagram', subtitle: 'Flowchart, sequence, architecture', shortcut: '⌘ ⇧ D', action: () => { setPicker('diagram'); setQuery(''); setSelected(0) } },
    { id: 'table', title: 'Insert table', subtitle: 'API, database, or test-case template', shortcut: '⌘ ⇧ T', action: () => { setPicker('table'); setQuery(''); setSelected(0) } },
    { id: 'callout', title: 'Insert callout', subtitle: 'A durable Markdown note for decisions', action: () => { insertAtCursor('> [!NOTE]\n> Add a decision, constraint, or review note here.'); setPaletteOpen(false) } },
    { id: 'image', title: 'Insert image reference', subtitle: 'Add an asset path and accompanying behavior', action: () => { imageInputRef.current?.click(); setPaletteOpen(false) } },
    { id: 'code', title: 'Insert code block', subtitle: 'Add a fenced code example', action: () => { insertAtCursor('```ts\n// Implementation context\n```'); setPaletteOpen(false) } },
  ]
  const visibleCommands = commands.filter(c => `${c.title} ${c.subtitle}`.toLowerCase().includes(query.toLowerCase()))
  const options = picker === 'diagram' ? diagramTemplates : picker === 'table' ? tableTemplates : visibleCommands
  const activate = () => {
    const item = options[selected]
    if (!item) return
    if (picker === 'diagram') addDiagram((item as typeof diagramTemplates[number]).source)
    else if (picker === 'table') addTable((item as typeof tableTemplates[number]).source)
    else (item as Command).action()
  }
  const paletteKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(v => Math.min(v + 1, options.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(v => Math.max(v - 1, 0)) }
    if (event.key === 'Enter') { event.preventDefault(); activate() }
    if (event.key === 'Escape') { setPaletteOpen(false); setPicker(null) }
  }
  const wordCount = markdown.replace(/[`#>|*\-]/g, '').trim().split(/\s+/).filter(Boolean).length

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">u</span><span>uft</span><span className="beta">prototype</span></div>
      <div className="document-chip"><span className="pulse" /> docs / authentication.md <span className="chevron">⌄</span></div>
      <div className="top-actions">
        <button className="shortcut-button" onClick={openPalette}>{icon('spark')} <span>Command</span><kbd>⌘ K</kbd></button>
        <button className="round-button" title="Open Markdown file" onClick={openFile}>{icon('folder')}</button>
        <button className="save-button" onClick={saveFile}>{icon('save')} Save <kbd>⌘ S</kbd></button>
      </div>
    </header>
    <section className="workspace">
      <aside className="sidebar">
        <div className="sidebar-title"><span>EXPLORER</span><button aria-label="Add document">+</button></div>
        <div className="tree-item active">{icon('file')} authentication.md <span className="dirty-dot" /></div>
        <div className="tree-item">{icon('file')} api-contract.md</div>
        <div className="tree-item">{icon('file')} overview.md</div>
        <div className="tree-folder">{icon('folder')} assets <span>⌄</span></div>
        <div className="tree-item indent">{icon('image')} login-screen.png</div>
        <div className="sidebar-bottom"><span className="git-branch">⑂</span> main <span className="sync-dot" /> synced</div>
      </aside>
      <section className="main-pane">
        <div className="editor-toolbar">
          <div className="mode-switch"><button onClick={() => setMode('source')} className={mode === 'source' ? 'selected' : ''}>Source</button><button onClick={() => setMode('split')} className={mode === 'split' ? 'selected' : ''}>Split</button><button onClick={() => setMode('preview')} className={mode === 'preview' ? 'selected' : ''}>Preview</button></div>
          <div className="status"><span className="local-dot" /> {notice}</div>
        </div>
        <div className={`document-area mode-${mode}`}>
          {mode !== 'preview' && <section className="source-pane"><div className="line-gutter">{Array.from({ length: Math.max(30, markdown.split('\n').length) }, (_, i) => <span key={i}>{i + 1}</span>)}</div><textarea ref={editorRef} value={markdown} onChange={e => setMarkdown(e.target.value)} spellCheck={false} aria-label="Markdown editor" /></section>}
          {mode !== 'source' && <Preview markdown={markdown} images={imageUrls} activeDiagram={activeDiagram} setActiveDiagram={setActiveDiagram} onChangeDiagram={setMarkdown} />}
        </div>
      </section>
    </section>
    <footer className="footer"><span>Markdown · Local-first · Git-friendly</span><span>{wordCount} words&nbsp;&nbsp; · &nbsp;&nbsp;UTF-8</span></footer>
    <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={chooseImage} />
    {paletteOpen && <CommandPalette picker={picker} query={query} selected={selected} options={options} onQuery={value => { setQuery(value); setSelected(0) }} onKeyDown={paletteKeyDown} onSelect={i => { const item = options[i]; if (!item) return; if (picker === 'diagram') addDiagram((item as typeof diagramTemplates[number]).source); else if (picker === 'table') addTable((item as typeof tableTemplates[number]).source); else (item as Command).action() }} onBack={() => { setPicker(null); setQuery(''); setSelected(0) }} />}
  </main>
}

function CommandPalette({ picker, query, selected, options, onQuery, onKeyDown, onSelect, onBack }: { picker: 'diagram' | 'table' | null; query: string; selected: number; options: Array<Command | typeof diagramTemplates[number] | typeof tableTemplates[number]>; onQuery: (value: string) => void; onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void; onSelect: (i: number) => void; onBack: () => void }) {
  const input = useRef<HTMLInputElement>(null); useEffect(() => input.current?.focus(), [])
  return <div className="palette-scrim"><section className="palette" role="dialog" aria-label="Command palette">
    <div className="palette-input">{icon('search')}<input ref={input} value={query} onChange={e => onQuery(e.target.value)} onKeyDown={onKeyDown} placeholder={picker ? `Search ${picker} templates…` : 'Search commands…'} /><kbd>esc</kbd></div>
    {picker && <button className="palette-back" onClick={onBack}>← Back to commands</button>}
    <div className="palette-label">{picker ? `${picker} templates` : 'Create block'}</div>
    <div className="palette-items">{options.map((item, i) => <button key={item.id} className={`palette-item ${selected === i ? 'is-selected' : ''}`} onClick={() => onSelect(i)}>
      <span className="command-glyph">{'icon' in item ? item.icon : picker === 'diagram' ? '◇' : '▦'}</span><span className="command-copy"><strong>{'title' in item ? item.title : item.name}</strong><small>{'subtitle' in item ? item.subtitle : ('description' in item ? item.description : 'Insert a Markdown table')}</small></span>{'shortcut' in item && <kbd>{item.shortcut}</kbd>}
    </button>)}</div>
    <div className="palette-help"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> insert</span></div>
  </section></div>
}

function Preview({ markdown, images, activeDiagram, setActiveDiagram, onChangeDiagram }: { markdown: string; images: Record<string, string>; activeDiagram: number | null; setActiveDiagram: (n: number | null) => void; onChangeDiagram: (value: string) => void }) {
  const blocks = useMemo(() => markdown.split(/(```[\s\S]*?```)/g).filter(Boolean), [markdown])
  let diagramIndex = 0
  return <section className="preview-pane" aria-label="Rendered preview">{blocks.map((block, index) => {
    if (block.startsWith('```mermaid')) { const current = diagramIndex++; return <MermaidCard key={index} source={stripFence(block)} edit={activeDiagram === current} onEdit={() => setActiveDiagram(activeDiagram === current ? null : current)} onSave={value => onChangeDiagram(markdown.replace(block, `\`\`\`mermaid\n${value}\n\`\`\``))} /> }
    if (block.startsWith('```')) return <pre key={index} className="code-block"><code>{block.replace(/^```\w*\n?|\n?```$/g, '')}</code></pre>
    return <MarkdownChunk key={index} content={block} images={images} onTableChange={(previousTable, nextTable) => onChangeDiagram(markdown.replace(block, block.replace(previousTable, nextTable)))} />
  })}</section>
}

function MermaidCard({ source, edit, onEdit, onSave }: { source: string; edit: boolean; onEdit: () => void; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(source); useEffect(() => setDraft(source), [source])
  return <div className={`diagram-card ${edit ? 'editing' : ''}`}><div className="diagram-bar"><span>{icon('diagram')} Mermaid diagram</span><button onClick={onEdit}>{edit ? 'Done editing' : 'Enter to edit source'} <kbd>↵</kbd></button></div>{edit ? <textarea value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => onSave(draft)} autoFocus /> : <DiagramVisual source={source} />}</div>
}

function DiagramVisual({ source }: { source: string }) {
  return <div className="diagram-visual"><DiagramFallback source={source} /></div>
}

function DiagramFallback({ source }: { source: string }) {
  const labels = Array.from(source.matchAll(/\w+\[([^\]]+)\]/g)).map(match => match[1].replace(/^\(|\)$/g, '')).slice(0, 4)
  const nodes = labels.length ? labels : ['Diagram source', 'Preview', 'Text']
  return <div className="flow-diagram-fallback">{nodes.map((node, index) => <div className="flow-node-wrap" key={`${node}-${index}`}><div className={`flow-node ${index === nodes.length - 1 ? 'storage' : ''}`}>{node}</div>{index < nodes.length - 1 && <span className="flow-arrow">→</span>}</div>)}</div>
}

function MarkdownChunk({ content, images, onTableChange }: { content: string; images: Record<string, string>; onTableChange: (previous: string, next: string) => void }) {
  const lines = content.split('\n'); const result: ReactNode[] = []; let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || line === '---' || /^\w+:/.test(line)) { i++; continue }
    if (/^\|/.test(line) && /^\|/.test(lines[i + 1] || '')) { const tableLines: string[] = []; while (/^\|/.test(lines[i] || '')) tableLines.push(lines[i++]); result.push(<EditableTable key={`t${i}`} lines={tableLines} onChange={nextTable => onTableChange(tableLines.join('\n'), nextTable)} />); continue }
    if (line.startsWith('> [!')) { const type = line.match(/\[!(\w+)\]/)?.[1] || 'NOTE'; const body = lines[++i]?.replace(/^>\s?/, ''); result.push(<aside className="callout" key={`c${i}`}><strong>{type}</strong><span>{body}</span></aside>); i++; continue }
    if (/^#{1,3}\s/.test(line)) { const level = line.match(/^#+/)![0].length; const text = line.slice(level + 1); result.push(level === 1 ? <h1 key={i}>{text}</h1> : level === 2 ? <h2 key={i}>{text}</h2> : <h3 key={i}>{text}</h3>); i++; continue }
    if (/^- \[[ x]\]/.test(line)) { const checked = line.includes('[x]'); result.push(<label className="task" key={i}><input type="checkbox" checked={checked} readOnly />{line.replace(/^- \[[ x]\]\s*/, '')}</label>); i++; continue }
    if (line.startsWith('![')) { const [, alt, src] = line.match(/!\[([^\]]*)\]\(([^\)]+)\)/) || []; result.push(<figure className="image-placeholder" key={i}>{images[src] ? <img src={images[src]} alt={alt} /> : icon('image')}<figcaption>{alt || 'Image'} <small>{src}</small></figcaption></figure>); i++; continue }
    if (line.startsWith('- ')) { const items: string[] = []; while (lines[i]?.startsWith('- ')) items.push(lines[i++].slice(2)); result.push(<ul key={`l${i}`}>{items.map(x => <li key={x}>{x}</li>)}</ul>); continue }
    result.push(<p key={i}>{line}</p>); i++
  }
  return <>{result}</>
}

function EditableTable({ lines, onChange }: { lines: string[]; onChange: (table: string) => void }) {
  const fromLines = () => lines.filter((_, i) => i !== 1).map(line => line.split('|').slice(1, -1).map(x => x.trim()))
  const tableKey = lines.join('\n')
  const [rows, setRows] = useState(fromLines); useEffect(() => setRows(fromLines()), [tableKey])
  const saveRows = (next: string[][]) => { setRows(next); const divider = `|${next[0].map(() => '---').join('|')}|`; onChange([`| ${next[0].join(' | ')} |`, divider, ...next.slice(1).map(row => `| ${row.join(' | ')} |`)].join('\n')) }
  const updateCell = (rowIndex: number, columnIndex: number, value: string) => { const next = rows.map(row => [...row]); next[rowIndex][columnIndex] = value; saveRows(next) }
  const onCellKeyDown = (event: KeyboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) => { if (event.key === 'Tab' && !event.shiftKey && rowIndex === rows.length - 1 && columnIndex === rows[0].length - 1) { event.preventDefault(); saveRows([...rows, rows[0].map(() => '')]); requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-cell="${rows.length}-0"]`)?.focus()) } }
  return <div className="table-wrap"><div className="table-caption">{icon('table')} Markdown table <span>Tab to navigate cells · Tab on last cell adds a row</span></div><table><thead><tr>{rows[0]?.map((cell, columnIndex) => <th key={columnIndex}><input value={cell} onChange={event => updateCell(0, columnIndex, event.target.value)} data-cell={`0-${columnIndex}`} /></th>)}</tr></thead><tbody>{rows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={`${rowIndex}-${columnIndex}`}><input data-cell={`${rowIndex + 1}-${columnIndex}`} value={cell} onChange={event => updateCell(rowIndex + 1, columnIndex, event.target.value)} onKeyDown={event => onCellKeyDown(event, rowIndex + 1, columnIndex)} /></td>)}</tr>)}</tbody></table></div>
}

export default App
