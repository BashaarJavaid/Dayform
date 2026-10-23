// T-07 smoke: one Nova Converse call, then one row into smoke_overnight via the RDS Data API.
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const bedrock = new BedrockRuntimeClient({});
const rds = new RDSDataClient({});
const db = { resourceArn: process.env.AURORA_CLUSTER_ARN!, secretArn: process.env.AURORA_SECRET_ARN!, database: process.env.AURORA_DATABASE! };

export const handler = async (event: unknown) => {
  const source = (event as { source?: string })?.source ?? "manual";
  const res = await bedrock.send(new ConverseCommand({
    modelId: process.env.REASONING_MODEL_ID!,
    messages: [{ role: "user", content: [{ text: "Reply with one short sentence wishing a lifter good morning." }] }],
    inferenceConfig: { maxTokens: 40 },
  }));
  const reply = res.output?.message?.content?.[0]?.text?.trim() ?? "";
  const note = `${source}: ${reply}`.slice(0, 500);
  await rds.send(new ExecuteStatementCommand({ ...db, sql: "CREATE TABLE IF NOT EXISTS smoke_overnight(ran_at timestamptz, note text)" }));
  await rds.send(new ExecuteStatementCommand({ ...db, sql: "INSERT INTO smoke_overnight(ran_at, note) VALUES (now(), :note)",
    parameters: [{ name: "note", value: { stringValue: note } }] }));
  return { ok: true, note };
};
