-- Deduplicate any existing duplicate (repo, name) pairs (keep the latest row)
DELETE FROM branches b1
USING branches b2
WHERE b1.repo = b2.repo AND b1.name = b2.name AND b1.id < b2.id;

-- Replace regular index with unique index
DROP INDEX IF EXISTS idx_branches_repo_name;
CREATE UNIQUE INDEX idx_branches_repo_name_unique ON branches(repo, name);
