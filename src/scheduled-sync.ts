import { syncDaily, syncSolved } from "./sync.js";

const language = process.env.SYNC_DAILY_LANGUAGE || "java";
const syncDailyQuestion =
  (process.env.SYNC_DAILY_QUESTION || "true").toLowerCase() === "true";
const submitBoilerplate =
  (process.env.SUBMIT_DAILY_BOILERPLATE || "false").toLowerCase() === "true";

console.log(JSON.stringify(await syncSolved(false, 500), null, 2));
if (syncDailyQuestion)
  console.log(
    JSON.stringify(
      await syncDaily(language, false, submitBoilerplate),
      null,
      2,
    ),
  );
