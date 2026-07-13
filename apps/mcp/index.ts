import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PremortemService } from '@premortem/core/application';
import { createRehearsalSchema } from '@premortem/core/contracts';
import { createAiProviderFromEnv } from '@premortem/ai/provider-factory';

const service = new PremortemService(undefined, undefined, createAiProviderFromEnv());
const server = new McpServer({ name: 'premortem', version: '0.1.0' });
const result = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value as Record<string, unknown>
});

server.registerTool(
  'create_rehearsal',
  {
    description: 'Create an authorised launch rehearsal using PREMORTEM safety checks.',
    inputSchema: createRehearsalSchema
  },
  async (input) => result(await service.createRehearsal(input))
);
server.registerTool(
  'get_rehearsal_status',
  {
    description: 'Get progress and terminal status for an owned rehearsal.',
    inputSchema: z.object({ rehearsalId: z.string().min(1) })
  },
  async ({ rehearsalId }) => result(service.getRehearsalStatus(rehearsalId))
);
server.registerTool(
  'get_launch_report',
  {
    description: 'Return the evidence-backed launch report for an owned rehearsal.',
    inputSchema: z.object({ rehearsalId: z.string().min(1) })
  },
  async ({ rehearsalId }) => result(service.getLaunchReport(rehearsalId))
);
server.registerTool(
  'list_findings',
  {
    description: 'List report findings with explicit evidence types.',
    inputSchema: z.object({ rehearsalId: z.string().min(1) })
  },
  async ({ rehearsalId }) => result({ findings: service.getLaunchReport(rehearsalId).findings })
);
server.registerTool(
  'get_finding_evidence',
  {
    description: 'Get evidence and reproduction steps for one finding.',
    inputSchema: z.object({ rehearsalId: z.string().min(1), findingId: z.string().min(1) })
  },
  async ({ rehearsalId, findingId }) => {
    const finding = service
      .getLaunchReport(rehearsalId)
      .findings.find((item) => item.id === findingId);
    if (!finding)
      return { isError: true, content: [{ type: 'text' as const, text: 'Finding not found.' }] };
    return result(finding);
  }
);
server.registerTool(
  'compare_rehearsals',
  {
    description: 'Compare two owned rehearsals and classify resolved, remaining, and new findings.',
    inputSchema: z.object({
      baselineRehearsalId: z.string().min(1),
      candidateRehearsalId: z.string().min(1)
    })
  },
  async ({ baselineRehearsalId, candidateRehearsalId }) =>
    result(service.compareRehearsals(baselineRehearsalId, candidateRehearsalId))
);

await server.connect(new StdioServerTransport());
