import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { services, syncDaily, syncSolved } from "./sync.js";

const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const failure = (error: unknown) => ({ isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] });

export function createLeetCodeMcpServer(): McpServer {
  const server = new McpServer({ name: "leetcode-sync", version: "2.0.0" });

  server.registerTool("leetcode_list_recent_accepted", {
    description: "Read recent accepted LeetCode submissions. Does not modify LeetCode or GitHub.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(10), offset: z.number().int().min(0).default(0) })
  }, async ({ limit, offset }) => { try { return result(await services().lc.listAccepted(limit, offset)); } catch (e) { return failure(e); } });

  server.registerTool("leetcode_get_daily_question", {
    description: "Read today's LeetCode daily question and boilerplate for a language.",
    inputSchema: z.object({ language: z.string().min(1).default("java") })
  }, async ({ language }) => { try {
    const { lc } = services(); const daily = await lc.daily(); const question = await lc.question(daily.titleSlug);
    return result({ daily, questionId: question.questionId, language, code: question.codeSnippets.find(x => x.langSlug === language)?.code ?? null, markdown: lc.toMarkdown({ ...question, title: daily.title }) });
  } catch (e) { return failure(e); } });

  server.registerTool("leetcode_sync_solved_to_github", {
    description: "Preview or commit accepted LeetCode submissions to GitHub. dryRun defaults to true.",
    inputSchema: z.object({ dryRun: z.boolean().default(true), maxSubmissions: z.number().int().min(1).max(500).default(100) })
  }, async ({ dryRun, maxSubmissions }) => { try { return result(await syncSolved(dryRun, maxSubmissions)); } catch (e) { return failure(e); } });

  server.registerTool("leetcode_sync_daily_to_github", {
    description: "Preview or commit daily boilerplate to GitHub. LeetCode submission is optional and disabled by default.",
    inputSchema: z.object({ language: z.string().min(1).default("java"), dryRun: z.boolean().default(true), submitBoilerplate: z.boolean().default(false) })
  }, async ({ language, dryRun, submitBoilerplate }) => { try { return result(await syncDaily(language, dryRun, submitBoilerplate)); } catch (e) { return failure(e); } });

  return server;
}
