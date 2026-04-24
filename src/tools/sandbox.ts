import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sandboxManager } from '../services/sandbox-manager.js';
import { formatError, formatSuccess } from '../types.js';

export function registerSandboxTools(server: McpServer): void {

  server.tool(
    'sandbox_create',
    'Create a new E2B cloud sandbox (isolated Linux VM) and return its sandboxId for use with all other sandbox_* tools. This is the entry point — call this before any other sandbox operation. The sandbox auto-expires after the timeout (default 5 min); use sandbox_keep_alive to extend or sandbox_pause to persist indefinitely. If GITHUB_TOKEN is set, git authentication is configured automatically for private repo access. Returns sandboxId, templateId, creation timestamp, metadata, and git auth status. Consumes E2B API quota (check e2b.dev/pricing for limits).',
    {
      templateId: z.string().optional().describe('Sandbox template ID (e.g., "base", "python", or a custom template). Defaults to "base" (Ubuntu with common tools). Use a custom template for pre-installed languages, databases, or project dependencies.'),
      timeoutMs: z.number().optional().describe('Auto-expiry timeout in milliseconds. Default: 300000 (5 min). Max: 86400000 (24h on Pro plan). After this, the sandbox is destroyed and all data is lost. Use sandbox_keep_alive to extend or sandbox_pause to preserve state.'),
      metadata: z.record(z.string()).optional().describe('Key-value labels for identifying the sandbox later (e.g., {"repo": "user/project", "purpose": "testing"}). Returned by sandbox_list and sandbox_info.'),
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
    'List all active E2B sandboxes managed by this server (read-only, no side effects). Returns an array of sandbox summaries including sandboxId, templateId, creation time, and metadata for each. Returns an empty message if no sandboxes exist. Use this to find sandbox IDs when you have lost track of them. Unlike sandbox_info (which returns full details for one sandbox), this returns a summary of all sandboxes. Does not include paused sandboxes — those must be resumed with sandbox_resume using their original sandboxId.',
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
    'Get detailed metadata about a specific sandbox (read-only, no side effects). Returns the sandbox ID, template ID, creation timestamp, and any custom metadata labels. Use this to inspect a single sandbox by ID. Unlike sandbox_list (which returns a summary of all active sandboxes), this tool provides full details for one sandbox. Fails with an error if the sandbox ID is not found in the active registry.',
    {
      sandboxId: z.string().describe('The sandbox ID to inspect. Must be an active sandbox returned by sandbox_create or sandbox_list. Use sandbox_list first if you do not know the ID.'),
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
    'Permanently terminate and destroy a sandbox, including all files, processes, and state. This is irreversible — all data in the sandbox is lost. Use sandbox_pause instead if you want to preserve state for later. To save files before killing, use sandbox_download_url or sandbox_file_read first. Fails if the sandbox ID is not found. After killing, the sandboxId is no longer valid for any operations.',
    {
      sandboxId: z.string().describe('The sandbox ID to terminate. Must be an active sandbox from sandbox_create or sandbox_list.'),
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
    'Extend the auto-expiry timeout of an active sandbox to prevent automatic termination (no other side effects). The new timeout starts from now, not from the original creation time. Use this when a sandbox is about to expire but you still need it. For indefinite persistence, use sandbox_pause instead. Fails if the sandbox ID is not found. Returns confirmation with the new timeout duration.',
    {
      sandboxId: z.string().describe('The sandbox ID to extend. Must be an active (not paused or killed) sandbox.'),
      timeoutMs: z.number().describe('New timeout in milliseconds from now (e.g., 300000 for 5 min, 3600000 for 1 hour). The sandbox will auto-terminate after this duration unless extended again.'),
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
    'Pause an active sandbox to persist its full state (filesystem, installed packages, configuration) for later resumption. The sandbox is removed from the active registry and its timeout stops counting. Resume it later with sandbox_resume using the same sandboxId — even across different sessions. Unlike sandbox_kill (which destroys everything), pause preserves state. Running processes may not survive pause/resume. Use this for long-running development sessions where you want to continue later. Fails if the sandbox ID is not found.',
    {
      sandboxId: z.string().describe('The sandbox ID to pause. Must be an active sandbox. Save the returned sandboxId to resume later with sandbox_resume.'),
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
    'Resume a previously paused sandbox, restoring its filesystem and state. The sandbox becomes active again with a new timeout and is re-added to the active registry. If GITHUB_TOKEN is configured, git authentication is automatically re-established. Only works on sandboxes paused with sandbox_pause — not on killed or expired sandboxes. After resuming, use all other sandbox_* tools normally. Fails if the sandboxId does not correspond to a paused sandbox.',
    {
      sandboxId: z.string().describe('The sandbox ID of the paused sandbox to resume. This is the same ID returned by sandbox_create and sandbox_pause.'),
      timeoutMs: z.number().optional().describe('New auto-expiry timeout in milliseconds after resuming. Default: 300000 (5 min). Use sandbox_keep_alive to extend later if needed.'),
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
    'Get a public HTTPS URL for accessing a service running on a specific port inside a sandbox (read-only, no side effects). Use this after starting a dev server or web app with sandbox_exec_background to preview it in a browser. The URL is publicly accessible — anyone with the link can reach the service. Returns the full URL, host, and port. A service must already be listening on the specified port; this tool does not start any service. Unlike sandbox_upload_url/sandbox_download_url (for file transfer), this provides live access to running HTTP services.',
    {
      sandboxId: z.string().describe('The sandbox ID running the service.'),
      port: z.number().describe('The port number the service is listening on inside the sandbox (e.g., 3000 for React/Next.js, 8080 for Express, 5173 for Vite). The service must already be running.'),
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
    'Generate a temporary presigned URL for uploading a file into the sandbox (read-only, no side effects on the sandbox until the URL is used). The returned URL accepts a POST request with the file as multipart/form-data. The URL expires after a short period. Use this to transfer local files into the sandbox; for writing text content directly, use sandbox_file_write instead. Unlike sandbox_download_url (which retrieves files from the sandbox), this uploads files into it.',
    {
      sandboxId: z.string().describe('The sandbox ID to upload the file to.'),
      path: z.string().optional().describe('Destination directory path inside the sandbox where the uploaded file will be placed. Defaults to "/home/user". The directory must exist — use sandbox_file_mkdir to create it first if needed.'),
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
    'Generate a temporary presigned URL for downloading a file from the sandbox (read-only, no side effects). Use this to retrieve build artifacts, logs, binaries, or any file from the sandbox to the local machine. The URL can be opened in a browser or fetched with curl/wget. The URL expires after a short period. For reading file contents directly as text, use sandbox_file_read instead — it returns the content inline. Unlike sandbox_upload_url (which sends files to the sandbox), this retrieves files from it. Fails if the file path does not exist.',
    {
      sandboxId: z.string().describe('The sandbox ID containing the file.'),
      path: z.string().describe('Absolute path to the file inside the sandbox to download (e.g., "/home/user/repo/dist/bundle.js"). Must be a file, not a directory. Use sandbox_file_list to find available files.'),
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
