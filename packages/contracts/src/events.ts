import { z } from "zod";

/** Simulator WebSocket events (frontend ⇄ backend), discriminated on `type`. Audio is base64 PCM16 mono. */
const ev = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), ...shape });

export const StateEvent = ev("state", { state: z.enum(["idle", "listening", "thinking", "speaking"]) });
export const UserTranscriptEvent = ev("user_transcript", { text: z.string(), final: z.boolean() });
export const AlexaTranscriptEvent = ev("alexa_transcript", { text: z.string(), final: z.boolean() });
/** Typed input from the frontend (D12: typed input also works). */
export const TextInputEvent = ev("text_input", { text: z.string().min(1) });
/** Mic audio, frontend → backend, 16 kHz. */
export const AudioInEvent = ev("audio_in", { data: z.string() });
/** Alexa's voice, backend → frontend, 24 kHz. */
export const AudioOutEvent = ev("audio_out", { data: z.string() });
export const ToolCallStartedEvent = ev("tool_call_started", {
  call_id: z.string(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
});
export const ToolCallFinishedEvent = ev("tool_call_finished", {
  call_id: z.string(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  latency_ms: z.number(),
  status: z.enum(["ok", "error"]),
  summary: z.string().describe("One-line result summary for the 'under the hood' trace."),
});
export const CardEvent = ev("card", {
  call_id: z.string().nullable(),
  resource_uri: z.string(),
  html: z.string(),
  data: z.unknown().describe("The tool's structuredContent."),
});
export const ElicitationRequestEvent = ev("elicitation_request", {
  id: z.string(),
  message: z.string(),
  requested_schema: z.record(z.string(), z.unknown()),
});
export const ElicitationResponseEvent = ev("elicitation_response", {
  id: z.string(),
  action: z.enum(["accept", "decline", "cancel"]),
  content: z.record(z.string(), z.unknown()).optional(),
});
export const ProgressEvent = ev("progress", { call_id: z.string().nullable(), text: z.string() });
export const ErrorEvent = ev("error", { message: z.string(), code: z.string().optional() });

/** Backend → frontend. */
export const ServerEvent = z.discriminatedUnion("type", [
  StateEvent,
  UserTranscriptEvent,
  AlexaTranscriptEvent,
  AudioOutEvent,
  ToolCallStartedEvent,
  ToolCallFinishedEvent,
  CardEvent,
  ElicitationRequestEvent,
  ProgressEvent,
  ErrorEvent,
]);
export type ServerEvent = z.infer<typeof ServerEvent>;

/** Frontend → backend. */
export const ClientEvent = z.discriminatedUnion("type", [AudioInEvent, TextInputEvent, ElicitationResponseEvent]);
export type ClientEvent = z.infer<typeof ClientEvent>;

export const SimEvent = z.discriminatedUnion("type", [
  ...ServerEvent.options,
  AudioInEvent,
  TextInputEvent,
  ElicitationResponseEvent,
]);
export type SimEvent = z.infer<typeof SimEvent>;
