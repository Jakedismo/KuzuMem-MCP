import { McpTool } from '../types';

/**
 * K-Core Decomposition Tool
 * Identifies k-core subgraphs within a projected graph of memory items.
 */
export const kCoreDecompositionTool: McpTool = {
  name: 'k-core-decomposition',
  description:
    "Use this tool to identify clusters of highly interconnected memory items (k-cores). This helps in understanding core project areas by finding subgraphs where every item has at least 'k' connections within the cluster. Requires defining a projected graph first.",
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
          "A unique name for the projected graph to be used by the Kuzu algorithm (e.g., 'myProjectedGraphForKCore'). This graph is temporary.",
      },
      nodeTableNames: {
        type: 'array',
        description:
          "Array of node table names to include in the projection (e.g., ['Component', 'Decision', 'Rule']).",
        items: { type: 'string' }, // According to McpTool type, items just needs type for primitive arrays
      },
      relationshipTableNames: {
        type: 'array',
        description:
          "Array of relationship table names to include in the projection (e.g., ['DEPENDS_ON', 'CONTEXT_OF_DECISION']).",
        items: { type: 'string' },
      },
      k: {
        type: 'integer',
        description:
          'The minimum degree for nodes within a k-core. Nodes with coreness < k might be filtered out by the underlying Kuzu call or this tool.',
      },
    },
    required: [
      'repository',
      'branch',
      'projectedGraphName',
      'nodeTableNames',
      'relationshipTableNames',
      'k',
    ],
  },
  annotations: {
    title: 'K-Core Decomposition',
    readOnlyHint: true, // Algorithm execution doesn't modify base data
    destructiveHint: false,
    idempotentHint: true, // Given the same graph and k, result is the same
    openWorldHint: false, // Operates on the defined projected graph
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      kCoreNodes: {
        type: 'array',
        description:
          'An array of objects, where each object represents a node and its coreness value (if >= k, or as returned by Kuzu). Each object typically contains nodeId and coreness.',
      },
    },
  },
};
