// LLM client (T-20 task 7; used by T-22, T-25, T-27, T-28). Bedrock Converse on REASONING_MODEL_ID (Nova, D21).
// Structured output = one FORCED tool (toolChoice {tool:{name}}, proven in T-01) whose input schema is the zod
// schema; the reply is zod-validated and retried once with the errors. Throttling or a 5xx moves to
// REASONING_MODEL_FALLBACK_ID. Nova takes ~650 ms per call, so never call this on a confident tool path (§7).
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type ConverseCommandOutput,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";

export interface StructuredRequest<T extends z.ZodType> {
  /** Tool name the model must call, e.g. "save_meal_plan". */
  name: string;
  description: string;
  schema: T;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Use ConverseStream (long outputs). Nova sends a forced tool's input in one delta at the end (F-007). */
  stream?: boolean;
}

export interface LlmResult<T> {
  data: T;
  model: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
}

type Raw = { input: unknown; inputTokens: number; outputTokens: number; stopReason?: string };
/** One model call that returns the forced tool's input. Injectable for tests. */
export type CallModel = (args: {
  modelId: string;
  system?: string;
  messages: Message[];
  tool: { name: string; description: string; json: Record<string, unknown> };
  maxTokens: number;
  temperature: number;
  stream: boolean;
  signal: AbortSignal;
}) => Promise<Raw>;

let bedrock: BedrockRuntimeClient | undefined;
export const bedrockCall: CallModel = async (a) => {
  bedrock ??= new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  const input = {
    modelId: a.modelId,
    system: a.system ? [{ text: a.system }] : undefined,
    messages: a.messages,
    toolConfig: {
      tools: [{ toolSpec: { name: a.tool.name, description: a.tool.description, inputSchema: { json: a.tool.json as never } } }],
      toolChoice: { tool: { name: a.tool.name } },
    },
    inferenceConfig: { maxTokens: a.maxTokens, temperature: a.temperature },
  };
  if (!a.stream) {
    const r: ConverseCommandOutput = await bedrock.send(new ConverseCommand(input), { abortSignal: a.signal });
    return {
      input: r.output?.message?.content?.find((b) => b.toolUse)?.toolUse?.input,
      inputTokens: r.usage?.inputTokens ?? 0,
      outputTokens: r.usage?.outputTokens ?? 0,
      stopReason: r.stopReason,
    };
  }
  const r = await bedrock.send(new ConverseStreamCommand(input), { abortSignal: a.signal });
  let buf = "";
  const out: Raw = { input: undefined, inputTokens: 0, outputTokens: 0 };
  for await (const ev of r.stream!) {
    buf += ev.contentBlockDelta?.delta?.toolUse?.input ?? "";
    if (ev.messageStop) out.stopReason = ev.messageStop.stopReason;
    if (ev.metadata?.usage) {
      out.inputTokens = ev.metadata.usage.inputTokens ?? 0;
      out.outputTokens = ev.metadata.usage.outputTokens ?? 0;
    }
  }
  try {
    out.input = JSON.parse(buf);
  } catch {
    out.input = undefined;
  }
  return out;
};

const isRetryableService = (e: unknown) => {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  const status = err.$metadata?.httpStatusCode ?? 0;
  return /Throttling|ServiceUnavailable|InternalServer|ModelNotReady/i.test(err.name ?? "") || status === 429 || status >= 500;
};

export class LlmError extends Error {}

export function createLlm(call: CallModel = bedrockCall) {
  return async function structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<LlmResult<z.infer<T>>> {
    const { $schema: _, ...json } = z.toJSONSchema(req.schema) as Record<string, unknown>;
    const models = [process.env.REASONING_MODEL_ID, process.env.REASONING_MODEL_FALLBACK_ID].filter(Boolean) as string[];
    if (!models.length) throw new LlmError("REASONING_MODEL_ID is not set");
    const t0 = performance.now();
    let lastErr: unknown;
    for (const modelId of models) {
      const messages: Message[] = [{ role: "user", content: [{ text: req.prompt }] }];
      let tokensIn = 0;
      let tokensOut = 0;
      try {
        for (let attempt = 1; attempt <= 2; attempt++) {
          const signal = AbortSignal.timeout(req.timeoutMs ?? 30_000);
          const raw = await call({
            modelId,
            system: req.system,
            messages,
            tool: { name: req.name, description: req.description, json },
            maxTokens: req.maxTokens ?? 2000,
            temperature: req.temperature ?? 0,
            stream: req.stream ?? false,
            signal,
          });
          tokensIn += raw.inputTokens;
          tokensOut += raw.outputTokens;
          const parsed = req.schema.safeParse(raw.input);
          const ms = Math.round(performance.now() - t0);
          const log = `llm tool=${req.name} model=${modelId} attempt=${attempt} ms=${ms} in=${raw.inputTokens} out=${raw.outputTokens} stop=${raw.stopReason}`;
          if (parsed.success) {
            console.log(`${log} status=ok`);
            return { data: parsed.data, model: modelId, ms, inputTokens: tokensIn, outputTokens: tokensOut, attempts: attempt };
          }
          console.log(`${log} status=invalid`);
          lastErr = new LlmError(`${req.name}: invalid output after 2 attempts: ${parsed.error?.message ?? "no tool call"}`);
          messages.push({
            role: "user",
            content: [{ text: `Your ${req.name} call was invalid:\n${raw.input === undefined ? "no tool input" : z.prettifyError(parsed.error)}\nCall ${req.name} again with input that fixes every error.` }],
          });
          // Bedrock wants alternating roles; merge the two user turns.
          messages.splice(0, 2, { role: "user", content: [...messages[0].content!, ...messages[1].content!] });
        }
        throw lastErr; // invalid twice: the fallback model won't fix a schema problem.
      } catch (e) {
        lastErr = e;
        if (e instanceof LlmError || !isRetryableService(e)) break;
        console.log(`llm tool=${req.name} model=${modelId} status=${(e as Error).name} -> fallback`);
      }
    }
    throw lastErr;
  };
}

/** The shared client. `await structured({ name, description, schema, prompt })`. */
export const structured = createLlm();
