import { McpTool } from '../types';

/**
 * Get Context Tool
 * Used to retrieve context for a repository (branch-aware for KuzuDB)
 */
export const getContextTool: McpTool = {
  name: 'get-context',
  description:
    'Get the latest or all context entries for a repository. Use latest=true for the most recent context.',
  inputSchema: { // Renamed from parameters
    type: 'object',
    properties: {
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      latest: {
        type: 'boolean',
        description: 'Whether to get only the latest context (true) or all contexts (false)',
      },
      limit: {
        type: 'integer',
        description: 'Number of contexts to return when latest is false',
      },
    },
    required: ['repository', 'branch'],
  },
  annotations: {
    title: 'Get Context',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      context: {
        type: 'array',
        description: 'Context objects',
      },
    },
  },
};

/**
 * Update Context Tool
 * Used to update context for a repository (branch-aware for KuzuDB)
 */
export const updateContextTool: McpTool = {
  name: 'update-context',
  description: 'Update context for a repository with new information',
  inputSchema: { // Renamed from parameters
    type: 'object',
    properties: {
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      agent: {
        type: 'string',
        description: 'Agent name',
      },
      issue: {
        type: 'string',
        description: 'Related issue',
      },
      summary: {
        type: 'string',
        description: 'Context summary',
      },
      decision: {
        type: 'string',
        description: 'Decision to add',
      },
      observation: {
        type: 'string',
        description: 'Observation to add',
      },
    },
    required: ['repository', 'branch'],
  },
  annotations: {
    title: 'Update Context',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the update was successful',
      },
      context: {
        type: 'object',
        description: 'Updated context content',
      },
    },
  },
};
