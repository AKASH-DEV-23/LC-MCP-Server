import axios, { AxiosInstance } from "axios";
import TurndownService from "turndown";

const BASE_URL = "https://leetcode.com";
const turndown = new TurndownService({ codeBlockStyle: "fenced" });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type Submission = {
  id: string;
  lang: string;
  timestamp: string;
  statusDisplay: string;
  runtime: string;
  title: string;
  memory: string;
  titleSlug: string;
  code?: string;
  runtimePerc?: string;
  memoryPerc?: string;
  questionId?: string;
};
export type Question = {
  questionId: string;
  title?: string;
  titleSlug?: string;
  content: string;
  codeSnippets: { langSlug: string; code: string }[];
};

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

export class LeetCodeClient {
  private api: AxiosInstance;
  constructor(session: string, csrfToken: string) {
    this.api = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: {
        "content-type": "application/json",
        origin: BASE_URL,
        referer: `${BASE_URL}/`,
        cookie: `csrftoken=${csrfToken}; LEETCODE_SESSION=${session};`,
        "x-csrftoken": csrfToken,
        "user-agent": "leetcode-sync-mcp/1.0",
      },
    });
  }
  private async graphql<T>(query: string, variables: object = {}): Promise<T> {
    const response = await this.api.post("/graphql/", { query, variables });
    if (response.data.errors?.length)
      throw new Error(
        response.data.errors.map((e: any) => e.message).join("; "),
      );
    return response.data.data as T;
  }
  async listAccepted(
    limit = 20,
    offset = 0,
  ): Promise<{ hasNext: boolean; submissions: Submission[] }> {
    const data = await this.graphql<{
      submissionList: { hasNext: boolean; submissions: Submission[] };
    }>(
      `
      query ($offset: Int!, $limit: Int!) { submissionList(offset: $offset, limit: $limit) {
        hasNext submissions { id lang timestamp statusDisplay runtime title memory titleSlug }
      }}`,
      { offset, limit },
    );
    return {
      ...data.submissionList,
      submissions: data.submissionList.submissions.filter(
        (s) => s.statusDisplay === "Accepted",
      ),
    };
  }
  async submissionDetails(submission: Submission): Promise<Submission> {
    const data = await this.graphql<{ submissionDetails: any }>(
      `
      query ($submissionId: Int!) { submissionDetails(submissionId: $submissionId) {
        runtimePercentile memoryPercentile code question { questionId }
      }}`,
      { submissionId: Number(submission.id) },
    );
    const d = data.submissionDetails;
    return {
      ...submission,
      code: d.code,
      questionId: d.question?.questionId,
      runtimePerc:
        d.runtimePercentile == null
          ? "N/A"
          : `${d.runtimePercentile.toFixed(2)}%`,
      memoryPerc:
        d.memoryPercentile == null
          ? "N/A"
          : `${d.memoryPercentile.toFixed(2)}%`,
    };
  }
  async question(titleSlug: string): Promise<Question> {
    const data = await this.graphql<{ question: Question }>(
      `
      query ($titleSlug: String!) { question(titleSlug: $titleSlug) {
        questionId title titleSlug content codeSnippets { langSlug code }
      }}`,
      { titleSlug },
    );
    if (!data.question)
      throw new Error(`Question not found or unavailable: ${titleSlug}`);
    return data.question;
  }
  async daily(): Promise<{ title: string; titleSlug: string }> {
    const data = await this.graphql<any>(
      `query { activeDailyCodingChallengeQuestion { question { title titleSlug } } }`,
    );
    return data.activeDailyCodingChallengeQuestion.question;
  }
  async currentUser(): Promise<{ username: string | null }> {
    const data = await this.graphql<{
      userStatus?: { username?: string | null };
    }>(`query { userStatus { username } }`);
    return { username: data.userStatus?.username ?? null };
  }
  async getProfile(): Promise<{
    username: string | null;
    ranking: number | null;
    totalSolved: number | null;
    easySolved: number | null;
    mediumSolved: number | null;
    hardSolved: number | null;
    totalSubmissions: number | null;
    easySubmissions: number | null;
    mediumSubmissions: number | null;
    hardSubmissions: number | null;
    acceptanceRate: number | null;
    contestRating: number | null;
    attendedContestsCount: number | null;
  }> {
    const sessionUser = await this.currentUser();
    const username = sessionUser.username;
    if (!username)
      throw new Error(
        "Unable to determine the authenticated LeetCode username from the current session.",
      );

    const progressQuery = `
      query userSessionProgress($username: String!) {
        allQuestionsCount { difficulty count }
        matchedUser(username: $username) {
          username
          profile { ranking }
          submitStats {
            acSubmissionNum { difficulty count submissions }
            totalSubmissionNum { difficulty count submissions }
          }
        }
      }
    `;
    const progress = await this.graphql<any>(progressQuery, { username });
    const user = progress.matchedUser ?? {};
    const profile = user.profile ?? {};
    const submitStats = user.submitStats ?? {};
    const acSubmissionNum = Array.isArray(submitStats.acSubmissionNum)
      ? submitStats.acSubmissionNum
      : [];
    const totalSubmissionNum = Array.isArray(submitStats.totalSubmissionNum)
      ? submitStats.totalSubmissionNum
      : [];

    const difficultyValue = (
      items: Array<{
        difficulty?: string;
        count?: number;
        submissions?: number;
      }>,
      key: string,
    ): number | null => {
      const match = items.find(
        (item) =>
          String(item.difficulty ?? "").toLowerCase() === key.toLowerCase(),
      );
      const value = toNumber(match?.count ?? null);
      return value == null
        ? key === "all"
          ? toNumber(match?.submissions ?? null)
          : null
        : value;
    };

    const totalSolved = difficultyValue(acSubmissionNum, "all");
    const easySolved = difficultyValue(acSubmissionNum, "easy");
    const mediumSolved = difficultyValue(acSubmissionNum, "medium");
    const hardSolved = difficultyValue(acSubmissionNum, "hard");
    const totalSubmissions =
      difficultyValue(totalSubmissionNum, "all") ??
      toNumber(
        (
          totalSubmissionNum.find(
            (item: any) =>
              String(item.difficulty ?? "").toLowerCase() === "all",
          ) || {}
        )?.submissions ?? null,
      );
    const easySubmissions = toNumber(
      (
        totalSubmissionNum.find(
          (item: any) => String(item.difficulty ?? "").toLowerCase() === "easy",
        ) || {}
      )?.submissions ?? null,
    );
    const mediumSubmissions = toNumber(
      (
        totalSubmissionNum.find(
          (item: any) =>
            String(item.difficulty ?? "").toLowerCase() === "medium",
        ) || {}
      )?.submissions ?? null,
    );
    const hardSubmissions = toNumber(
      (
        totalSubmissionNum.find(
          (item: any) => String(item.difficulty ?? "").toLowerCase() === "hard",
        ) || {}
      )?.submissions ?? null,
    );

    const contestQuery = `
      query userContestBaseRating($userSlug: String!) {
        userContestBaseRating(username: $userSlug) {
          rating
          attendedContestsCount
        }
      }
    `;
    const contestData = await this.graphql<{
      userContestBaseRating?: {
        rating?: number | null;
        attendedContestsCount?: number | null;
      };
    }>(contestQuery, { userSlug: username });
    const contestRating = toNumber(
      contestData.userContestBaseRating?.rating ?? null,
    );
    const attendedContestsCount = toNumber(
      contestData.userContestBaseRating?.attendedContestsCount ?? null,
    );
    const acceptanceRate =
      totalSubmissions != null && totalSubmissions > 0 && totalSolved != null
        ? (totalSolved / totalSubmissions) * 100
        : null;

    return {
      username: user.username ?? username,
      ranking: toNumber(profile.ranking ?? null),
      totalSolved,
      easySolved,
      mediumSolved,
      hardSolved,
      totalSubmissions,
      easySubmissions,
      mediumSubmissions,
      hardSubmissions,
      acceptanceRate,
      contestRating,
      attendedContestsCount,
    };
  }
  async getProgress(): Promise<{
    totalSolved: number;
    easySolved: number;
    mediumSolved: number;
    hardSolved: number;
    submissionsToday: number;
    solvedToday: number;
    submissionsLast7Days: number;
    solvedLast7Days: number;
    submissionsLast30Days: number;
    solvedLast30Days: number;
    dailyActivity: Array<{
      date: string;
      submissions: number;
      solved: number;
      easySolved: number;
      mediumSolved: number;
      hardSolved: number;
    }>;
    weeklyActivity: Array<{
      weekStartDate: string;
      submissions: number;
      solved: number;
      easySolved: number;
      mediumSolved: number;
      hardSolved: number;
    }>;
    monthlyActivity: Array<{
      month: string;
      submissions: number;
      solved: number;
      easySolved: number;
      mediumSolved: number;
      hardSolved: number;
    }>;
  }> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const userSummaryQuery = `
      query userSessionProgress($username: String!) {
        matchedUser(username: $username) {
          submitStats {
            acSubmissionNum { difficulty count submissions }
            totalSubmissionNum { difficulty count submissions }
          }
        }
      }
    `;
    const currentUserName = await this.currentUser();
    const summaryData = currentUserName.username
      ? await this.graphql<any>(userSummaryQuery, {
          username: currentUserName.username,
        })
      : { matchedUser: null };
    const summaryUser = summaryData.matchedUser ?? {};
    const summaryStats = summaryUser.submitStats ?? {};
    const summaryAc = Array.isArray(summaryStats.acSubmissionNum)
      ? summaryStats.acSubmissionNum
      : [];
    const summaryTotal = Array.isArray(summaryStats.totalSubmissionNum)
      ? summaryStats.totalSubmissionNum
      : [];
    const summarize = (
      items: Array<{
        difficulty?: string;
        count?: number;
        submissions?: number;
      }>,
      type: "easy" | "medium" | "hard" | "all",
    ) => {
      const matched = items.find(
        (item) => String(item.difficulty ?? "").toLowerCase() === type,
      );
      return toNumber(matched?.count ?? matched?.submissions ?? null) ?? 0;
    };

    const query = `
      query userProgressCalendarV2($queryType: ProgressCalendarQueryTypeEnum!, $year: Int!, $month: Int, $groupByWeek: Boolean) {
        userProgressCalendarV2(queryType: $queryType, year: $year, month: $month, groupByWeek: $groupByWeek) {
          dateSolvedInfoWithinMonth { date easySolvedNum hardSolvedNum mediumSolvedNum }
          dateSubmissionNumWithinMonth { date numSubmitted }
          monthSolvedInfoWithinYear { easySolvedNum mediumSolvedNum hardSolvedNum month }
          monthSubmissionNumWithinYear { month numSubmitted }
          weekSolvedInfoWithinMonth { weekStartDate easySolvedNum mediumSolvedNum hardSolvedNum }
          weekSubmissionNumWithinMonth { weekStartDate numSubmitted }
        }
      }
    `;
    const data = await this.graphql<any>(query, {
      queryType: "SUBMISSION",
      year,
      month,
      groupByWeek: false,
    });
    const calendar = data.userProgressCalendarV2 ?? {};
    const solvedByDate = new Map<
      string,
      {
        easySolved: number;
        mediumSolved: number;
        hardSolved: number;
        solved: number;
      }
    >();
    for (const entry of Array.isArray(calendar.dateSolvedInfoWithinMonth)
      ? calendar.dateSolvedInfoWithinMonth
      : []) {
      const date = String(entry.date ?? "");
      if (!date) continue;
      const easy = toNumber(entry.easySolvedNum) ?? 0;
      const medium = toNumber(entry.mediumSolvedNum) ?? 0;
      const hard = toNumber(entry.hardSolvedNum) ?? 0;
      solvedByDate.set(date, {
        easySolved: easy,
        mediumSolved: medium,
        hardSolved: hard,
        solved: easy + medium + hard,
      });
    }

    const submissionsByDate = new Map<string, number>();
    for (const entry of Array.isArray(calendar.dateSubmissionNumWithinMonth)
      ? calendar.dateSubmissionNumWithinMonth
      : []) {
      const date = String(entry.date ?? "");
      if (!date) continue;
      submissionsByDate.set(date, toNumber(entry.numSubmitted) ?? 0);
    }

    const allDates: string[] = [];
    for (let index = 0; index <= 29; index += 1) {
      allDates.push(formatDateKey(addDays(now, -index)));
    }
    allDates.reverse();

    const dailyActivity = allDates.map((date) => {
      const solved = solvedByDate.get(date) ?? {
        easySolved: 0,
        mediumSolved: 0,
        hardSolved: 0,
        solved: 0,
      };
      const submissions = submissionsByDate.get(date) ?? 0;
      return {
        date,
        submissions,
        solved: solved.solved,
        easySolved: solved.easySolved,
        mediumSolved: solved.mediumSolved,
        hardSolved: solved.hardSolved,
      };
    });

    const todayKey = formatDateKey(now);
    const solvedToday = solvedByDate.get(todayKey)?.solved ?? 0;
    const submissionsToday = submissionsByDate.get(todayKey) ?? 0;

    const submissionsLast7Days = dailyActivity
      .slice(-7)
      .reduce((sum, entry) => sum + entry.submissions, 0);
    const solvedLast7Days = dailyActivity
      .slice(-7)
      .reduce((sum, entry) => sum + entry.solved, 0);
    const submissionsLast30Days = dailyActivity.reduce(
      (sum, entry) => sum + entry.submissions,
      0,
    );
    const solvedLast30Days = dailyActivity.reduce(
      (sum, entry) => sum + entry.solved,
      0,
    );

    const monthEntries = Array.isArray(calendar.monthSolvedInfoWithinYear)
      ? calendar.monthSolvedInfoWithinYear
      : [];
    const monthSubmissions = Array.isArray(
      calendar.monthSubmissionNumWithinYear,
    )
      ? calendar.monthSubmissionNumWithinYear
      : [];
    const monthMap = new Map<
      number,
      {
        month: string;
        submissions: number;
        solved: number;
        easySolved: number;
        mediumSolved: number;
        hardSolved: number;
      }
    >();
    for (const entry of monthEntries) {
      const monthNumber = toNumber(entry.month) ?? 0;
      if (!monthNumber) continue;
      const previous = monthMap.get(monthNumber) ?? {
        month: `${monthNumber}`,
        submissions: 0,
        solved: 0,
        easySolved: 0,
        mediumSolved: 0,
        hardSolved: 0,
      };
      const easySolved = toNumber(entry.easySolvedNum) ?? 0;
      const mediumSolved = toNumber(entry.mediumSolvedNum) ?? 0;
      const hardSolved = toNumber(entry.hardSolvedNum) ?? 0;
      previous.easySolved += easySolved;
      previous.mediumSolved += mediumSolved;
      previous.hardSolved += hardSolved;
      previous.solved += easySolved + mediumSolved + hardSolved;
      monthMap.set(monthNumber, previous);
    }
    for (const entry of monthSubmissions) {
      const monthNumber = toNumber(entry.month) ?? 0;
      if (!monthNumber) continue;
      const previous = monthMap.get(monthNumber) ?? {
        month: `${monthNumber}`,
        submissions: 0,
        solved: 0,
        easySolved: 0,
        mediumSolved: 0,
        hardSolved: 0,
      };
      previous.submissions += toNumber(entry.numSubmitted) ?? 0;
      monthMap.set(monthNumber, previous);
    }

    const monthlyActivity = Array.from(monthMap.values())
      .map((entry) => ({ ...entry, month: entry.month.padStart(2, "0") }))
      .sort((a, b) => Number(a.month) - Number(b.month));

    const weeklyByStart = new Map<
      string,
      {
        weekStartDate: string;
        submissions: number;
        solved: number;
        easySolved: number;
        mediumSolved: number;
        hardSolved: number;
      }
    >();
    const weekSolvedInfo = Array.isArray(calendar.weekSolvedInfoWithinMonth)
      ? calendar.weekSolvedInfoWithinMonth
      : [];
    const weekSubmissionInfo = Array.isArray(
      calendar.weekSubmissionNumWithinMonth,
    )
      ? calendar.weekSubmissionNumWithinMonth
      : [];
    for (const entry of weekSolvedInfo) {
      const weekStart = String(entry.weekStartDate ?? "");
      if (!weekStart) continue;
      const previous = weeklyByStart.get(weekStart) ?? {
        weekStartDate: weekStart,
        submissions: 0,
        solved: 0,
        easySolved: 0,
        mediumSolved: 0,
        hardSolved: 0,
      };
      const easySolved = toNumber(entry.easySolvedNum) ?? 0;
      const mediumSolved = toNumber(entry.mediumSolvedNum) ?? 0;
      const hardSolved = toNumber(entry.hardSolvedNum) ?? 0;
      previous.easySolved += easySolved;
      previous.mediumSolved += mediumSolved;
      previous.hardSolved += hardSolved;
      previous.solved += easySolved + mediumSolved + hardSolved;
      weeklyByStart.set(weekStart, previous);
    }
    for (const entry of weekSubmissionInfo) {
      const weekStart = String(entry.weekStartDate ?? "");
      if (!weekStart) continue;
      const previous = weeklyByStart.get(weekStart) ?? {
        weekStartDate: weekStart,
        submissions: 0,
        solved: 0,
        easySolved: 0,
        mediumSolved: 0,
        hardSolved: 0,
      };
      previous.submissions += toNumber(entry.numSubmitted) ?? 0;
      weeklyByStart.set(weekStart, previous);
    }
    const weeklyActivity = Array.from(weeklyByStart.values()).sort((a, b) =>
      a.weekStartDate.localeCompare(b.weekStartDate),
    );

    const monthSolvedEntries: any[] = Array.isArray(
      calendar.dateSolvedInfoWithinMonth,
    )
      ? calendar.dateSolvedInfoWithinMonth
      : [];
    const monthSolvedTotal = monthSolvedEntries.reduce(
      (sum: number, entry: any) =>
        sum +
        (toNumber(entry.easySolvedNum) ?? 0) +
        (toNumber(entry.mediumSolvedNum) ?? 0) +
        (toNumber(entry.hardSolvedNum) ?? 0),
      0,
    );
    const monthEasySolved = monthSolvedEntries.reduce(
      (sum: number, entry: any) => sum + (toNumber(entry.easySolvedNum) ?? 0),
      0,
    );
    const monthMediumSolved = monthSolvedEntries.reduce(
      (sum: number, entry: any) => sum + (toNumber(entry.mediumSolvedNum) ?? 0),
      0,
    );
    const monthHardSolved = monthSolvedEntries.reduce(
      (sum: number, entry: any) => sum + (toNumber(entry.hardSolvedNum) ?? 0),
      0,
    );

    return {
      totalSolved: summarize(summaryAc, "all") || monthSolvedTotal,
      easySolved: summarize(summaryAc, "easy") || monthEasySolved,
      mediumSolved: summarize(summaryAc, "medium") || monthMediumSolved,
      hardSolved: summarize(summaryAc, "hard") || monthHardSolved,
      submissionsToday,
      solvedToday,
      submissionsLast7Days,
      solvedLast7Days,
      submissionsLast30Days,
      solvedLast30Days,
      dailyActivity,
      weeklyActivity,
      monthlyActivity,
    };
  }
  async resolveQuestionById(
    questionId: string | number,
  ): Promise<{ questionId: string; title: string; titleSlug: string }> {
    const normalizedQuestionId = String(questionId).trim();
    if (!normalizedQuestionId)
      throw new Error("Invalid question ID: empty value.");

    const response = await this.api.get("/api/problems/all/");
    const statStatusPairs = Array.isArray(response.data?.stat_status_pairs)
      ? response.data.stat_status_pairs
      : [];
    const match = statStatusPairs.find(
      (entry: any) =>
        String(entry?.stat?.question_id ?? "") === normalizedQuestionId ||
        String(entry?.stat?.questionId ?? "") === normalizedQuestionId,
    );
    if (!match)
      throw new Error(
        `Problem not found for questionId: ${normalizedQuestionId}`,
      );

    const stat = match.stat ?? {};
    const title = stat.question__title ?? stat.title ?? "Unknown Problem";
    const titleSlug = stat.question__title_slug ?? stat.titleSlug ?? "";
    if (!titleSlug)
      throw new Error(
        `Problem slug is unavailable for questionId: ${normalizedQuestionId}`,
      );

    return {
      questionId: String(stat.question_id ?? normalizedQuestionId),
      title,
      titleSlug,
    };
  }
  async submit(
    titleSlug: string,
    questionId: string,
    lang: string,
    code: string,
  ): Promise<string> {
    const response = await this.api.post(
      `/problems/${titleSlug}/submit/`,
      { lang, question_id: questionId, typed_code: code },
      { headers: { referer: `${BASE_URL}/problems/${titleSlug}/` } },
    );
    return String(
      response.data.submission_id ?? response.data.submissionId ?? "",
    );
  }
  async getSubmissionResult(
    submissionId: string,
    timeoutMs = 45000,
    pollIntervalMs = 1500,
  ): Promise<{
    success: boolean;
    submissionId: string;
    status: string;
    runtime: string | null;
    memory: string | null;
    message?: string;
    error?: string;
  }> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const response = await this.api.get(
        `/submissions/detail/${submissionId}/check/`,
        {
          headers: {
            referer: `${BASE_URL}/submissions/detail/${submissionId}/`,
          },
        },
      );
      const data = response.data ?? {};
      const state = String(data.state ?? "").toUpperCase();
      const status = String(data.status_msg ?? data.state ?? "Unknown Error");
      const runtime = typeof data.runtime === "string" ? data.runtime : null;
      const memory = typeof data.memory === "string" ? data.memory : null;

      if (
        state === "SUCCESS" ||
        (status.toLowerCase() !== "pending" &&
          status.toLowerCase() !== "started" &&
          status.toLowerCase() !== "not_started")
      ) {
        return {
          success: status.toLowerCase() === "accepted",
          submissionId,
          status: status || "Unknown Error",
          runtime,
          memory,
          error: status.toLowerCase() === "accepted" ? undefined : status,
        };
      }
      await sleep(pollIntervalMs);
    }
    return {
      success: false,
      submissionId,
      status: "Pending",
      runtime: null,
      memory: null,
      message:
        "Submission was created but the final result could not be retrieved within the configured timeout.",
    };
  }
  async submitSolution(
    questionId: string | number,
    language: string,
    code: string,
  ): Promise<{
    success: boolean;
    submissionId: string;
    questionId: string;
    title: string;
    titleSlug: string;
    language: string;
    status: string;
    runtime: string | null;
    memory: string | null;
    error?: string;
    message?: string;
  }> {
    const normalizedLanguage = String(language).trim().toLowerCase();
    if (!normalizedLanguage) throw new Error("Invalid language: empty value.");
    if (!["java"].includes(normalizedLanguage))
      throw new Error(
        `Invalid language: ${language}. Supported languages: java`,
      );
    if (!code || !code.trim())
      throw new Error("Invalid code: empty code provided.");

    const problem = await this.resolveQuestionById(questionId);

    let submissionId: string;
    try {
      submissionId = await this.submit(
        problem.titleSlug,
        problem.questionId,
        normalizedLanguage,
        code,
      );
    } catch (error: any) {
      if (error?.response?.status === 429) {
        return {
          success: false,
          submissionId: "",
          questionId: problem.questionId,
          title: problem.title,
          titleSlug: problem.titleSlug,
          language: normalizedLanguage,
          status: "Rate Limited",
          runtime: null,
          memory: null,
          error: "LeetCode rate limited the submission request (429).",
          message:
            "Submission was rejected due to LeetCode rate limiting. Please retry after a short delay.",
        };
      }
      throw error;
    }

    if (
      !submissionId ||
      submissionId === "undefined" ||
      submissionId === "null"
    ) {
      throw new Error(
        "LeetCode did not return a submission ID for the submitted solution.",
      );
    }

    const finalResult = await this.getSubmissionResult(
      submissionId,
      45000,
      1500,
    );
    return {
      success: finalResult.success,
      submissionId,
      questionId: problem.questionId,
      title: problem.title,
      titleSlug: problem.titleSlug,
      language: normalizedLanguage,
      status: finalResult.status,
      runtime: finalResult.runtime,
      memory: finalResult.memory,
      error: finalResult.error,
      message: finalResult.message,
    };
  }
  toMarkdown(question: Question): string {
    return `# ${question.title || "LeetCode Problem"}\n\n${turndown.turndown(question.content)}\n`;
  }
}
