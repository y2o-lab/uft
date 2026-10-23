/** Add editor controls without making them part of the saved Markdown. */
export function decorateListHandles(host: HTMLElement, enabled: boolean): void {
  for (const handle of host.querySelectorAll("[data-list-handle]"))
    handle.remove();
  if (!enabled) return;
  for (const item of host.querySelectorAll("li")) {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "list-drag-handle";
    handle.dataset.listHandle = "";
    handle.dataset.previewOnly = "";
    handle.contentEditable = "false";
    handle.draggable = true;
    handle.setAttribute("aria-label", "リスト項目を移動");
    handle.title = "ドラッグで移動（Alt + ↑ / ↓ でも移動）";
    item.prepend(handle);
  }
}

export function moveListItem(
  host: HTMLElement,
  source: HTMLLIElement,
  target: HTMLLIElement,
  after: boolean,
): boolean {
  if (
    source === target ||
    !host.contains(source) ||
    !host.contains(target) ||
    source.contains(target) ||
    !target.parentElement?.matches("ul, ol")
  )
    return false;
  const oldList = source.parentElement;
  const before = after ? target.nextSibling : target;
  if (
    source.parentElement === target.parentElement &&
    (before === source || source.nextSibling === before)
  )
    return false;
  target.parentElement.insertBefore(source, before);
  if (oldList && !oldList.querySelector(":scope > li")) oldList.remove();
  return true;
}
