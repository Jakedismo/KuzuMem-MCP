import { McpTool } from '../types';

/**
 * Get Metadata Tool
 * Used to retrieve metadata for a repository (branch-aware for KuzuDB)
 */
export const getMetadataTool: McpTool = {
  name: 'get-metadata',
  description: 'Get metadata for a repository',
  inputSchema: { // Renamed from parameters
    type: 'object',
    properties: {
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
    },
    required: ['repository', 'branch'],
  },
  annotations: {
    title: 'Get Metadata',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      metadata: {
        type: 'object',
        description: 'Metadata content',
      },
    },
  },
};

/**
 * Update Metadata Tool
 * Used to update metadata for a repository (branch-aware for KuzuDB)
 */
export const updateMetadataTool: McpTool = {
  name: 'update-metadata',
  description: 'Update metadata for a repository',
  inputSchema: { // Renamed from parameters
    type: 'object',
    properties: {
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      metadata: {
        type: 'object',
        description: 'Metadata content to update',
      },
    },
    required: ['repository', 'branch', 'metadata'],
  },
  annotations: {
    title: 'Update Metadata',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  outputSchema: { // Renamed from returns
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the update was successful',
      },
      metadata: {
        type: 'object',
        description: 'Updated metadata content',
      },
    },
  },
};
