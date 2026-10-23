import { markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, MapMode } from "@codemirror/state";

// Keep corrections in the editing transaction so selection mapping and undo
// include both the deletion and the resulting number changes.
export const renumberOrderedLists = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.startState.readOnly) return tr;

  const deletions: Array<{ from: number; to: number }> = [];
  tr.changes.iterChangedRanges((from, to) => {
    if (to > from) deletions.push({ from, to });
  });
  if (!deletions.length) return tr;

  const starts = new Map<number, number>();
  markdownLanguage.parser.parse(tr.startState.doc.toString()).iterate({
    enter(node) {
      if (
        node.name !== "OrderedList" ||
        !deletions.some(({ from, to }) => from < node.to && to > node.from)
      )
        return;
      const markers = node.node
        .getChildren("ListItem")
        .map((item) => item.getChild("ListMark"))
        .filter((marker) => marker !== null);
      const first = markers[0];
      if (!first) return;
      const start = Number.parseInt(
        tr.startState.doc.sliceString(first.from, first.to),
        10,
      );
      for (const marker of markers) {
        const position = tr.changes.mapPos(marker.from, 1, MapMode.TrackDel);
        if (position !== null) starts.set(position, start);
      }
    },
  });
  if (!starts.size) return tr;

  const changes: Array<{ from: number; to: number; insert: string }> = [];
  markdownLanguage.parser.parse(tr.newDoc.toString()).iterate({
    enter(node) {
      if (node.name !== "OrderedList") return;
      const markers = node.node
        .getChildren("ListItem")
        .map((item) => item.getChild("ListMark"))
        .filter((marker) => marker !== null);
      const start = markers
        .map((marker) => starts.get(marker.from))
        .find((value) => value !== undefined);
      if (start === undefined) return;
      markers.forEach((marker, index) => {
        // Replace only the digits, preserving indentation, delimiter and spaces.
        const to = marker.to - 1;
        const insert = String(start + index);
        if (tr.newDoc.sliceString(marker.from, to) !== insert)
          changes.push({ from: marker.from, to, insert });
      });
    },
  });
  changes.sort((a, b) => a.from - b.from);
  return changes.length ? [tr, { changes, sequential: true }] : tr;
});
