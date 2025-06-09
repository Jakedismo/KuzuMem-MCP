import { McpTool } from '../types';

/**
 * Louvain Community Detection Tool
 * Detects communities in a projected graph of memory items.
 */
export const louvainCommunityDetectionTool: McpTool = {
  name: 'louvain-community-detection',
  description:
    'Use this tool to discover naturally forming groups or themes (communities) within memory items based on their interconnections. Requires defining a projected graph first.',
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
      projectedGraphName: {
        type: 'string',
        description:
          "A unique name for the projected graph to be used by the Kuzu algorithm (e.g., 'myProjectedGraphForLouvain'). This graph is temporary.",
      },
      nodeTableNames: {
        type: 'array',
        description:
          "Array of node table names to include in the projection (e.g., ['Component', 'Decision']).",
        items: { type: 'string' },
      },
      relationshipTableNames: {
        type: 'array',
        description:
          "Array of relationship table names to include in the projection (e.g., ['DEPENDS_ON', 'HAS_CONTEXT']).",
        items: { type: 'string' },
      },
      // Louvain specific parameters can be added here if Kuzu's implementation supports them (e.g., weightProperty, tolerance)
    },
    required: [
      'repository',
      'branch',
      'projectedGraphName',
      'nodeTableNames',
      'relationshipTableNames',
    ],
  },
  annotations: {
    title: 'Louvain Community Detection',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false, // Louvain can have slight variations in results depending on tie-breaking
    openWorldHint: false,
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      communities: {
        type: 'array',
        description:
          'An array of objects, where each object represents a node and the community ID it belongs to. Each object typically contains nodeId and communityId.',
      },
    },
  },
};
