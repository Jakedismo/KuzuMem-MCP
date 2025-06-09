import { McpTool } from '../types';

/**
 * Strongly Connected Components (SCC) Tool
 * Finds sets of strongly connected nodes in a projected graph of memory items.
 */
export const stronglyConnectedComponentsTool: McpTool = {
  name: 'strongly-connected-components',
  description:
    'Use this tool to find sets of memory items (especially Components with DEPENDS_ON relationships) that are cyclically dependent or form tight feedback loops where every item in the set is reachable from every other item by following directed links. Requires defining a projected graph first.',
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
          "A unique name for the projected graph to be used by the Kuzu algorithm (e.g., 'myProjectedGraphForSCC'). This graph is temporary.",
      },
      nodeTableNames: {
        type: 'array',
        description:
          "Array of node table names to include in the projection (e.g., ['Component', 'Decision']). These should be relevant for directed relationship analysis.",
        items: { type: 'string' },
      },
      relationshipTableNames: {
        type: 'array',
        description:
          "Array of directed relationship table names to include in the projection (e.g., ['DEPENDS_ON', 'LED_TO', 'IMPLIES']).",
        items: { type: 'string' },
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
    title: 'Strongly Connected Components',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true, // SCC algorithms are deterministic
    openWorldHint: false,
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      stronglyConnectedComponents: {
        type: 'array',
        description:
          'An array of components. Each component is itself an array of node IDs (strings) that belong to that strongly connected component. For Kuzu, this might be an array of objects, each with a component_id and a list of node_ids.',
        // The actual structure will depend on how Kuzu returns SCC results.
        // If it returns [{component_id: X, nodes: [id1, id2]}, ...], the description here is a simplification.
        // For now, describing as array of arrays of strings (nodeIds) for simplicity.
        // items: { type: "array", items: { type: "string" } } // This would be for array of arrays of strings, but McpTool might not support nested items directly.
      },
    },
  },
};
