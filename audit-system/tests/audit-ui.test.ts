import { describe, expect, it } from "vitest";

import {
  advanceCursor,
  normalizePagedResponse,
  pageRows,
  phasesForTab,
  retreatCursor,
  visibleWindow
} from "../src/ui/workbench.js";

describe("audit UI workbench helpers", () => {
  it("maps workspace tabs to event phase filters", () => {
    expect(phasesForTab("timeline")).toEqual([]);
    expect(phasesForTab("data")).toEqual(["strategy", "preflight", "data", "market"]);
    expect(phasesForTab("analysis")).toEqual(["analysis", "candidate", "decision", "intent", "cta"]);
    expect(phasesForTab("risk")).toEqual(["risk", "action", "execution", "verification"]);
    expect(phasesForTab("notes")).toEqual(["review", "summary"]);
  });

  it("normalizes legacy arrays and paged API objects", () => {
    expect(normalizePagedResponse([{ id: "a" }, { id: "b" }])).toEqual({
      items: [{ id: "a" }, { id: "b" }],
      total: 2
    });
    expect(
      normalizePagedResponse({
        items: [{ id: "c" }],
        nextCursor: "50",
        total: 125
      })
    ).toEqual({
      items: [{ id: "c" }],
      nextCursor: "50",
      total: 125
    });
  });

  it("tracks cursor history for previous and next page controls", () => {
    const first = { cursor: undefined, previousCursors: [] as string[] };
    const second = advanceCursor(first, "50");
    expect(second).toEqual({ cursor: "50", previousCursors: [""] });

    const third = advanceCursor(second, "100");
    expect(third).toEqual({ cursor: "100", previousCursors: ["", "50"] });

    expect(retreatCursor(third)).toEqual({ cursor: "50", previousCursors: [""] });
    expect(retreatCursor(second)).toEqual({ cursor: undefined, previousCursors: [] });
  });

  it("calculates a fixed-height visible window with overscan padding", () => {
    expect(
      visibleWindow({
        total: 100,
        scrollTop: 80,
        rowHeight: 40,
        viewportHeight: 120,
        overscan: 1
      })
    ).toEqual({
      start: 1,
      end: 6,
      padTop: 40,
      padBottom: 3760
    });
  });

  it("keeps the current API page fully rendered so native scrolling is stable", () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({ id: index + 1 }));

    expect(pageRows(rows)).toHaveLength(50);
    expect(pageRows(rows).at(0)).toEqual({ id: 1 });
    expect(pageRows(rows).at(-1)).toEqual({ id: 50 });
  });
});
