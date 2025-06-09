# MCP Transport Migration Guide

## Overview

This repository now includes two MCP server implementations to demonstrate the evolution from Server-Sent Events (SSE) to the modern HTTP streaming transport pattern.

## Server Implementations

### 1. SSE Server (Legacy) - `mcp-sse-server.ts`

**Status**: Legacy implementation (not recommended by MCP)
**Transport**: StreamableHTTPServerTransport with SSE-like patterns
**Use Case**: Reference implementation showing older patterns

#### Characteristics:
- Uses low-level `Server` class from `@modelcontextprotocol/sdk/server/index.js`
- Manual request handler setup for each MCP feature
- Session management using Express session handling
- Progress reporting disabled for HTTP transport
- Custom adapter layer between SDK and tool handlers

#### Usage:
```bash
npm run dev:sse
# or
npm run start:sse  # after build
```

### 2. HTTP Streaming Server (Recommended) - `mcp-httpstream-server.ts`

**Status**: Modern implementation (recommended)
**Transport**: StreamableHTTPServerTransport with proper HTTP streaming
**Use Case**: Production-ready server following MCP best practices

#### Characteristics:
- Uses high-level `McpServer` class from `@modelcontextprotocol/sdk/server/mcp.js`
- Automatic tool registration using the declarative API
- Proper session management with `Mcp-Session-Id` headers
- Built-in progress streaming support via SSE
- Clean separation of concerns
- Automatic schema validation with Zod
- Session timeout and cleanup
- Graceful shutdown handling
- Enhanced error handling and logging

#### Features:
- **Session Management**: Automatic session creation, tracking, and cleanup
- **Progress Streaming**: Real-time progress updates during tool execution
- **Stateful Operations**: Tools can maintain context across requests
- **Resource Management**: Automatic cleanup of inactive sessions
- **Security**: CORS configuration and request validation
- **Observability**: Comprehensive logging and health endpoints

#### Usage:
```bash
npm run dev:http
# or  
npm run start:http  # after build
```

## Key Differences

| Feature | SSE Server (Legacy) | HTTP Streaming Server (Modern) |
|---------|-------------------|-------------------------------|
| **API Level** | Low-level Server class | High-level McpServer class |
| **Tool Registration** | Manual request handlers | Declarative tool() method |
| **Session Management** | Basic Express sessions | MCP-compliant session IDs |
| **Progress Streaming** | Disabled | Built-in SSE support |
| **Schema Validation** | Manual Zod parsing | Automatic validation |
| **Error Handling** | Basic try/catch | Comprehensive error management |
| **Resource Cleanup** | Manual | Automatic session timeouts |
| **Graceful Shutdown** | Basic | Proper session cleanup |

## Migration Benefits

### Developer Experience
- **Less Boilerplate**: Declarative tool registration vs manual handlers
- **Type Safety**: Automatic schema validation and type inference
- **Better Debugging**: Enhanced logging and error reporting
- **Easier Testing**: Clean separation of concerns

### Performance
- **Session Reuse**: Persistent connections reduce initialization overhead
- **Resource Management**: Automatic cleanup prevents memory leaks
- **Progress Streaming**: Real-time feedback for long-running operations

### Standards Compliance
- **MCP Protocol**: Full compliance with MCP HTTP streaming specification
- **Session Headers**: Proper `Mcp-Session-Id` header handling
- **HTTP Methods**: Correct POST/GET/DELETE endpoint handling

## Configuration

### Environment Variables

Both servers support the following environment variables:

```bash
# Server configuration
PORT=3001                    # Server port (default: 3001)
DEBUG_LEVEL=2               # Debug logging level (0-3, default: 0)

# CORS configuration  
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Memory bank configuration
DB_PATH=./memory-bank.kuzu  # Database path (relative to client project)
```

### HTTP Streaming Server Additional Configuration

```bash
# Session management
SESSION_TIMEOUT=1800000     # Session timeout in milliseconds (default: 30 minutes)
```

## Client Compatibility

### HTTP Streaming Server
- **MCP Clients**: Full compatibility with MCP-compliant clients
- **Session Support**: Clients should send `Mcp-Session-Id` header after initialization
- **Streaming**: Supports progress updates via Server-Sent Events

### SSE Server
- **Legacy Clients**: Compatible with older client implementations
- **Basic HTTP**: Simple POST/GET request patterns

## Testing

You can test both servers using the MCP Inspector or compatible MCP clients:

```bash
# Test HTTP Streaming Server
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json,text/event-stream" \
  -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# Health check
curl http://localhost:3001/health
```

### E2E Tests

The repository includes comprehensive end-to-end tests for both server implementations:

#### HTTP Streaming Server Tests (Modern)
- **File**: `src/tests/e2e/httpstream-server.e2e.spec.ts`
- **Port**: 3001 (default)
- **Features Tested**:
  - MCP session initialization and management
  - Session termination and cleanup
  - Tool execution with session context
  - Concurrent request handling
  - Server-sent events support
  - Component CRUD operations
  - Health endpoint monitoring

```bash
# Run modern HTTP streaming tests
npm test -- --testPathPattern=httpstream-server.e2e.spec.ts
```

#### SSE Server Tests (Legacy)
- **File**: `src/tests/e2e/sse-server.e2e.spec.ts`  
- **Port**: 3002 (to avoid conflicts)
- **Features Tested**:
  - Legacy SSE streaming patterns
  - Basic HTTP requests
  - Tool execution (without session management)
  - Component operations

```bash
# Run legacy SSE tests
npm test -- --testPathPattern=sse-server.e2e.spec.ts
```

#### Running Both Test Suites
```bash
# Run all e2e tests
npm run test:e2e

# Run specific test files
npm test -- --testPathPattern="server.e2e.spec.ts"
```

### Test Environment Variables

Configure test execution with environment variables:

```bash
# HTTP Streaming Server tests
HTTP_STREAM_PORT=3001
DEBUG_LEVEL=3
SESSION_TIMEOUT=300000

# SSE Server tests  
SSE_STREAM_PORT=3002
DEBUG_LEVEL=3

# Run tests with custom config
HTTP_STREAM_PORT=3001 npm test -- --testPathPattern=httpstream-server.e2e.spec.ts
```

## Recommendations

1. **New Projects**: Use the HTTP Streaming Server (`mcp-httpstream-server.ts`)
2. **Existing Projects**: Migrate to HTTP Streaming Server for better performance and features
3. **Legacy Support**: Keep SSE Server for backward compatibility if needed

## Future Considerations

- The SSE server will be deprecated in future versions
- Focus development on the HTTP Streaming Server
- Consider removing SSE server once all clients migrate to HTTP streaming transport

## Troubleshooting

### Common Issues

1. **Session Timeouts**: Increase `SESSION_TIMEOUT` for long-running operations
2. **CORS Errors**: Update `CORS_ORIGINS` environment variable
3. **Memory Leaks**: Check session cleanup in server logs
4. **Progress Streaming**: Ensure client supports Server-Sent Events

### Debug Logging

Enable debug logging to troubleshoot issues:

```bash
DEBUG_LEVEL=3 npm run dev:http
```

This will show detailed request/response logging and session management information.