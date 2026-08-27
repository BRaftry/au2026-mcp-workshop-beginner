import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { AppAuthenticationProvider } from './aps.js';
import { createMcpServer } from './mcp.js';

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    console.error('APS_CLIENT_ID and APS_CLIENT_SECRET environment variables are required.');
    process.exit(1);
}
console.error('APS_CLIENT_ID:', APS_CLIENT_ID);

const authenticationProvider = new AppAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
const server = createMcpServer(authenticationProvider);
const transport = new StdioServerTransport();
await server.connect(transport);
