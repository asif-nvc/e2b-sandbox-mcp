import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sandboxManager } from '../services/sandbox-manager.js';
import { formatError, formatSuccess } from '../types.js';

export function registerGitTools(server: McpServer): void {

  server.tool(
    'sandbox_git_clone',
    'Clone a GitHub repository into a sandbox. Supports private repos when GITHUB_TOKEN is configured.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      repoUrl: z.string().describe('Git repository URL (e.g., "https://github.com/user/repo").'),
      path: z.string().optional().describe('Clone destination path. Defaults to /home/user/repo.'),
      branch: z.string().optional().describe('Branch to clone. Defaults to the default branch.'),
      depth: z.number().optional().describe('Shallow clone depth. Default: 1 for faster cloning. Set 0 for full history.'),
    },
    async ({ sandboxId, repoUrl, path, branch, depth }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const clonePath = path ?? '/home/user/repo';
        const cloneDepth = depth === 0 ? undefined : (depth ?? 1);

        const opts: { path: string; branch?: string; depth?: number } = { path: clonePath };
        if (branch) opts.branch = branch;
        if (cloneDepth) opts.depth = cloneDepth;

        await sandbox.git.clone(repoUrl, opts);

        return formatSuccess(JSON.stringify({
          message: 'Repository cloned successfully',
          repoUrl,
          path: clonePath,
          branch: branch ?? 'default',
          depth: cloneDepth ?? 'full',
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_git_status',
    'Get the git status of a repository in a sandbox (current branch, modified/staged/untracked files).',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      repoPath: z.string().describe('Path to the git repository in the sandbox.'),
    },
    async ({ sandboxId, repoPath }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const status = await sandbox.git.status(repoPath);
        return formatSuccess(JSON.stringify(status, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_git_commit',
    'Stage files and create a git commit in a sandbox repository.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      repoPath: z.string().describe('Path to the git repository.'),
      message: z.string().describe('Commit message.'),
      files: z.array(z.string()).optional().describe('Specific files to stage. If omitted, stages all changes.'),
      authorName: z.string().optional().describe('Commit author name.'),
      authorEmail: z.string().optional().describe('Commit author email.'),
    },
    async ({ sandboxId, repoPath, message, files, authorName, authorEmail }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);

        if (files && files.length > 0) {
          await sandbox.git.add(repoPath, { files });
        } else {
          await sandbox.git.add(repoPath);
        }

        const commitOpts: { authorName?: string; authorEmail?: string } = {};
        if (authorName) commitOpts.authorName = authorName;
        if (authorEmail) commitOpts.authorEmail = authorEmail;

        await sandbox.git.commit(repoPath, message, commitOpts);

        return formatSuccess(JSON.stringify({
          message: 'Committed successfully',
          commitMessage: message,
          filesStaged: files ?? 'all',
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_git_push',
    'Push commits to a remote repository. Requires GITHUB_TOKEN for authentication.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      repoPath: z.string().describe('Path to the git repository.'),
      remote: z.string().optional().describe('Remote name. Defaults to "origin".'),
      branch: z.string().optional().describe('Branch to push. Defaults to current branch.'),
      setUpstream: z.boolean().optional().describe('Set upstream tracking. Use true when pushing a new branch.'),
    },
    async ({ sandboxId, repoPath, remote, branch, setUpstream }) => {
      try {
        if (!process.env.GITHUB_TOKEN) {
          return formatError(new Error('GITHUB_TOKEN is not set. Push requires authentication. Set GITHUB_TOKEN environment variable.'));
        }

        const sandbox = sandboxManager.get(sandboxId);
        const pushOpts: { remote?: string; branch?: string; setUpstream?: boolean } = {};
        if (remote) pushOpts.remote = remote;
        if (branch) pushOpts.branch = branch;
        if (setUpstream) pushOpts.setUpstream = setUpstream;

        await sandbox.git.push(repoPath, pushOpts);

        return formatSuccess(JSON.stringify({
          message: 'Pushed successfully',
          remote: remote ?? 'origin',
          branch: branch ?? 'current',
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_git_branch',
    'Manage git branches: list, create, or switch branches in a sandbox repository.',
    {
      sandboxId: z.string().describe('The sandbox ID.'),
      repoPath: z.string().describe('Path to the git repository.'),
      action: z.enum(['list', 'create', 'checkout']).describe('"list" to show branches, "create" to make a new branch, "checkout" to switch branches.'),
      branchName: z.string().optional().describe('Branch name (required for "create" and "checkout" actions).'),
    },
    async ({ sandboxId, repoPath, action, branchName }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);

        if (action === 'list') {
          const branches = await sandbox.git.branches(repoPath);
          return formatSuccess(JSON.stringify(branches, null, 2));
        }

        if (!branchName) {
          return formatError(new Error(`branchName is required for "${action}" action.`));
        }

        if (action === 'create') {
          await sandbox.git.createBranch(repoPath, branchName);
          return formatSuccess(`Branch "${branchName}" created.`);
        }

        if (action === 'checkout') {
          await sandbox.git.checkoutBranch(repoPath, branchName);
          return formatSuccess(`Switched to branch "${branchName}".`);
        }

        return formatError(new Error(`Unknown action: ${action}`));
      } catch (error) {
        return formatError(error);
      }
    }
  );
}
