import { createServer } from "http";
import { MCPServer } from "@mastra/mcp";
import { randomUUID } from "crypto";
import { vectorSearchWorkflow } from "../../mastra/workflows/vector-search";

export const mcpServer = new MCPServer({
  id: "ans-mcp-server",
  name: "model-context-protocol-server",
  version: "1.0.0",
  agents: {},
  tools: {},
  workflows: { vectorSearchWorkflow },
});

export function startMcpServer(port: number) {
  createServer(async (req, res) => {
    await mcpServer.startHTTP({
      url: new URL(req.url || "", `http://localhost:${port}`),
      httpPath: "/mcp",
      req,
      res,
      options: {
        sessionIdGenerator: () => randomUUID(),
      },
    });
  }).listen(port, () => {
    console.log(`MCP Server running on http://localhost:${port}/mcp`);
  });
}

