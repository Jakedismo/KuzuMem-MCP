import { McpTool } from '../types';

/**
 * Get Component Dependencies Tool
 * Used to retrieve all upstream dependencies for a given component.
 */
export const getComponentDependenciesTool: McpTool = {
  name: 'get-component-dependencies',
  description:
    'Given a Component ID, use this tool to find all other Component items that the specified component directly or indirectly relies on (its upstream dependencies) by traversing DEPENDS_ON relationships.',
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
      componentId: {
        type: 'string',
        description: "ID of the component to get dependencies for (e.g., 'comp-AuthService')",
      },
    },
    required: ['repository', 'branch', 'componentId'],
  },
  annotations: {
    title: 'Get Component Dependencies',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false, // Assuming dependencies are within the known graph
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      dependencies: {
        type: 'array',
        description:
          'An array of component objects that are dependencies. Each object contains id, name, kind, status etc.',
      },
    },
  },
};
