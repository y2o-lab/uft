/**
 * Counts the Markdown source as users see it. Iterating the string counts a
 * Unicode code point (for example, an emoji) once instead of counting its
 * UTF-16 surrogate pair twice.
 */
export function countMarkdownCharacters(markdown: string): number {
  return Array.from(markdown).length;
}
