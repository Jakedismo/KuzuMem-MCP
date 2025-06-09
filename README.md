# KuzuMem-MCP

A TypeScript implementation of a distributed memory bank as an MCP (Model Context Protocol) tool, storing memories in a **KùzuDB graph database** with repository and branch filtering capabilities. Branch isolation is achieved by using a graph-unique identifier for entities, enabling a centralized memory bank while allowing repository-specific and branch-specific views. 

**Built with the official MCP TypeScript SDK** for full protocol compliance and seamless integration with IDEs and AI agents.

## Features

- **Official MCP TypeScript SDK** - Built using the official `@modelcontextprotocol/sdk` for guaranteed protocol compliance and access to latest MCP features
- **Thread-Safe Singleton Pattern** - Ensures each resource is instantiated only once, with proper thread safety
- **Distributed Graph Structure** - Follows the advanced memory bank specification using a KùzuDB graph
- **Repository & Branch Awareness** - All operations are contextualized by repository name and branch, with entities uniquely identified by a composite key (`repositoryName:branchName:itemId`)
- **File & Tag Management** - Comprehensive file tracking with metadata and universal tagging system for all entities
- **Asynchronous Operations** - Uses async/await for better performance
- **Multiple Access Interfaces** - Access via a RESTful HTTP API, a CLI, and multiple MCP server implementations
- **KùzuDB Backend** - Utilizes KùzuDB for graph-based memory storage and querying
- **Fully MCP Compliant** - All tools follow the Model Context Protocol using official SDK patterns
- **Modular Architecture** - Clear separation between MCP servers, service layer, memory operations, and repositories
- **MCP/JSON-RPC Communication** - Supports:
  - **HTTP Streaming (SSE)** via a unified `/mcp` endpoint for progressive results using official `StreamableHTTPServerTransport` (`src/mcp-httpstream-server.ts`)
  - **Stdio** for direct IDE/Agent integration using official `StdioServerTransport`, supporting both batch and progressive results (`src/mcp-stdio-server.ts`)
  - HTTP with per-tool batch-oriented endpoints (`src/mcp/server.ts` via `src/app.ts` at `/mcp/tools/...`)
- **Official Session Management** - Proper MCP session handling with session IDs for HTTP streaming transport
- **Server-Sent Events (SSE)** - Real-time streaming of tool results and progress notifications using official SDK patterns
- **Progressive Results Streaming** - Supports `tools/progress` notifications for long-running graph operations over Stdio and HTTP Streaming
- **Graph & Traversal Tools** - Includes tools for dependency analysis, pathfinding, and graph algorithms
- **Comprehensive Testing** - 95%+ test coverage for all core operations with 24+ unit tests
- **Lazy Database Initialization** - Databases are only initialized when explicitly requested through the init-memory-bank tool, not during server startup
- **Client Project Root Isolation** - Each client project gets its own isolated database instance based on the provided project root path

## Available MCP Tools

The server exposes the following tools to MCP clients:

### **Core Repository Management**
- `init-memory-bank` - Initialize a new memory bank for a repository/branch
- `get-metadata` / `update-metadata` - Repository-level metadata management
- `get-context` / `update-context` - Session and work context tracking

### **Component & Architecture Management**
- `add-component` - Add/update system components with dependencies
- `get-component-dependencies` - Find what a component depends on
- `get-component-dependents` - Find what depends on a component
- `get-active-components` - List all active components

### **Decision & Rule Management**
- `add-decision` - Record architectural decisions with context
- `add-rule` - Define coding standards and architectural rules
- `get-active-rules` - Retrieve active rules for a repository
- `get-decisions-by-date-range` - Find decisions within a time period

### **File Management (NEW)**
- `add_file` - Add/update file records with metadata, metrics, and content hashes
- `associate_file_with_component` - Link files to components via CONTAINS_FILE relationships

### **Tagging System (NEW)**
- `add_tag` - Create/update global tags with colors and descriptions
- `tag_item` - Apply tags to any item (Components, Decisions, Rules, Files, Contexts)
- `find_items_by_tag` - Search for items by tag with optional type filtering

### **Graph Analysis & Traversal**
- `get-governing-items-for-component` - Find rules and decisions affecting a component
- `get-item-contextual-history` - Track how an entity evolved over time
- `get-related-items` - Explore component neighborhoods and relationships
- `shortest-path` - Find relationship paths between components

### **Graph Algorithms**
- `pagerank` - Identify critical components by importance
- `louvain-community-detection` - Discover natural system modules
- `k-core-decomposition` - Find tightly coupled component clusters
- `strongly-connected-components` - Detect circular dependencies
- `weakly-connected-components` - Find isolated subsystems

### **Database Introspection**
- `count-nodes-by-label` - Count entities by type
- `list-nodes-by-label` - List entities with pagination
- `get-node-properties` - Inspect database schema
- `list-all-indexes` - View database indexes
- `list-all-node-labels` - Get available entity types

## Documentation

This README provides basic setup and usage information. For detailed documentation on architecture, advanced usage patterns, and graph database capabilities, please see [Extended Documentation](docs/README2.md) and [Graph Schema](docs/graph-schema.md).
For details on tools supporting progressive results, see [MCP Tools Streaming Support](src/mcp/tools/README.md).

## Installation

```bash
# Clone the repository
git clone https://github.com/solita-internal/kuzumem-mcp
cd kuzumem-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
# Default filename for KuzuDB database files created within client project roots
DB_FILENAME="memory-bank.kuzu" 

# Server Configuration
# Main server port
PORT=3000
# HTTP Stream server port (should be different from main port)
HTTP_STREAM_PORT=3001
# Host to bind server to
HOST=localhost

# Debug Logging for MCP Servers (0=Error, 1=Warn, 2=Info, 3=Debug, 4=Trace)
DEBUG=1
```

Add the following to your IDEs MCP configuration:

```json
{
  "mcpServers": {
    "KuzuMemo-MCP": {
      "command": "npx",
      "args": [
        "-y",
        "ts-node",
        "/Users/<absolute_path>/src/mcp-stdio-server.ts" // or "src/mcp-httpstream-server.ts" if your IDE supports SSE
      ],
      "env": {
        "PORT": "3000",
        "HOST": "localhost",
        "DB_FILENAME": "memory-bank.kuzu",
        "HTTP_STREAM_PORT": "3001"
      },
      "protocol": "stdio" // or "sse" for HTTP streaming
    }
  }
}
```

![IDE MCP Configuration](docs/client_view.png)

## Usage Examples

### File Management

```bash
# Add a file with metadata and metrics
curl -X POST http://localhost:3000/mcp/tools/add_file \
  -H "Content-Type: application/json" \
  -d '{
    "clientProjectRoot": "/path/to/project",
    "repository": "my-app",
    "branch": "main",
    "id": "file-auth-service",
    "name": "AuthService.ts",
    "path": "/src/services/AuthService.ts",
    "language": "typescript",
    "metrics": {"lines": 150, "complexity": 8},
    "content_hash": "abc123...",
    "mime_type": "text/typescript",
    "size_bytes": 4096
  }'

# Associate file with a component
curl -X POST http://localhost:3000/mcp/tools/associate_file_with_component \
  -H "Content-Type: application/json" \
  -d '{
    "clientProjectRoot": "/path/to/project",
    "repository": "my-app",
    "branch": "main",
    "componentId": "comp-AuthService",
    "fileId": "file-auth-service"
  }'
```

### Tagging System

```bash
# Create a tag
curl -X POST http://localhost:3000/mcp/tools/add_tag \
  -H "Content-Type: application/json" \
  -d '{
    "clientProjectRoot": "/path/to/project",
    "repository": "my-app",
    "branch": "main",
    "id": "tag-security",
    "name": "Security",
    "color": "#ff0000",
    "description": "Security-related components and decisions"
  }'

# Tag a component
curl -X POST http://localhost:3000/mcp/tools/tag_item \
  -H "Content-Type: application/json" \
  -d '{
    "clientProjectRoot": "/path/to/project",
    "repository": "my-app",
    "branch": "main",
    "itemId": "comp-AuthService",
    "itemType": "Component",
    "tagId": "tag-security"
  }'

# Find items by tag
curl -X POST http://localhost:3000/mcp/tools/find_items_by_tag \
  -H "Content-Type: application/json" \
  -d '{
    "clientProjectRoot": "/path/to/project",
    "repository": "my-app",
    "branch": "main",
    "tagId": "tag-security",
    "itemTypeFilter": "Component"
  }'
```

## Starting the Servers for local testing

- **HTTP Streaming MCP Server (Recommended - Official SDK with SSE):** (`src/mcp-httpstream-server.ts`)

  ```bash
  # Make sure memory-bank directory exists
  mkdir -p ./memory-bank
  
  # Start the HTTP stream server using official MCP SDK
  npx ts-node src/mcp-httpstream-server.ts
  ```

- **stdio MCP Server (Recommended - Official SDK):** (`src/mcp-stdio-server.ts`)

  ```bash
  # The stdio server will detect client project root from the environment
  # or from the tools/call arguments for init-memory-bank
  npx ts-node src/mcp-stdio-server.ts
  ```

- **Main HTTP Server (for REST API & Batch MCP via per-tool endpoints):** (`src/app.ts` which uses `src/mcp/server.ts` for `/mcp/tools/...`)

  ```bash
  # Make sure memory-bank directory exists
  mkdir -p ./memory-bank
  
  # Start the main server
  npm start
  ```

## Database Initialization

After the refactoring, database initialization now works as follows:

1. Databases are explicitly initialized through the `init-memory-bank` tool, not during server startup
2. Each database is stored within the client's project root directory
3. The database path is constructed at runtime by concatenating:
   - The client's project root (provided per request)
   - The database filename (from DB_FILENAME environment variable)
4. Server startup no longer fails if the database directory doesn't exist - it's created on demand

## MCP Server Implementation

All server implementations use the **official MCP TypeScript SDK** and support these MCP capabilities:

- `initialize` - Protocol handshake and capability discovery using official request schemas
- `tools/list` - Discovery of available tools with full schema definitions using `ListToolsRequestSchema`
- `tools/call` - Execution of any listed tool using `CallToolRequestSchema`, with support for `tools/progress` streaming from graph operations
- **Session Management** - Proper MCP session handling with session IDs for HTTP streaming transport
- **Server-Sent Events** - Real-time streaming using official `StreamableHTTPServerTransport`

**Recommended Server Implementations:**

1. **HTTP Streaming Server** (`src/mcp-httpstream-server.ts`) - Uses official `StreamableHTTPServerTransport` with SSE support
2. **stdio Server** (`src/mcp-stdio-server.ts`) - Uses official `StdioServerTransport` for direct IDE integration

**Common Tool Parameters (in JSON request body)**:

- `repository`: string (repository name, e.g., "my-project")
- `branch`: string (optional, defaults to "main"; specifies the branch context for the item)
- `id`: string (the logical/user-defined ID for the item, e.g., "comp-auth", "my-rule-001")
- `clientProjectRoot`: string (required for init-memory-bank, specifies the absolute path to the client project root)

## Architecture

This project follows a clean architecture with separation of concerns and **uses the official MCP TypeScript SDK**:

### Database Layer

- Uses **KùzuDB**, an embedded graph database
- Interaction via the `KuzuDBClient` which executes **Cypher** queries
- Database paths are now constructed at runtime using the client's project root

### Repository Layer

Thread-safe singleton repositories for each memory type and core graph entities:

- `RepositoryRepository` (for `Repository` nodes)
- `MetadataRepository`
- `ContextRepository`
- `ComponentRepository` (also handles component-centric graph queries like dependencies, dependents, related items, shortest path, and placeholders for graph algorithms)
- `DecisionRepository`
- `RuleRepository`
- `FileRepository` (NEW - manages file nodes and relationships)
- `TagRepository` (NEW - manages tags and tagging relationships)

### Memory Operations Layer (`src/services/memory-operations/`)

A layer that encapsulates specific business logic for groups of operations, called by `MemoryService`:

- `metadata.ops.ts`
- `context.ops.ts`
- `component.ops.ts` (includes new traversal ops)
- `decision.ops.ts`
- `rule.ops.ts`
- `file.ops.ts` (NEW - file creation and component association)
- `tag.ops.ts` (NEW - tag creation, item tagging, and tag-based search)
- `import-export.ops.ts`
- `graph.ops.ts` (for graph algorithms and generic traversals)

### Service Layer

- `MemoryService` - Core business logic, now acts as an orchestrator, delegating to Memory Operations Layer functions
- `RepositoryFactory` - Creates and caches repository instances
- `RepositoryProvider` - Manages repositories per client project root, ensuring proper initialization

### MCP Layer (`src/mcp/`) - **Official SDK Integration**

- **Tool Definitions (`src/mcp/tools/`)**: Modular tool definitions ([see details](src/mcp/tools/README.md)) with full MCP schema compatibility. Includes new graph and traversal tools
- **Tool Handlers (`src/mcp/tool-handlers.ts`)**: Centralized logic for executing any defined MCP tool, shared by different server implementations
- **Streaming Support Infrastructure (`src/mcp/streaming/`, `src/mcp/services/tool-execution.service.ts`)**:
  - `progress-handler.ts`: Defines `ProgressHandler` and `ProgressTransport` interfaces for managing streaming
  - `stdio-transport.ts`: Implements `ProgressTransport` for stdio
  - `http-transport.ts`: Implements `ProgressTransport` for HTTP SSE
  - `tool-execution.service.ts`: Orchestrates tool calls with progress handling
  - `operations/`: Directory containing Operation Classes for streamable tools
- **Server Implementations (Official SDK)**:
  - `src/mcp-httpstream-server.ts`: **Recommended** - Uses official `Server` class with `StreamableHTTPServerTransport` for SSE support
  - `src/mcp-stdio-server.ts`: **Recommended** - Uses official `Server` class with `StdioServerTransport` for direct IDE integration
  - `src/mcp/server.ts` (`MemoryMcpServer`): Legacy Express.js implementation with dedicated batch-oriented POST endpoints per tool
- **Types(`src/mcp/types/`)**: Shared MCP type definitions (e.g., `McpTool`, `ToolHandler`)

### CLI Layer

Commander-based CLI with async operation support, interacting with `MemoryService`.

## KùzuDB Graph Schema

The memory bank uses a graph structure in KùzuDB. Refer to [Graph Schema](docs/graph-schema.md) for the detailed node and relationship definitions.

Key aspects:

- **Nodes**: `Repository`, `Metadata`, `Context`, `Component`, `Decision`, `Rule`, `File` (NEW), `Tag` (NEW)
- **Primary Keys**: `Repository` nodes use `id` (format: `name:branch`). Other entities (`Metadata`, `Context`, `Component`, `Decision`, `Rule`) use a `graph_unique_id` (format: `repositoryName:itemBranch:logicalId`) as their `PRIMARY KEY` to ensure uniqueness across repositories and branches. `File` nodes use `id` as primary key. `Tag` nodes use `id` as primary key (tags are global).
- **Relationships**: Various `HAS_...` and semantic relationships like `DEPENDS_ON`, `CONTEXT_OF`, `CONTAINS_FILE` (NEW), `IS_TAGGED_WITH` (NEW), etc., link these nodes

## Testing

The project includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --testPathPattern="file.ops.test.ts|tag.ops.test.ts"

# Coverage: 95.61% statements, 82.75% branches, 100% functions
```

## License

MIT

## Contributing

Feel free to contribute to the project.

## Recent Updates

### ✅ Phase 3 Complete - File & Tag Management (December 2024)

- **File Management Tools** - Complete file tracking with metadata, metrics, and component associations
- **Universal Tagging System** - Tag any entity (Components, Decisions, Rules, Files, Contexts) with colored, searchable tags
- **Comprehensive Testing** - 24 unit tests with 95%+ coverage for all new operations
- **Enhanced Schema** - Extended KùzuDB schema with File and Tag nodes and relationships
- **Standardized Error Handling** - Consistent error patterns across all operations
- **Type Safety Improvements** - Enhanced TypeScript type definitions for better development experience

## Future Improvements

- **Enhance CLI** to support branch selection for all relevant commands more explicitly
- **Refine Graph Algorithm Streaming**: Further refactor `MemoryService` and Kùzu calls within Operation Classes to provide more granular progress for algorithms where KùzuDB allows iterative result yielding
- **Add Full-Text Search (FTS) Capabilities** - Planned implementation to enable efficient keyword-based search across all memory items using KùzuDB's FTS extension. Enhanced by the new tagging system
- **Vector Embeddings Support** - Planned implementation; would enable semantic similarity search and NLP-based memory retrieval using KùzuDB's vector capabilities
- **Enhanced File Analysis** - Integration with code analysis tools for automated metrics and relationship detection
- **Tag Analytics** - Advanced tag-based insights and relationship analysis

## Target Graph Schema

![New Graph Schema](docs/schema_evolution.md)
