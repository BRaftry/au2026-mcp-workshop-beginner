import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getHubsProjects, getFolderContents } from './aps.js';

export function createMcpServer(authenticationProvider) {
    const server = new McpServer({
        name: 'aps-mcp-server',
        description: 'MCP server for Autodesk Platform Services',
        version: '1.0.0'
    });

    server.registerTool(
        'list-hubs-projects',
        {
            description: 'Lists all hubs and their projects available to the APS application.',
        },
        async () => {
            const hubs = await getHubsProjects(authenticationProvider);
            const lines = [];
            for (const hub of hubs) {
                lines.push(`- Hub: ${hub.name} (ID: ${hub.id}, region: ${hub.region})`);
                for (const project of hub.projects) {
                    lines.push(`  - Project: ${project.name} (ID: ${project.id})`);
                }
            }
            return { content: [{ type: 'text', text: lines.join('\n') }] };
        }
    );

    server.registerTool(
        'list-folder-contents',
        {
            description: 'Lists the contents of a folder in a project, or top-level folders if no folder ID is provided.',
            inputSchema: z.object({
                hubId: z.string().describe('Hub ID.'),
                projectId: z.string().describe('Project ID.'),
                folderId: z.string().optional().describe('Folder ID. Omit to list top-level folders.'),
            })
        },
        async ({ hubId, projectId, folderId }) => {
            const items = await getFolderContents(hubId, projectId, folderId, authenticationProvider);
            const lines = [];
            for (const item of items) {
                if (item.type === 'folders') {
                    lines.push(`- Folder: ${item.name} (ID: ${item.id})`);
                } else if (item.type === 'items') {
                    lines.push(`- File: ${item.name} (ID: ${item.id}, Last modified at ${item.modifiedAt} by ${item.modifiedBy})`);
                }
            }
            return { content: [{ type: 'text', text: lines.join('\n') }] };
        }
    );

    return server;
}
