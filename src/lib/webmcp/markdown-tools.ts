import { hasControlCharacters } from "../domain/tree";
import type { WorkspaceCommands } from "../workspace/workspace-commands";
import { CommandError, failure, type ModelContextTool } from "./types";

export const MAX_CONTENT_BYTES = 1024 * 1024;
export const MAX_NAME_LENGTH = 255;
const string = { type: "string", minLength: 1 };
const content = {
  type: "string",
  maxLength: MAX_CONTENT_BYTES,
  description: "Markdown, at most 1 MiB UTF-8",
};
const offset = {
  type: "integer",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
};
const definitions = [
  {
    name: "uft_list_documents",
    description:
      "List Markdown documents and folders, without content. Each collection has its own next offset.",
    required: ["workspaceId"],
    properties: { offset, limit: { type: "integer", minimum: 1, maximum: 20 } },
  },
  {
    name: "uft_read_document",
    description:
      "Read a Markdown range without selecting it. UTF-16 offsets; only join pages with identical versionToken.",
    required: ["workspaceId", "entryId"],
    properties: {
      entryId: string,
      offset,
      limit: { type: "integer", minimum: 1, maximum: 1000 },
    },
  },
  {
    name: "uft_open_document",
    description: "Select a Markdown document and save the selection.",
    required: ["workspaceId", "entryId"],
    properties: { entryId: string },
  },
  {
    name: "uft_create_document",
    description:
      "Create, save and select a Markdown document. Does not overwrite names. Retry with the same requestId and input (last 100 requests retained).",
    required: ["workspaceId", "name", "content", "requestId"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH },
      content,
      requestId: string,
      parentId: string,
    },
  },
  {
    name: "uft_update_document",
    description:
      "Replace Markdown after user diff approval. Use versionToken from read and a unique requestId. On CONFLICT, read again. Retry with identical requestId and input.",
    required: [
      "workspaceId",
      "entryId",
      "versionToken",
      "content",
      "requestId",
    ],
    properties: {
      entryId: string,
      versionToken: string,
      content,
      requestId: string,
    },
  },
] as const;

export type ToolInput = {
  workspaceId: string;
  entryId?: string;
  offset?: number;
  limit?: number;
  name?: string;
  content?: string;
  requestId?: string;
  parentId?: string;
  versionToken?: string;
};
export function validateInput(index: number, raw: unknown): ToolInput {
  const definition = definitions[index];
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new CommandError("INVALID_INPUT");
  const input = raw as Record<string, unknown>;
  const allowed = ["workspaceId", ...Object.keys(definition.properties)];
  if (
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    definition.required.some((key) => !(key in input))
  )
    throw new CommandError("INVALID_INPUT");
  for (const [key, value] of Object.entries(input)) {
    if (key === "offset" || key === "limit") {
      const max =
        key === "offset" ? Number.MAX_SAFE_INTEGER : index === 0 ? 20 : 1000;
      if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < (key === "offset" ? 0 : 1) ||
        value > max
      )
        throw new CommandError("INVALID_INPUT");
    } else if (
      typeof value !== "string" ||
      (key !== "content" && !value.length)
    )
      throw new CommandError("INVALID_INPUT");
  }
  if (
    typeof input.content === "string" &&
    new TextEncoder().encode(input.content).length > MAX_CONTENT_BYTES
  )
    throw new CommandError("INVALID_INPUT");
  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (
      !name ||
      input.name.length > MAX_NAME_LENGTH ||
      /[\\/]|^\.{1,2}$/.test(name) ||
      hasControlCharacters(input.name)
    )
      throw new CommandError("INVALID_INPUT");
    const normalized = /\.md$/i.test(name) ? name : `${name}.md`;
    if (normalized.length > MAX_NAME_LENGTH)
      throw new CommandError("INVALID_INPUT");
  }
  return input as ToolInput;
}
export function createMarkdownTools(
  workspaceId: string,
  commands: WorkspaceCommands,
  lifetime: AbortSignal,
): ModelContextTool[] {
  return definitions.map((definition, index) => ({
    name: definition.name,
    description: `${definition.description} Current workspaceId: ${JSON.stringify(workspaceId)}.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [...definition.required],
      properties: { workspaceId: string, ...definition.properties },
    },
    annotations: {
      readOnlyHint: index < 2,
      untrustedContentHint: true,
      consequentialHint: index === 4,
    },
    execute: async (raw, options) => {
      try {
        const input = validateInput(index, raw);
        const signal = options?.signal
          ? AbortSignal.any([lifetime, options.signal])
          : lifetime;
        return await commands.execute(index, input, signal);
      } catch (error) {
        return failure(error);
      }
    },
  }));
}
