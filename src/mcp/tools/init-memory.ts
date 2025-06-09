import { McpTool } from '../types';

/**
 * Initialize Memory Bank Tool
 * Used to initialize a new memory bank for a repository with branch support
 * at a specified client project root.
 */
export const initMemoryBankTool: McpTool = {
  name: 'init-memory-bank',
  description:
    'Initialize a new memory bank for a repository at a specified client project root. Only call this once per repository per client project root.',
  inputSchema: { // Renamed from parameters
    type: 'object',
    properties: {
      clientProjectRoot: {
        type: 'string',
        description:
          "The absolute file system path to the root of the client\'s project where the memory bank will be stored.",
      },
      repository: {
        // This is the logical name
        type: 'string',
        description:
          'Logical repository name for this memory bank (e.g., project folder name). Used for display and internal ID generation.',
      },
      branch: {
        type: 'string',
        description: "Branch name for repository isolation (default: 'main')",
      },
    },
    required: ['clientProjectRoot', 'repository', 'branch'], // clientProjectRoot is now required
  },
  annotations: {
    title: 'Initialize Memory Bank',
    readOnlyHint: false,
    destructiveHint: false, // Though it creates files/dirs, it should be idempotent on existing structures
    idempotentHint: true,
    openWorldHint: false, // Operates on a specified filesystem path
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the initialization was successful',
      },
      message: {
        type: 'string',
        description: 'Status message',
      },
      dbPath: {
        // Optionally return the actual path used
        type: 'string',
        description: 'The absolute path where the database was initialized.',
      },
    },
  },
};
