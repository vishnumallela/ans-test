import {
  ToolLoopAgent,
  UIMessage,
  createUIMessageStreamResponse,
  convertToModelMessages,
  wrapLanguageModel,
  gateway,
} from "ai";
import { createMCPClient, MCPClient } from "@ai-sdk/mcp";
import { devToolsMiddleware } from '@ai-sdk/devtools';
import { AGENT_SYSTEM_PROMPT } from "./system-prompt";

const model = wrapLanguageModel({
  model: gateway('anthropic/claude-opus-4.6'),
  middleware: devToolsMiddleware(),
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  
  let mcpClient: MCPClient | undefined;

  try {
    mcpClient = await createMCPClient({
      transport: {
        type: "http",
        url: "http://localhost:3001/mcp",
      },
    });

    const mcpTools = await mcpClient.tools();
    const modelMessages = await convertToModelMessages(messages);

    const agent = new ToolLoopAgent({
      model,
      instructions: AGENT_SYSTEM_PROMPT,
      tools: mcpTools,
      experimental_onToolCallStart: async (event: any) => {
        console.log(`Tool call starting: ${event.toolCall.toolName}`);
      },
      experimental_onToolCallFinish: async (event: any) => {
        if (event.success) {
          console.log(`Tool call finished: ${event.toolCall.toolName}`);
        } else {
          console.error(`Tool call failed: ${event.toolCall.toolName}`, event.error);
        }
      },
      onFinish: async () => {
        await mcpClient?.close();
      },
    });

    const stream = agent.stream({
      messages: modelMessages,
    });

    return createUIMessageStreamResponse({
      stream: (await stream).toUIMessageStream(),
    });

  } catch (error) {
    console.error("Chat API error:", error);
    await mcpClient?.close();
    
    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}