import { McpTool } from '../types';

/**
 * PageRank Tool
 * Calculates the PageRank for nodes in a projected graph of memory items.
 */
export const pageRankTool: McpTool = {
  name: 'pagerank',
  description:
    'Use this tool to identify the most influential or central memory items by calculating their PageRank score. Requires defining a projected graph first.',
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
          "A unique name for the projected graph to be used by the Kuzu algorithm (e.g., 'myProjectedGraphForPageRank'). This graph is temporary.",
      },
      nodeTableNames: {
        type: 'array',
        description:
          "Array of node table names to include in the projection (e.g., ['Component', 'Decision', 'Rule']).",
        items: { type: 'string' },
      },
      relationshipTableNames: {
        type: 'array',
        description:
          "Array of relationship table names to include in the projection (e.g., ['DEPENDS_ON', 'CONTEXT_OF']).",
        items: { type: 'string' },
      },
      // PageRank specific parameters (refer to Kuzu documentation for exact names/types)
      dampingFactor: {
        type: 'number', // Assuming float/double
        description:
          "Optional: Damping factor for PageRank (e.g., 0.85). Defaults to Kuzu's internal default if not provided.",
      },
      maxIterations: {
        type: 'integer',
        description:
          "Optional: Maximum number of iterations for PageRank calculation. Defaults to Kuzu's internal default if not provided.",
      },
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
    title: 'PageRank',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true, // PageRank is deterministic
    openWorldHint: false,
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      pageRankScores: {
        type: 'array',
        description:
          'An array of objects, where each object represents a node and its PageRank score. Each object typically contains nodeId and score.',
      },
    },
  },
};
