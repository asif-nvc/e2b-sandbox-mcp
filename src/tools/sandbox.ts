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

  server.tool(
    'sandbox_pause',
    'Pause a sandbox to preserve its state. The sandbox can be resumed later with sandbox_resume using the same sandbox ID. Paused sandboxes persist across sessions and do not count against timeout.',
    {
      sandboxId: z.string().describe('The sandbox ID to pause.'),
    },
    async ({ sandboxId }) => {
      try {
        await sandboxManager.pause(sandboxId);
        return formatSuccess(JSON.stringify({
          message: 'Sandbox paused successfully',
          sandboxId,
          hint: 'Use sandbox_resume with this sandboxId to resume later.',
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_resume',
    'Resume a previously paused sandbox. Reconnects to the sandbox and restores its state including filesystem and running processes.',
    {
      sandboxId: z.string().describe('The sandbox ID of the paused sandbox to resume.'),
      timeoutMs: z.number().optional().describe('New timeout in milliseconds after resuming. Default: 300000 (5 min).'),
    },
    async ({ sandboxId, timeoutMs }) => {
      try {
        const info = await sandboxManager.resume(sandboxId, timeoutMs);
        return formatSuccess(JSON.stringify({
          message: 'Sandbox resumed successfully',
          sandboxId: info.sandboxId,
          gitAuth: process.env.GITHUB_TOKEN ? 'configured' : 'not configured',
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_get_url',
    'Get the public URL for a port running inside a sandbox. Use this to access dev servers, web apps, or any HTTP service running in the sandbox from a browser.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      port: z.number().describe('The port number the service is listening on inside the sandbox (e.g., 3000, 8080).'),
    },
    async ({ sandboxId, port }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const host = sandbox.getHost(port);
        return formatSuccess(JSON.stringify({
          url: `https://${host}`,
          host,
          port,
          hint: 'Open this URL in a browser to access the service.',
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_upload_url',
    'Get a presigned URL to upload a file to the sandbox. Send a POST request with the file as multipart/form-data to the returned URL.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      path: z.string().optional().describe('Destination path inside the sandbox. Defaults to /home/user.'),
    },
    async ({ sandboxId, path }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const url = await sandbox.uploadUrl(path);
        return formatSuccess(JSON.stringify({
          uploadUrl: url,
          destinationPath: path ?? '/home/user',
          hint: 'POST a file as multipart/form-data to this URL.',
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_download_url',
    'Get a presigned URL to download a file from the sandbox. Use this to retrieve build artifacts, logs, or any file from the sandbox.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      path: z.string().describe('Absolute path to the file inside the sandbox to download.'),
    },
    async ({ sandboxId, path }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const url = await sandbox.downloadUrl(path);
        return formatSuccess(JSON.stringify({
          downloadUrl: url,
          filePath: path,
          hint: 'Open this URL or use curl/wget to download the file.',
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );
}
