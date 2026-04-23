import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sandboxManager } from '../services/sandbox-manager.js';
import { formatError, formatSuccess, truncateOutput } from '../types.js';

export function registerCommandTools(server: McpServer): void {

  server.tool(
    'sandbox_exec',
    'Execute a shell command in a sandbox and return stdout, stderr, and exit code. Use for running builds, tests, installs, or any CLI command.',
    {
      sandboxId: z.string().describe('The sandbox ID to run the command in.'),
      command: z.string().describe('The shell command to execute (e.g., "npm install", "python main.py").'),
      cwd: z.string().optional().describe('Working directory inside the sandbox. Defaults to /home/user.'),
      timeoutMs: z.number().optional().describe('Command timeout in milliseconds. Default: 120000 (2 min). Set 0 for no timeout.'),
      envs: z.record(z.string()).optional().describe('Environment variables to set for this command.'),
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
    'Start a background process in a sandbox (e.g., dev server, file watcher). Returns immediately without waiting for completion.',
    {
      sandboxId: z.string().describe('The sandbox ID to run the command in.'),
      command: z.string().describe('The shell command to run in the background.'),
      cwd: z.string().optional().describe('Working directory. Defaults to /home/user.'),
      envs: z.record(z.string()).optional().describe('Environment variables for this command.'),
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
    'List all running processes (commands and PTY sessions) in a sandbox. Shows PID, command, and arguments for each process.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
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
    'Kill a running process in a sandbox by its PID. Use sandbox_process_list to find the PID.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      pid: z.number().describe('Process ID to kill. Get PIDs from sandbox_process_list.'),
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
