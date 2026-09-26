import { Octokit } from "@octokit/rest";
import path from "node:path";
import type { Submission } from "./leetcode.js";

const EXT: Record<string,string> = { bash:"sh",c:"c",cpp:"cpp",csharp:"cs",dart:"dart",elixir:"ex",erlang:"erl",golang:"go",java:"java",javascript:"js",kotlin:"kt",mssql:"sql",mysql:"sql",oraclesql:"sql",php:"php",python:"py",python3:"py",pythondata:"py",postgresql:"sql",racket:"rkt",ruby:"rb",rust:"rs",scala:"scala",swift:"swift",typescript:"ts" };
export const normalizeName = (s: string) => s.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9_-]/g,"");
const posix = (p: string) => p.split(path.sep).join("/");

export class GitHubRepo {
  private octokit: Octokit;
  constructor(private token: string, private owner: string, private repo: string) { this.octokit = new Octokit({ auth: token }); }
  async state() {
    const [{data: info}, {data: commits}] = await Promise.all([
      this.octokit.repos.get({owner:this.owner,repo:this.repo}),
      this.octokit.repos.listCommits({owner:this.owner,repo:this.repo,per_page:100})
    ]);
    if (!commits.length) throw new Error("Target repository needs at least one commit");
    return { branch: info.default_branch, commits, commitSha: commits[0].sha, treeSha: commits[0].commit.tree.sha };
  }
  lastSyncTimestamp(commits: any[], header: string): number {
    const found = commits.find(c => c.commit.message.startsWith(header));
    return found ? Date.parse(found.commit.committer.date) / 1000 : 0;
  }
  async commitSubmission(args: { submission: Submission; markdown: string; folder: string; header: string; branch: string; commitSha: string; treeSha: string; author: any; }) {
    const {submission:s} = args; const ext = EXT[s.lang];
    if (!ext) throw new Error(`Unsupported language: ${s.lang}`);
    const qid = s.questionId ? `${String(s.questionId).padStart(4,"0")}-` : "";
    const dir = `${qid}${normalizeName(s.title)}`;
    const prefix = args.folder ? `${args.folder}/` : "";
    const tree = await this.octokit.git.createTree({owner:this.owner,repo:this.repo,base_tree:args.treeSha,tree:[
      {path:posix(`${prefix}${dir}/README.md`),mode:"100644",type:"blob",content:args.markdown},
      {path:posix(`${prefix}${dir}/solution.${ext}`),mode:"100644",type:"blob",content:`${s.code || ""}\n`}
    ]});
    const message = `${args.header} - ${s.title} - Runtime - ${s.runtime}${s.runtimePerc ? ` (${s.runtimePerc})` : ""}, Memory - ${s.memory}${s.memoryPerc ? ` (${s.memoryPerc})` : ""}`;
    const date = new Date(Number(s.timestamp) * 1000).toISOString();
    const commit = await this.octokit.git.createCommit({owner:this.owner,repo:this.repo,message,tree:tree.data.sha,parents:[args.commitSha],author:{...args.author,date},committer:{...args.author,date}});
    await this.octokit.git.updateRef({owner:this.owner,repo:this.repo,ref:`heads/${args.branch}`,sha:commit.data.sha});
    return { treeSha: tree.data.sha, commitSha: commit.data.sha, message };
  }
}
