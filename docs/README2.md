# 🧠 KuzuMem-MCP

> **Enhance AI coding assistants with persistent, graph-based knowledge using the official MCP TypeScript SDK**

The KuzuMem-MCP server provides a structured approach to storing and retrieving repository knowledge, enabling AI coding assistants to maintain context across sessions and branches. **Built with the official MCP TypeScript SDK** for guaranteed protocol compliance and seamless integration.

## 🎯 Purpose & Goals

This project addresses several key challenges in AI-assisted development:

- **Maintain persistent knowledge** across coding sessions
- **Support branch-based knowledge organization** for development workflows
- **Identify relationships** between components, decisions, and rules
- **Provide graph-based memory storage** for enhanced context retrieval
- **Enable AI tools** to understand project architecture
- **Track file metadata and relationships** with comprehensive file management
- **Universal tagging system** for organizing and discovering any type of entity
- **Client isolation** for supporting multiple client projects with dedicated memory banks
- **Official MCP compliance** using the official TypeScript SDK for reliable integration

## ✨ Key Benefits

### 📚 Knowledge Persistence

This memory bank enables AI assistants to:

- Retain architectural decisions and their context
- Track component relationships across your codebase
- Build knowledge incrementally over multiple sessions
- Maintain file metadata including metrics, hashes, and language information
- Organize entities with a flexible tagging system

### 🌐 Graph-Based Storage

Using **KùzuDB** as a graph database provides:

- Relationship-aware queries between components
- Context retrieval across connected entities
- Structural representation of system architecture
- File-to-component associations for code organization
- Tag-based discovery and cross-cutting concerns analysis

### 🔀 Branch Isolation

The implementation supports branch-based workflows:

- Separate memory contexts for each branch
- Branch-specific development knowledge
- Clean context switching when changing branches
- File tracking across branch variations

### 🧰 Graph Traversal & Analysis

MCP tools include capabilities for:

- Component dependency analysis
- Component relationship mapping
- Structural importance identification
- Tag-based entity discovery and relationship analysis

### 🏢 Client Project Isolation

The enhanced architecture now supports:

- Per-client database isolation for multi-project support
- Dedicated memory banks stored within each client's project root
- Lazy database initialization that only happens when explicitly requested
- Improved database path handling with proper error messages

### 🏗️ Official MCP TypeScript SDK Integration

Built with the official SDK for:

- **Standards compliance** with MCP protocol specifications
- **Session management** with proper session ID handling for HTTP streaming
- **Server-Sent Events (SSE)** for real-time streaming using official transport
- **Request/Response handling** using official schemas (`ListToolsRequestSchema`, `CallToolRequestSchema`, etc.)
- **Future compatibility** with MCP protocol updates and improvements

### � File Management & Tracking

The new file management system provides:

- **Comprehensive file metadata** - Track language, metrics, content hashes, mime types, and file sizes
- **File-component relationships** - Associate files with the components they implement
- **Version tracking** - Monitor file changes through content hashes
- **Code metrics integration** - Store and query code complexity, line counts, and other metrics

### 🏷️ Universal Tagging System

The tagging system enables:

- **Cross-cutting organization** - Tag any entity (Components, Decisions, Rules, Files, Contexts)
- **Visual categorization** - Color-coded tags for quick identification
- **Semantic grouping** - Group related entities regardless of type
- **Discovery and search** - Find entities by tag with optional type filtering
- **Relationship analysis** - Understand how tagged entities relate to each other

## �🔍 Advanced Graph Queries & Traversals

The graph-based architecture enables powerful queries that would be difficult or impossible with traditional databases:

### 1. Impact Analysis

```bash
# Find all components that would be affected by changing the Authentication service
$ curl -X POST http://localhost:3000/tools/get-component-dependents \
  -H "Content-Type: application/json" \
  -d '{
    "clientProjectRoot": "/path/to/project", 
    "repository": "my-app", 
    "branch": "main", 
    "componentId": "comp-AuthService"
  }'

# Result shows not just direct users of the Auth service, but the entire dependency chain
{
  "dependents": [
    {"id": "comp-AdminPanel", "name": "Admin Panel", "path": ["comp-AuthService", "comp-AdminAPI", "comp-AdminPanel"]},
    {"id": "comp-UserProfile", "name": "User Profile", "path": ["comp-AuthService", "comp-UserProfile"]},
    {"id": "comp-PaymentService", "name": "Payment Service", "path": ["comp-AuthService", "comp-PaymentService"]},
    // ... additional dependent components with their dependency paths
  ]
}
```

### 2. File and Component Analysis

```bash
# Find all files associated with security-tagged components
$ curl -X POST http://localhost:3000/tools/find_items_by_tag \
  -H "Content-Type: application/json" \
  -d '{
    "clientProjectRoot": "/path/to/project",
    "repository": "my-app", 
    "branch": "main", 
    "tagId": "tag-security",
    "itemTypeFilter": "All"
  }'

# Results show components, files, and decisions all tagged with security
{
  "items": [
    {"id": "comp-AuthService", "nodeLabel": "Component", "properties": {"name": "Authentication Service", "kind": "service"}},
    {"id": "file-auth-service", "nodeLabel": "File", "properties": {"path": "/src/auth/AuthService.ts", "language": "typescript", "metrics": {"complexity": 8}}},
    {"id": "dec-20241201-2fa", "nodeLabel": "Decision", "properties": {"name": "Two-Factor Authentication", "date": "2024-12-01"}},
    // ... more security-related entities
  ]
}
```

### 3. Architectural Decision Context

```bash
# Find all decisions and rules affecting the UserProfile component
$ curl -X POST http://localhost:3000/tools/get-governing-items-for-component \
  -H "Content-Type: application/json" \
  -d '{
    "clientProjectRoot": "/path/to/project",
    "repository": "my-app", 
    "branch": "main", 
    "componentId": "comp-UserProfile"
  }'

# Results include decisions, rules and when/why they were made
{
  "decisions": [
    {"id": "dec-20250315-GDPR", "name": "GDPR Compliance Strategy", "date": "2025-03-15", "context": "EU regulations required ..."},
    {"id": "dec-20250401-Caching", "name": "Profile Data Caching Policy", "date": "2025-04-01", "context": "Performance issues in production..."}
  ],
  "rules": [
    {"id": "rule-security-pii", "name": "PII Data Handling", "content": "All personally identifiable information must be..."},
    {"id": "rule-frontend-state", "name": "Frontend State Management", "content": "User state should be managed using..."}
  ],
  "contextHistory": [
    {"date": "2025-02-10", "summary": "Initial implementation", "agent": "dev-alice"},
    {"date": "2025-03-15", "summary": "Updated for GDPR compliance", "agent": "dev-bob"}
  ]
}
```

### 4. Knowledge Graph Exploration

```bash
# Find the shortest relationship path between two components
$ curl -X POST http://localhost:3000/tools/shortest-path \
  -H "Content-Type: application/json" \
  -d '{"repository": "my-app", "branch": "main", "startNodeId": "comp-AdminPanel", "endNodeId": "comp-DataStore"}'

# Results show how components are connected through the system
{
  "path": [
    {"id": "comp-AdminPanel", "name": "Admin Panel", "relationshipType": "DEPENDS_ON"},
    {"id": "comp-AdminAPI", "name": "Admin API", "relationshipType": "DEPENDS_ON"},
    {"id": "comp-DataAccess", "name": "Data Access Layer", "relationshipType": "DEPENDS_ON"},
    {"id": "comp-DataStore", "name": "Data Store"}
  ],
  "contextualDecisions": [
    {"id": "dec-20250220-DataAccess", "name": "Data Access Pattern Selection", "affects": ["comp-DataAccess", "comp-DataStore"]}
  ]
}
```

### 5. Architectural Health Analysis

```bash
# Identify critical components using PageRank algorithm
$ curl -X POST http://localhost:3000/tools/pagerank \
  -H "Content-Type: application/json" \
  -d '{"repository": "my-app", "branch": "main"}'

# Results highlight components that are most fundamental to the system
{
  "rankedComponents": [
    {"id": "comp-DataStore", "name": "Data Store", "rank": 0.89, "dependentCount": 12},
    {"id": "comp-AuthService", "name": "Auth Service", "rank": 0.76, "dependentCount": 8},
    {"id": "comp-APIGateway", "name": "API Gateway", "rank": 0.73, "dependentCount": 7},
    // ... more components ranked by centrality
  ]
}
```

### 6. System Structure Discovery

```bash
# Detect natural system boundaries using community detection
$ curl -X POST http://localhost:3000/tools/louvain-community-detection \
  -H "Content-Type: application/json" \
  -d '{"repository": "my-app", "branch": "main"}'

# Results group components into natural subsystems
{
  "communities": [
    {
      "id": 0,
      "name": "Authentication and User Management",
      "components": ["comp-AuthService", "comp-UserProfile", "comp-PermissionManager"],
      "cohesion": 0.92
    },
    {
      "id": 1,
      "name": "Data and Storage",
      "components": ["comp-DataStore", "comp-DataAccess", "comp-CacheLayer"],
      "cohesion": 0.87
    },
    // ... more communities representing logical subsystems
  ],
  "modularity": 0.78
}
```

### 7. Tag-Based Insights

```bash
# Analyze relationships between entities with similar tags
$ curl -X POST http://localhost:3000/tools/find_items_by_tag \
  -H "Content-Type: application/json" \
  -d '{
    "clientProjectRoot": "/path/to/project",
    "repository": "my-app", 
    "branch": "main", 
    "tagId": "tag-performance",
    "itemTypeFilter": "All"
  }'

# Results show all performance-related entities across different types
{
  "items": [
    {"id": "comp-CacheLayer", "nodeLabel": "Component", "properties": {"name": "Cache Layer", "kind": "service"}},
    {"id": "dec-20241115-caching", "nodeLabel": "Decision", "properties": {"name": "Caching Strategy", "date": "2024-11-15"}},
    {"id": "rule-performance-db", "nodeLabel": "Rule", "properties": {"name": "Database Query Performance", "content": "All queries must complete within 100ms"}},
    {"id": "file-cache-manager", "nodeLabel": "File", "properties": {"path": "/src/cache/CacheManager.ts", "metrics": {"complexity": 12}}}
  ]
}
```

### 8. Architectural Weakness Detection

```bash
# Find circular dependencies that may indicate design problems
$ curl -X POST http://localhost:3000/tools/strongly-connected-components \
  -H "Content-Type: application/json" \
  -d '{"repository": "my-app", "branch": "main"}'

# Results show components with circular dependencies
{
  "cyclicDependencyGroups": [
    {
      "components": ["comp-UserService", "comp-NotificationService", "comp-UserPreferences"],
      "cycle": "UserService → NotificationService → UserPreferences → UserService",
      "suggestedRefactoring": "Extract notification preferences to a separate component"
    },
    // ... other circular dependency groups
  ]
}
```

These examples demonstrate how the graph-based architecture enables complex queries about component relationships, architectural decisions, and system structure that would be difficult or impossible with traditional databases. AI assistants can use these insights to provide more informed guidance about code changes, architectural evolution, and potential design weaknesses.

### Key Schema Design Elements

1. **Branch-Aware Repository Nodes**

   - Repository nodes use a synthetic primary key (`id = name + ':' + branch`)
   - This enables complete isolation of memory between branches
   - All operations filter by both repository name and branch

2. **Rich Relationship Types**

   - **HAS\_\* relationships** - Connect repositories to memory entities
   - **DEPENDS_ON** - Track component dependencies (self-referential)
   - **CONTEXT_OF\*** - Link context to components, decisions, and rules
   - **DECISION_ON** - Connect decisions to affected components
   - **CONTAINS_FILE** (NEW) - Link components to their implementation files
   - **IS_TAGGED_WITH** (NEW) - Universal tagging relationship for any entity

3. **File and Tag Integration**
   - **File nodes** - Store comprehensive file metadata including metrics, hashes, and language information
   - **Tag nodes** - Global tags with colors and descriptions for cross-cutting organization
   - **Multi-type relationships** - Tags can be applied to any entity type, enabling semantic grouping

4. **Graph Traversal Capabilities**
   - **Multi-hop queries** - Find indirect relationships between components
   - **Ancestor/descendant tracking** - Trace component dependencies or dependents
   - **Path finding** - Discover relationships between seemingly unrelated components
   - **Relationship analysis** - Identify critical components using graph algorithms
   - **Tag-based discovery** - Find related entities through shared tags

This graph structure enables the system to answer complex questions that would be difficult with a traditional database, such as "What components might be affected if I change this service?" or "What context led to this architectural decision?" The addition of file tracking and tagging further enhances the system's ability to understand code organization and cross-cutting concerns.

## 💻 MCP Integration - Official SDK

This server implements Model Context Protocol standards using the **official MCP TypeScript SDK**:

- **Full tool schema definitions** for IDE auto-discovery using official schemas
- **Multiple transport protocols** - HTTP Streaming (SSE) with `StreamableHTTPServerTransport` and stdio with `StdioServerTransport`
- **Session management** - Proper MCP session handling with session IDs for HTTP streaming
- **Progressive result streaming** for long-running operations with official progress notifications
- **Error handling and status reporting** using official SDK patterns
- **Request/Response handling** using official request schemas (`ListToolsRequestSchema`, `CallToolRequestSchema`, etc.)
- **Server-Sent Events** for real-time streaming using official transport implementations

## 🚀 Technical Features

- **🏗️ Official MCP TypeScript SDK** - Built with `@modelcontextprotocol/sdk` for guaranteed compliance
- **🧵 Thread-Safe Singleton Pattern** - Ensures each resource is instantiated once
- **📂 Distributed Memory Structure** - Follows memory bank specification
- **🔍 Repository & Branch Filtering** - Operations isolated by repository and branch
- **📁 Comprehensive File Management** - Track files with metadata, metrics, and component relationships
- **🏷️ Universal Tagging System** - Tag any entity with colored, searchable tags
- **⚡ Asynchronous Operations** - Uses async/await for performance
- **🔌 Multiple Access Methods** - REST API, CLI, and MCP integration
- **📊 KùzuDB Backend** - Graph database for relationship queries
- **🧩 Modular Architecture** - Clean separation between layers
- **🔄 JSON-RPC Communication** - Standard protocol support using official SDK
- **📡 Server-Sent Events (SSE)** - Real-time streaming with official `StreamableHTTPServerTransport`
- **🗺️ Graph Traversal Tools** - Path finding and dependency analysis
- **🔐 Client Project Isolation** - Each client project gets its own memory bank
- **🎯 Session Management** - Proper MCP session handling with session IDs
- **🧪 Comprehensive Testing** - 95%+ test coverage with 24+ unit tests

## 📅 Feature Timeline

### Winter 2024-2025 - File & Tag Management System (Phase 3) ✅

- ✅ **File Management Tools** - Complete file tracking with metadata, metrics, and component associations
- ✅ **Universal Tagging System** - Tag any entity (Components, Decisions, Rules, Files, Contexts) with colored, searchable tags
- ✅ **File-Component Relationships** - Associate files with components via CONTAINS_FILE relationships
- ✅ **Tag-Based Discovery** - Search and filter entities by tags with optional type filtering
- ✅ **Enhanced Schema** - Extended KùzuDB schema with File and Tag nodes and relationships
- ✅ **Comprehensive Testing** - 24 unit tests with 95%+ coverage for all new operations
- ✅ **Standardized Error Handling** - Consistent error patterns across all operations
- ✅ **Type Safety Improvements** - Enhanced TypeScript type definitions

### Spring 2025 - KùzuDB Migration & Official SDK Integration ✅

- ✅ **Graph Database Migration** - Transitioned from SQLite to KùzuDB
- ✅ **Branch Isolation** - Implemented repository synthetic IDs (`name + ':' + branch`)
- ✅ **Relationship Modeling** - Created node and relationship tables in graph structure
- ✅ **Cypher Query Support** - Replaced SQL queries with Cypher for graph traversal
- ✅ **Service/Repository Refactoring** - Updated all layers to support branch awareness
- ✅ **Graph Traversal Tools** - Added component dependency and relationship tools
- ✅ **Client Project Isolation** - Implemented per-client memory banks
- ✅ **Repository Factory Pattern** - Centralized repository creation with proper caching
- ✅ **Repository Provider** - Added intermediary between services and repositories
- ✅ **Lazy Database Initialization** - Databases only created when explicitly requested
- ✅ **Improved Error Handling** - Better error messages for database path issues
- ✅ **Official MCP TypeScript SDK Migration** - Migrated from custom MCP implementation to official SDK
- ✅ **Session Management** - Implemented proper MCP session handling with session IDs
- ✅ **Server-Sent Events** - Added real-time streaming using official transport implementations
- ✅ **Request Schema Compliance** - Updated all request handling to use official MCP schemas

## 💡 Use Cases

- **Project Knowledge Continuity** - Maintain context across development sessions
- **Architecture Understanding** - Query component dependencies and relationships
- **Decision History** - Track why implementation choices were made
- **Impact Assessment** - Identify affected components when making changes
- **Onboarding** - Help new team members understand system structure
- **Multi-Project Support** - Maintain separate memory banks for different projects
- **Real-time Collaboration** - Stream updates and progress using official MCP SSE transport
- **File Organization** - Track and analyze code files with comprehensive metadata
- **Cross-Cutting Concerns** - Use tags to identify security, performance, or feature-related entities
- **Code Quality Analysis** - Monitor code metrics and complexity through file tracking
- **Semantic Discovery** - Find related entities through tag-based relationships

## 🔧 Installation & Usage

```bash
# Clone the repository
git clone git@github.com:Jakedismo/KuzuMem-MCP.git
cd kuzumem-mcp

# Install dependencies (includes official MCP TypeScript SDK)
npm install

# Build the project
npm run build
```

### Configuration

Create a `.env` file with:

```env
# KùzuDB Configuration
DB_FILENAME=memory-bank.kuzu

# Server Configuration
PORT=3000
HTTP_STREAM_PORT=3001
HOST=localhost
DEBUG=1
```

### Server Options (Official SDK)

- **HTTP Streaming Server (Recommended):** `npx ts-node src/mcp-httpstream-server.ts` - Uses official `StreamableHTTPServerTransport`
- **stdio Server (Recommended):** `npx ts-node src/mcp-stdio-server.ts` - Uses official `StdioServerTransport`
- **HTTP Server (Legacy):** `npm start` - Traditional Express.js implementation

### MCP Tools

The server provides tools for repository operations, memory management, graph traversal, file management, and tagging using official MCP schemas. See [README.md](../README.md) for the complete tool list including the new file and tag management tools.

## 🏗️ Architecture - Official SDK Integration

This project follows a multi-layer architecture with **official MCP TypeScript SDK integration**:

- **Database Layer:**
  - KùzuDB graph database with Cypher queries
  - RepositoryFactory for centralized repository creation
  - RepositoryProvider for client-specific repository management

- **Repository Layer:**
  - Thread-safe singleton repositories for each memory type
  - Client-aware repository instances
  - New FileRepository and TagRepository for file and tag management

- **Memory Operations Layer:**
  - Business logic for memory operations
  - Client project root validation
  - New file.ops.ts and tag.ops.ts for file and tag operations

- **Service Layer:**
  - Core orchestration through MemoryService
  - Client project awareness for database operations
  - Integration of file and tag management capabilities

- **MCP Layer (Official SDK):**
  - **Server Implementations**: Using official `Server` class with `StreamableHTTPServerTransport` and `StdioServerTransport`
  - **Request Handling**: Official schemas (`ListToolsRequestSchema`, `CallToolRequestSchema`, etc.)
  - **Session Management**: Proper MCP session handling with session IDs
  - **Tool definitions, handlers, and streaming support**
  - **Client project root propagation**
  - **Comprehensive testing infrastructure**

- **CLI Layer:**
  - Command-line interface for direct interaction

## 🙏 Acknowledgements

- **[Model Context Protocol](https://modelcontextprotocol.io/introduction)** - Agent-tool communication standard and **official TypeScript SDK**
- **[KùzuDB](https://kuzudb.com/)** - Embedded property graph database
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe programming language
- **[Node.js](https://nodejs.org/)** - JavaScript runtime
- **[Express](https://expressjs.com/)** - Web framework
- **[Commander.js](https://github.com/tj/commander.js/)** - Command-line application framework

## 📄 License

Apache-2.0
