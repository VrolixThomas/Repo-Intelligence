import { describe, it, expect, afterAll } from "bun:test";
import { writeFileSync, unlinkSync } from "fs";
import { buildEmailMap, buildBitbucketCommitUrl, buildBitbucketBranchUrl, buildJiraTicketUrl, loadConfig } from "../../src/config";
import { testConfig, testTeam } from "../fixtures/config";

// Track temp files for cleanup
const tempFiles: string[] = [];

function writeTempToml(name: string, content: string): string {
  const path = `/tmp/codingsummary-test-${name}.toml`;
  writeFileSync(path, content);
  tempFiles.push(path);
  return path;
}

afterAll(() => {
  for (const f of tempFiles) {
    try { unlinkSync(f); } catch { /* already cleaned */ }
  }
});

describe("buildEmailMap", () => {
  it("builds a map from email to member name", () => {
    // Act
    const map = buildEmailMap(testTeam);

    // Assert
    expect(map.get("alice@example.com")).toBe("Alice Dev");
    expect(map.get("bob@example.com")).toBe("Bob QA");
  });

  it("lowercases email keys", () => {
    // Arrange
    const team = [{ name: "Test", emails: ["Test@UPPER.com"] }];

    // Act
    const map = buildEmailMap(team);

    // Assert
    expect(map.get("test@upper.com")).toBe("Test");
    expect(map.has("Test@UPPER.com")).toBe(false);
  });

  it("handles multiple emails per member", () => {
    // Act
    const map = buildEmailMap(testTeam);

    // Assert
    expect(map.get("alice@example.com")).toBe("Alice Dev");
    expect(map.get("alice.dev@company.com")).toBe("Alice Dev");
  });

  it("returns empty map for empty team", () => {
    // Act
    const map = buildEmailMap([]);

    // Assert
    expect(map.size).toBe(0);
  });
});

describe("buildBitbucketCommitUrl", () => {
  it("constructs correct commit URL", () => {
    // Act & Assert
    const url = buildBitbucketCommitUrl(testConfig, "my-repo", "abc123");
    expect(url).toBe("https://bitbucket.org/myworkspace/my-repo/commits/abc123");
  });
});

describe("buildBitbucketBranchUrl", () => {
  it("constructs correct branch URL", () => {
    // Act & Assert
    const url = buildBitbucketBranchUrl(testConfig, "my-repo", "feature/login");
    expect(url).toBe("https://bitbucket.org/myworkspace/my-repo/branch/feature/login");
  });
});

describe("buildJiraTicketUrl", () => {
  it("constructs correct ticket URL", () => {
    // Act & Assert
    const url = buildJiraTicketUrl(testConfig, "PI-123");
    expect(url).toBe("https://jira.example.com/browse/PI-123");
  });
});

describe("loadConfig", () => {
  it("throws for nonexistent config file", () => {
    // Act & Assert
    expect(() => loadConfig("/nonexistent/config.toml")).toThrow();
  });

  it("throws when repos is missing", () => {
    // Arrange
    const path = writeTempToml("no-repos", `
[general]
output_dir = "./data/reports"

[[team]]
name = "Alice"
emails = ["alice@example.com"]
`);

    // Act & Assert
    expect(() => loadConfig(path)).toThrow("at least one [[repos]] entry is required");
  });

  it("throws when team is missing", () => {
    // Arrange
    const path = writeTempToml("no-team", `
[general]
output_dir = "./data/reports"

[[repos]]
name = "test"
path = "/tmp"
default_branch = "main"
`);

    // Act & Assert
    expect(() => loadConfig(path)).toThrow("at least one [[team]] entry is required");
  });

  it("applies defaults for missing optional sections", () => {
    // Arrange
    const path = writeTempToml("defaults", `
[jira]
base_url = "https://jira.test.com"
project_keys = ["TEST"]

[[repos]]
name = "test-repo"
path = "/tmp/test"
default_branch = "main"

[[team]]
name = "Tester"
emails = ["test@example.com"]
`);

    // Act
    const config = loadConfig(path);

    // Assert
    expect(config.general.timezone).toBe("UTC");
    expect(config.claude.max_diff_lines).toBe(500);
    expect(config.web!.port).toBe(3100);
    expect(config.bitbucket!.base_url).toBe("https://bitbucket.org");
  });
});
