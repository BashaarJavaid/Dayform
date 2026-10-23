// SigV4 for AgentCore (service bedrock-agentcore), the T-03 signer. Patches global fetch so any MCP client that uses
// the default fetch (the demo runner's StreamableHTTPClientTransport) signs requests to the AgentCore host.
import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

const region = process.env.AWS_REGION ?? "us-east-1";
const signer = new SignatureV4({ service: "bedrock-agentcore", region, sha256: Sha256, credentials: defaultProvider() });
const plain = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!url.hostname.startsWith("bedrock-agentcore.")) return plain(input, init);
  const headers: Record<string, string> = { host: url.host };
  new Headers(init.headers).forEach((v, k) => (headers[k] = v));
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (query[k] = v));
  const signed = await signer.sign(
    new HttpRequest({ method: init.method ?? "GET", protocol: url.protocol, hostname: url.hostname, path: url.pathname, query, headers, body: init.body as string | undefined }),
  );
  return plain(url, { ...init, headers: signed.headers });
};
