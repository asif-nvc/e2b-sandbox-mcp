import { Sandbox } from 'e2b';
import { TrackedSandbox } from '../types.js';

class SandboxManager {
  private sandboxes = new Map<string, { sandbox: Sandbox; info: TrackedSandbox }>();

  async create(templateId?: string, timeoutMs?: number, metadata?: Record<string, string>): Promise<TrackedSandbox> {
    if (!process.env.E2B_API_KEY) {
      throw new Error('E2B_API_KEY environment variable is not set. Get your key at https://e2b.dev/dashboard');
    }

    const opts: { timeoutMs?: number } = {};
    if (timeoutMs) opts.timeoutMs = timeoutMs;

    const sandbox = templateId
      ? await Sandbox.create(templateId, opts)
      : await Sandbox.create(opts);

    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      await sandbox.git.dangerouslyAuthenticate({
        username: 'git',
        password: githubToken,
      });
    }

    const info: TrackedSandbox = {
      sandboxId: sandbox.sandboxId,
      templateId: templateId ?? 'base',
      createdAt: new Date().toISOString(),
      metadata: metadata ?? {},
    };

    this.sandboxes.set(sandbox.sandboxId, { sandbox, info });
    return info;
  }

  get(sandboxId: string): Sandbox {
    const entry = this.sandboxes.get(sandboxId);
    if (!entry) {
      const available = [...this.sandboxes.keys()];
      const hint = available.length > 0
        ? `Available sandboxes: ${available.join(', ')}`
        : 'No active sandboxes. Create one with sandbox_create.';
      throw new Error(`Sandbox "${sandboxId}" not found. ${hint}`);
    }
    return entry.sandbox;
  }

  async kill(sandboxId: string): Promise<void> {
    const entry = this.sandboxes.get(sandboxId);
    if (entry) {
      await entry.sandbox.kill();
      this.sandboxes.delete(sandboxId);
    } else {
      throw new Error(`Sandbox "${sandboxId}" not found.`);
    }
  }

  async pause(sandboxId: string): Promise<void> {
    const entry = this.sandboxes.get(sandboxId);
    if (!entry) throw new Error(`Sandbox "${sandboxId}" not found.`);
    await entry.sandbox.pause();
    this.sandboxes.delete(sandboxId);
  }

  async resume(sandboxId: string, timeoutMs?: number): Promise<TrackedSandbox> {
    const opts: { timeoutMs?: number } = {};
    if (timeoutMs) opts.timeoutMs = timeoutMs;

    const sandbox = await Sandbox.connect(sandboxId, opts);

    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      await sandbox.git.dangerouslyAuthenticate({
        username: 'git',
        password: githubToken,
      });
    }

    const info: TrackedSandbox = {
      sandboxId: sandbox.sandboxId,
      templateId: 'resumed',
      createdAt: new Date().toISOString(),
      metadata: {},
    };

    this.sandboxes.set(sandbox.sandboxId, { sandbox, info });
    return info;
  }

  async keepAlive(sandboxId: string, timeoutMs: number): Promise<void> {
    this.get(sandboxId);
    await Sandbox.setTimeout(sandboxId, timeoutMs);
  }

  list(): TrackedSandbox[] {
    return [...this.sandboxes.values()].map(e => e.info);
  }

  getInfo(sandboxId: string): TrackedSandbox {
    const entry = this.sandboxes.get(sandboxId);
    if (!entry) throw new Error(`Sandbox "${sandboxId}" not found.`);
    return entry.info;
  }

  removeStaleSandbox(sandboxId: string): void {
    this.sandboxes.delete(sandboxId);
  }
}

export const sandboxManager = new SandboxManager();
