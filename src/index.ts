#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerSandboxTools } from './tools/sandbox.js';
import { registerCommandTools } from './tools/commands.js';
import { registerFilesystemTools } from './tools/filesystem.js';
import { registerGitTools } from './tools/git.js';

const server = new McpServer({
  name: 'e2b-sandbox',
  version: '1.0.0',
});

registerSandboxTools(server);
registerCommandTools(server);
registerFilesystemTools(server);
registerGitTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[INFO] E2B Sandbox MCP Server running on stdio');
  console.error(`[INFO] E2B API key: ${process.env.E2B_API_KEY ? 'configured' : 'NOT SET — sandbox_create will fail'}`);
  console.error(`[INFO] GitHub auth: ${process.env.GITHUB_TOKEN ? 'configured' : 'not configured'}`);
}

main().catch(error => {
  console.error('[ERROR] Fatal error in main():', error);
  process.exit(1);
});
