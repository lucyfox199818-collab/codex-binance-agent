#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { createExchange, type ExchangeLike } from "./exchange-factory.js";
import { createToolHandlers, registerCcxtTools } from "./tools.js";

const config = loadConfig();
let exchange: ExchangeLike | undefined;

function getExchange(): ExchangeLike {
  exchange ??= createExchange(config);
  return exchange;
}

const server = new McpServer({
  name: "ccxt-mcp",
  version: "0.1.0"
});

registerCcxtTools(server, createToolHandlers(config, getExchange));

const transport = new StdioServerTransport();
await server.connect(transport);
