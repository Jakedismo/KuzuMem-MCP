/**
 * MCP HTTP Streaming Server (New Implementation)
 * Implements the Model Context Protocol using modern HTTP streaming patterns
 * Based on the official TypeScript SDK v1.12+ patterns with proper session management
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

// Configuration
const PORT = process.env.PORT || 3001;
const DEBUG_LEVEL = parseInt(process.env.DEBUG_LEVEL || '0', 10);
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT || '1800000', 10); // 30 minutes
const CORS_ORIGINS = process.env.CORS_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

// Logging utility
function debugLog(level: number, message: string, ...args: any[]): void {
  if (DEBUG_LEVEL >= level) {
    const timestamp = new Date().toISOString();
    const logMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    console.error(`[HTTP-STREAM-${level}] ${timestamp} ${logMessage}`);
  }
}

// Session management interface
interface SessionState {
  sessionId: string;
  server: Server;
  transport: StreamableHTTPServerTransport;
  clientProjectRoot?: string;
  repository?: string;
  branch?: string;
  createdAt: Date;
  lastActivity: Date;
}

// Session store
const sessions = new Map<string, SessionState>();

// Adapter to convert SdkToolHandler to ToolHandler format (same as stdio server)
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
        debug: (msg: string, ...logArgs: any[]) =>
          debugLog(3, logArgs.length > 0 ? `${msg} ${JSON.stringify(logArgs)}` : msg),
        info: (msg: string, ...logArgs: any[]) =>
          debugLog(2, logArgs.length > 0 ? `${msg} ${JSON.stringify(logArgs)}` : msg),
        warn: (msg: string, ...logArgs: any[]) =>
          debugLog(1, logArgs.length > 0 ? `${msg} ${JSON.stringify(logArgs)}` : msg),
        error: (msg: string, ...logArgs: any[]) =>
          debugLog(0, logArgs.length > 0 ? `${msg} ${JSON.stringify(logArgs)}` : msg),
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

// Cleanup inactive sessions
setInterval(
  () => {
    const now = new Date();
    for (const [sessionId, session] of sessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > SESSION_TIMEOUT) {
        debugLog(1, `Cleaning up inactive session: ${sessionId}`);
        try {
          session.transport.close();
          session.server.close();
        } catch (error) {
          debugLog(0, `Error cleaning up session ${sessionId}:`, error);
        }
        sessions.delete(sessionId);
      }
    }
  },
  10 * 60 * 1000,
); // Check every 10 minutes

// Create a new MCP server instance
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
    const requestId = 'id' in request ? String(request.id) : randomUUID();

    debugLog(1, `Executing tool: ${toolName} with args:`, toolArgs);

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
        adaptedToolHandlers, // Use adapted tool handlers that match the expected type
        effectiveClientProjectRoot,
        sdkContext, // Pass sdkContext
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
          content: [
            {
              type: 'text',
              text: 'Tool executed successfully with no specific result content.',
            },
          ],
          isError: false,
        };
      }

      // Success case with structured content
      return {
        structuredContent: toolResult, // toolResult is the direct JSON object
        content:
          toolResult.message && typeof toolResult.message === 'string'
            ? [{ type: 'text', text: toolResult.message }]
            : [],
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

  // Set up other request handlers
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

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
  }),
);

// Request logging middleware
app.use((req, res, next) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  debugLog(2, `${req.method} ${req.path}`, {
    sessionId: sessionId ? `${sessionId.substring(0, 8)}...` : 'none',
    body: req.method === 'POST' ? 'present' : 'none',
  });
  next();
});

// Main MCP endpoint - handles POST, GET, and DELETE
app.all('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    if (req.method === 'POST') {
      await handlePostRequest(req, res, sessionId);
    } else if (req.method === 'GET') {
      await handleGetRequest(req, res, sessionId);
    } else if (req.method === 'DELETE') {
      await handleDeleteRequest(req, res, sessionId);
    } else {
      res.status(405).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: `Method ${req.method} not allowed`,
        },
        id: null,
      });
    }
  } catch (error) {
    debugLog(0, 'Error handling MCP request:', error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// Handle POST requests (client-to-server communication)
async function handlePostRequest(req: Request, res: Response, sessionId?: string): Promise<void> {
  let session: SessionState | undefined;

  // Check for existing session
  if (sessionId && sessions.has(sessionId)) {
    session = sessions.get(sessionId)!;
    session.lastActivity = new Date();
  }
  // Handle new initialization request
  else if (!sessionId && isInitializeRequest(req.body)) {
    const newSessionId = randomUUID();

    // Create new transport with session management
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (id) => {
        debugLog(1, `New MCP session initialized: ${id}`);
      },
    });

    // Create new server instance
    const server = createMcpServer();

    // Clean up when transport closes
    transport.onclose = () => {
      debugLog(1, `Cleaning up MCP session: ${newSessionId}`);
      sessions.delete(newSessionId);
      try {
        server.close();
      } catch (error) {
        debugLog(0, `Error closing server for session ${newSessionId}:`, error);
      }
    };

    // Connect server to transport
    await server.connect(transport);

    // Store session
    session = {
      sessionId: newSessionId,
      server,
      transport,
      createdAt: new Date(),
      lastActivity: new Date(),
    };
    sessions.set(newSessionId, session);

    debugLog(1, `Created new session: ${newSessionId}`);
  }
  // Invalid request
  else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided or not an initialization request',
      },
      id: null,
    });
    return;
  }

  // Handle the request through the transport
  await session.transport.handleRequest(req, res, req.body);
}

// Handle GET requests (server-to-client notifications via SSE)
async function handleGetRequest(req: Request, res: Response, sessionId?: string): Promise<void> {
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const session = sessions.get(sessionId)!;
  session.lastActivity = new Date();

  // Handle the GET request through the transport
  await session.transport.handleRequest(req, res);
}

// Handle DELETE requests (session termination)
async function handleDeleteRequest(req: Request, res: Response, sessionId?: string): Promise<void> {
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const session = sessions.get(sessionId)!;

  try {
    // Close the transport and server
    session.transport.close();
    session.server.close();

    // Remove from sessions
    sessions.delete(sessionId);

    debugLog(1, `Session terminated by client: ${sessionId}`);
    res.status(200).send('Session terminated');
  } catch (error) {
    debugLog(0, `Error terminating session ${sessionId}:`, error);
    res.status(500).send('Error terminating session');
  }
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    sessions: sessions.size,
    version: '3.0.0',
    transport: 'streamable-http',
    uptime: process.uptime(),
  });
});

// Legacy compatibility endpoint (list tools)
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

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: any) => {
  debugLog(0, 'Unhandled error:', error);

  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  debugLog(1, 'SIGTERM received, shutting down gracefully');

  // Close all sessions
  for (const [sessionId, session] of sessions.entries()) {
    try {
      session.transport.close();
      session.server.close();
    } catch (error) {
      debugLog(0, `Error closing session ${sessionId} during shutdown:`, error);
    }
  }

  sessions.clear();
  process.exit(0);
});

process.on('SIGINT', async () => {
  debugLog(1, 'SIGINT received, shutting down gracefully');

  // Close all sessions
  for (const [sessionId, session] of sessions.entries()) {
    try {
      session.transport.close();
      session.server.close();
    } catch (error) {
      debugLog(0, `Error closing session ${sessionId} during shutdown:`, error);
    }
  }

  sessions.clear();
  process.exit(0);
});

// Start the server
app.listen(PORT, () => {
  console.log(`MCP HTTP Streaming Server (v3.0.0) running at http://localhost:${PORT}`);
  console.log(`Transport: Streamable HTTP`);
  console.log(`Debug level: ${DEBUG_LEVEL}`);
  console.log(`Session timeout: ${SESSION_TIMEOUT}ms`);
  console.log(`CORS origins: ${CORS_ORIGINS.join(', ')}`);
  debugLog(1, 'Server started successfully');
});

export default app;