# Extras

## Vibe-Code Additional Features

Use GitHub Copilot to add a new feature to your MCP server. Some ideas:

- **Search project by name**: update the hub/project listing tool so that it accepts an optional project name to search for
- **List issues**: add a tool that lists issues in a project using the [Forma Issues API](https://aps.autodesk.com/en/docs/acc/v1/overview/field-guide/issues/)
- **Search by name**: add a tool that searches for files by name across all folders in a project
- **Recent changes skill**: extend the `forma-weekly-update` skill to send the summary as a formatted email draft

### Suggested approach

1. Describe the feature to Copilot in plain language: "Add an MCP tool that lists open issues in a project."
2. Let Copilot suggest the implementation.
3. Review the code, ask follow-up questions, iterate.
4. Test with the GitHub Copilot Chat.

This is intentionally open-ended — the goal is to get comfortable using AI to extend the server you've built.

## Production checklist

You've built a working MCP server. Here's what you'd need to address before shipping it as a real product.

| Area | Workshop state | Production requirement |
|---|---|---|
| Transport | STDIO (local process only) | Switch to Streamable HTTP (covered in the advanced session) |
| Credentials | Codespace secrets | Proper secret manager (e.g. Azure Key Vault, AWS Secrets Manager) |
| Token caching | In-memory, process lifetime | Persistent cache; handle expiry and refresh across restarts |
| APS app provisioning | Single Forma project | Provision the app to every project it needs; consider automation |
| Error handling | Minimal | Structured error responses, logging, and alerting |
| MCP client access | Anyone with the binary | Restrict to authorised users; consider authentication at the client layer |

> **Next step:** Join the advanced session to add Streamable HTTP transport, user authentication, and an embedded design viewer.
