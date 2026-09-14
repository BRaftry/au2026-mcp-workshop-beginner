import cors from 'cors';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { AppAuthenticationProvider } from './aps.js';
import { createMcpServer } from './mcp.js';

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    console.error('APS_CLIENT_ID and APS_CLIENT_SECRET environment variables are required.');
    process.exit(1);
}
const PORT = parseInt(process.env.PORT || '3000');
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

const authenticationProvider = new AppAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
const mcpHandler = createMcpHandler(() => createMcpServer(authenticationProvider));

const app = createMcpExpressApp({ host: '0.0.0.0' });
app.use(cors());

const mcpNodeHandler = toNodeHandler(mcpHandler);
app.all('/mcp', (req, res) => mcpNodeHandler(req, res, req.body));

app.listen(PORT, () => console.log(`MCP server listening on ${PUBLIC_URL}/mcp`));
