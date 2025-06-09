import { z } from 'zod';

// -------------------------------------
// init-memory-bank
// -------------------------------------
export const InitMemoryBankInputSchema = z.object({
  clientProjectRoot: z.string().min(1, { message: 'clientProjectRoot is required' }),
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
});

export const InitMemoryBankOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  dbPath: z.string().optional(), // Corresponds to the path used by the server
});

// -------------------------------------
// get-metadata
// -------------------------------------
export const GetMetadataInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  // clientProjectRoot is NOT part of input schema for this tool;
  // it will be retrieved from context.session by the handler.
});

// Output schema for the actual metadata content returned by the handler
// This matches the structure of the 'metadata' field in the old McpTool return type
export const MetadataContentSchema = z
  .object({
    id: z.string(), // e.g., "meta"
    project: z
      .object({
        name: z.string(),
        created: z.string().optional(), // date string
        description: z.string().optional(),
      })
      .optional(),
    tech_stack: z
      .object({
        language: z.string().optional(),
        framework: z.string().optional(),
        datastore: z.string().optional(),
      })
      .optional(),
    architecture: z.string().optional(),
    memory_spec_version: z.string().optional(),
    // Allow any other custom fields in content
  })
  .catchall(z.any());

export const GetMetadataOutputSchema = MetadataContentSchema; // Handler returns the metadata content directly

// -------------------------------------
// update-metadata
// -------------------------------------
export const UpdateMetadataInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  metadata: MetadataContentSchema, // The new metadata content to apply/merge
});

export const UpdateMetadataOutputSchema = z.object({
  success: z.boolean(),
  // The handler will return the updated metadata content directly
  metadata: MetadataContentSchema,
});

// -------------------------------------
// add-component
// -------------------------------------
export const ComponentStatusSchema = z.enum(['active', 'deprecated', 'planned']);

export const AddComponentInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  id: z.string().min(1, { message: 'id is required' }),
  name: z.string().min(1, { message: 'name is required' }),
  kind: z.string().optional(),
  status: ComponentStatusSchema.optional(),
  depends_on: z.array(z.string()).optional(),
  // clientProjectRoot is NOT part of input schema; retrieved from session.
});

// Output for add-component is typically just a success/message status
// If the component data is returned, it would be a different schema.
// The old tool returned a success/message and the component itself.
// For SDK, the handler should return the data that matches an output schema.
// Let's assume it returns the component data similar to GetEntity tools.
export const ComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string().optional().nullable(), // Kuzu might return null for optional unset string fields
  status: ComponentStatusSchema.optional().nullable(),
  depends_on: z.array(z.string()).optional().nullable(),
  // Include other fields that a Component node might have as per your evolved schema
  // For example, if you add 'description', 'created_at', 'updated_at' to Component nodes:
  // description: z.string().optional().nullable(),
  created_at: z.string().datetime({ offset: true }).optional().nullable(), // Added (ISO 8601 string)
  updated_at: z.string().datetime({ offset: true }).optional().nullable(), // Added (ISO 8601 string)
  repository: z.string(), // Reference to the repository owning this component
  branch: z.string(), // Reference to the branch
});

export const AddComponentOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(), // Optional message from server
  component: ComponentSchema.optional(), // Optionally return the created/updated component
});

// Example of a more complete Component output schema if get-component was defined
// export const GetComponentOutputSchema = ComponentSchema;

// -------------------------------------
// get-context
// -------------------------------------
export const GetContextInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  latest: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  // clientProjectRoot omitted (from session)
});

export const ContextSchema = z.object({
  id: z.string(),
  name: z.string().optional().nullable(), // As summary might be the primary content
  summary: z.string().optional().nullable(),
  iso_date: z.string(), // YYYY-MM-DD
  created_at: z.string().datetime({ message: 'Invalid datetime string' }).optional().nullable(),
  updated_at: z.string().datetime({ message: 'Invalid datetime string' }).optional().nullable(),
  agent: z.string().optional().nullable(),
  issue: z.string().optional().nullable(),
  decision_ids: z.array(z.string()).optional().nullable(), // If storing linked decision IDs
  observation_ids: z.array(z.string()).optional().nullable(), // If storing linked observation IDs
  // Schema evolution: Add fields for File and Tag associations if Context can link to them
  // file_ids: z.array(z.string()).optional().nullable(),
  // tag_ids: z.array(z.string()).optional().nullable(),
  repository: z.string(), // Reference to the repository ID (e.g., repoName:branch)
  branch: z.string(),
});

// get-context handler returns an array of Context objects
export const GetContextOutputSchema = z.array(ContextSchema);

// -------------------------------------
// update-context
// -------------------------------------
export const UpdateContextInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  id: z.string().optional(), // Optional: if not provided, might update/create based on date (today)
  name: z.string().optional(), // ADDED: Optional name for the context
  summary: z.string().optional(),
  agent: z.string().optional(),
  issue: z.string().optional(),
  decision: z.string().optional(),
  observation: z.string().optional(),
});

export const UpdateContextOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  context: ContextSchema.optional(), // Return the updated or created context object
});

// -------------------------------------
// add-decision (Simplified for now, align with evolved Decision schema)
// -------------------------------------
export const DecisionSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(), // YYYY-MM-DD
  context: z.string().optional().nullable(), // Narrative context
  status: z
    .enum(['proposed', 'accepted', 'rejected', 'deprecated', 'superseded'])
    .optional()
    .nullable(), // Evolved schema
  // Schema evolution: Add fields for linking to Components, Files, Tags
  // component_ids: z.array(z.string()).optional().nullable(),
  // file_ids: z.array(z.string()).optional().nullable(),
  // tag_ids: z.array(z.string()).optional().nullable(),
  repository: z.string(),
  branch: z.string(),
  created_at: z.string().datetime({ offset: true }).optional().nullable(), // Added
  updated_at: z.string().datetime({ offset: true }).optional().nullable(), // Added
});

export const AddDecisionInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  id: z.string().min(1, { message: 'id is required' }),
  name: z.string().min(1, { message: 'name is required' }),
  date: z.string().min(1, { message: 'date is required' }), // YYYY-MM-DD
  context: z.string().optional(),
  status: z.enum(['proposed', 'accepted', 'rejected', 'deprecated', 'superseded']).optional(),
  // clientProjectRoot omitted (from session)
});

export const AddDecisionOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  decision: DecisionSchema.optional(),
});

// -------------------------------------
// add-rule (Simplified for now, align with evolved Rule schema)
// -------------------------------------
export const RuleStatusSchema = z.enum(['active', 'deprecated', 'proposed']);

export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  created: z.string(), // YYYY-MM-DD
  content: z.string().optional().nullable(),
  status: RuleStatusSchema.optional().nullable(),
  triggers: z.array(z.string()).optional().nullable(),
  // Schema evolution: Add fields for linking to Components, Files, Tags
  // component_ids: z.array(z.string()).optional().nullable(),
  // file_ids: z.array(z.string()).optional().nullable(),
  // tag_ids: z.array(z.string()).optional().nullable(),
  repository: z.string(),
  branch: z.string(),
  created_at: z.string().datetime({ offset: true }).optional().nullable(), // Added
  updated_at: z.string().datetime({ offset: true }).optional().nullable(), // Added
});

export const AddRuleInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  id: z.string().min(1, { message: 'id is required' }),
  name: z.string().min(1, { message: 'name is required' }),
  created: z.string().min(1, { message: 'created date is required' }), // YYYY-MM-DD
  content: z.string().optional(),
  status: RuleStatusSchema.optional(),
  triggers: z.array(z.string()).optional(),
  // clientProjectRoot omitted (from session)
});

export const AddRuleOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  rule: RuleSchema.optional(),
});

// -------------------------------------
// get-component-dependencies
// -------------------------------------
export const GetComponentDependenciesInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  componentId: z.string().min(1, { message: 'componentId is required' }),
  // clientProjectRoot omitted (from session)
});

// Output from the *handler* should be the list of components or an object containing it.
// The McpServer will wrap this in the { content: [{type: 'text', text: JSON.stringify(handlerResult)}]} structure.
// Let's align with how other tools like get-context return the direct data (array of contexts).
// So, the handler for get-component-dependencies should return ComponentSchema[].
// The *old* server wrapped this further with a status. New SDK approach: handler returns data, McpServer wraps.
// However, our test assertions for the old server for this tool (and graph algos)
// checked for a custom wrapper like { status: 'complete', dependencies: [...] }.
// For SDK migration, the HANDLER should return ComponentSchema[].
// If the old wrapper structure is still desired in the final JSON sent to client,
// then the OutputSchema here would represent that wrapper that the *handler* must return.
// Given the pattern for get-context, let's assume handler returns the array directly.
// export const GetComponentDependenciesOutputSchema = z.array(ComponentSchema);
// UPDATE based on e2e test expectations: these tools had a wrapper with 'status' and the data field.
// So, the handler *should* return this wrapper object to match existing test assertions initially.
export const GetComponentDependenciesOutputSchema = z.object({
  status: z.string().optional().default('complete'),
  dependencies: z.array(ComponentSchema),
  message: z.string().optional(),
});

// -------------------------------------
// get-component-dependents
// -------------------------------------
export const GetComponentDependentsInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  componentId: z.string().min(1, { message: 'componentId is required' }),
});

// Similar to dependencies, handler should return the wrapper if tests expect it.
export const GetComponentDependentsOutputSchema = z.object({
  status: z.string().optional().default('complete'),
  dependents: z.array(ComponentSchema),
  message: z.string().optional(),
});

// -------------------------------------
// get-item-contextual-history
// -------------------------------------
export const GetItemContextualHistoryInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  itemId: z.string().min(1, { message: 'itemId is required' }),
  itemType: z.enum(['Component', 'Decision', 'Rule'], { message: 'Invalid itemType' }),
});

export const GetItemContextualHistoryOutputSchema = z.object({
  status: z.string().optional().default('complete'),
  contextHistory: z.array(ContextSchema), // ContextSchema was defined with get-context
  message: z.string().optional(),
});

// -------------------------------------
// get-governing-items-for-component
// -------------------------------------
export const GetGoverningItemsForComponentInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  componentId: z.string().min(1, { message: 'componentId is required' }),
});

export const GetGoverningItemsForComponentOutputSchema = z.object({
  status: z.string().optional().default('complete'),
  decisions: z.array(DecisionSchema), // DecisionSchema defined with add-decision
  rules: z.array(RuleSchema), // RuleSchema defined with add-rule
  // contextHistory: z.array(ContextSchema).optional(), // Kept old field, if server includes it
  message: z.string().optional(),
});

// -------------------------------------
// get-related-items
// -------------------------------------
export const GetRelatedItemsInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  startItemId: z.string().min(1, { message: 'startItemId is required' }),
  depth: z.number().int().positive().optional(),
  relationshipFilter: z.string().optional(),
  targetNodeTypeFilter: z.string().optional(),
});

// Output is complex: an array of items (any of Component, Decision, Rule, Context) and optionally paths
// For simplicity, let's define the output as an array of generic objects with id and type,
// and the handler can populate more fields. A more robust solution would use a discriminated union.
export const RelatedItemBaseSchema = z
  .object({
    id: z.string(),
    type: z.string(), // e.g., 'Component', 'Decision'
  })
  .catchall(z.any());

export const GetRelatedItemsOutputSchema = z.object({
  status: z.string().optional().default('complete'),
  relatedItems: z.array(RelatedItemBaseSchema),
  message: z.string().optional(),
});

// -------------------------------------
// Graph Algorithm Tools - Common Input parts
// -------------------------------------
// Most algorithm tools require a projected graph to operate on.
const GraphProjectionInputBaseSchema = z.object({
  projectedGraphName: z.string().min(1, { message: 'projectedGraphName is required' }),
  nodeTableNames: z.array(z.string()).min(1, { message: 'At least one nodeTableName is required' }),
  relationshipTableNames: z
    .array(z.string())
    .min(1, { message: 'At least one relationshipTableName is required' }),
});

// Base for algorithm inputs including repository, branch, and projection
const AlgoToolInputBaseSchema = z
  .object({
    repository: z.string().min(1, { message: 'repository is required' }),
    branch: z.string().min(1, { message: 'branch is required' }),
  })
  .merge(GraphProjectionInputBaseSchema);

// Base for algorithm outputs, usually a list of nodes with scores or community IDs etc.
// The actual data structure within 'results' will vary per algorithm.
const AlgoToolOutputBaseSchema = z.object({
  status: z.string().optional().default('complete'),
  clientProjectRoot: z
    .string()
    .describe('The client project root used for this operation.')
    .optional(), // Often returned for context
  repository: z.string().optional(),
  branch: z.string().optional(),
  projectedGraphName: z.string().optional(),
  message: z.string().optional(),
  // 'results' will be specific to each algorithm
});

// -------------------------------------
// k-core-decomposition
// -------------------------------------
export const KCoreDecompositionInputSchema = AlgoToolInputBaseSchema.extend({
  k: z.number().int().positive({ message: 'k must be a positive integer' }),
});

export const KCoreDecompositionOutputSchema = AlgoToolOutputBaseSchema.extend({
  results: z.object({
    k: z.number().int(),
    // Kuzu typically returns an array of {nodeInternalId, coreness} or similar.
    // Let's assume our handler standardizes to { nodeId: string, coreness: number }.
    components: z.array(
      z.object({
        nodeId: z.string(),
        coreness: z.number().int(),
      }),
    ),
  }),
});

// -------------------------------------
// louvain-community-detection
// -------------------------------------
export const LouvainCommunityDetectionInputSchema = AlgoToolInputBaseSchema; // No extra params beyond base

export const LouvainCommunityDetectionOutputSchema = AlgoToolOutputBaseSchema.extend({
  results: z.object({
    // Kuzu returns an array of {nodeInternalId, communityId} or similar.
    // Handler standardizes to { nodeId: string, communityId: number }.
    communities: z.array(
      z.object({
        nodeId: z.string(),
        communityId: z.number().int(),
      }),
    ),
    modularity: z.number().optional(), // Modularity score if available
  }),
});

// -------------------------------------
// pagerank
// -------------------------------------
export const PageRankInputSchema = AlgoToolInputBaseSchema.extend({
  dampingFactor: z.number().optional(),
  maxIterations: z.number().int().positive().optional(),
});

export const PageRankOutputSchema = AlgoToolOutputBaseSchema.extend({
  results: z.object({
    // Kuzu returns an array of {nodeInternalId, rank} or similar.
    // Handler standardizes to { nodeId: string, score: number }.
    ranks: z.array(
      z.object({
        nodeId: z.string(),
        score: z.number(),
      }),
    ),
  }),
});

// -------------------------------------
// strongly-connected-components
// -------------------------------------
export const StronglyConnectedComponentsInputSchema = AlgoToolInputBaseSchema; // No extra params beyond base

export const StronglyConnectedComponentsOutputSchema = AlgoToolOutputBaseSchema.extend({
  results: z.object({
    // Kuzu returns array of component sets. Each component is an array of node IDs.
    // Handler standardizes to an array of objects, each with a component_id and array of nodeIds.
    // This matches the old server output structure for this specific tool.
    components: z.array(
      z.object({
        component_id: z.number().int(),
        nodes: z.array(z.string()), // Array of node IDs
      }),
    ),
  }),
});

// -------------------------------------
// weakly-connected-components
// -------------------------------------
export const WeaklyConnectedComponentsInputSchema = AlgoToolInputBaseSchema; // No extra params beyond base

export const WeaklyConnectedComponentsOutputSchema = AlgoToolOutputBaseSchema.extend({
  results: z.object({
    // Similar to SCC, array of component sets.
    components: z.array(
      z.object({
        component_id: z.number().int(),
        nodes: z.array(z.string()), // Array of node IDs
      }),
    ),
  }),
});

// -------------------------------------
// shortest-path
// -------------------------------------
export const ShortestPathInputSchema = AlgoToolInputBaseSchema.extend({
  startNodeId: z.string().min(1, { message: 'startNodeId is required' }),
  endNodeId: z.string().min(1, { message: 'endNodeId is required' }),
  // costPropertyName: z.string().optional(), // If weighted paths are supported
});

export const ShortestPathOutputSchema = AlgoToolOutputBaseSchema.extend({
  results: z.object({
    pathFound: z.boolean(),
    // Path can be an array of nodes, or nodes and relationships.
    // For simplicity, assume array of node-like objects for now, matching old structure.
    path: z.array(
      z
        .object({
          id: z.string(),
          // Potentially other node properties if server includes them
        })
        .catchall(z.any()),
    ),
    // cost: z.number().optional(), // If weighted
  }),
});

// -------------------------------------
// Graph Introspection Tools (New)
// -------------------------------------

// -------------------------------------
// count_nodes_by_label
// -------------------------------------
export const CountNodesByLabelInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  label: z.string().min(1, { message: 'Node label is required' }),
});

export const CountNodesByLabelOutputSchema = z.object({
  label: z.string(),
  count: z.number().int(),
});

// -------------------------------------
// list_nodes_by_label
// -------------------------------------
export const ListNodesByLabelInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  label: z.string().min(1, { message: 'Node label is required' }),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});

// Output will be an array of nodes. The structure of these nodes will vary.
// We can use a generic object schema, or define specific schemas if we know the common node types.
// For now, a generic approach, assuming nodes at least have an 'id'.
export const GenericNodeSchema = z
  .object({
    id: z.string(),
    // Potentially other common properties like 'name', or allow any
  })
  .catchall(z.any());

export const ListNodesByLabelOutputSchema = z.object({
  label: z.string(),
  nodes: z.array(GenericNodeSchema),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
  totalInLabel: z.number().int().optional(), // Optional: total count of nodes with this label if available
});

// -------------------------------------
// get_node_properties (schema/structure for a label)
// -------------------------------------
export const GetNodePropertiesInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  label: z.string().min(1, { message: 'Node label is required' }),
});

// Output describes properties: name and type (e.g., from Kuzu's SHOW TABLE_TYPES or similar)
const PropertyDefinitionSchema = z.object({
  name: z.string(),
  type: z.string(), // e.g., 'STRING', 'INT64', 'LIST[STRING]'
  // isPrimaryKey: z.boolean().optional(), // If Kuzu provides this info
});

export const GetNodePropertiesOutputSchema = z.object({
  label: z.string(),
  properties: z.array(PropertyDefinitionSchema),
});

// -------------------------------------
// list_all_indexes
// -------------------------------------
export const ListAllIndexesInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  label: z.string().optional(), // Optionally filter indexes by node label if Kuzu supports it
});

const IndexDefinitionSchema = z.object({
  name: z.string(), // Index name
  tableName: z.string(), // Table (Node Label) the index is on
  propertyName: z.string(), // Property being indexed
  isPrimaryKey: z.boolean().optional(),
  indexType: z.string().optional(), // e.g., BTREE, HASH (if Kuzu provides)
});

export const ListAllIndexesOutputSchema = z.object({
  indexes: z.array(IndexDefinitionSchema),
});

// -------------------------------------
// File and Tagging Tools (New - based on evolved schema)
// -------------------------------------

// -------------------------------------
// add_file
// -------------------------------------
export const AddFileInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  id: z.string().min(1, { message: "File node ID is required (e.g., 'file-path/to/file.ts-v1')" }),
  name: z.string().min(1, { message: "File name is required (e.g., 'file.ts')" }),
  path: z.string().min(1, { message: 'File path is required' }),
  language: z.string().optional().describe('Primary programming language of the file'),
  metrics: z
    .record(z.string(), z.any())
    .optional()
    .describe('JSON object for various file metrics, e.g., line_count, complexity'),
  content_hash: z
    .string()
    .optional()
    .describe('SHA256 hash of the file content for versioning/caching'),
  mime_type: z.string().optional(),
  size_bytes: z.number().int().nonnegative().optional(),
});

export const FileNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  language: z.string().optional().nullable(), // Added
  metrics: z.record(z.string(), z.any()).optional().nullable(), // Added
  content_hash: z.string().optional().nullable(),
  mime_type: z.string().optional().nullable(),
  size_bytes: z.number().int().nonnegative().optional().nullable(),
  created_at: z
    .string()
    .datetime({ message: 'Invalid ISO8601 datetime string' })
    .optional()
    .nullable(),
  updated_at: z
    .string()
    .datetime({ message: 'Invalid ISO8601 datetime string' })
    .optional()
    .nullable(),
  repository: z.string(),
  branch: z.string(),
});

export const AddFileOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  file: FileNodeSchema.optional(),
});

// -------------------------------------
// associate_file_with_component (Example linking tool)
// Creates a CONTAINS_FILE relationship from Component to File
// -------------------------------------
export const AssociateFileWithComponentInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  componentId: z.string().min(1, { message: 'Component ID is required' }),
  fileId: z.string().min(1, { message: 'File ID is required' }),
});

export const AssociateFileWithComponentOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// -------------------------------------
// add_tag
// -------------------------------------
export const AddTagInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  id: z.string().min(1, { message: "Tag ID is required (e.g., 'tag-typescript')" }),
  name: z.string().min(1, { message: "Tag name is required (e.g., 'typescript')" }),
  color: z.string().optional().describe('Color associated with the tag, e.g., hex code'),
  description: z.string().optional(),
});

export const TagNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional().nullable(), // Added
  description: z.string().optional().nullable(),
  created_at: z
    .string()
    .datetime({ message: 'Invalid ISO8601 datetime string' })
    .optional()
    .nullable(),
  // Decide if tags are global or scoped. If scoped, add repo/branch here.
  // repository: z.string().optional().nullable(),
  // branch: z.string().optional().nullable(),
});

export const AddTagOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  tag: TagNodeSchema.optional(),
});

// -------------------------------------
// tag_item (Applies a Tag to an item like Component, Decision, Rule, File)
// Creates an IS_TAGGED_WITH relationship from the item to the Tag node.
// -------------------------------------
export const TagItemInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  itemId: z.string().min(1, { message: 'ID of the item to tag is required' }),
  itemType: z.enum(['Component', 'Decision', 'Rule', 'File', 'Context'], {
    message: 'Valid itemType required',
  }),
  tagId: z.string().min(1, { message: 'Tag ID to apply is required' }),
});

export const TagItemOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// -------------------------------------
// find_items_by_tag
// -------------------------------------
export const FindItemsByTagInputSchema = z.object({
  repository: z.string().min(1, { message: 'repository is required' }),
  branch: z.string().min(1, { message: 'branch is required' }),
  tagId: z.string().min(1, { message: 'Tag ID to search by is required' }),
  itemTypeFilter: z
    .enum(['Component', 'Decision', 'Rule', 'File', 'Context', 'All'])
    .optional()
    .default('All'),
});

// Output will be an array of items. Using GenericNodeSchema defined earlier for simplicity.
export const FindItemsByTagOutputSchema = z.object({
  tagId: z.string(),
  items: z.array(GenericNodeSchema),
});

export const ListAllLabelsInputSchema = z.object({
  repository: z.string().min(1, 'Repository name is required.'),
  branch: z.string().min(1, 'Branch name is required.'),
});

export const ListAllLabelsOutputSchema = z.object({
  labels: z.array(z.string()),
  status: z.string().optional(),
  message: z.string().optional(),
});
