export interface TrackedSandbox {
  sandboxId: string;
  templateId: string;
  createdAt: string;
  metadata: Record<string, string>;
}

export interface ToolResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

const MAX_OUTPUT_LENGTH = 200_000;

export function truncateOutput(text: string, limit = MAX_OUTPUT_LENGTH): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n\n[Output truncated at ${Math.round(limit / 1024)}KB]`;
}

export function formatError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

export function formatSuccess(text: string): ToolResult {
  return {
    content: [{ type: 'text', text }],
  };
}
