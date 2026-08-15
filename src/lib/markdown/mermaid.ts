let mermaidSequence = 0;

export async function renderMermaid(
  source: string,
  theme: "light" | "dark" = "light",
): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: theme === "dark" ? "dark" : "neutral",
  });
  const id = `uft-mermaid-${mermaidSequence++}`;
  return (await mermaid.render(id, source)).svg;
}
