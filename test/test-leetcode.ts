import axios from "axios";

async function test() {
  try {
    const response = await axios.post(
      "https://leetcode.com/graphql/",
      {
        query: `
          query {
            activeDailyCodingChallengeQuestion {
              question {
                title
                titleSlug
              }
            }
          }
        `,
        variables: {},
      },
      {
        timeout: 30000,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "leetcode-sync-mcp/1.0",
        },
      },
    );

    console.log("SUCCESS");
    console.log(response.data);
  } catch (error: any) {
    console.error("FAILED");
    console.error("message:", error.message);
    console.error("code:", error.code);
  }
}

test();
