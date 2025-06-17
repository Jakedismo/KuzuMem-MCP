/**
 * MCP Tool Definitions - Type Definitions
 * Following the Model Context Protocol specification
 * See: https://modelcontextprotocol.io
 */

import { MemoryService } from '../../services/memory.service';

/**
 * MCP Tool Interface
 * Base interface for all MCP tools
 */
export interface McpTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<
      string,
      {
        type: string;
        description: string;
        title?: string; // Optional title for parameters (per MCP spec)
        enum?: string[];
        items?: {
          type: string;
        };
      }
    >;
    required: string[];
  };
  returns: {
    type: string;
    properties: Record<
      string,
      {
        type: string;
        description: string;
        title?: string; // Optional title for return values (per MCP spec)
      }
    >;
  };
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

/**
 * MCP Server Metadata
 */
export interface McpServerMetadata {
  name: string;
  version: string;
  description: string;
  tools: string[];
}

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  toolArgs: any, // Standard tool arguments from the MCP call
  memoryService: MemoryService, // Instance of the memory service
  clientProjectRoot?: string, // Optional, to be supplied by server
) => Promise<unknown>; // Return type of the handler
