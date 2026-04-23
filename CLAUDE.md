# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An MCP (Model Context Protocol) server that gives Claude Code access to E2B cloud sandboxes — isolated Linux VMs for cloning repos, running commands, managing files, and performing git operations without touching the local machine. Communicates over stdio transport.

## Build & Run

```bash
npm run build          # TypeScript → dist/
npm run dev            # Build + run
npm start              # Run from dist/ (must build first)
```

No test suite or linter is configured.

## Register as MCP Server

```bash
claude mcp add e2b-sandbox -s user \
  -e E2B_API_KEY=your-key \
  -e GITHUB_TOKEN=your-token \
  -- node /absolute/path/to/dist/index.js
```

## Environment Variables

- `E2B_API_KEY` (required) — from e2b.dev/dashboard. Without it, `sandbox_create` fails immediately.
- `GITHUB_TOKEN` (optional) — enables private repo cloning and `git push`. Auto-configured on sandbox creation via `sandbox.git.dangerouslyAuthenticate()`.

## Architecture

Single-process MCP server, ESM (`"type": "module"`), strict TypeScript targeting ES2022/Node16.

**Entry point**: `src/index.ts` — creates `McpServer`, registers all tool groups, connects via `StdioServerTransport`.

**Singleton sandbox registry**: `src/services/sandbox-manager.ts` — `SandboxManager` class holds a `Map<sandboxId, {sandbox, info}>` of live E2B `Sandbox` instances. All tools look up sandboxes by ID through this registry. Stale sandbox detection happens in `commands.ts` (catches "not found" errors, removes from registry).

**Tool registration pattern**: Each file in `src/tools/` exports a `register*Tools(server: McpServer)` function that calls `server.tool()` with Zod schemas for input validation. Four tool groups (29 tools total):
- `sandbox.ts` — lifecycle (create, list, info, kill, keep_alive, pause, resume) + networking (get_url, upload_url, download_url)
- `commands.ts` — exec, exec_background (with output truncation at 100KB per stream), process_list, process_kill
- `filesystem.ts` — read, write, list (capped at 1000 entries), mkdir, remove, info, exists, rename
- `git.ts` — clone (shallow depth=1 by default), status, commit, push, pull, branch, init

**Shared helpers**: `src/types.ts` — `formatSuccess`/`formatError` produce MCP-compliant `ToolResult` objects; `truncateOutput` caps at 200KB.

## Key Behaviors

- Sandboxes auto-expire after 5 minutes (default). Use `sandbox_keep_alive` to extend.
- `sandbox_pause` persists sandbox state and removes it from the local registry. `sandbox_resume` reconnects and re-authenticates git.
- `sandbox_get_url` returns a public `https://` URL for accessing services on any sandbox port.
- `sandbox_git_clone` defaults to `depth: 1` (shallow). Pass `depth: 0` for full history.
- `sandbox_exec` defaults to 2-minute timeout. Default working directory is `/home/user`.
- Git push checks for `GITHUB_TOKEN` before attempting and returns a clear error if missing.
- All tool handlers follow try/catch → `formatError` pattern; errors surface as MCP error results, not thrown exceptions.

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server framework
- `e2b` — E2B sandbox SDK (creates/manages cloud VMs)
- `zod` — tool input schema validation
