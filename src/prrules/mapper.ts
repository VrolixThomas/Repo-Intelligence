/**
 * Map PR comment file paths to the nearest CLAUDE.md target.
 *
 * Generic approach: discovers all CLAUDE.md files in the repo,
 * then for any file path walks up parent directories to find the
 * nearest CLAUDE.md. Works with any repo structure.
 */

import { Glob } from "bun";
import * as path from "path";

export interface ClaudeMdTarget {
  claudeMdPath: string;     // Absolute path to CLAUDE.md
  projectName: string;      // Directory name (e.g. "Portal.Web") or "root"
  relativePath: string;     // Relative to repo root (e.g. "src/Portal/Portal.Web/CLAUDE.md")
}

export interface ClaudeMdIndex {
  targets: ClaudeMdTarget[];
  /** Map from directory (relative to repo root) to target */
  dirMap: Map<string, ClaudeMdTarget>;
  /** Sorted directory prefixes, longest first (for matching) */
  sortedDirs: string[];
  /** Root CLAUDE.md */
  rootTarget: ClaudeMdTarget | null;
}

/**
 * Build an index of all CLAUDE.md files in a repo.
 * Works with any directory structure.
 */
export async function buildClaudeMdIndex(repoPath: string): Promise<ClaudeMdIndex> {
  const glob = new Glob("**/CLAUDE.md");
  const targets: ClaudeMdTarget[] = [];
  const dirMap = new Map<string, ClaudeMdTarget>();
  let rootTarget: ClaudeMdTarget | null = null;

  for await (const match of glob.scan({ cwd: repoPath, absolute: false })) {
    const relativePath = match;
    const absolutePath = path.join(repoPath, relativePath);
    const dir = path.dirname(relativePath);

    // Use the last directory component as project name, or "root" for top-level
    const projectName = dir === "." ? "root" : path.basename(dir);

    const target: ClaudeMdTarget = { claudeMdPath: absolutePath, projectName, relativePath };
    targets.push(target);

    if (dir === ".") {
      rootTarget = target;
      dirMap.set(".", target);
    } else {
      dirMap.set(dir, target);
    }
  }

  // Sort directories longest-first so we match most specific first
  const sortedDirs = [...dirMap.keys()]
    .filter(d => d !== ".")
    .sort((a, b) => b.length - a.length);

  return { targets, dirMap, sortedDirs, rootTarget };
}

/**
 * Map a file path from a PR comment to the nearest CLAUDE.md target.
 *
 * Strategy: find the longest directory prefix that has a CLAUDE.md.
 * Falls back to root CLAUDE.md if no parent directory matches.
 * Null/empty filePath (general comments) → root CLAUDE.md.
 */
export function mapFileToClaudeMd(
  filePath: string | null,
  index: ClaudeMdIndex
): ClaudeMdTarget | null {
  // General comments (no file path) → root
  if (!filePath) {
    return index.rootTarget;
  }

  // Find the longest matching directory prefix
  for (const dir of index.sortedDirs) {
    if (filePath.startsWith(dir + "/")) {
      return index.dirMap.get(dir) ?? null;
    }
  }

  // No match → root
  return index.rootTarget;
}
