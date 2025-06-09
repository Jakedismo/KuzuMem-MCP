import { McpTool } from '../types';

/**
 * Get Governing Items for Component Tool
 * Used to retrieve Decisions directly linked to a Component and Rules sharing context with it.
 */
export const getGoverningItemsForComponentTool: McpTool = {
  name: 'get-governing-items-for-component',
  description:
    'Given a Component ID, use this tool to find all Decision items directly linked via DECISION_ON and all Rule items that share Context with the component (i.e., Context linked to Component via CONTEXT_OF and also to a Rule via CONTEXT_OF_RULE).',
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
        description: "ID of the Component to get governing items for (e.g., 'comp-AuthService')",
      },
    },
    required: ['repository', 'branch', 'componentId'],
  },
  annotations: {
    title: 'Get Governing Items for Component',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false, // Assuming links are within the known graph
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      decisions: {
        type: 'array',
        description:
          'An array of Decision objects directly linked to the component. Each object includes name, context, date etc.',
      },
      rules: {
        type: 'array',
        description:
          'An array of Rule objects that share context with the component. Each object includes name, content, status etc.',
      },
    },
  },
};
