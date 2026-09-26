#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createLeetCodeMcpServer } from "./create-server.js";

serveStdio(() => createLeetCodeMcpServer());
