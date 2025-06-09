/**
 * MCP HTTP Streaming Server
 * Implements the Model Context Protocol using the official TypeScript SDK
 * Based on the official TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { ToolExecutionService } from './mcp/services/tool-execution.service';
import { toolHandlers } from './mcp/tool-handlers';
import { MEMORY_BANK_MCP_TOOLS } from './mcp/tools';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'; // Added for sdkContext type
import { McpTool } from './mcp/types'; // Import McpTool

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Debug level
const debugLevel = parseInt(process.env.DEBUG_LEVEL || '0', 10);

function debugLog(level: number, message: string): void {
  if (debugLevel >= level) {
    console.error(`[DEBUG-${level}] ${new Date().toISOString()} ${message}`);
  }
}

// Create an MCP server factory function
function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'KuzuMem-MCP-HTTPStream',
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
    // const requestId = (request as any).id?.toString() || randomUUID(); // sdkContext.requestId can be used

    debugLog(1, `Executing tool: ${toolName} with args: ${JSON.stringify(toolArgs)}, sdkSessionId: ${sdkContext.sessionId}`);

    // Extract clientProjectRoot from tool arguments
    const effectiveClientProjectRoot = toolArgs.clientProjectRoot as string;

    if (!effectiveClientProjectRoot) {
      throw new Error(
        toolName === 'init-memory-bank'
          ? `Tool '${toolName}' requires clientProjectRoot argument.`
          : `Server error: clientProjectRoot context not established for tool '${toolName}'. Provide clientProjectRoot in tool arguments.`,
      );
    }

    try {
      // For HTTP transport, we execute tools without progress handlers as they don't support streaming
      const toolExecutionService = await ToolExecutionService.getInstance();

      const toolResult = await toolExecutionService.executeTool(
        toolName,
        toolArgs,
        toolHandlers, // Use original toolHandlers
        effectiveClientProjectRoot,
        sdkContext, // Pass sdkContext
        undefined, // No progress handler for HTTP transport
        // debugLog, // Removed, logger is now in context
      );

      // Consistent response handling with stdio-server
      if (toolResult?.error) {
        // Tool reported an error
        return {
          // structuredContent should not be set or be undefined
          content: [{ type: 'text', text: JSON.stringify(toolResult.error, null, 2) }], // Or toolResult.error.message if error is an object
          isError: true,
        };
      }

      if (toolResult === null) {
        // Tool executed successfully but returned no specific data
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
    } catch (error) {
      // This catch block handles errors thrown by pre-execution logic or if executeTool itself throws
      const errorMessage = error instanceof Error ? error.message : String(error);
      debugLog(1, `Tool execution error: ${errorMessage}`);
      return {
        // structuredContent should not be set or be undefined
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // Set up other request handlers as needed
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: [] };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: [] };
  });

  return server;
}

// Create Express app
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  }),
);

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req: Request, res: Response) => {
  // Check for existing session ID
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
        debugLog(1, `New MCP session initialized: ${sessionId}`);
      },
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        debugLog(1, `Cleaning up MCP session: ${transport.sessionId}`);
        delete transports[transport.sessionId];
      }
    };

    const server = createMcpServer();

    // Connect to the MCP server
    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Handle the request
  await transport.handleRequest(req, res, req.body);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

// Legacy endpoints for backward compatibility
app.get('/tools/list', async (req: Request, res: Response) => {
  debugLog(0, "Legacy endpoint /tools/list accessed. This endpoint is deprecated. Please use the standard MCP 'tools/list' method via POST /mcp.");

  const tools = MEMORY_BANK_MCP_TOOLS.map((tool: McpTool) => ({ // Added McpTool type for safety
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema || { type: 'object', properties: {}, required: [] }, // Use inputSchema
    // outputSchema and annotations are not exposed on this legacy endpoint
  }));

  res.setHeader('X-Deprecated-Endpoint', '/tools/list is deprecated; use MCP tools/list method via POST /mcp');
  res.json({ tools });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`MCP HTTP Streaming Server running at http://localhost:${PORT}`);
  debugLog(1, `Server started with debug level: ${debugLevel}`);
});
