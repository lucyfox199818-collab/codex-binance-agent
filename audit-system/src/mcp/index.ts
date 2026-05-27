#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { auditDataDir } from "../cli/env.js";
import { analyzeCycles, analyzeTradingDecisions, getCycleDigest } from "./analysis.js";
import { coingeckoMarkets, coingeckoSearch, coingeckoTrending } from "./coingecko.js";
import {
  defillamaFeesOverview,
  defillamaPricesCurrent,
  defillamaProtocol,
  defillamaProtocols,
  defillamaStablecoins,
  defillamaYieldsPools
} from "./defillama.js";

type JsonRecord = Record<string, unknown>;

const server = new McpServer({
  name: "trading-intel-mcp",
  version: "0.1.0"
});

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: serialize(value)
      }
    ]
  };
}

function toolError(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error)
      }
    ],
    isError: true
  };
}

function coingeckoOptions() {
  return {
    apiKey: process.env.COINGECKO_DEMO_API_KEY || process.env.COINGECKO_API_KEY,
    baseUrl: process.env.COINGECKO_BASE_URL
  };
}

function defillamaOptions() {
  return {
    baseUrls: {
      core: process.env.DEFILLAMA_CORE_BASE_URL,
      stablecoins: process.env.DEFILLAMA_STABLECOINS_BASE_URL,
      yields: process.env.DEFILLAMA_YIELDS_BASE_URL,
      coins: process.env.DEFILLAMA_COINS_BASE_URL,
      fees: process.env.DEFILLAMA_FEES_BASE_URL
    }
  };
}

server.registerTool(
  "audit_analyze_cycles",
  {
    title: "Analyze Audit Cycles",
    description: "Read local audit data and return cycle/event/symbol coverage statistics. Read-only.",
    inputSchema: {
      limit: z.number().int().positive().max(500).optional(),
      status: z.enum(["running", "completed", "error"]).optional(),
      symbol: z.string().min(1).optional()
    }
  },
  async (args) => {
    try {
      return toolResult(analyzeCycles({ dataDir: auditDataDir() }, args as JsonRecord));
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "audit_analyze_trading_decisions",
  {
    title: "Analyze Trading Decisions",
    description: "Aggregate CTA, risk gate, execution skip, and execution event patterns from local audit data. Read-only.",
    inputSchema: {
      limit: z.number().int().positive().max(500).optional(),
      symbol: z.string().min(1).optional()
    }
  },
  async (args) => {
    try {
      return toolResult(analyzeTradingDecisions({ dataDir: auditDataDir() }, args as JsonRecord));
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "audit_get_cycle_digest",
  {
    title: "Get Audit Cycle Digest",
    description: "Return a compact read-only digest for one audit cycle, with optional final summary payload.",
    inputSchema: {
      cycleId: z.string().min(1),
      includeFinalSummaryPayload: z.boolean().optional()
    }
  },
  async (args) => {
    try {
      return toolResult(getCycleDigest({ dataDir: auditDataDir() }, args as { cycleId: string; includeFinalSummaryPayload?: boolean }));
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "coingecko_search",
  {
    title: "CoinGecko Search",
    description: "Search CoinGecko public API for coins, exchanges, categories, and NFTs. Read-only, free public endpoint.",
    inputSchema: {
      query: z.string().min(1)
    }
  },
  async (args) => {
    try {
      return toolResult(await coingeckoSearch(args as JsonRecord, coingeckoOptions()));
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "coingecko_trending",
  {
    title: "CoinGecko Trending",
    description: "Fetch CoinGecko public trending coins and NFTs. Read-only, free public endpoint.",
    inputSchema: {}
  },
  async (args) => {
    try {
      return toolResult(await coingeckoTrending(args as JsonRecord, coingeckoOptions()));
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "coingecko_markets",
  {
    title: "CoinGecko Markets",
    description: "Fetch CoinGecko public coin market data for market-cap, category, and sector context. Read-only.",
    inputSchema: {
      vsCurrency: z.string().min(1).optional(),
      ids: z.array(z.string().min(1)).optional(),
      category: z.string().min(1).optional(),
      order: z.string().min(1).optional(),
      perPage: z.number().int().positive().max(250).optional(),
      page: z.number().int().positive().max(100).optional(),
      sparkline: z.boolean().optional(),
      priceChangePercentage: z.string().min(1).optional()
    }
  },
  async (args) => {
    try {
      return toolResult(await coingeckoMarkets(args as JsonRecord, coingeckoOptions()));
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "defillama_protocols",
  {
    title: "DefiLlama Protocols",
    description: "Fetch DefiLlama public protocol TVL metadata. Read-only, free public endpoint.",
    inputSchema: {}
  },
  async (args) => {
    try {
      return toolResult(await defillamaProtocols(args as JsonRecord, defillamaOptions()));
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "defillama_protocol",
  {
    title: "DefiLlama Protocol",
    description: "Fetch DefiLlama public historical TVL and protocol metadata by slug. Read-only, free public endpoint.",
    inputSchema: {
      slug: z.string().min(1)
    }
  },
  async (args) => {
    try {
      return toolResult(await defillamaProtocol(args as JsonRecord, defillamaOptions()));
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "defillama_stablecoins",
  {
    title: "DefiLlama Stablecoins",
    description: "Fetch DefiLlama public stablecoin supply context. Read-only, free public endpoint.",
    inputSchema: {
      includePrices: z.boolean().optional()
    }
  },
  async (args) => {
    try {
      return toolResult(await defillamaStablecoins(args as JsonRecord, defillamaOptions()));
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "defillama_yields_pools",
  {
    title: "DefiLlama Yield Pools",
    description: "Fetch DefiLlama public yield pool data. Read-only, free public endpoint.",
    inputSchema: {
      limit: z.number().int().positive().max(10_000).optional()
    }
  },
  async (args) => {
    try {
      return toolResult(await defillamaYieldsPools(args as JsonRecord, defillamaOptions()));
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "defillama_fees_overview",
  {
    title: "DefiLlama Fees Overview",
    description: "Fetch DefiLlama public fees/revenue overview. Read-only, free public endpoint.",
    inputSchema: {
      dataType: z.string().min(1).optional(),
      excludeTotalDataChart: z.boolean().optional(),
      excludeTotalDataChartBreakdown: z.boolean().optional()
    }
  },
  async (args) => {
    try {
      return toolResult(await defillamaFeesOverview(args as JsonRecord, defillamaOptions()));
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "defillama_prices_current",
  {
    title: "DefiLlama Current Prices",
    description: "Fetch DefiLlama public current token prices by coin ids, e.g. coingecko:ethereum. Read-only.",
    inputSchema: {
      coins: z.array(z.string().min(1)).min(1)
    }
  },
  async (args) => {
    try {
      return toolResult(await defillamaPricesCurrent(args as JsonRecord, defillamaOptions()));
    } catch (error) {
      return toolError(error);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
