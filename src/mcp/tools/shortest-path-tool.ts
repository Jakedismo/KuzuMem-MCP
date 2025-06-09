import { McpTool } from '../types';

/**
 * Shortest Path Tool
 * Finds the shortest path between two nodes in a projected graph of memory items.
 */
export const shortestPathTool: McpTool = {
  name: 'shortest-path',
  description:
    'Use this tool to understand the most direct relationship or sequence of connections between any two memory items. Requires defining a projected graph first, and specifying start and end node IDs.',
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
          "A unique name for the projected graph to be used by the Kuzu algorithm (e.g., 'myProjectedGraphForSP'). This graph is temporary.",
      },
      nodeTableNames: {
        type: 'array',
        description:
          "Array of node table names to include in the projection (e.g., ['Component', 'Decision', 'Rule', 'Context']).",
        items: { type: 'string' },
      },
      relationshipTableNames: {
        type: 'array',
        description:
          "Array of relationship table names to include in the projection (e.g., ['DEPENDS_ON', 'CONTEXT_OF', 'RELATED_TO']).",
        items: { type: 'string' },
      },
      startNodeId: {
        type: 'string',
        description: 'The ID of the node where the path should start.',
      },
      endNodeId: {
        type: 'string',
        description: 'The ID of the node where the path should end.',
      },
      // Optional parameters for weighted shortest path (if Kuzu supports and schema allows)
      // costPropertyName: {
      //   type: "string",
      //   description: "Optional: The name of the property on relationships to use as cost/weight.",
      // },
    },
    required: [
      'repository',
      'branch',
      'projectedGraphName',
      'nodeTableNames',
      'relationshipTableNames',
      'startNodeId',
      'endNodeId',
    ],
  },
  annotations: {
    title: 'Shortest Path',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true, // Shortest path algorithms are generally deterministic for unweighted or with deterministic tie-breaking
    openWorldHint: false,
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      path: {
        type: 'array',
        description:
          "An array representing the shortest path. This could be an array of node IDs, or an array of objects representing nodes and/or relationships in the path, depending on Kuzu's output and how it's processed.",
      },
      // cost: {
      //   type: "number",
      //   description: "Optional: The total cost/length of the shortest path if a weighted search was performed.",
      // },
    },
  },
};
