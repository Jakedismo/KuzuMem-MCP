import { McpTool } from '../types';

/**
 * Get Component Dependents Tool
 * Used to retrieve all downstream dependents for a given component.
 */
export const getComponentDependentsTool: McpTool = {
  name: 'get-component-dependents',
  description:
    'Given a Component ID, use this tool to find all other Component items that directly or indirectly rely on the specified component (its downstream dependents) by traversing DEPENDS_ON relationships in reverse.',
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
        description: "ID of the component to get dependents for (e.g., 'comp-AuthService')",
      },
    },
    required: ['repository', 'branch', 'componentId'],
  },
  annotations: {
    title: 'Get Component Dependents',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false, // Assuming dependents are within the known graph
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      dependents: {
        type: 'array',
        description:
          'An array of component objects that are dependents of the given component. Each object contains id, name, kind, status etc.',
      },
    },
  },
};
