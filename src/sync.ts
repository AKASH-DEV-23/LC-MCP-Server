import { loadConfig } from "./config.js";
import { LeetCodeClient, Submission } from "./leetcode.js";
import { GitHubRepo, normalizeName } from "./github.js";

export function services() {
  const c = loadConfig();
  return {
    c,
    lc: new LeetCodeClient(c.leetcodeSession, c.leetcodeCsrfToken),
    gh: new GitHubRepo(c.githubToken, c.owner, c.repo),
  };
}

export async function syncSolved(dryRun = true, maxSubmissions = 100) {
  const { c, lc, gh } = services();
  const state = await gh.state();
  const last = gh.lastSyncTimestamp(state.commits, c.commitHeader);
  const selected: Submission[] = [];
  const seen: Record<string, number> = {};
  let offset = 0,
    stop = false;
  while (!stop && selected.length < maxSubmissions) {
    const page = await lc.listAccepted(20, offset);
    for (const s of page.submissions) {
      const ts = Number(s.timestamp);
      if (ts <= last) {
        stop = true;
        break;
      }
      const key = `${normalizeName(s.title)}:${s.lang}`;
      if (seen[key] && seen[key] - ts < c.filterDuplicateSecs) continue;
      seen[key] = ts;
      selected.push(s);
      if (selected.length >= maxSubmissions) break;
    }
    if (!page.hasNext) break;
    offset += 20;
  }
  if (dryRun)
    return {
      dryRun: true,
      count: selected.length,
      submissions: selected.map((s) => ({
        id: s.id,
        title: s.title,
        lang: s.lang,
        timestamp: s.timestamp,
      })),
    };
  let { treeSha, commitSha } = state;
  const author = state.commits.find((x: any) => x.commit.author)?.commit.author;
  const committed = [];
  for (const raw of selected.reverse()) {
    const s = await lc.submissionDetails(raw);
    const q = await lc.question(s.titleSlug);
    const result = await gh.commitSubmission({
      submission: s,
      markdown: lc.toMarkdown(q),
      folder: c.destinationFolder,
      header: c.commitHeader,
      branch: state.branch,
      treeSha,
      commitSha,
      author,
    });
    treeSha = result.treeSha;
    commitSha = result.commitSha;
    committed.push({ title: s.title, commitSha, message: result.message });
  }
  return { dryRun: false, count: committed.length, committed };
}

export async function syncDaily(
  language = "java",
  dryRun = true,
  submitBoilerplate = false,
) {
  const { c, lc, gh } = services();
  const daily = await lc.daily();
  const q = await lc.question(daily.titleSlug);
  const snippet = q.codeSnippets?.find((s) => s.langSlug === language)?.code;
  if (!snippet)
    throw new Error(`No boilerplate found for language: ${language}`);
  if (dryRun) return { dryRun: true, daily, language, code: snippet };
  let submissionId: string | undefined;
  if (submitBoilerplate)
    submissionId = await lc.submit(
      daily.titleSlug,
      q.questionId,
      language,
      snippet,
    );
  const state = await gh.state();
  const author = state.commits.find((x: any) => x.commit.author)?.commit.author;
  const fake: Submission = {
    id: submissionId || "daily",
    title: daily.title,
    titleSlug: daily.titleSlug,
    lang: language,
    timestamp: String(Math.floor(Date.now() / 1000)),
    statusDisplay: "Pending",
    runtime: "N/A",
    memory: "N/A",
    code: snippet,
    questionId: q.questionId,
  };
  const result = await gh.commitSubmission({
    submission: fake,
    markdown: lc.toMarkdown({ ...q, title: daily.title }),
    folder: c.destinationFolder,
    header: c.commitHeader,
    branch: state.branch,
    treeSha: state.treeSha,
    commitSha: state.commitSha,
    author,
  });
  return { dryRun: false, daily, submissionId, commitSha: result.commitSha };
}
