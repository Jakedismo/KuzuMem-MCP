import { McpTool } from '../types';

/**
 * Add Rule Tool
 * Used to add a rule to a repository's memory bank (branch-aware for KuzuDB)
 */
export const addRuleTool: McpTool = {
  name: 'add-rule',
  description: "Add a rule to a repository's memory bank",
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
        description: 'Rule ID',
      },
      name: {
        type: 'string',
        description: 'Rule name',
      },
      created: {
        type: 'string',
        description: 'Rule creation date (YYYY-MM-DD)',
      },
      triggers: {
        type: 'array',
        description: 'Rule triggers',
        items: {
          type: 'string',
        },
      },
      content: {
        type: 'string',
        description: 'Rule content',
      },
      status: {
        type: 'string',
        description: 'Rule status',
        enum: ['active', 'deprecated'],
      },
    },
    required: ['repository', 'branch', 'id', 'name', 'created'],
  },
  annotations: {
    title: 'Add Rule',
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
      rule: {
        type: 'object',
        description: 'Added rule content',
      },
    },
  },
};
