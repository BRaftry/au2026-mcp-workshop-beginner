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

export async function getFolderContents(authenticationProvider, hubId, projectId, folderId) {
    const client = new DataManagementClient({ authenticationProvider });
    // TODO: only the first page of results is returned; folders with more than 200 children need pagination via links.next
    const { data: items = [] } = folderId
        ? await client.getFolderContents(projectId, folderId)
        : await client.getProjectTopFolders(hubId, projectId);
    return items
        .filter(item => !item.attributes.hidden) // skip entries the Forma UI hides, e.g. system folders
        .map(item => ({
            type: item.type,
            id: item.id,
            name: item.attributes.displayName,
            modifiedAt: item.attributes.lastModifiedTime,
            modifiedBy: item.attributes.lastModifiedUserName
        }));
}
