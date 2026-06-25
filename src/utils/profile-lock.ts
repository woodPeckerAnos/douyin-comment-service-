import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

const LOCK_FILES = ["SingletonLock", "SingletonCookie", "SingletonSocket"] as const;

export function extractPidFromLockName(lockName: string): number | null {
  const match = lockName.match(/-(\d+)$/);
  if (!match?.[1]) {
    return null;
  }
  const pid = Number.parseInt(match[1], 10);
  return Number.isFinite(pid) ? pid : null;
}

async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isProfileInUse(profileDir: string): boolean {
  try {
    const escaped = profileDir.replace(/'/g, "'\\''");
    const output = execSync(
      `pgrep -f 'user-data-dir=${escaped}' 2>/dev/null || true`,
      { encoding: "utf8" },
    ).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

async function removeLockFiles(profileDir: string): Promise<void> {
  for (const file of LOCK_FILES) {
    try {
      await fs.unlink(path.join(profileDir, file));
    } catch {
      // ignore missing lock files
    }
  }

  try {
    await fs.unlink(path.join(profileDir, "chrome.pid"));
  } catch {
    // ignore
  }
}

/**
 * Chrome 异常退出后可能残留 SingletonLock，导致 launchPersistentContext 阻塞或失败。
 */
export async function clearStaleProfileLocks(profileDir: string): Promise<boolean> {
  if (isProfileInUse(profileDir)) {
    return false;
  }

  const lockPath = path.join(profileDir, "SingletonLock");
  let shouldClear = false;

  try {
    await fs.access(lockPath);
    shouldClear = true;

    try {
      const lockTarget = await fs.readlink(lockPath);
      const pid = extractPidFromLockName(lockTarget);
      if (pid != null && (await isProcessRunning(pid))) {
        shouldClear = false;
      }
    } catch {
      // 非 symlink 的残留锁文件，且没有 Chrome 占用 profile，可清理
      shouldClear = true;
    }
  } catch {
    return false;
  }

  if (!shouldClear) {
    return false;
  }

  await removeLockFiles(profileDir);
  return true;
}

export class ProfileInUseError extends Error {
  constructor(profileDir: string) {
    super(
      `Browser profile is in use: ${profileDir}. Stop other Chrome/douyin services using this profile, or kill the stuck process.`,
    );
    this.name = "ProfileInUseError";
  }
}

export async function assertProfileAvailable(profileDir: string): Promise<void> {
  if (isProfileInUse(profileDir)) {
    throw new ProfileInUseError(profileDir);
  }
}
