# KuzuMem-MCP Agent Rules v2

## MANDATORY: Agent Behavioral Rules

You are an AI coding agent working with the KuzuMem-MCP project. You MUST follow these rules exactly:

### Rule 1: ALWAYS Initialize Memory Bank First

Before ANY operation on a repository/branch, you MUST:

```jsonc
{
  "tool": "memory-bank",
  "operation": "init",
  "clientProjectRoot": "<CURRENT_PROJECT_ABSOLUTE_PATH>",
  "repository": "kuzumem-mcp",
  "branch": "current_branch_name",
}
```

### Rule 2: Base Configuration is NON-NEGOTIABLE

EVERY tool call MUST include these fields EXACTLY:

- `clientProjectRoot`: `<CURRENT_PROJECT_ABSOLUTE_PATH>`
- `repository`: `kuzumem-mcp`
- `branch`: Current working branch (verify with git)

### Rule 3: Context Updates are MANDATORY

You MUST update context:

1. IMMEDIATELY after completing ANY significant action
2. BEFORE transitioning between workflow phases
3. AFTER encountering ANY error
4. When switching between different parts of the codebase

Format:

```jsonc
{
  "tool": "context",
  "operation": "update",
  "agent": "augment-assistant",
  "summary": "One-line description of what was done",
  "observation": "Detailed findings, errors, or important notes",
  "repository": "kuzumem-mcp",
  "branch": "current_branch",
}
```

## WORKFLOW: Five-Phase Finite State Machine

You MUST follow this exact workflow for EVERY task:

### Phase 1: ANALYZE (MANDATORY FIRST STEP)

1. **Pull Latest Context**:

   ```jsonc
   {
     "tool": "query",
     "type": "context",
     "repository": "kuzumem-mcp",
     "branch": "current_branch",
     "latest": true,
     "limit": 5,
   }
   ```

2. **Search for Relevant Code** (if applicable):

   ```jsonc
   {
     "tool": "search",
     "query": "search terms related to task",
     "repository": "kuzumem-mcp",
     "entityTypes": ["component", "decision", "rule", "file"],
     "limit": 10,
   }
   ```

3. **Analyze Dependencies** (for component work):

   ```jsonc
   {
     "tool": "query",
     "type": "dependencies",
     "componentId": "comp-TargetComponent",
     "direction": "both",
     "repository": "kuzumem-mcp",
     "branch": "current_branch",
   }
   ```

4. **Update Context** with analysis findings

### Phase 2: BLUEPRINT

1. **Create a Decision Entity**:

   ```jsonc
   {
     "tool": "entity",
     "operation": "create",
     "entityType": "decision",
     "data": {
       "id": "dec-YYYYMMDD-task-slug",
       "name": "Implementation Plan: [Task Description]",
       "date": "YYYY-MM-DD",
       "status": "proposed",
       "context": "Numbered plan:\n1. Step one\n2. Step two\n3. ...",
       "affects": ["comp-AffectedComponent1", "comp-AffectedComponent2"],
     },
     "repository": "kuzumem-mcp",
     "branch": "current_branch",
   }
   ```

2. **Tag the Decision**:

   ```jsonc
   {
     "tool": "associate",
     "type": "tag-item",
     "tagId": "tag-architecture", // or tag-performance, tag-security
     "itemId": "dec-YYYYMMDD-task-slug",
     "entityType": "Decision",
     "repository": "kuzumem-mcp",
     "branch": "current_branch",
   }
   ```

3. **WAIT for user approval** - Do NOT proceed until user responds with "APPROVED"

### Phase 3: CONSTRUCT

For EACH step in your approved plan:

1. **Execute the code change**

2. **Create/Update Component entities** for new/modified components:

   ```jsonc
   {
     "tool": "entity",
     "operation": "create", // or "update"
     "entityType": "component",
     "data": {
       "id": "comp-ComponentName",
       "name": "Component Display Name",
       "kind": "service|module|handler|repository|tool",
       "status": "active",
       "depends_on": ["comp-Dependency1", "comp-Dependency2"],
       "description": "What this component does",
       "metadata": {
         "file_paths": ["src/path/to/component.ts"],
         "created": "YYYY-MM-DD",
         "modified": "YYYY-MM-DD",
       },
     },
     "repository": "kuzumem-mcp",
     "branch": "current_branch",
   }
   ```

3. **Associate files with components**:

   ```jsonc
   {
     "tool": "associate",
     "type": "file-component",
     "fileId": "file-src-path-to-component-ts-v1",
     "componentId": "comp-ComponentName",
     "repository": "kuzumem-mcp",
     "branch": "current_branch",
   }
   ```

4. **Update context** after EACH step

### Phase 4: VALIDATE

1. **Run tests** using appropriate commands
2. **Run linters** if applicable
3. **Search for potential issues**:

   ```jsonc
   {
     "tool": "detect",
     "type": "cycles",
     "repository": "kuzumem-mcp",
     "branch": "current_branch",
     "projectedGraphName": "validation-check",
     "nodeTableNames": ["Component"],
     "relationshipTableNames": ["DEPENDS_ON"],
   }
   ```

4. **Update Decision status**:

   ```jsonc
   {
     "tool": "entity",
     "operation": "update",
     "entityType": "decision",
     "id": "dec-YYYYMMDD-task-slug",
     "data": {
       "status": "implemented", // or "failed" if tests fail
     },
     "repository": "kuzumem-mcp",
     "branch": "current_branch",
   }
   ```

5. **Final context update** with validation results

### Phase 5: ROLLBACK (Only on catastrophic failure)

1. Revert code changes
2. Update affected entities with `status: "deprecated"`
3. Create context log explaining the rollback
4. Return to ANALYZE phase

## TOOL USAGE RULES

### The 12 Unified Tools (USE ONLY THESE)

1. **memory-bank**: Repository initialization and metadata
2. **entity**: ALL CRUD operations for components, decisions, rules, files, tags
3. **introspect**: Database exploration (labels, count, properties, indexes)
4. **context**: Session logging (update operation only)
5. **query**: Graph traversal (context, entities, relationships, dependencies, governance, history, tags)
6. **associate**: Create relationships (file-component, tag-item)
7. **analyze**: Graph algorithms (pagerank, k-core, louvain, shortest-path)
8. **detect**: Pattern detection (cycles, islands, path, strongly-connected, weakly-connected)
9. **bulk-import**: Batch entity import (components, decisions, rules)
10. **search**: Full-text search across entities
11. **delete**: Entity removal (single, bulk - USE WITH EXTREME CAUTION)
12. **memory-optimizer**: AI-powered optimization (analyze, optimize, rollback, list-snapshots)

### ID Format Rules (MUST FOLLOW EXACTLY)

| Entity Type | Format                         | Example                          |
| ----------- | ------------------------------ | -------------------------------- |
| Component   | `comp-<CamelCase>`             | `comp-MemoryService`             |
| Decision    | `dec-YYYYMMDD-<slug>`          | `dec-20250120-unified-tools`     |
| Rule        | `rule-<category>-<slug>`       | `rule-security-auth`             |
| File        | `file-<path-with-dashes>-v<n>` | `file-src-services-memory-ts-v1` |
| Tag         | `tag-<category>`               | `tag-performance`                |

### Dependency Rules

1. EVERY new Component MUST list ALL its dependencies in `depends_on`
2. NEVER create circular dependencies
3. Run cycle detection after creating/updating dependencies
4. Components are NEVER deleted - mark as `deprecated` instead

### Memory Optimization Rules

ONLY use memory-optimizer when:

1. Explicitly requested by user
2. Memory bank exceeds 1000 entities
3. Performance issues are reported

ALWAYS use conservative strategy unless explicitly told otherwise:

```jsonc
{
  "tool": "memory-optimizer",
  "operation": "analyze",
  "strategy": "conservative",
  "dryRun": true,
  "repository": "kuzumem-mcp",
  "branch": "current_branch",
}
```

## ERROR HANDLING DIRECTIVES

1. **On ANY tool error**:
   - Log full error in context
   - DO NOT retry more than once
   - Ask user for guidance

2. **On test failures**:
   - Stay in CONSTRUCT phase
   - Fix the issue
   - Re-run validation

3. **On unrecoverable errors**:
   - Enter ROLLBACK phase immediately
   - Document what went wrong
   - Return to ANALYZE with lessons learned

## FORBIDDEN ACTIONS

You MUST NEVER:

1. Skip the ANALYZE phase
2. Proceed without user approval after BLUEPRINT
3. Delete entities (use deprecation instead)
4. Create circular dependencies
5. Skip context updates
6. Use tool names not in the 12 unified tools list
7. Modify configuration files directly
8. Commit code without human review
9. Use memory-optimizer aggressive mode without explicit permission
10. Create entities without proper ID formatting

## QUICK REFERENCE: Common Patterns

### Finding what depends on a component

```jsonc
{
  "tool": "query",
  "type": "dependencies",
  "componentId": "comp-TargetComponent",
  "direction": "dependents",
  "repository": "kuzumem-mcp",
  "branch": "current_branch",
}
```

### Checking architectural decisions for a component

```jsonc
{
  "tool": "query",
  "type": "governance",
  "componentId": "comp-TargetComponent",
  "repository": "kuzumem-mcp",
  "branch": "current_branch",
}
```

### Finding critical components

```jsonc
{
  "tool": "analyze",
  "type": "pagerank",
  "repository": "kuzumem-mcp",
  "branch": "current_branch",
  "projectedGraphName": "importance-analysis",
  "nodeTableNames": ["Component"],
  "relationshipTableNames": ["DEPENDS_ON"],
}
```

### Safe bulk deletion pattern

```jsonc
// ALWAYS dry-run first
{
  "tool": "delete",
  "operation": "bulk-by-type",
  "targetType": "context",
  "dryRun": true,
  "repository": "kuzumem-mcp",
  "branch": "current_branch"
}
// Then confirm if results look correct
{
  "tool": "delete",
  "operation": "bulk-by-type",
  "targetType": "context",
  "confirm": true,
  "repository": "kuzumem-mcp",
  "branch": "current_branch"
}
```

## REMEMBER

1. Context is your memory - update it constantly
2. The graph is your map - query it before making changes
3. Decisions are your audit trail - document everything
4. Dependencies are your safety net - track them carefully
5. The workflow is your guardrail - follow it exactly

---

**VERSION**: 2.0
**LAST UPDATED**: 2025-01-20
**STATUS**: ACTIVE - These rules supersede all previous versions
