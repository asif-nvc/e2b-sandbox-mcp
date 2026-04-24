import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sandboxManager } from '../services/sandbox-manager.js';
import { formatError, formatSuccess, truncateOutput } from '../types.js';

export function registerCommandTools(server: McpServer): void {

  server.tool(
    'sandbox_exec',
    'Execute a shell command in a sandbox and wait for it to complete. Returns stdout, stderr, and exit code. Modifies the sandbox filesystem and state depending on the command (e.g., "npm install" adds node_modules, "rm -rf" deletes files). Output is truncated at 100KB per stream (stdout/stderr) to prevent context overflow. Use this for commands that finish quickly (builds, tests, installs, scripts). For long-running processes like dev servers or watchers, use sandbox_exec_background instead — sandbox_exec will block until the command exits or times out. If the sandbox has expired, returns an error and removes it from the registry.',
    {
      sandboxId: z.string().describe('The sandbox ID to run the command in. Must be an active sandbox.'),
      command: z.string().describe('The shell command to execute (e.g., "npm install", "python main.py", "ls -la"). Runs in bash. Supports pipes, redirects, and chaining with && or ;.'),
      cwd: z.string().optional().describe('Working directory inside the sandbox. Defaults to "/home/user". Use the path returned by sandbox_git_clone to run commands in a cloned repository.'),
      timeoutMs: z.number().optional().describe('Command timeout in milliseconds. Default: 120000 (2 min). The command is killed if it exceeds this. Set higher for long builds (e.g., 600000 for 10 min). Set 0 for no timeout (use with caution).'),
      envs: z.record(z.string()).optional().describe('Environment variables to set for this command only (e.g., {"NODE_ENV": "production", "DEBUG": "true"}). These do not persist across calls.'),
    },
    async ({ sandboxId, command, cwd, timeoutMs, envs }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const result = await sandbox.commands.run(command, {
          cwd: cwd ?? '/home/user',
          timeoutMs: timeoutMs ?? 120_000,
          envs,
        });

        const output = JSON.stringify({
          exitCode: result.exitCode,
          stdout: truncateOutput(result.stdout, 100_000),
          stderr: truncateOutput(result.stderr, 100_000),
        }, null, 2);

        return formatSuccess(output);
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          sandboxManager.removeStaleSandbox(sandboxId);
          return formatError(new Error(`Sandbox "${sandboxId}" has expired. Create a new one with sandbox_create.`));
        }
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_exec_background',
    'Start a long-running background process in a sandbox (e.g., dev server, file watcher, database) and return immediately with its PID. Does not wait for the command to complete and does not stream output — use this for processes that run indefinitely. The process continues running until the sandbox expires, is killed with sandbox_process_kill, or exits on its own. Use sandbox_process_list to check if it is still running. To access a web server started this way, use sandbox_get_url with the port number. Unlike sandbox_exec (which blocks until completion), this returns immediately.',
    {
      sandboxId: z.string().describe('The sandbox ID to run the process in. Must be an active sandbox.'),
      command: z.string().describe('The shell command to run in the background (e.g., "npm run dev", "python -m http.server 8080", "redis-server"). The process will keep running after this tool returns.'),
      cwd: z.string().optional().describe('Working directory for the process. Defaults to "/home/user". Use the cloned repo path for running dev servers.'),
      envs: z.record(z.string()).optional().describe('Environment variables for this process (e.g., {"PORT": "3000"}). These do not affect other commands.'),
    },
    async ({ sandboxId, command, cwd, envs }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const handle = await sandbox.commands.run(command, {
          background: true,
          cwd: cwd ?? '/home/user',
          envs,
        });

        return formatSuccess(JSON.stringify({
          message: 'Background process started',
          pid: handle.pid,
          command,
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_process_list',
    'List all running processes in a sandbox (read-only, no side effects). Returns PID, command name, arguments, and tag for each process. Use this to find the PID of a background process started with sandbox_exec_background so you can kill it with sandbox_process_kill, or to verify a process is still running. Returns an empty message if no processes are active. Unlike sandbox_exec (which runs a new command), this inspects what is already running.',
    {
      sandboxId: z.string().describe('The sandbox ID to inspect. Must be an active sandbox.'),
    },
    async ({ sandboxId }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const processes = await sandbox.commands.list();

        if (processes.length === 0) {
          return formatSuccess('No running processes.');
        }

        const formatted = processes.map(p => ({
          pid: p.pid,
          command: p.cmd,
          args: p.args,
          tag: p.tag,
        }));

        return formatSuccess(JSON.stringify(formatted, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_process_kill',
    'Terminate a running process in a sandbox by its PID. The process is stopped immediately and cannot be resumed. Use sandbox_process_list first to find the PID of the process you want to kill. Common use: stopping a dev server started with sandbox_exec_background before starting a new one on the same port. Returns success if the process was found and killed, or an error if the PID does not exist. Unlike sandbox_kill (which destroys the entire sandbox), this only stops one process.',
    {
      sandboxId: z.string().describe('The sandbox ID containing the process. Must be an active sandbox.'),
      pid: z.number().describe('Process ID to kill. Obtain PIDs by calling sandbox_process_list first. Using an incorrect PID returns an error.'),
    },
    async ({ sandboxId, pid }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const killed = await sandbox.commands.kill(pid);
        if (killed) {
          return formatSuccess(`Process ${pid} killed successfully.`);
        }
        return formatError(new Error(`Process ${pid} not found.`));
      } catch (error) {
        return formatError(error);
      }
    }
  );
}
