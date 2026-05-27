import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defillamaFeesOverview,
  defillamaPricesCurrent,
  defillamaProtocol,
  defillamaStablecoins,
  defillamaYieldsPools
} from "../src/mcp/defillama.js";

function mockFetch(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body)
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("DefiLlama MCP helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses free public DefiLlama endpoints without auth headers", async () => {
    const fetchMock = mockFetch({ tvl: 123 });

    const result = await defillamaProtocol({ slug: "aave" });

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      source: "defillama-public",
      freeOnly: true,
      data: { tvl: 123 }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.llama.fi/protocol/aave"),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          authorization: expect.any(String)
        })
      })
    );
  });

  it("builds stablecoin, yield, fee, and price requests", async () => {
    const fetchMock = mockFetch({ data: [{ pool: "one" }, { pool: "two" }] });

    await defillamaStablecoins({ includePrices: false });
    await defillamaYieldsPools({ limit: 1 });
    await defillamaFeesOverview({ dataType: "dailyRevenue" });
    await defillamaPricesCurrent({ coins: ["coingecko:ethereum"] });

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain("https://stablecoins.llama.fi/stablecoins?includePrices=false");
    expect(urls).toContain("https://yields.llama.fi/pools");
    expect(urls).toContain(
      "https://fees.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue"
    );
    expect(urls).toContain("https://coins.llama.fi/prices/current/coingecko%3Aethereum");
  });
});
