import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createLlm, LlmError, type CallModel } from "../src/core/llm.ts";

const Meal = z.object({ items: z.array(z.object({ food: z.string(), quantity: z.number().optional() })).min(1) });
const req = { name: "record_meal", description: "Record foods.", schema: Meal, prompt: "two rotis and daal" };
const good = { input: { items: [{ food: "roti", quantity: 2 }, { food: "daal" }] }, inputTokens: 10, outputTokens: 5 };

function fake(replies: Array<object | Error>) {
  const calls: Parameters<CallModel>[0][] = [];
  const call: CallModel = async (a) => {
    calls.push(structuredClone({ ...a, signal: undefined as never }));
    const r = replies.shift()!;
    if (r instanceof Error) throw r;
    return r as never;
  };
  return { call, calls };
}

beforeEach(() => {
  process.env.REASONING_MODEL_ID = "primary";
  process.env.REASONING_MODEL_FALLBACK_ID = "fallback";
});

describe("llm client", () => {
  it("forces the tool and returns validated JSON", async () => {
    const f = fake([good]);
    const r = await createLlm(f.call)(req);
    expect(r).toMatchObject({ data: good.input, model: "primary", attempts: 1 });
    expect(f.calls[0].tool.name).toBe("record_meal");
    expect(f.calls[0].tool.json).toMatchObject({ type: "object", required: ["items"] });
  });

  it("retries once on an invalid reply, telling the model what was wrong", async () => {
    const f = fake([{ input: { items: "roti" }, inputTokens: 10, outputTokens: 3 }, good]);
    const r = await createLlm(f.call)(req);
    expect(r).toMatchObject({ data: good.input, attempts: 2, inputTokens: 20, outputTokens: 8, model: "primary" });
    expect(f.calls[1].messages).toHaveLength(1); // one user turn: prompt + correction
    expect(JSON.stringify(f.calls[1].messages)).toMatch(/was invalid/);
  });

  it("gives up after two invalid replies with an LlmError (no fallback for schema problems)", async () => {
    const f = fake([{ input: undefined, inputTokens: 1, outputTokens: 1 }, { input: {}, inputTokens: 1, outputTokens: 1 }]);
    await expect(createLlm(f.call)(req)).rejects.toBeInstanceOf(LlmError);
    expect(f.calls).toHaveLength(2);
  });

  it("falls back to REASONING_MODEL_FALLBACK_ID on throttling", async () => {
    const throttled = Object.assign(new Error("Too many requests"), { name: "ThrottlingException", $metadata: { httpStatusCode: 429 } });
    const f = fake([throttled, good]);
    const r = await createLlm(f.call)(req);
    expect(r.model).toBe("fallback");
    expect(f.calls.map((c) => c.modelId)).toEqual(["primary", "fallback"]);
  });

  it("does not fall back on a client error", async () => {
    const denied = Object.assign(new Error("denied"), { name: "AccessDeniedException", $metadata: { httpStatusCode: 403 } });
    const f = fake([denied]);
    await expect(createLlm(f.call)(req)).rejects.toThrow("denied");
    expect(f.calls).toHaveLength(1);
  });
});
