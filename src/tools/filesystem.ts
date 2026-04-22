import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sandboxManager } from '../services/sandbox-manager.js';
import { formatError, formatSuccess, truncateOutput } from '../types.js';

export function registerFilesystemTools(server: McpServer): void {

  server.tool(
    'sandbox_file_read',
    'Read the contents of a file in a sandbox.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      path: z.string().describe('Absolute path to the file inside the sandbox.'),
    },
    async ({ sandboxId, path }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const content = await sandbox.files.read(path);
        return formatSuccess(truncateOutput(content));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_file_write',
    'Write content to a file in a sandbox. Creates parent directories automatically. Overwrites if file exists.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      path: z.string().describe('Absolute path to the file inside the sandbox.'),
      content: z.string().describe('The content to write to the file.'),
    },
    async ({ sandboxId, path, content }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        await sandbox.files.write(path, content);
        return formatSuccess(`File written: ${path} (${content.length} bytes)`);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_file_list',
    'List files and directories in a sandbox path.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      path: z.string().optional().describe('Directory path to list. Defaults to /home/user.'),
    },
    async ({ sandboxId, path }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const entries = await sandbox.files.list(path ?? '/home/user');

        const formatted = entries.slice(0, 1000).map(e => {
          const type = e.type === 'dir' ? '[DIR]' : '[FILE]';
          return `${type} ${e.name}`;
        });

        if (entries.length > 1000) {
          formatted.push(`\n... and ${entries.length - 1000} more entries`);
        }

        return formatSuccess(formatted.join('\n'));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_file_mkdir',
    'Create a directory (and parent directories) in a sandbox.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      path: z.string().describe('Absolute path of the directory to create.'),
    },
    async ({ sandboxId, path }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        await sandbox.files.makeDir(path);
        return formatSuccess(`Directory created: ${path}`);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_file_remove',
    'Delete a file or directory in a sandbox.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      path: z.string().describe('Absolute path of the file or directory to delete.'),
    },
    async ({ sandboxId, path }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        await sandbox.files.remove(path);
        return formatSuccess(`Removed: ${path}`);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_file_info',
    'Get metadata about a file or directory in a sandbox (size, type, permissions).',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      path: z.string().describe('Absolute path to get info for.'),
    },
    async ({ sandboxId, path }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const info = await sandbox.files.getInfo(path);
        return formatSuccess(JSON.stringify(info, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );
}
