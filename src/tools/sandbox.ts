import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sandboxManager } from '../services/sandbox-manager.js';
import { formatError, formatSuccess } from '../types.js';

export function registerSandboxTools(server: McpServer): void {

  server.tool(
    'sandbox_create',
    'Create a new E2B cloud sandbox (secure Linux VM). Returns a sandboxId to use with other tools.',
    {
      templateId: z.string().optional().describe('Sandbox template ID. Defaults to "base". Use a custom template for pre-configured environments.'),
      timeoutMs: z.number().optional().describe('Sandbox timeout in milliseconds. Default: 300000 (5 min). Max: 86400000 (24h on Pro).'),
      metadata: z.record(z.string()).optional().describe('Key-value labels for the sandbox (e.g., {"repo": "user/project"}).'),
    },
    async ({ templateId, timeoutMs, metadata }) => {
      try {
        const info = await sandboxManager.create(templateId, timeoutMs, metadata);
        return formatSuccess(JSON.stringify({
          message: 'Sandbox created successfully',
          sandboxId: info.sandboxId,
          templateId: info.templateId,
          createdAt: info.createdAt,
          metadata: info.metadata,
          gitAuth: process.env.GITHUB_TOKEN ? 'configured' : 'not configured (set GITHUB_TOKEN for private repos)',
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_list',
    'List all active E2B sandboxes managed by this server.',
    {},
    async () => {
      try {
        const sandboxes = sandboxManager.list();
        if (sandboxes.length === 0) {
          return formatSuccess('No active sandboxes. Create one with sandbox_create.');
        }
        return formatSuccess(JSON.stringify(sandboxes, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_info',
    'Get details about a specific sandbox.',
    {
      sandboxId: z.string().describe('The sandbox ID to get info for.'),
    },
    async ({ sandboxId }) => {
      try {
        const info = sandboxManager.getInfo(sandboxId);
        return formatSuccess(JSON.stringify(info, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_kill',
    'Terminate and clean up a sandbox. The sandbox and all its data will be destroyed.',
    {
      sandboxId: z.string().describe('The sandbox ID to terminate.'),
    },
    async ({ sandboxId }) => {
      try {
        await sandboxManager.kill(sandboxId);
        return formatSuccess(`Sandbox "${sandboxId}" terminated successfully.`);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_keep_alive',
    'Extend a sandbox timeout to prevent it from being automatically terminated.',
    {
      sandboxId: z.string().describe('The sandbox ID to extend.'),
      timeoutMs: z.number().describe('New timeout in milliseconds from now.'),
    },
    async ({ sandboxId, timeoutMs }) => {
      try {
        await sandboxManager.keepAlive(sandboxId, timeoutMs);
        return formatSuccess(`Sandbox "${sandboxId}" timeout extended by ${Math.round(timeoutMs / 1000)}s.`);
      } catch (error) {
        return formatError(error);
      }
    }
  );
}
