import { McpTool } from '../types';

/**
 * Get Related Items Tool
 * Used to explore items related to a starting memory item within a specified depth.
 */
export const getRelatedItemsTool: McpTool = {
  name: 'get-related-items',
  description:
    'Given a starting memory item ID (e.g., Component, Decision, Rule, or Context), use this tool to traverse outgoing relationships up to a specified depth (e.g., 1 or 2 hops) and return all connected memory items. Can optionally filter by relationship or target node type.',
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
      startItemId: {
        type: 'string',
        description: 'ID of the memory item to start traversal from.',
      },
      depth: {
        type: 'integer',
        description: 'Maximum number of relationship hops to traverse (e.g., 1 or 2). Default: 1.',
      },
      relationshipFilter: {
        type: 'string',
        description:
          "Optional: Comma-separated list of relationship types to include (e.g., 'DEPENDS_ON,CONTEXT_OF').",
      },
      targetNodeTypeFilter: {
        type: 'string',
        description:
          "Optional: Comma-separated list of target node types to include (e.g., 'Component,Decision').",
      },
    },
    required: ['repository', 'branch', 'startItemId'],
  },
  annotations: {
    title: 'Get Related Items',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true, // The graph structure can be arbitrary
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      relatedItems: {
        type: 'array',
        description:
          'An array of memory item objects found within the specified depth. Each object will vary based on its type but will include at least an id and type.',
      },
      paths: {
        type: 'array',
        description:
          'Optional: An array of paths, where each path is an array of items/relationships showing how a related item was reached.',
      },
    },
  },
};
