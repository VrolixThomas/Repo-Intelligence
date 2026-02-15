/**
 * Claude CLI wrapper — finds the Claude Code binary and invokes it
 * with pre-built prompts, running inside the target repo directory.
 */

export interface ClaudeResult {
  ok: true;
  output: string;
  sessionId: string | null;
  durationMs: number;
}

export interface ClaudeError {
  ok: false;
  error: string;
  exitCode: number | null;
  durationMs: number;
}

export interface InvokeOptions {
  claudePath: string;
  prompt: string;
  repoPath: string;
  model?: string;          // default: "sonnet"
  allowedTools?: string[];  // default: ["Read", "Grep", "Glob"]
  timeoutMs?: number;       // default: 120_000
  sessionId?: string;       // for incremental analysis continuity
  resumeSessionId?: string; // resume an existing session instead of creating one
}

/**
 * Find the Claude CLI binary. Checks common locations.
 */
export async function findClaudeCli(): Promise<string | null> {
  const candidates = [
    "claude",                                      // in PATH
    "/usr/local/bin/claude",
    `${process.env.HOME}/.claude/local/claude`,
    `${process.env.HOME}/.local/bin/claude`,
  ];

  for (const candidate of candidates) {
    try {
      const proc = Bun.spawn(["which", candidate], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
      if (proc.exitCode === 0) {
        const path = await new Response(proc.stdout as ReadableStream).text();
        return path.trim();
      }
    } catch {
      
    }


    try {
      const proc = Bun.spawn([candidate, "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
      if (proc.exitCode === 0) {
        return candidate;
      }
    } catch {
    }
  }

  return null;
}

/**
 * Invoke Claude Code CLI with the given prompt, running in the target repo directory.
 *
 * Uses `Bun.spawn()` with the prompt passed as a positional argument to `claude -p`.
 * The process runs with `cwd` set to the target repo so Claude has natural codebase access.
 */
export async function invokeClaude(opts: InvokeOptions): Promise<ClaudeResult | ClaudeError> {
  const {
    claudePath,
    prompt,
    repoPath,
    model = "sonnet",
    allowedTools = ["Read", "Grep", "Glob"],
    timeoutMs = 120_000,
    sessionId,
    resumeSessionId,
  } = opts;

  const args = [
    claudePath,
    "-p",
    prompt,
    "--model", model,
    "--output-format", "text",
  ];

  if (allowedTools.length > 0) {
    args.push("--allowedTools", allowedTools.join(","));
  }

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  } else if (sessionId) {
    args.push("--session-id", sessionId);
  }

  const start = Date.now();

  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(args, {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        // Ensure Bun is in PATH for Claude's own subprocesses
        PATH: `/Users/Werk/.bun/bin:${process.env.PATH ?? ""}`,
      },
    });
  } catch (err: any) {
    return {
      ok: false,
      error: `Failed to spawn Claude CLI: ${err.message}`,
      exitCode: null,
      durationMs: Date.now() - start,
    };
  }

  // Set up timeout
  const timeout = setTimeout(() => {
    try { proc.kill(); } catch { }
  }, timeoutMs);

  try {
    const exitCode = await proc.exited;
    clearTimeout(timeout);

    const durationMs = Date.now() - start;
    const stdout = await new Response(proc.stdout as ReadableStream).text();
    const stderr = await new Response(proc.stderr as ReadableStream).text();

    if (exitCode !== 0) {
      return {
        ok: false,
        error: stderr.trim() || stdout.trim() || `Exit code ${exitCode}`,
        exitCode,
        durationMs,
      };
    }

    // Try to extract session ID from stderr (Claude CLI logs it there)
    const sessionMatch = stderr.match(/session[:\s]+([a-f0-9-]+)/i);
    const detectedSessionId = sessionMatch?.[1] ?? sessionId ?? null;

    return {
      ok: true,
      output: stdout.trim(),
      sessionId: detectedSessionId,
      durationMs,
    };
  } catch (err: any) {
    clearTimeout(timeout);
    return {
      ok: false,
      error: `Claude invocation failed: ${err.message}`,
      exitCode: null,
      durationMs: Date.now() - start,
    };
  }
}
