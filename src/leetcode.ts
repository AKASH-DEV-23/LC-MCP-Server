import axios, { AxiosInstance } from "axios";
import TurndownService from "turndown";

const BASE_URL = "https://leetcode.com";
const turndown = new TurndownService({ codeBlockStyle: "fenced" });

export type Submission = {
  id: string; lang: string; timestamp: string; statusDisplay: string;
  runtime: string; title: string; memory: string; titleSlug: string;
  code?: string; runtimePerc?: string; memoryPerc?: string; questionId?: string;
};
export type Question = { questionId: string; title?: string; titleSlug?: string; content: string; codeSnippets: { langSlug: string; code: string }[] };

export class LeetCodeClient {
  private api: AxiosInstance;
  constructor(session: string, csrfToken: string) {
    this.api = axios.create({ baseURL: BASE_URL, timeout: 30000, headers: {
      "content-type": "application/json", origin: BASE_URL, referer: `${BASE_URL}/`,
      cookie: `csrftoken=${csrfToken}; LEETCODE_SESSION=${session};`, "x-csrftoken": csrfToken,
      "user-agent": "leetcode-sync-mcp/1.0"
    }});
  }
  private async graphql<T>(query: string, variables: object = {}): Promise<T> {
    const response = await this.api.post("/graphql/", { query, variables });
    if (response.data.errors?.length) throw new Error(response.data.errors.map((e: any) => e.message).join("; "));
    return response.data.data as T;
  }
  async listAccepted(limit = 20, offset = 0): Promise<{ hasNext: boolean; submissions: Submission[] }> {
    const data = await this.graphql<{submissionList: {hasNext: boolean; submissions: Submission[]}}>(`
      query ($offset: Int!, $limit: Int!) { submissionList(offset: $offset, limit: $limit) {
        hasNext submissions { id lang timestamp statusDisplay runtime title memory titleSlug }
      }}`, { offset, limit });
    return { ...data.submissionList, submissions: data.submissionList.submissions.filter(s => s.statusDisplay === "Accepted") };
  }
  async submissionDetails(submission: Submission): Promise<Submission> {
    const data = await this.graphql<{submissionDetails: any}>(`
      query ($submissionId: Int!) { submissionDetails(submissionId: $submissionId) {
        runtimePercentile memoryPercentile code question { questionId }
      }}`, { submissionId: Number(submission.id) });
    const d = data.submissionDetails;
    return { ...submission, code: d.code, questionId: d.question?.questionId,
      runtimePerc: d.runtimePercentile == null ? "N/A" : `${d.runtimePercentile.toFixed(2)}%`,
      memoryPerc: d.memoryPercentile == null ? "N/A" : `${d.memoryPercentile.toFixed(2)}%` };
  }
  async question(titleSlug: string): Promise<Question> {
    const data = await this.graphql<{question: Question}>(`
      query ($titleSlug: String!) { question(titleSlug: $titleSlug) {
        questionId title titleSlug content codeSnippets { langSlug code }
      }}`, { titleSlug });
    if (!data.question) throw new Error(`Question not found or unavailable: ${titleSlug}`);
    return data.question;
  }
  async daily(): Promise<{ title: string; titleSlug: string }> {
    const data = await this.graphql<any>(`query { activeDailyCodingChallengeQuestion { question { title titleSlug } } }`);
    return data.activeDailyCodingChallengeQuestion.question;
  }
  async submit(titleSlug: string, questionId: string, lang: string, code: string): Promise<string> {
    const response = await this.api.post(`/problems/${titleSlug}/submit/`, { lang, question_id: questionId, typed_code: code },
      { headers: { referer: `${BASE_URL}/problems/${titleSlug}/` } });
    return String(response.data.submission_id);
  }
  toMarkdown(question: Question): string {
    return `# ${question.title || "LeetCode Problem"}\n\n${turndown.turndown(question.content)}\n`;
  }
}
