# MCP connection guide

## Role of the MCP server

The MCP application is a thin adapter over PREMORTEM application services. It does not own database queries, scoring, browser execution, or authorization rules. This prevents MCP callers from bypassing the checks used by the web API.

The MVP uses the stable Model Context Protocol TypeScript SDK v1 and local stdio transport. Streamable HTTP is the future remote transport; legacy HTTP+SSE is not a new deployment target.

## Tools

- `create_rehearsal`: validates input, authorization confirmation, and target policy before creating a rehearsal.
- `get_rehearsal_status`: returns lifecycle and progress for an owned rehearsal.
- `get_launch_report`: returns the evidence-backed report summary and score explanation.
- `list_findings`: lists owned findings with evidence classifications.
- `get_finding_evidence`: returns bounded occurrence and artifact metadata for one owned finding.
- `compare_rehearsals`: compares two owned, compatible rehearsals.

All input and structured output schemas use Zod. Tool-level failures return safe, actionable MCP errors; internal stack traces, database details, and secrets are not returned.

## Local connection

Configure an MCP client to run the repository's root `mcp` script. A local source-mode configuration is:

```json
{
  "mcpServers": {
    "premortem": {
      "command": "pnpm",
      "args": ["--dir", "C:/absolute/path/to/premortem", "mcp"],
      "env": {
        "NODE_ENV": "development",
        "DATABASE_URL": "C:/absolute/path/to/premortem/.premortem/premortem.db"
      }
    }
  }
}
```

Use absolute paths because MCP clients may start the process from another working directory. Put optional AI credentials in the MCP client's environment configuration or an ignored `.env` file, never in the repository or command arguments. A packaged deployment may point `node` at the compiled MCP entrypoint instead.

## Authentication and ownership

Local development uses the same seeded development principal as the web app and does not provide token authentication. Keep it as a local stdio process. A future remote MCP service must authenticate each connection or request, derive the user server-side, and pass that principal into the same ownership-checked services.

No MCP input may select an arbitrary owner. Artifact reads must verify ownership and visibility. `create_rehearsal` cannot disable SSRF policy or expand browser scope.

## Future tools

Schemas may be added for `create_github_issues`, `request_codex_fix`, and `verify_fix`, but repository writes remain owner-reviewed. A repair prompt export is data, not authority to mutate a repository or deploy a change.
