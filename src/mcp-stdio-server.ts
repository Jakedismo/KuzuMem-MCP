import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MEMORY_BANK_MCP_TOOLS } from './mcp';
import { ToolExecutionService } from './mcp/services/tool-execution.service';
// import { createProgressHandler } from './mcp/streaming/progress-handler'; // Removed
// import { StdioProgressTransport } from './mcp/streaming/stdio-transport'; // Removed
import { toolHandlers } from './mcp/tool-handlers';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'; // Added for sdkContext type
import { McpTool } from './mcp/types'; // Import McpTool

// Determine Client Project Root at startup (for context only, not for DB initialization)
const detectedClientProjectRoot = process.cwd();
console.error(`MCP stdio server detected client project root: ${detectedClientProjectRoot}`);

// Debug configuration
const DEBUG_LEVEL = process.env.DEBUG ? parseInt(process.env.DEBUG, 10) || 1 : 0;

function debugLog(level: number, message: string, data?: any): void {
  if (DEBUG_LEVEL >= level) {
    if (data) {
      console.error(
        `[MCP-STDIO-DEBUG${level}] ${message}`,
        typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      );
    } else {
      console.error(`[MCP-STDIO-DEBUG${level}] ${message}`);
    }
  }
}

// Create the server instance
const server = new Server(
  {
    name: 'memory-bank-mcp',
    version: '3.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  },
);

// const progressTransport = new StdioProgressTransport(debugLog); // Removed

// Set up the list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  debugLog(1, `Returning tools/list with ${MEMORY_BANK_MCP_TOOLS.length} tools`);

  const tools = MEMORY_BANK_MCP_TOOLS.map((tool: McpTool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema || { type: 'object', properties: {}, required: [] }, // Use inputSchema
    outputSchema: tool.outputSchema, // Add outputSchema
    annotations: tool.annotations,   // Add annotations
  }));

  return { tools };
});

// Set up the call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request, sdkContext) => { // Added sdkContext
  const { name: toolName, arguments: toolArgs = {} } = request.params;
  const requestId = 'id' in request ? String(request.id) : ('unknownRequestId'); // Ensure requestId is always a string

  debugLog(1, `Handling tools/call for tool: ${toolName} with sdkSessionId: ${sdkContext.sessionId}`);

  const toolDefinition = MEMORY_BANK_MCP_TOOLS.find((t) => t.name === toolName);
  if (!toolDefinition) {
    throw new Error(`Tool '${toolName}' not found.`);
  }

  // For init-memory-bank, clientProjectRoot comes from toolArgs.
  // For others, we use the provided clientProjectRoot from tool arguments
  const effectiveClientProjectRoot = toolArgs.clientProjectRoot as string;

  if (!effectiveClientProjectRoot) {
    throw new Error(
      toolName === 'init-memory-bank'
        ? `Tool '${toolName}' requires clientProjectRoot argument.`
        : `Server error: clientProjectRoot context not established for tool '${toolName}'. Provide clientProjectRoot in tool arguments.`,
    );
  }

  try {
    // All progressHandler and capturedFinalResult logic is removed.
    // SDK will handle progress notifications via sdkContext.sendNotification.

    const toolExecutionService = await ToolExecutionService.getInstance();

    const toolResult = await toolExecutionService.executeTool(
      toolName,
      toolArgs,
      toolHandlers, // Use original toolHandlers
      effectiveClientProjectRoot,
      sdkContext, // Pass sdkContext
      // progressHandler, // Removed
      // debugLog, // Removed
    );

    // The toolResult is now the direct result from the tool execution.
    // If toolResult is null or has an error property, it indicates an error.
    // Otherwise, it's a success.
    if (toolResult?.error) {
      // Tool reported an error
      return {
        // structuredContent should not be set or be undefined
        content: [{ type: 'text', text: JSON.stringify(toolResult.error, null, 2) }], // Or toolResult.error.message if error is an object
        isError: true,
      };
    }

    if (toolResult === null) {
      // Tool executed successfully but returned no specific data (e.g., fire and forget)
      return {
        // structuredContent should not be set or be undefined
        content: [{ type: 'text', text: 'Tool executed successfully with no specific result content.' }],
        isError: false,
      };
    }

    // Success case with structured content
    return {
      structuredContent: toolResult, // toolResult is the direct JSON object
      content: toolResult.message && typeof toolResult.message === 'string' ? [{ type: 'text', text: toolResult.message }] : [],
      isError: false,
    };
  } catch (error: any) {
    // This catch block handles errors thrown by pre-execution logic or if executeTool itself throws
    debugLog(0, `Error in CallToolRequest handler: ${error.message}`, error.stack);
    return {
      // structuredContent should not be set or be undefined
      content: [{ type: 'text', text: `Error executing tool: ${error.message}` }],
      isError: true,
    };
  }
});

// Set up the list resources handler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: [] };
});

// Set up the list prompts handler
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: [] };
});

// Start the server
async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('MCP_STDIO_SERVER_READY_FOR_TESTING');
}

// Handle graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Redirect console.log to stderr so only JSON responses go to stdout
/* eslint-disable no-console */
console.log = (...args: any[]): void => {
  // Avoid breaking tests that rely on return value of console.log
  console.error('[STDERR-LOG]', ...args);
};
/* eslint-enable no-console */

// Start the server
startServer().catch((error) => {
  console.error('Failed to start MCP stdio server:', error);
  process.exit(1);
});
