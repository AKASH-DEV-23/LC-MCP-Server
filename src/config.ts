import "dotenv/config";

export type AppConfig = {
  githubToken: string;
  owner: string;
  repo: string;
  leetcodeCsrfToken: string;
  leetcodeSession: string;
  destinationFolder: string;
  filterDuplicateSecs: number;
  commitHeader: string;
  verbose: boolean;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadConfig(): AppConfig {
  const [owner, repo, extra] = required("GITHUB_REPO").split("/");
  if (!owner || !repo || extra) throw new Error("GITHUB_REPO must be owner/repository");
  return {
    githubToken: required("GITHUB_TOKEN"), owner, repo,
    leetcodeCsrfToken: required("LEETCODE_CSRF_TOKEN"),
    leetcodeSession: required("LEETCODE_SESSION"),
    destinationFolder: process.env.DESTINATION_FOLDER?.trim() || "DSA",
    filterDuplicateSecs: Number(process.env.FILTER_DUPLICATE_SECS || 86400),
    commitHeader: process.env.COMMIT_HEADER?.trim() || "Sync LeetCode submission",
    verbose: (process.env.VERBOSE || "true").toLowerCase() === "true"
  };
}
