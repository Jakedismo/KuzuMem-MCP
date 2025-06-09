import { McpTool } from '../types';

/**
 * Weakly Connected Components (WCC) Tool
 * Finds sets of weakly connected nodes in a projected graph of memory items.
 */
export const weaklyConnectedComponentsTool: McpTool = {
  name: 'weakly-connected-components',
  description:
    "Use this tool to identify isolated 'islands' or distinct topics within the memory bank by finding groups of interconnected items that have no links to other groups (ignoring link direction). Requires defining a projected graph first.",
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
          "A unique name for the projected graph to be used by the Kuzu algorithm (e.g., 'myProjectedGraphForWCC'). This graph is temporary.",
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
          "Array of relationship table names to include in the projection (e.g., ['DEPENDS_ON', 'CONTEXT_OF', 'RELATED_TO']). Direction is ignored by WCC.",
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
    title: 'Weakly Connected Components',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true, // WCC algorithms are deterministic
    openWorldHint: false,
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      weaklyConnectedComponents: {
        type: 'array',
        description:
          'An array of components. Each component is itself an array of node IDs (strings) that belong to that weakly connected component. For Kuzu, this might be an array of objects, each with a component_id and a list of node_ids.',
      },
    },
  },
};
