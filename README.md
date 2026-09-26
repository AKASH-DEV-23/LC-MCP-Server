# LeetCode Sync MCP Server

Production-oriented TypeScript MCP server supporting:

- Local MCP over stdio
- Remote MCP over Streamable HTTP at `/mcp`
- Bearer-token protection for remote access
- Docker deployment and `/health` endpoint
- GitHub Actions scheduling twice daily
- LeetCode-to-GitHub synchronization

> An LLM cannot connect directly unless its application supports MCP. Use this with any MCP-compatible host or agent, including compatible VS Code clients.

## Tools

- `leetcode_list_recent_accepted`
- `leetcode_get_daily_question`
- `leetcode_sync_solved_to_github`
- `leetcode_sync_daily_to_github`

Write tools default to `dryRun: true`. Preview first, then run with `dryRun: false`.

## Prerequisites

- Node.js 20+
- A GitHub token with Contents read/write on the destination repository
- A valid LeetCode `LEETCODE_SESSION` and CSRF token

## Local testing

```powershell
Copy-Item .env.example .env
npm install
npm run build
npm run start:local
```

The stdio server waits silently for an MCP client. Copy `clients/vscode-local.json` into your client's MCP configuration and replace `ABSOLUTE_PATH` and secrets.

## Test the remote server locally

```powershell
npm run start:remote
```

Health check:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

MCP endpoint: `http://localhost:3000/mcp`. Configure `clients/vscode-remote.json` and use the same `MCP_API_KEY` as the server.

## Docker

```powershell
docker compose up --build
```

For production, configure platform secrets instead of copying `.env` into an image. Put HTTPS/TLS in front of the container. Change `ALLOWED_HOSTS` to the deployed hostname, for example `mcp.example.com`.

## Remote deployment

Deploy the Docker image to Azure Container Apps, Azure App Service, Cloud Run, ECS, Railway, Render, Fly.io, or another Node/container host. Configure all variables from `.env.example` as deployment secrets/settings. Expose port `3000`, map your domain, enable HTTPS, and point the MCP client to `https://YOUR_DOMAIN/mcp`.

## Scheduled synchronization

`.github/workflows/sync-leetcode.yml` runs at `02:30 UTC` and `18:30 UTC`. Add repository secrets:

- `LEETCODE_CSRF_TOKEN`
- `LEETCODE_SESSION_ID`

The workflow uses GitHub's repository token and includes a concurrency group. Empty daily boilerplate submission is disabled by default. Set `SUBMIT_DAILY_BOILERPLATE` to `true` only if you intentionally want that LeetCode submission.

## Security

- Never commit `.env`.
- Use HTTPS for remote MCP.
- Use a long random `MCP_API_KEY` and rotate it if exposed.
- Use a fine-grained GitHub token restricted to one repository.
- Set `ALLOWED_HOSTS` in production.
- LeetCode session cookies expire and its web GraphQL endpoints may change.
- This is designed for a single trusted user. Multi-user hosting requires isolated credentials and OAuth-style authorization.
