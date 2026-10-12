import { describe, expect, it } from "vitest";
import { setTaskChecked } from "./task-list";

describe("preview task toggles", () => {
  it("supports task markers on a continuation line without shifting later tasks", () => {
    const source = "> -\n>   [ ] continued\n> - [ ] next\n";
    expect(setTaskChecked(source, 0, true)).toBe(
      source.replace("[ ] continued", "[x] continued"),
    );
    expect(setTaskChecked(source, 1, true)).toBe(
      source.replace("[ ] next", "[x] next"),
    );
  });
  it("changes only the chosen task marker, preserving the source formatting", () => {
    const source =
      "# Tasks\r\n\r\n```md\r\n- [ ] example\r\n```\r\n\r\n+ [ ] **Parent**\r\n  * [X] child\r\n\r\n> 1. [ ] quoted\r\n\r\n[link]: https://example.com\r\n";
    expect(setTaskChecked(source, 0, true)).toBe(
      source.replace("+ [ ]", "+ [x]"),
    );
    expect(setTaskChecked(source, 1, false)).toBe(
      source.replace("* [X]", "* [ ]"),
    );
    expect(setTaskChecked(source, 2, true)).toBe(
      source.replace("1. [ ]", "1. [x]"),
    );
    expect(setTaskChecked(source, 3, true)).toBe(source);
  });
});
