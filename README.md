# E2B Sandbox MCP Server

An MCP (Model Context Protocol) server that connects Claude Code with [E2B](https://e2b.dev) cloud sandboxes, giving you isolated Linux VMs to work on any GitHub repository without touching your local machine.

## What It Does

This server provides Claude Code with 18 tools to create cloud sandboxes, clone repos, run commands, manage files, and perform git operations — all in a secure, disposable Linux environment.

**Your local machine stays untouched.** Every operation happens inside an E2B sandbox VM.

## Use Cases

### Work on Any GitHub Repo Remotely
Clone any repository into a sandbox, run its build and test suite, make changes, and push — without ever installing the project locally.

```
You: "Clone github.com/fastify/fastify, run the tests, and find why test X fails"

Claude Code:
  → sandbox_create
  → sandbox_git_clone "https://github.com/fastify/fastify"
  → sandbox_exec "npm install"
  → sandbox_exec "npm test"
  → sandbox_file_read (inspect failing test)
  → sandbox_file_write (apply fix)
  → sandbox_exec "npm test" (verify)
```

### Safe Experimentation
Try risky changes — dependency upgrades, major refactors, migration scripts — in a throwaway environment. If it breaks, `sandbox_kill` and start fresh.

### Multi-Repo Parallel Work
Spin up multiple sandboxes, clone different repos, work on all of them simultaneously. Each sandbox is fully isolated.

### Clean CI-Like Testing
Run your full test suite in a fresh Linux environment. Catch "works on my machine" issues before pushing to CI.

### Open Source Contributions
Fork a repo, clone it in a sandbox, make your changes, commit, and push to your fork — all without local project setup.

### Code Review in a Live Environment
Clone a PR branch into a sandbox, run the tests, inspect the changes, and verify the behavior — without checking out the branch locally.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [Claude Code](https://claude.ai/code) CLI installed
- [E2B API key](https://e2b.dev/dashboard) (free tier available)
- [GitHub Personal Access Token](https://github.com/settings/tokens) (optional, for private repos and push)

### 1. Install

```bash
# Clone the repo
git clone https://github.com/IQBal-Hyena/e2b-sandbox-mcp.git
cd e2b-sandbox-mcp

# Install dependencies
npm install

# Build
npm run build
```

### 2. Register with Claude Code

```bash
claude mcp add e2b-sandbox -- node /path/to/e2b-sandbox-mcp/dist/index.js
```

Then add your environment variables in `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "e2b-sandbox": {
      "command": "node",
      "args": ["/path/to/e2b-sandbox-mcp/dist/index.js"],
      "env": {
        "E2B_API_KEY": "your-e2b-api-key",
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

### 3. Use It

Start Claude Code and ask it to work on any repo:

> "Create a sandbox, clone https://github.com/expressjs/express, and run the test suite"

Claude Code will call the MCP tools automatically.

## Available Tools

### Sandbox Lifecycle

| Tool | Description |
|------|-------------|
| `sandbox_create` | Create a new cloud sandbox (Linux VM) |
| `sandbox_list` | List all active sandboxes |
| `sandbox_info` | Get details about a specific sandbox |
| `sandbox_kill` | Terminate and destroy a sandbox |
| `sandbox_keep_alive` | Extend a sandbox's timeout |

### Command Execution

| Tool | Description |
|------|-------------|
| `sandbox_exec` | Run a shell command and get stdout/stderr/exit code |
| `sandbox_exec_background` | Start a background process (dev servers, watchers) |

### File Operations

| Tool | Description |
|------|-------------|
| `sandbox_file_read` | Read file contents |
| `sandbox_file_write` | Write/create a file |
| `sandbox_file_list` | List directory contents |
| `sandbox_file_mkdir` | Create a directory |
| `sandbox_file_remove` | Delete a file or directory |
| `sandbox_file_info` | Get file metadata (size, type, permissions) |

### Git Operations

| Tool | Description |
|------|-------------|
| `sandbox_git_clone` | Clone a repository (supports private repos with GITHUB_TOKEN) |
| `sandbox_git_status` | Get working tree status |
| `sandbox_git_commit` | Stage files and commit |
| `sandbox_git_push` | Push commits to remote |
| `sandbox_git_branch` | List, create, or switch branches |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `E2B_API_KEY` | Yes | Your E2B API key from [e2b.dev/dashboard](https://e2b.dev/dashboard) |
| `GITHUB_TOKEN` | No | GitHub personal access token for private repo access and `git push` |

## Architecture

```
src/
├── index.ts                  # MCP server entry point (stdio transport)
├── types.ts                  # Shared types and error helpers
├── services/
│   └── sandbox-manager.ts    # Sandbox registry (tracks active VMs)
└── tools/
    ├── sandbox.ts            # Lifecycle tools
    ├── commands.ts           # Command execution tools
    ├── filesystem.ts         # File operation tools
    └── git.ts                # Git operation tools
```

The server manages a registry of active sandbox instances. Each tool references sandboxes by ID, allowing concurrent work across multiple isolated environments.

## Important Notes

- **Sandboxes are real VMs.** Commands execute on actual Linux machines in E2B's cloud.
- **Git push is real.** Pushing from a sandbox pushes to the actual remote repository.
- **Sandboxes auto-expire.** Default timeout is 5 minutes. Use `sandbox_keep_alive` to extend.
- **E2B usage has costs.** Check [E2B pricing](https://e2b.dev/pricing) for details. Free tier is available.
- **Sandboxes are isolated from your machine**, but not from the internet. Network requests, git pushes, and npm publishes are real.

## License

MIT
