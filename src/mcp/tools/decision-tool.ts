import { McpTool } from '../types';

/**
 * Add Decision Tool
 * Used to add a decision to a repository's memory bank (branch-aware for KuzuDB)
 */
export const addDecisionTool: McpTool = {
  name: 'add-decision',
  description: "Add a decision record to a repository's memory bank",
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
      id: {
        type: 'string',
        description: 'Decision ID',
      },
      name: {
        type: 'string',
        description: 'Decision name',
      },
      context: {
        type: 'string',
        description: 'Decision context',
      },
      date: {
        type: 'string',
        description: 'Decision date (YYYY-MM-DD)',
      },
    },
    required: ['repository', 'branch', 'id', 'name', 'date'],
  },
  annotations: {
    title: 'Add Decision',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the operation was successful',
      },
      decision: {
        type: 'object',
        description: 'Added decision content',
      },
    },
  },
};
