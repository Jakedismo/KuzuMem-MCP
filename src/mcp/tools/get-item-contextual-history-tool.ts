import { McpTool } from '../types';

/**
 * Get Item Contextual History Tool
 * Used to retrieve all context items associated with a given Component, Decision, or Rule.
 */
export const getItemContextualHistoryTool: McpTool = {
  name: 'get-item-contextual-history',
  description:
    'Given the ID of a Component, Decision, or Rule, use this tool to retrieve all associated Context items linked via CONTEXT_OF, CONTEXT_OF_DECISION, or CONTEXT_OF_RULE relationships. Results should ideally be sorted by the created_at timestamp of the Context items.',
  inputSchema: { // Renamed from parameters
    type: 'object',
    properties: {
      repository: {
        type: 'string',
        description: "Repository name (e.g., 'my-repo')",
      },
      branch: {
        type: 'string',
        description: "Repository branch (e.g., 'main')",
      },
      itemId: {
        type: 'string',
        description:
          "ID of the Component, Decision, or Rule to get contextual history for (e.g., 'comp-AuthService', 'dec-20230101-Logging', 'rule-Formatting-v1')",
      },
      itemType: {
        type: 'string',
        description: "Type of the item: 'Component', 'Decision', or 'Rule'.",
        enum: ['Component', 'Decision', 'Rule'],
      },
    },
    required: ['repository', 'branch', 'itemId', 'itemType'],
  },
  annotations: {
    title: 'Get Item Contextual History',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false, // Assuming context links are within the known graph
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      contextHistory: {
        type: 'array',
        description:
          'An array of context objects associated with the item, ideally sorted by creation date. Each object contains details like summary, agent, issue, decision, observation, created_at etc.',
      },
    },
  },
};
