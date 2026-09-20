import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

function fencedCode(source: string, language = ""): string {
  const longestFence = Math.max(
    3,
    ...[...source.matchAll(/`+/g)].map((match) => match[0].length + 1),
  );
  const fence = "`".repeat(longestFence);
  const body = source.replace(/\n$/, "");
  return `\n\n${fence}${language}\n${body}\n${fence}\n\n`;
}

function imageDestination(source: string): string {
  return `<${source.replaceAll("<", "%3C").replaceAll(">", "%3E")}>`;
}

function imageLabel(label: string): string {
  return label
    .replaceAll("\\", "\\\\")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]");
}

function createService(): TurndownService {
  const service = new TurndownService({
    blankReplacement: (_content, node) => {
      if (node.matches("figure[data-mermaid-source]"))
        return fencedCode(node.dataset.mermaidSource ?? "", "mermaid");
      return (node as HTMLElement & { isBlock?: boolean }).isBlock
        ? "\n\n"
        : "";
    },
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    headingStyle: "atx",
    strongDelimiter: "**",
  });
  service.use(gfm);
  service.addRule("uft-preview-only", {
    filter: (node) => node.matches("[data-preview-only]"),
    replacement: () => "",
  });
  service.addRule("uft-mermaid", {
    filter: (node) => node.matches("figure[data-mermaid-source]"),
    replacement: (_content, node) =>
      fencedCode(node.dataset.mermaidSource ?? "", "mermaid"),
  });
  service.addRule("uft-fenced-code", {
    filter: (node) => node.tagName === "PRE",
    replacement: (_content, node) => {
      const code =
        node.firstElementChild?.tagName === "CODE"
          ? (node.firstElementChild as HTMLElement)
          : (node as HTMLElement);
      const language =
        [...code.classList]
          .find((className) => className.startsWith("language-"))
          ?.slice("language-".length) ?? "";
      return fencedCode(code.textContent ?? "", language);
    },
  });
  service.addRule("uft-image-source", {
    filter: "img",
    replacement: (_content, node) => {
      const source = node.dataset.markdownSrc ?? node.getAttribute("src") ?? "";
      const alt = imageLabel(node.getAttribute("alt") ?? "");
      const title = node.getAttribute("title");
      const titleSuffix = title ? ` "${title.replaceAll('"', '\\"')}"` : "";
      return source
        ? `![${alt}](${imageDestination(source)}${titleSuffix})`
        : "";
    },
  });
  return service;
}

export function previewToMarkdown(preview: HTMLElement | string): string {
  const markdown = createService().turndown(preview).trimEnd();
  return markdown ? `${markdown}\n` : "";
}
