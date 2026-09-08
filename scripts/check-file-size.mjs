import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_SOURCE_LINES = 1100;
const SOURCE_ROOT = "src";
const SOURCE_EXTENSIONS = new Set([".svelte", ".ts"]);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))
      ? [path]
      : [];
  }));
  return files.flat();
}

const oversized = [];
for (const path of await sourceFiles(SOURCE_ROOT)) {
  const lineCount = (await readFile(path, "utf8")).split("\n").length;
  if (lineCount > MAX_SOURCE_LINES) oversized.push({ path, lineCount });
}

if (oversized.length) {
  console.error(`Source files must not exceed ${MAX_SOURCE_LINES} lines:`);
  for (const { path, lineCount } of oversized)
    console.error(`  ${path}: ${lineCount} lines`);
  process.exitCode = 1;
}
