# Part 2: APS & Authentication

In this section you will build the APS integration layer for your project. By the end you will have an `aps.js` module with a reusable authentication provider and two data helpers, plus a temporary `index.js` that lists all of your Autodesk Forma hubs and projects as JSON — proving that your credentials work and that you can talk to APS.

## Theory

### The APS Data Management API

The [APS Data Management API](https://aps.autodesk.com/en/docs/data/v2/overview/) organises your files in a hierarchy: **Hubs → Projects → Folders → Items → Versions**. A Hub is typically your company's Forma or Fusion account; Projects live inside hubs; Folders and Items (files, drawings, models) live inside projects. Everything in this hierarchy is identified by a unique ID.

### 2-legged OAuth (client credentials)

APS uses OAuth 2.0 to protect its APIs. There are two common flows:

- **2-legged (client credentials):** Your application authenticates *as itself* using a client ID and secret. No user has to log in. This is the right choice for server-to-server access where you own the data or have been given service-account access to a hub.
- **3-legged (authorization code):** A real user is redirected to Autodesk's login page, grants consent, and your app receives a token scoped to *that user's* data.

For this workshop we start with 2-legged. Your credentials are already stored as Codespace secrets (`APS_CLIENT_ID` and `APS_CLIENT_SECRET`), so the only thing your code needs to do is exchange them for a short-lived access token whenever it needs to call an API.

### The authentication provider pattern

Rather than requesting a new token for every API call — or, worse, passing raw tokens around as function arguments — we will create a small object called an **authentication provider**. The rest of the code never touches tokens directly; it just calls `provider.getAccessToken()` and receives a valid token.

> **Why does this pattern matter?**
>
> In the advanced session of this workshop, participants swap the 2-legged provider for a 3-legged (user-level) provider. Because everything downstream only depends on the `getAccessToken()` interface, *not a single other line of code changes*. Building the abstraction now means the payoff is visible later.

## Step 1: Authentication provider

Create a new file called `aps.js` in the project root. Start with a pair of import statements and a skeleton comment so you know what you are about to build:

```js
import { AuthenticationClient, Scopes } from '@aps_sdk/authentication';
import { DataManagementClient } from '@aps_sdk/data-management';

const SCOPES = [Scopes.DataRead];

// TODO: implement AppAuthenticationProvider
```

The `AppAuthenticationProvider` class will have three properties: the client ID, the client secret, and a token cache. The cache stores the last generated token so that it can be reused for as long as it's valid.

Replace the `// TODO` comment with the following class:

```js
export class AppAuthenticationProvider {
    constructor(clientId, clientSecret) {
        this.authClient = new AuthenticationClient();
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.cache = {
            accessToken: null,
            expiresAt: 0,
        };
    }

    async getAccessToken() {
        if (this.cache.expiresAt < Date.now() + 60 * 1000) { // refresh a minute early to absorb clock skew and request latency
            const credentials = await this.authClient.getTwoLeggedToken(this.clientId, this.clientSecret, SCOPES);
            this.cache.accessToken = credentials.access_token;
            this.cache.expiresAt = Date.now() + credentials.expires_in * 1000;
        }
        return this.cache.accessToken;
    }
}
```

A few things worth noting:

- `SCOPES` is defined once at the module level as `[Scopes.DataRead]`. Centralising it means you only need to change it in one place if you later need additional scopes.
- `cache` is a plain object with `accessToken` and `expiresAt`. A fresh token is fetched whenever `expiresAt` is less than a minute away (i.e. 0 on first call, or once the token is close to expiring). That one-minute margin matters: a token is valid for an hour, and handing out one with a second left on it means the request can reach APS after it has expired, which shows up as a sporadic `401` that looks random. Refreshing early keeps that out of the picture.
- `getAccessToken()` takes no arguments — the scopes are fixed by the module-level constant, which is intentional for a 2-legged server-to-server integration.

## Step 2: List hubs & projects

This helper creates a `DataManagementClient` backed by your authentication provider, fetches all hubs, then fetches the projects inside each hub, and returns a clean array of objects. Add it in the `aps.js` file after the `AppAuthenticationProvider` class:

```js
export async function getHubsProjects(authenticationProvider) {
    const client = new DataManagementClient({ authenticationProvider });
    const { data: hubs = [] } = await client.getHubs();
    return Promise.all(hubs.map(async hub => {
        const { data: projects = [] } = await client.getHubProjects(hub.id);
        return {
            id: hub.id,
            name: hub.attributes.name,
            region: hub.attributes.region,
            projects: projects.map(p => ({ id: p.id, name: p.attributes.name }))
        };
    }));
}
```

Notice that `DataManagementClient` receives `{ authenticationProvider }` — the SDK calls `getAccessToken` internally whenever it needs a token. You never see the raw token string outside of the provider class. `Promise.all` fetches the projects for every hub concurrently, and the destructuring assignment with default values (`= []`) keeps the code compact when a hub has no projects.

## Step 3: List folder contents

This helper returns the contents of a folder, or — when no `folderId` is given — the top-level folders of a project. It is not used in this section, but it will be needed when you build the MCP server later. Add it in the `aps.js` file after the `getHubsProjects` function:

```js
export async function getFolderContents(hubId, projectId, folderId, authenticationProvider) {
    const client = new DataManagementClient({ authenticationProvider });
    // TODO: only the first page of results is returned; folders with more than 200 children need pagination via links.next
    const { data: items = [] } = folderId
        ? await client.getFolderContents(projectId, folderId)
        : await client.getProjectTopFolders(hubId, projectId);
    return items.map(item => ({
        type: item.type,
        id: item.id,
        name: item.attributes.displayName,
        modifiedAt: item.attributes.lastModifiedTime,
        modifiedBy: item.attributes.lastModifiedUserName
    }));
}
```

## Step 4: Update the app

The `index.js` you created previously just printed your credentials. Replace the entire file with this temporary test script — it creates an authentication provider, calls `getHubsProjects`, and dumps the result as JSON:

```js
import { AppAuthenticationProvider, getHubsProjects } from './aps.js';

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    console.error('APS_CLIENT_ID and APS_CLIENT_SECRET environment variables are required.');
    process.exit(1);
}
console.log('APS_CLIENT_ID:', APS_CLIENT_ID);

const authenticationProvider = new AppAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
const hubs = await getHubsProjects(authenticationProvider);
console.log(JSON.stringify(hubs, null, 2));
```

This code is still temporary. It will be replaced again in the next section when you start building the MCP server.

## Checkpoint

You should now have:

- [x] `aps.js` with `AppAuthenticationProvider`, `getHubsProjects`, and `getFolderContents`
- [x] `index.js` replaced with the hub/project listing script
- [x] `node index.js` printing a JSON array of your hubs and projects

<details>
    <summary>
        Reference: full <code>aps.js</code>
    </summary>

```js
import { AuthenticationClient, Scopes } from '@aps_sdk/authentication';
import { DataManagementClient } from '@aps_sdk/data-management';

const SCOPES = [Scopes.DataRead];

export class AppAuthenticationProvider {
    constructor(clientId, clientSecret) {
        this.authClient = new AuthenticationClient();
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.cache = {
            accessToken: null,
            expiresAt: 0,
        };
    }

    async getAccessToken() {
        if (this.cache.expiresAt < Date.now() + 60 * 1000) { // refresh a minute early to absorb clock skew and request latency
            const credentials = await this.authClient.getTwoLeggedToken(this.clientId, this.clientSecret, SCOPES);
            this.cache.accessToken = credentials.access_token;
            this.cache.expiresAt = Date.now() + credentials.expires_in * 1000;
        }
        return this.cache.accessToken;
    }
}

export async function getHubsProjects(authenticationProvider) {
    const client = new DataManagementClient({ authenticationProvider });
    const { data: hubs = [] } = await client.getHubs();
    return Promise.all(hubs.map(async hub => {
        const { data: projects = [] } = await client.getHubProjects(hub.id);
        return {
            id: hub.id,
            name: hub.attributes.name,
            region: hub.attributes.region,
            projects: projects.map(p => ({ id: p.id, name: p.attributes.name }))
        };
    }));
}

export async function getFolderContents(hubId, projectId, folderId, authenticationProvider) {
    const client = new DataManagementClient({ authenticationProvider });
    // TODO: only the first page of results is returned; folders with more than 200 children need pagination via links.next
    const { data: items = [] } = folderId
        ? await client.getFolderContents(projectId, folderId)
        : await client.getProjectTopFolders(hubId, projectId);
    return items.map(item => ({
        type: item.type,
        id: item.id,
        name: item.attributes.displayName,
        modifiedAt: item.attributes.lastModifiedTime,
        modifiedBy: item.attributes.lastModifiedUserName
    }));
}
```

</details>

### Try it out

Run the `index.js` script in the terminal:

```bash
node index.js
```

If your APS credentials are valid and your application has been provisioned to at least one Forma hub, you should see output like:

```json
[
  {
    "id": "b.xxx",
    "name": "My Hub",
    "region": "US",
    "projects": [
      { "id": "b.yyy", "name": "My Forma Project" }
    ]
  }
]
```

The actual IDs, hub names, and project names will be specific to your account.

**If you see an empty array (`[]`):** your application has not been added to any hub yet. In Forma, an administrator must add the application under Hub Admin → Custom Integrations.

**If you see an authentication error:** double-check that `APS_CLIENT_ID` and `APS_CLIENT_SECRET` are set correctly.

### Additional resources

- [APS Data Management API overview](https://aps.autodesk.com/en/docs/data/v2/overview/)
- [APS SDK for Node.js](https://github.com/autodesk-platform-services/aps-sdk-node)
- [OAuth 2.0 client credentials](https://aps.autodesk.com/en/docs/oauth/v2/tutorials/get-2-legged-token/)
