// Sample tool folder: proves the registry loads a domain folder with no edit to core files.
import { z } from "zod";
import { defineTool } from "../../core/registry.ts";
import { clock } from "../../core/clock.ts";

const ping = {
  name: "ping",
  description: "Health check for the Dayform server. Call only when asked whether the fitness skill is reachable. Returns the server time.",
  input: z.object({}),
  output: z.object({ server_time: z.string() }),
};

export const tools = [
  defineTool(ping, async () => {
    const server_time = (await clock.now()).toISOString();
    return { data: { server_time }, text: `Server time ${server_time}.` };
  }),
];
