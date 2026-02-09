/**
 * Build Claude prompts for PR rule extraction.
 * Each prompt instructs Claude to analyze review comments and update a CLAUDE.md file.
 */

import type { PRCommentBundle } from "../bitbucket/comments";
import type { ClaudeMdTarget } from "./mapper";

const MAX_PROMPT_CHARS = 50_000;
const TRUNCATED_COMMENT_LEN = 300;

export interface RuleExtractionInput {
  target: ClaudeMdTarget;
  bundles: PRCommentBundle[];
}

/**
 * Build the Claude prompt for rule extraction from PR review comments.
 */
export function buildRuleExtractionPrompt(input: RuleExtractionInput): string {
  const { target, bundles } = input;

  const instructions = `You are analyzing PR review comments to extract coding rules and conventions for a .NET/C# project.

## Task
1. Read the existing CLAUDE.md file at: ${target.relativePath}
2. Analyze the review comments below for **recurring patterns** — rules that are enforced across multiple PRs or by multiple reviewers
3. Add a \`## Review Conventions\` section at the end of the file (or merge into an existing \`## Conventions\` section if present)
4. **Preserve ALL existing content** — only ADD new rules
5. Each rule: concise bullet point, grouped by category (naming, error handling, testing, architecture, etc.)
6. **Skip**: formatting rules (CSharpier handles that), one-off nits, subjective preferences from a single reviewer
7. Use the Edit tool for targeted additions — do NOT rewrite the entire file
8. If no meaningful recurring rules are found in the comments, do NOT modify the file

## Important
- Only add rules that appear in 2+ PRs or from 2+ different reviewers
- Be concise — one bullet point per rule
- Group related rules under sub-headings within ## Review Conventions

## Review Comments for ${target.projectName}
`;

  let commentSection = formatComments(bundles);

  // Size guard: truncate if too large
  let prompt = instructions + commentSection;
  if (prompt.length > MAX_PROMPT_CHARS) {
    // First pass: truncate individual comments
    commentSection = formatComments(bundles, TRUNCATED_COMMENT_LEN);
    prompt = instructions + commentSection;
  }

  if (prompt.length > MAX_PROMPT_CHARS) {
    // Second pass: drop oldest PRs until it fits
    const sortedBundles = [...bundles].sort(
      (a, b) => b.comments[0]?.createdAt.localeCompare(a.comments[0]?.createdAt ?? "") ?? 0
    );
    const trimmed: PRCommentBundle[] = [];
    let size = instructions.length;
    for (const bundle of sortedBundles) {
      const text = formatBundle(bundle, TRUNCATED_COMMENT_LEN);
      if (size + text.length > MAX_PROMPT_CHARS - 200) break;
      trimmed.push(bundle);
      size += text.length;
    }
    commentSection = trimmed.map(b => formatBundle(b, TRUNCATED_COMMENT_LEN)).join("\n");
    prompt = instructions + commentSection;
  }

  return prompt;
}

function formatComments(bundles: PRCommentBundle[], maxLen?: number): string {
  return bundles.map(b => formatBundle(b, maxLen)).join("\n");
}

function formatBundle(bundle: PRCommentBundle, maxLen?: number): string {
  const lines: string[] = [];
  lines.push(`### PR #${bundle.prId}: ${bundle.prTitle} (by ${bundle.prAuthor})`);
  lines.push(`URL: ${bundle.prUrl}`);
  lines.push("");

  for (const comment of bundle.comments) {
    let content = comment.content;
    if (maxLen && content.length > maxLen) {
      content = content.slice(0, maxLen) + "...";
    }

    if (comment.isInline && comment.filePath) {
      const lineInfo = comment.lineTo ? ` line ${comment.lineTo}` : "";
      lines.push(`**Reviewer: ${comment.authorName}** on \`${comment.filePath}\`${lineInfo}`);
    } else {
      lines.push(`**Reviewer: ${comment.authorName}** (general)`);
    }
    lines.push(`> ${content.replace(/\n/g, "\n> ")}`);
    lines.push("");
  }

  return lines.join("\n");
}
