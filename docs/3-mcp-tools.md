# Part 3: MCP Server & Tools

In this section you'll build the heart of the workshop: an MCP server that exposes two tools the AI can call — one to list hubs and projects, and one to browse folder contents. By the end, GitHub Copilot Chat will be able to answer questions about your APS data by calling those tools directly.

## Theory

### What is MCP?

The **Model Context Protocol (MCP)** is an open standard that lets AI clients — like GitHub Copilot — call tools and access data from external servers. Think of it as a plugin system for AI: you define named functions with typed arguments, and the AI decides when and how to call them.

### Key concepts

**MCP tool** — a named function the AI can call with typed arguments. It receives a structured input object and returns text or structured content. You'll define two tools in this section.

**STDIO transport** — the simplest MCP transport. The AI client (VS Code / Copilot) launches your server as a child process and communicates over stdin/stdout. No ports, no networking — just a process.

### The factory function pattern

> **Design note:** You'll write a `createMcpServer(authenticationProvider)` factory function that creates and returns the server — it does **not** start it. This separation is intentional.
>
> The same factory can later be used with different transports:
>
> - **STDIO** for local development (this section)
> - **Streamable HTTP** for a deployed, shared server (the advanced session)
>
> Because the server logic lives in `createMcpServer`, swapping transports requires changing only `index.js` — the server tools themselves are untouched.

## Step 1: MCP Server

Create a new file called `mcp.js` in the project root. Start with the imports and a skeleton factory function:

```js
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { getHubsProjects, getFolderContents } from './aps.js';

export function createMcpServer(authenticationProvider) {
    const server = new McpServer({
        name: 'aps-mcp-server',
        title: 'APS MCP Server',
        version: '1.0.0'
    });

    // TODO: register the list-hubs-projects tool

    // TODO: register the list-folder-contents tool

    return server;
}
```

`McpServer` is the main class from the MCP SDK. You give it a name, a display title, and a version. Then you register tools on it before returning it. The `name` is the machine-readable identifier; the `title` is what MCP clients show to the user.

## Step 2: MCP tools

Replace the first `// TODO` comment with the following tool registration:

```js
    server.registerTool(
        'list-hubs-projects',
        {
            title: 'List hubs and projects',
            description: 'Lists all hubs and their projects available to the APS application.',
            annotations: { readOnlyHint: true }
        },
        async () => {
            const hubs = await getHubsProjects(authenticationProvider);
            return { content: [{ type: 'text', text: JSON.stringify(hubs, null, 2) }] };
        }
    );
```

`server.registerTool` takes three arguments:

1. **Name** — the identifier the AI uses to call this tool
2. **Options object** — describes the tool to the client
3. **Handler** — an async function that does the work and returns `{ content: [...] }`

The options object carries four things worth knowing about:

| Field | Purpose |
| --- | --- |
| `description` | Plain-language explanation the AI uses to decide when to call the tool |
| `title` | Human-readable name clients show in their UI |
| `inputSchema` | The tool's typed arguments; omit it for a tool that takes none |
| `annotations` | Hints about what calling the tool does |

`annotations: { readOnlyHint: true }` tells the client the tool only reads data and never changes anything. Both of your tools are read-only. Declaring it lets Copilot treat them as safe, skipping the per-call approval prompt.

Replace the second `// TODO` comment with:

```js
    server.registerTool(
        'list-folder-contents',
        {
            title: 'List folder contents',
            description: 'Lists the contents of a folder in a project, or top-level folders if no folder ID is provided.',
            inputSchema: z.object({
                hubId: z.string().describe('Hub ID.'),
                projectId: z.string().describe('Project ID.'),
                folderId: z.string().optional().describe('Folder ID. Omit to list top-level folders.'),
            }),
            annotations: { readOnlyHint: true }
        },
        async ({ hubId, projectId, folderId }) => {
            const items = await getFolderContents(authenticationProvider, hubId, projectId, folderId);
            return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
        }
    );
```

This tool has a typed input schema defined with [Zod](https://zod.dev). The schema is passed as `inputSchema` inside the options object, wrapped in `z.object({...})`. The `.describe()` calls on each field tell the AI what to pass, so it can fill in arguments automatically from context.

`folderId` is marked `.optional()`, which lets the AI omit it when it wants top-level folders rather than the contents of a specific folder.

`hubId` is required even though the helper only reads it on one of its two paths. The APS API addresses a project's top-level folders per hub. It addresses the contents of a specific folder per project instead. The tool asks for both identifiers up front, and ignores `hubId` whenever `folderId` is supplied.

## Step 3: Update the app

The `index.js` you created in the previous section was a temporary sanity check. Replace its entire contents with the real entry point:

```js
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { AppAuthenticationProvider } from './aps.js';
import { createMcpServer } from './mcp.js';

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    console.error('APS_CLIENT_ID and APS_CLIENT_SECRET environment variables are required.');
    process.exit(1);
}

const authenticationProvider = new AppAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
const server = createMcpServer(authenticationProvider);
const transport = new StdioServerTransport();
await server.connect(transport);
```

What each part does:

- `StdioServerTransport` wires the server to stdin/stdout
- `AppAuthenticationProvider` is passed into the factory so the server can make authenticated APS calls
- `server.connect(transport)` starts the MCP message loop — the process now waits for tool calls from a client
- the `APS_CLIENT_ID:` line from the previous section is gone — it was there to prove the secrets had arrived, and that job is done

> **Design note:** Under STDIO, stdout is the protocol channel: the client reads JSON-RPC messages from it, so anything else written there corrupts the stream and drops the connection. Diagnostics go to stderr instead, which the client treats as a log. Use `console.error` for every message your server prints — never `console.log`.

## Step 4: Copilot integration

Create the `.vscode/` directory if it doesn't exist, then create `.vscode/mcp.json`:

```json
{
  "servers": {
    "APS MCP Server": {
      "type": "stdio",
      "command": "node",
      "args": ["index.js"]
    }
  }
}
```

VS Code reads this file and, when you open Copilot Chat in agent mode, it automatically starts `node index.js` as a child process and connects to it over STDIO. You don't need to run the server yourself in a terminal.

> **After editing `mcp.js`, `aps.js`, or `index.js`:** click the **Restart** action above the server definition in `mcp.json` (or stop and start it again). Copilot keeps using the previously-loaded build of the server until you restart it, which is the most common source of "my change didn't take effect" confusion.

> **Note:** The `APS_CLIENT_ID` and `APS_CLIENT_SECRET` environment variables are injected by your Codespace secrets — you don't need to add them here. That holds whether you use the Codespace in the browser or through local VS Code, because the server always runs inside the Codespace. If you ever run the project outside a Codespace, export the two variables in your shell before launching VS Code.

## Checkpoint

You should now have:

- [x] `mcp.js` with `createMcpServer` factory and two registered tools
- [x] `index.js` using `StdioServerTransport` to start the server
- [x] `.vscode/mcp.json` pointing VS Code at your server

<details>
    <summary>
        Reference: full <code>mcp.js</code>
    </summary>

```js
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { getHubsProjects, getFolderContents } from './aps.js';

export function createMcpServer(authenticationProvider) {
    const server = new McpServer({
        name: 'aps-mcp-server',
        title: 'APS MCP Server',
        version: '1.0.0'
    });

    server.registerTool(
        'list-hubs-projects',
        {
            title: 'List hubs and projects',
            description: 'Lists all hubs and their projects available to the APS application.',
            annotations: { readOnlyHint: true }
        },
        async () => {
            const hubs = await getHubsProjects(authenticationProvider);
            return { content: [{ type: 'text', text: JSON.stringify(hubs, null, 2) }] };
        }
    );

    server.registerTool(
        'list-folder-contents',
        {
            title: 'List folder contents',
            description: 'Lists the contents of a folder in a project, or top-level folders if no folder ID is provided.',
            inputSchema: z.object({
                hubId: z.string().describe('Hub ID.'),
                projectId: z.string().describe('Project ID.'),
                folderId: z.string().optional().describe('Folder ID. Omit to list top-level folders.'),
            }),
            annotations: { readOnlyHint: true }
        },
        async ({ hubId, projectId, folderId }) => {
            const items = await getFolderContents(authenticationProvider, hubId, projectId, folderId);
            return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
        }
    );

    return server;
}
```

</details>

<details>
    <summary>
        Reference: full <code>index.js</code>
    </summary>

```js
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { AppAuthenticationProvider } from './aps.js';
import { createMcpServer } from './mcp.js';

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    console.error('APS_CLIENT_ID and APS_CLIENT_SECRET environment variables are required.');
    process.exit(1);
}

const authenticationProvider = new AppAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
const server = createMcpServer(authenticationProvider);
const transport = new StdioServerTransport();
await server.connect(transport);
```

</details>

## Try it out

Use this quick smoke test to verify the implementation works in its current state:

1. Open `.vscode/mcp.json` in VS Code.
2. Use the **Start** or **Enable** action shown above the server definition so VS Code registers the `APS MCP Server` from this file.
3. Open a **new GitHub Copilot Chat** window, and make sure the mode picker at the bottom shows **Agent** (not Ask or Edits). Tools are only invoked in Agent mode.
4. Ask a question such as:

    > What Forma projects do I have access to?

If the server is running correctly, Copilot should call your MCP tool and respond with data from your APS account. If VS Code prompts you to approve the tool call, click **Allow**.

> **Debugging tip — MCP Inspector.** If something isn't working, the MCP Inspector lets you test the server directly, bypassing Copilot entirely. Its command-line mode is the quickest option in a Codespace — no ports to forward and no browser needed.
>
> List the tools your server exposes:
>
> ```bash
> npx @modelcontextprotocol/inspector --cli node index.js -e APS_CLIENT_ID=$APS_CLIENT_ID -e APS_CLIENT_SECRET=$APS_CLIENT_SECRET --method tools/list
> ```
>
> Call one of them:
>
> ```bash
> npx @modelcontextprotocol/inspector --cli node index.js -e APS_CLIENT_ID=$APS_CLIENT_ID -e APS_CLIENT_SECRET=$APS_CLIENT_SECRET --method tools/call --tool-name list-hubs-projects
> ```
>
> The Inspector spawns your server as a child process and prints the raw JSON result, so you can confirm whether a problem is in your server code or in the Copilot integration.
>
> Two things to watch for:
>
> - **The Inspector does not pass your environment through to the server.** That's what the `-e` flags are for. Without them your server exits with `APS_CLIENT_ID and APS_CLIENT_SECRET environment variables are required.` and the Inspector reports `Connection closed`.
> - **The Inspector needs Node 22.19 or newer**, which is a higher bar than the server itself. Check with `node --version` if `npx` refuses to run it.
>
> There is also a browser UI (`npx @modelcontextprotocol/inspector node index.js`, plus the same `-e` flags). It serves on port **6274** and prints a URL containing a one-time session token — you have to open that full URL, token included, or the UI loads but every request it makes is rejected.

## Additional resources

- [Model Context Protocol documentation](https://modelcontextprotocol.io)
- [MCP SDK for JavaScript](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
