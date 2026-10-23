import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CARDS, CARD_URIS, TOOLS, confirm_checkout, ServerEvent, ClientEvent } from "../src/index.ts";

describe("contracts", () => {
  it("has the 18 tools of DESIGN §4, unique, each described", () => {
    expect(TOOLS).toHaveLength(18);
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(18);
    for (const t of [...TOOLS, confirm_checkout]) expect(t.description.length).toBeGreaterThan(60);
  });

  it("every card a tool names exists, and its output carries the card's fields", () => {
    for (const t of [...TOOLS, confirm_checkout]) {
      if (!("card" in t) || !t.card) continue;
      expect(CARD_URIS[t.card]).toBe(`ui://cards/${t.card}`);
      for (const key of Object.keys(CARDS[t.card].shape)) expect(Object.keys(t.output.shape)).toContain(key);
    }
    expect(Object.keys(CARDS)).toHaveLength(8);
  });

  it("every schema converts to JSON Schema (what the SDK sends in tools/list)", () => {
    for (const t of [...TOOLS, confirm_checkout]) {
      expect(z.toJSONSchema(t.input, { target: "draft-7" }).type).toBe("object");
      expect(z.toJSONSchema(t.output, { target: "draft-7" }).type).toBe("object");
    }
  });

  it("parses simulator events by type", () => {
    expect(ServerEvent.parse({ type: "state", state: "thinking" }).type).toBe("state");
    expect(ClientEvent.parse({ type: "text_input", text: "start push day" }).type).toBe("text_input");
    expect(() => ServerEvent.parse({ type: "state", state: "dancing" })).toThrow();
  });
});
