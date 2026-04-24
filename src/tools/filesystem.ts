import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sandboxManager } from '../services/sandbox-manager.js';
import { formatError, formatSuccess, truncateOutput } from '../types.js';

export function registerFilesystemTools(server: McpServer): void {

  server.tool(
    'sandbox_file_read',
    'Read the full text contents of a file in a sandbox and return it inline (read-only, no side effects). Output is truncated at 200KB for large files. Use this to inspect source code, config files, logs, or any text file. For binary files or very large files, use sandbox_download_url instead to get a download link. Fails if the file does not exist or the path points to a directory. Unlike sandbox_file_info (which returns metadata only) or sandbox_file_list (which lists directory contents), this returns the actual file content.',
    {
      sandboxId: z.string().describe('The sandbox ID containing the file.'),
      path: z.string().describe('Absolute path to the file inside the sandbox (e.g., "/home/user/repo/src/index.ts"). Must be a file, not a directory. Use sandbox_file_list to discover file paths.'),
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
    'Write text content to a file in a sandbox. Creates the file if it does not exist, and overwrites it completely if it does — there is no append mode. Parent directories are created automatically. Returns the file path and byte count written. Use this for creating or replacing source code, config files, scripts, or any text content. For uploading binary files from the local machine, use sandbox_upload_url instead. Unlike sandbox_file_rename (which moves files) or sandbox_file_remove (which deletes files), this creates or replaces file contents.',
    {
      sandboxId: z.string().describe('The sandbox ID to write the file in.'),
      path: z.string().describe('Absolute path for the file (e.g., "/home/user/repo/src/app.ts"). If the file exists, it will be completely overwritten. Parent directories are created automatically.'),
      content: z.string().describe('The full text content to write to the file. This replaces any existing content entirely. For large binary files, use sandbox_upload_url instead.'),
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
    'List files and directories in a sandbox directory (read-only, no side effects). Returns entries tagged as [FILE] or [DIR] with their names. Results are capped at 1000 entries for large directories. Use this to explore the sandbox filesystem, find files after cloning a repo, or verify that files were created. Fails if the path does not exist or is not a directory. Unlike sandbox_file_read (which returns file contents) or sandbox_file_info (which returns metadata for a single path), this lists directory contents.',
    {
      sandboxId: z.string().describe('The sandbox ID to list files in.'),
      path: z.string().optional().describe('Absolute path to a directory inside the sandbox (e.g., "/home/user/repo/src"). Defaults to "/home/user". Must be a directory, not a file.'),
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
    'Create a directory (and any missing parent directories) in a sandbox. Succeeds silently if the directory already exists. Use this to set up directory structure before writing files with sandbox_file_write or before uploading via sandbox_upload_url. Unlike sandbox_file_write (which creates files), this creates empty directories. Unlike sandbox_file_remove (which deletes), this only creates.',
    {
      sandboxId: z.string().describe('The sandbox ID to create the directory in.'),
      path: z.string().describe('Absolute path of the directory to create (e.g., "/home/user/repo/src/components"). All intermediate directories are created if they do not exist.'),
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
    'Permanently and irreversibly delete a file or directory in a sandbox. Directories are removed recursively including all contents. This operation cannot be undone — there is no trash or recycle bin. Fails with an error if the path does not exist. Use sandbox_file_exists to check before deleting if uncertain. Unlike sandbox_exec with "rm", this tool provides structured error reporting. For moving files instead of deleting, use sandbox_file_rename.',
    {
      sandboxId: z.string().describe('The sandbox ID containing the file or directory.'),
      path: z.string().describe('Absolute path of the file or directory to delete (e.g., "/home/user/repo/old-file.txt"). Must exist or the operation will fail.'),
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
    'Get metadata about a file or directory in a sandbox (read-only, no side effects). Returns the file type (file or directory), size in bytes, and permissions. Use this to check file size before reading, verify file type, or inspect permissions. Fails if the path does not exist — use sandbox_file_exists first if uncertain. Unlike sandbox_file_read (which returns file contents) or sandbox_file_list (which lists directory entries), this returns metadata for a single path.',
    {
      sandboxId: z.string().describe('The sandbox ID containing the file or directory.'),
      path: z.string().describe('Absolute path to inspect (e.g., "/home/user/repo/package.json"). Can be a file or directory.'),
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

  server.tool(
    'sandbox_file_exists',
    'Check whether a file or directory exists at a given path in a sandbox (read-only, no side effects). Returns {path, exists: true/false} — never throws an error for non-existent paths. Use this before sandbox_file_read, sandbox_file_remove, or sandbox_file_info to avoid errors on missing paths. Unlike sandbox_file_info (which fails if the path does not exist), this safely returns false. Unlike sandbox_file_list (which lists directory contents), this checks a single specific path.',
    {
      sandboxId: z.string().describe('The sandbox ID to check in.'),
      path: z.string().describe('Absolute path to check for existence (e.g., "/home/user/repo/package.json"). Can be a file or directory path.'),
    },
    async ({ sandboxId, path }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const exists = await sandbox.files.exists(path);
        return formatSuccess(JSON.stringify({ path, exists }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_file_rename',
    'Rename or move a file or directory within a sandbox. The source path must exist; the destination must not already exist. Works for both files and directories. Use this to reorganize project structure or rename files. Returns the old path, new path, and entry type. Unlike sandbox_file_remove (which deletes permanently), this preserves the file and changes its location or name. Unlike sandbox_file_write (which creates/overwrites content), this only changes the path.',
    {
      sandboxId: z.string().describe('The sandbox ID containing the file or directory.'),
      oldPath: z.string().describe('Current absolute path of the file or directory to rename/move (e.g., "/home/user/repo/old-name.ts"). Must exist.'),
      newPath: z.string().describe('New absolute path for the file or directory (e.g., "/home/user/repo/new-name.ts"). Parent directory must exist — use sandbox_file_mkdir first if needed.'),
    },
    async ({ sandboxId, oldPath, newPath }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const result = await sandbox.files.rename(oldPath, newPath);
        return formatSuccess(JSON.stringify({
          message: 'Renamed successfully',
          from: oldPath,
          to: newPath,
          type: result.type,
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );
}
