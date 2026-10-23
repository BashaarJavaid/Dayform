import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { CARD_MIME_TYPE } from "@dayform/contracts";
import { createMockApp } from "../src/app.ts";
import { loadFixtures } from "../src/fixtures.ts";
import { connect, listen } from "./helpers.ts";

const fixtures = loadFixtures();
let url: string;
let server: Server;
beforeAll(async () => ({ url, server } = await listen(createMockApp({ fixtures }))));
afterAll(() => void server.close());

describe("mock MCP server", () => {
  it("negotiates 2025-11-25 and lists 18 described tools whose cards resolve", async () => {
    const { client, transport } = await connect(url);
    expect(transport.protocolVersion).toBe("2025-11-25");
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(18);
    for (const t of tools) {
      expect(t.description?.length).toBeGreaterThan(60);
      expect(t.outputSchema?.type).toBe("object");
      const uri = (t._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri;
      if (!uri) continue;
      const r = await client.readResource({ uri });
      expect(r.contents[0].mimeType).toBe(CARD_MIME_TYPE);
    }
    expect(tools.filter((t) => t._meta?.ui).length).toBe(17);
    await client.close();
  });

  it("log_meal with the S1 items returns the S1 fixture", async () => {
    const { client } = await connect(url);
    const r = await client.callTool({
      name: "log_meal",
      arguments: {
        items: [{ food: "roti", quantity: 2 }, { food: "chicken karahi" }, { food: "mango lassi" }],
        meal: "lunch",
      },
    });
    expect(r.structuredContent).toEqual(fixtures.log_meal);
    await client.close();
  });

  it("checkout_cart sends an elicitation and honors the answer", async () => {
    const yes = await connect(url);
    const r = await yes.client.callTool({ name: "checkout_cart", arguments: {} });
    expect(yes.elicitations).toHaveLength(1);
    expect((yes.elicitations[0] as { message: string }).message).toBe("Add 14 items, about $63, to your Amazon cart?");
    expect((r.structuredContent as any).checkout.status).toBe("confirmed");
    expect((r.structuredContent as any).add_to_cart_url).toMatch(
      /^https:\/\/www\.amazon\.com\/associates\/addtocart\?AssociateTag=/,
    );

    const no = await connect(url, { action: "decline" });
    const d = await no.client.callTool({ name: "checkout_cart", arguments: {} });
    expect((d.structuredContent as any).checkout.status).toBe("declined");
    expect((d.structuredContent as any).add_to_cart_url).toBeNull();
    await yes.client.close();
    await no.client.close();
  });

  it("CHECKOUT_CONFIRM=tool adds confirm_checkout as the 19th tool", async () => {
    const t = await listen(createMockApp({ fixtures, checkoutConfirm: "tool" }));
    const { client, elicitations } = await connect(t.url);
    expect((await client.listTools()).tools).toHaveLength(19);
    const r = await client.callTool({ name: "checkout_cart", arguments: {} });
    expect((r.structuredContent as any).checkout.status).toBe("awaiting_confirmation");
    const c = await client.callTool({ name: "confirm_checkout", arguments: { confirm: true } });
    expect((c.structuredContent as any).checkout.status).toBe("confirmed");
    expect(elicitations).toHaveLength(0);
    await client.close();
    t.server.close();
  });
});
