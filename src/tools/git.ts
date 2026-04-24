import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sandboxManager } from '../services/sandbox-manager.js';
import { formatError, formatSuccess } from '../types.js';

export function registerGitTools(server: McpServer): void {

  server.tool(
    'sandbox_git_clone',
    'Clone a git repository into a sandbox, downloading its files and history. This is typically the first step after sandbox_create — clone a repo, then use sandbox_exec to build/test. Creates a new directory at the destination path containing the repository. Supports both public and private repos (private repos require GITHUB_TOKEN to be configured). Default shallow clone (depth=1) downloads only the latest commit for faster cloning. Modifies the sandbox filesystem by creating the clone directory and writing all repo files. Fails if the destination path already exists or the repo URL is invalid. Unlike sandbox_git_pull (which updates an existing repo), this performs the initial download.',
    {
      sandboxId: z.string().describe('The sandbox ID to clone into. Must be an active sandbox created with sandbox_create.'),
      repoUrl: z.string().describe('Git repository URL (e.g., "https://github.com/user/repo"). HTTPS URLs only. For private repos, GITHUB_TOKEN must be configured at server startup.'),
      path: z.string().optional().describe('Destination path for the cloned repository. Defaults to "/home/user/repo". The directory must not already exist. Use this path in subsequent sandbox_exec and sandbox_git_* calls.'),
      branch: z.string().optional().describe('Specific branch to clone. Defaults to the repository\'s default branch (usually "main" or "master"). Use this to clone a feature branch or PR branch directly.'),
      depth: z.number().optional().describe('Shallow clone depth (number of commits). Default: 1 (latest commit only, fastest). Set 0 for full history (needed for git log, blame, or bisect). Values like 10 or 50 provide partial history.'),
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
    'Get the current git status of a repository in a sandbox (read-only, no side effects). Returns the current branch name, list of modified files, staged files, and untracked files. Use this before sandbox_git_commit to see what will be committed, or after sandbox_file_write to verify changes are detected. Unlike sandbox_git_branch (which manages branches) or sandbox_git_commit (which creates commits), this only inspects the current state. Fails if the path is not a git repository.',
    {
      sandboxId: z.string().describe('The sandbox ID containing the repository.'),
      repoPath: z.string().describe('Absolute path to the git repository in the sandbox (e.g., "/home/user/repo"). Must be a directory initialized with sandbox_git_clone or sandbox_git_init.'),
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
    'Stage files and create a git commit in a sandbox repository. This is a two-step operation: first stages the specified files (or all changes if none specified), then creates a commit with the given message. Modifies the git history — the commit is added to the current branch. Use sandbox_git_status first to see what changes are available to commit. After committing, use sandbox_git_push to upload to the remote. Fails if there are no changes to commit or if the path is not a git repository. Unlike sandbox_git_push (which uploads commits), this only creates a local commit.',
    {
      sandboxId: z.string().describe('The sandbox ID containing the repository.'),
      repoPath: z.string().describe('Absolute path to the git repository (e.g., "/home/user/repo"). Must be a valid git repository.'),
      message: z.string().describe('Commit message describing the changes. Should be concise and descriptive (e.g., "Fix login validation bug").'),
      files: z.array(z.string()).optional().describe('Specific file paths to stage, relative to repoPath (e.g., ["src/index.ts", "package.json"]). If omitted, stages all modified, added, and deleted files (equivalent to "git add -A").'),
      authorName: z.string().optional().describe('Git commit author name. If omitted, uses the repository\'s configured user.name or defaults.'),
      authorEmail: z.string().optional().describe('Git commit author email. If omitted, uses the repository\'s configured user.email or defaults.'),
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
    'Push local commits to the remote repository. This is a destructive external operation — commits become visible to others and cannot easily be undone. Requires GITHUB_TOKEN to be configured at server startup; fails immediately with a clear error if not set. Use sandbox_git_commit first to create local commits, then push. For new branches, set setUpstream to true. Unlike sandbox_git_pull (which downloads remote changes) or sandbox_git_commit (which only creates local commits), this uploads commits to the remote. Fails if there are no commits to push or the remote is unreachable.',
    {
      sandboxId: z.string().describe('The sandbox ID containing the repository.'),
      repoPath: z.string().describe('Absolute path to the git repository (e.g., "/home/user/repo"). Must have at least one commit to push.'),
      remote: z.string().optional().describe('Remote name to push to. Defaults to "origin". Most repositories only have one remote.'),
      branch: z.string().optional().describe('Branch name to push. Defaults to the currently checked-out branch. Must match a local branch with commits.'),
      setUpstream: z.boolean().optional().describe('Set upstream tracking reference. Set to true when pushing a newly created branch for the first time (equivalent to "git push -u"). Not needed for branches that already track a remote.'),
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
    'Manage git branches in a sandbox repository: list existing branches, create a new branch, or switch to a different branch. The "list" action is read-only. The "create" action creates a new branch from the current HEAD but does not switch to it. The "checkout" action switches the working directory to the specified branch, modifying files in place — any uncommitted changes may conflict. Requires branchName for "create" and "checkout" actions. Unlike sandbox_git_status (which shows current branch and file changes), this manages branch lifecycle. Unlike sandbox_git_commit or sandbox_git_push, this does not affect commit history.',
    {
      sandboxId: z.string().describe('The sandbox ID containing the repository.'),
      repoPath: z.string().describe('Absolute path to the git repository (e.g., "/home/user/repo"). Must be a valid git repository.'),
      action: z.enum(['list', 'create', 'checkout']).describe('The branch operation: "list" shows all local branches (read-only), "create" creates a new branch from current HEAD (does not switch to it), "checkout" switches the working directory to the specified branch (modifies files).'),
      branchName: z.string().optional().describe('Branch name for "create" or "checkout" actions (e.g., "feature/new-login"). Required for "create" and "checkout", ignored for "list". For "create", the name must not already exist. For "checkout", the branch must exist.'),
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

  server.tool(
    'sandbox_git_pull',
    'Fetch and merge latest changes from a remote into the current branch of a sandbox repository. Modifies the working directory and may cause merge conflicts if local changes overlap with remote changes. Requires a previously cloned repository (use sandbox_git_clone first). Unlike sandbox_git_clone (initial download) or sandbox_git_push (upload changes), this tool updates an existing local repo with remote changes. Returns the remote and branch that were pulled. Fails if the path is not a git repository or the remote is unreachable.',
    {
      sandboxId: z.string().describe('The sandbox ID containing the repository.'),
      repoPath: z.string().describe('Absolute path to an existing git repository in the sandbox (e.g., "/home/user/repo"). Must already be initialized via sandbox_git_clone or sandbox_git_init.'),
      remote: z.string().optional().describe('Remote name to pull from. Defaults to "origin". Use sandbox_git_branch to verify available remotes.'),
      branch: z.string().optional().describe('Branch to pull. Defaults to the currently checked-out branch. Use sandbox_git_branch with action "list" to see available branches.'),
    },
    async ({ sandboxId, repoPath, remote, branch }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        const opts: { remote?: string; branch?: string } = {};
        if (remote) opts.remote = remote;
        if (branch) opts.branch = branch;

        await sandbox.git.pull(repoPath, opts);

        return formatSuccess(JSON.stringify({
          message: 'Pulled successfully',
          remote: remote ?? 'origin',
          branch: branch ?? 'current',
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'sandbox_git_init',
    'Initialize a new empty git repository in a sandbox directory. Creates a .git directory at the specified path, enabling git operations (commit, branch, etc.) on files in that directory. Use this when starting a new project from scratch — not needed if you used sandbox_git_clone (which already initializes git). The directory must already exist; use sandbox_file_mkdir first if needed. Does not create any initial commit. Unlike sandbox_git_clone (which downloads an existing repo), this creates a fresh, empty repository.',
    {
      sandboxId: z.string().describe('The sandbox ID to initialize the repository in.'),
      path: z.string().describe('Absolute path to the directory where the git repository should be initialized (e.g., "/home/user/my-project"). The directory must already exist. A .git subdirectory will be created inside it.'),
    },
    async ({ sandboxId, path }) => {
      try {
        const sandbox = sandboxManager.get(sandboxId);
        await sandbox.git.init(path);
        return formatSuccess(JSON.stringify({
          message: 'Repository initialized',
          path,
        }, null, 2));
      } catch (error) {
        return formatError(error);
      }
    }
  );
}
