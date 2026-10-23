import { history, redo, undo } from "@codemirror/commands";
import {
  type ChangeSpec,
  EditorState,
  type Transaction,
} from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { renumberOrderedLists } from "./ordered-list";

function editor(doc: string) {
  return EditorState.create({
    doc,
    extensions: [renumberOrderedLists, history()],
  });
}

function remove(doc: string, deleted: string) {
  const from = doc.indexOf(deleted);
  return editor(doc).update({
    changes: { from, to: from + deleted.length },
    selection: { anchor: from },
    userEvent: "delete.selection",
  });
}

describe("ordered list renumbering after deletion", () => {
  it("closes a gap after deleting a middle item", () => {
    expect(
      remove("1. first\n2. middle\n3. last", "2. middle\n").newDoc.toString(),
    ).toBe("1. first\n2. last");
  });

  it("keeps the list starting at one after deleting the first item", () => {
    expect(
      remove("1. first\n2. next\n3. last", "1. first\n").newDoc.toString(),
    ).toBe("1. next\n2. last");
  });

  it("handles multiple deleted items and preserves custom starts and delimiters", () => {
    expect(
      remove(
        "5) first\n6) next\n7) third\n8) last",
        "5) first\n6) next\n",
      ).newDoc.toString(),
    ).toBe("5) third\n6) last");
  });

  it("renumbers nested lists independently", () => {
    expect(
      remove(
        "1. parent\n   1. first\n   2. next\n   3. last\n2. sibling",
        "   1. first\n",
      ).newDoc.toString(),
    ).toBe("1. parent\n   1. next\n   2. last\n2. sibling");
  });

  it("handles quoted lists and preserves marker spacing", () => {
    expect(
      remove(
        "> 1. first\n> 2.  next\n> 3. last",
        "> 1. first\n",
      ).newDoc.toString(),
    ).toBe("> 1.  next\n> 2. last");
  });

  it("does not alter code blocks or separate lists", () => {
    const doc =
      "```md\n1. first\n2. next\n```\n\n1. actual\n2. removed\n3. last\n\nparagraph\n\n7. separate\n9. unchanged";
    expect(remove(doc, "2. removed\n").newDoc.toString()).toBe(
      doc.replace("2. removed\n3. last", "2. last"),
    );
    expect(remove(doc, "1. first\n").newDoc.toString()).toBe(
      doc.replace("1. first\n", ""),
    );
  });

  it("maps the cursor when numbering shrinks from two digits", () => {
    const doc = Array.from({ length: 11 }, (_, i) => `${i + 1}. item`).join(
      "\n",
    );
    const from = doc.indexOf("2. item");
    const tr = editor(doc).update({
      changes: { from, to: from + "2. item\n".length },
      selection: { anchor: doc.length - "2. item\n".length },
    });
    expect(tr.newDoc.toString()).toBe(
      Array.from({ length: 10 }, (_, i) => `${i + 1}. item`).join("\n"),
    );
    expect(tr.state.selection.main.head).toBe(tr.newDoc.length);
  });

  it("undoes and redoes deletion and numbering together", () => {
    const doc = "1. first\n2. next\n3. last";
    let state = remove(doc, "1. first\n").state;
    const target = {
      get state() {
        return state;
      },
      dispatch(tr: Transaction) {
        state = tr.state;
      },
    };
    expect(undo(target)).toBe(true);
    expect(state.doc.toString()).toBe(doc);
    expect(redo(target)).toBe(true);
    expect(state.doc.toString()).toBe("1. next\n2. last");
  });

  it("does not normalize imported text, external values, or read-only states", () => {
    const doc = "3. imported\n8. unchanged";
    expect(
      editor("")
        .update({ changes: { from: 0, insert: doc } })
        .newDoc.toString(),
    ).toBe(doc);
    const changes: ChangeSpec = { from: 0, to: 3, insert: "4. " };
    expect(
      editor(doc).update({ changes, filter: false }).newDoc.toString(),
    ).toBe("4. imported\n8. unchanged");
    const state = EditorState.create({
      doc,
      extensions: [renumberOrderedLists, EditorState.readOnly.of(true)],
    });
    expect(state.update({ changes }).newDoc.toString()).toBe(
      "4. imported\n8. unchanged",
    );
  });
});
