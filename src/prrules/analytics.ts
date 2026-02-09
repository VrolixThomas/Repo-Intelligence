/**
 * Compute PR review analytics from collected comment data.
 * Pure logic — no I/O.
 */

import type { PRCommentBundle } from "../bitbucket/comments";
import type { ClaudeMdTarget, ClaudeMdIndex } from "./mapper";
import { mapFileToClaudeMd } from "./mapper";

export interface ReviewAnalytics {
  // Overview
  totalPRs: number;
  totalComments: number;
  totalInlineComments: number;
  totalGeneralComments: number;
  dateRange: { since: string; until: string };

  // Top reviewers
  topReviewers: { name: string; commentCount: number; inlineCount: number; prsReviewed: number }[];

  // Most-commented projects
  commentsByProject: { projectName: string; claudeMdPath: string; commentCount: number; uniqueReviewers: number; uniquePRs: number }[];

  // Hotspot files
  hotspotFiles: { filePath: string; commentCount: number; uniquePRs: number; uniqueReviewers: number }[];

  // Reviewer → Author patterns
  reviewerAuthorPairs: { reviewer: string; author: string; commentCount: number }[];

  // Comment categories
  commentCategories: { category: string; count: number; percentage: number; examples: string[] }[];

  // Monthly trend
  monthlyTrend: { month: string; commentCount: number; prCount: number; avgCommentsPerPR: number }[];

  // General vs inline split per project
  commentTypeSplit: { projectName: string; inline: number; general: number }[];
}

// --- Category classification ---

interface CategoryDef {
  name: string;
  keywords: string[];
}

const CATEGORIES: CategoryDef[] = [
  { name: "Naming", keywords: ["rename", "name", "naming", "should be called", "convention"] },
  { name: "Error Handling", keywords: ["exception", "error", "catch", "try", "throw", "handle", "null check"] },
  { name: "Architecture", keywords: ["inject", "dependency", "service", "pattern", "abstract", "interface", "isender", "imediator", "mediatr"] },
  { name: "Performance", keywords: ["performance", "async", "await", "cache", "lazy", "optimize", "n+1"] },
  { name: "Security", keywords: ["security", "auth", "token", "validate", "sanitize", "injection", "xss"] },
  { name: "Testing", keywords: ["test", "unit test", "assert", "mock", "coverage"] },
  { name: "Code Style", keywords: ["style", "readability", "simplify", "clean", "refactor", "extract"] },
  { name: "Documentation", keywords: ["comment", "doc", "xml doc", "summary", "readme", "document"] },
  { name: "Logic", keywords: ["logic", "condition", "if", "else", "switch", "bug", "wrong", "incorrect", "fix"] },
];

function classifyComment(content: string): string[] {
  const lower = content.toLowerCase();
  const matched: string[] = [];

  for (const cat of CATEGORIES) {
    if (cat.keywords.some(kw => lower.includes(kw))) {
      matched.push(cat.name);
    }
  }

  if (matched.length === 0) matched.push("Other");
  return matched;
}

// --- Main computation ---

export interface ClaudeMdGroup {
  target: ClaudeMdTarget;
  bundles: PRCommentBundle[];
}

export function computeReviewAnalytics(
  bundles: PRCommentBundle[],
  claudeMdGroups: Map<string, ClaudeMdGroup>,
  index: ClaudeMdIndex
): ReviewAnalytics {
  const allComments = bundles.flatMap(b => b.comments);
  const totalComments = allComments.length;
  const totalInlineComments = allComments.filter(c => c.isInline).length;
  const totalGeneralComments = totalComments - totalInlineComments;

  // Date range
  const dates = allComments
    .map(c => c.createdAt)
    .filter(d => d)
    .sort();
  const since = dates[0] ?? "";
  const until = dates[dates.length - 1] ?? "";

  // --- Top reviewers ---
  const reviewerStats = new Map<string, { commentCount: number; inlineCount: number; prs: Set<number> }>();
  for (const bundle of bundles) {
    for (const comment of bundle.comments) {
      const name = comment.authorName;
      let stats = reviewerStats.get(name);
      if (!stats) {
        stats = { commentCount: 0, inlineCount: 0, prs: new Set() };
        reviewerStats.set(name, stats);
      }
      stats.commentCount++;
      if (comment.isInline) stats.inlineCount++;
      stats.prs.add(bundle.prId);
    }
  }
  const topReviewers = [...reviewerStats.entries()]
    .map(([name, s]) => ({ name, commentCount: s.commentCount, inlineCount: s.inlineCount, prsReviewed: s.prs.size }))
    .sort((a, b) => b.commentCount - a.commentCount);

  // --- Comments by project ---
  const commentsByProject = [...claudeMdGroups.entries()]
    .map(([, group]) => {
      const allGroupComments = group.bundles.flatMap(b => b.comments);
      const reviewers = new Set(allGroupComments.map(c => c.authorName));
      const prs = new Set(group.bundles.map(b => b.prId));
      return {
        projectName: group.target.projectName,
        claudeMdPath: group.target.relativePath,
        commentCount: allGroupComments.length,
        uniqueReviewers: reviewers.size,
        uniquePRs: prs.size,
      };
    })
    .sort((a, b) => b.commentCount - a.commentCount);

  // --- Hotspot files ---
  const fileStats = new Map<string, { count: number; prs: Set<number>; reviewers: Set<string> }>();
  for (const bundle of bundles) {
    for (const comment of bundle.comments) {
      if (!comment.filePath) continue;
      let stats = fileStats.get(comment.filePath);
      if (!stats) {
        stats = { count: 0, prs: new Set(), reviewers: new Set() };
        fileStats.set(comment.filePath, stats);
      }
      stats.count++;
      stats.prs.add(bundle.prId);
      stats.reviewers.add(comment.authorName);
    }
  }
  const hotspotFiles = [...fileStats.entries()]
    .map(([filePath, s]) => ({
      filePath,
      commentCount: s.count,
      uniquePRs: s.prs.size,
      uniqueReviewers: s.reviewers.size,
    }))
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 20);

  // --- Reviewer → Author pairs ---
  const pairStats = new Map<string, number>();
  for (const bundle of bundles) {
    for (const comment of bundle.comments) {
      const key = `${comment.authorName}|||${bundle.prAuthor}`;
      pairStats.set(key, (pairStats.get(key) ?? 0) + 1);
    }
  }
  const reviewerAuthorPairs = [...pairStats.entries()]
    .map(([key, count]) => {
      const [reviewer, author] = key.split("|||");
      return { reviewer: reviewer!, author: author!, commentCount: count };
    })
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 15);

  // --- Comment categories ---
  const categoryCounts = new Map<string, { count: number; examples: string[] }>();
  for (const comment of allComments) {
    const cats = classifyComment(comment.content);
    for (const cat of cats) {
      let entry = categoryCounts.get(cat);
      if (!entry) {
        entry = { count: 0, examples: [] };
        categoryCounts.set(cat, entry);
      }
      entry.count++;
      if (entry.examples.length < 3) {
        entry.examples.push(comment.content.slice(0, 100));
      }
    }
  }
  const commentCategories = [...categoryCounts.entries()]
    .map(([category, e]) => ({
      category,
      count: e.count,
      percentage: totalComments > 0 ? Math.round((e.count / totalComments) * 100) : 0,
      examples: e.examples,
    }))
    .sort((a, b) => b.count - a.count);

  // --- Monthly trend ---
  const monthlyData = new Map<string, { comments: number; prs: Set<number> }>();
  for (const bundle of bundles) {
    for (const comment of bundle.comments) {
      const month = comment.createdAt.slice(0, 7); // "2025-06"
      if (!month) continue;
      let entry = monthlyData.get(month);
      if (!entry) {
        entry = { comments: 0, prs: new Set() };
        monthlyData.set(month, entry);
      }
      entry.comments++;
      entry.prs.add(bundle.prId);
    }
  }
  const monthlyTrend = [...monthlyData.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, e]) => ({
      month,
      commentCount: e.comments,
      prCount: e.prs.size,
      avgCommentsPerPR: e.prs.size > 0 ? Math.round((e.comments / e.prs.size) * 10) / 10 : 0,
    }));

  // --- Comment type split per project ---
  const commentTypeSplit = [...claudeMdGroups.entries()]
    .map(([, group]) => {
      const allGroupComments = group.bundles.flatMap(b => b.comments);
      return {
        projectName: group.target.projectName,
        inline: allGroupComments.filter(c => c.isInline).length,
        general: allGroupComments.filter(c => !c.isInline).length,
      };
    })
    .sort((a, b) => (b.inline + b.general) - (a.inline + a.general));

  return {
    totalPRs: bundles.length,
    totalComments,
    totalInlineComments,
    totalGeneralComments,
    dateRange: { since, until },
    topReviewers,
    commentsByProject,
    hotspotFiles,
    reviewerAuthorPairs,
    commentCategories,
    monthlyTrend,
    commentTypeSplit,
  };
}
