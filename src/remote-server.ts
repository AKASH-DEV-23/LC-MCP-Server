#!/usr/bin/env node

import {
  createServer,
  type ServerResponse,
} from "node:http";

import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createLeetCodeMcpServer } from "./create-server.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

const allowedHosts = (process.env.ALLOWED_HOSTS || "")
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

const handler = createMcpHandler(
  () => createLeetCodeMcpServer(),
  {
    responseMode: "json",
  },
);

const nodeHandler = toNodeHandler(handler, {
  maxRequestBodySize: 1024 * 1024,
  onerror: (error) => {
    console.error("MCP handler error:", error);
  },
});

function hostAllowed(req: { headers: { host?: string } }): boolean {
  if (!allowedHosts.length) {
    return true;
  }

  const hostname = (req.headers.host || "")
    .split(":")[0]
    .toLowerCase();

  return allowedHosts.includes(hostname);
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });

  res.end(JSON.stringify(body));
}

const httpServer = createServer((req, res) => {
  /*
   * Public health endpoint
   */
  if (
    req.url === "/health" &&
    req.method === "GET"
  ) {
    return json(res, 200, {
      status: "ok",
      service: "leetcode-sync-mcp",
      version: "2.0.0",
    });
  }

  /*
   * MCP endpoint
   */
  if (req.url !== "/mcp") {
    return json(res, 404, {
      error: "Not found",
    });
  }

  /*
   * Host allow-list
   */
  if (!hostAllowed(req)) {
    return json(res, 403, {
      error: "Host is not allowed",
    });
  }

  /*
   * Public MCP endpoint.
   *
   * No Bearer token.
   * No OAuth.
   * No authentication.
   */
  void nodeHandler(req, res);
});

httpServer.listen(port, host, () => {
  console.log(
    `LeetCode Sync MCP listening on http://${host}:${port}/mcp`,
  );
});

const shutdown = async () => {
  await handler.close();

  httpServer.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);