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

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Debug level
const debugLevel = parseInt(process.env.DEBUG_LEVEL || '0', 10);

function debugLog(level: number, message: string): void {
  if (debugLevel >= level) {
    console.error(`[DEBUG-${level}] ${new Date().toISOString()} ${message}`);
  }
}

// Adapter to convert SdkToolHandler to ToolHandler format
function adaptSdkToolHandler(
  sdkHandler: (params: any, context: any, memoryService: any) => Promise<any>,
): (
  toolArgs: any,
  memoryService: any,
  progressHandler?: any,
  clientProjectRoot?: string,
) => Promise<any> {
  return async (toolArgs, memoryService, progressHandler, clientProjectRoot) => {
    // Create a mock context that matches EnrichedRequestHandlerExtra
    const context = {
      logger: {
        debug: (msg: string, ...args: any[]) =>
          debugLog(3, args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg),
        info: (msg: string, ...args: any[]) =>
          debugLog(2, args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg),
        warn: (msg: string, ...args: any[]) =>
          debugLog(1, args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg),
        error: (msg: string, ...args: any[]) =>
          debugLog(0, args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg),
      },
      session: {
        clientProjectRoot,
        repository: toolArgs.repository,
        branch: toolArgs.branch,
      },
      sendProgress: async (progress: any) => {
        if (progressHandler) {
          progressHandler.progress(progress);
        }
      },
      memoryService,
    };

    // Call the SDK handler with adapted parameters
    return sdkHandler(toolArgs, context, memoryService);
  };
}

// Adapt all tool handlers
const adaptedToolHandlers: Record<string, any> = {};
for (const [toolName, handler] of Object.entries(toolHandlers)) {
  adaptedToolHandlers[toolName] = adaptSdkToolHandler(handler);
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

    const tools = MEMORY_BANK_MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema || { type: 'object', properties: {}, required: [] },
    }));

    return { tools };
  });

  // Set up the call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: toolArgs = {} } = request.params;
    const requestId = (request as any).id?.toString() || randomUUID();

    debugLog(1, `Executing tool: ${toolName} with args: ${JSON.stringify(toolArgs)}`);

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
        adaptedToolHandlers,
        effectiveClientProjectRoot,
        undefined, // No progress handler for HTTP transport
      );

      if (toolResult !== null) {
        return {
          content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
          isError: !!toolResult?.error,
        };
      } else {
        return {
          content: [{ type: 'text', text: 'Tool executed successfully' }],
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      debugLog(1, `Tool execution error: ${errorMessage}`);
      return {
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
  const tools = MEMORY_BANK_MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema || { type: 'object', properties: {}, required: [] },
  }));

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
