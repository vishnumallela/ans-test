import { startMcpServer } from "./src/servers/mcp";
import { startElysiaServer } from "./src/servers/elysia";

startMcpServer(3001);
startElysiaServer(3000);
