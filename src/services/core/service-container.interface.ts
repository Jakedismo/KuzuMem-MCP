import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { SnapshotService } from '../snapshot.service';

/**
 * Service container interface for dependency injection
 * Eliminates circular dependencies by providing service access through interfaces
 */
export interface IServiceContainer {
  // Core infrastructure services
  getRepositoryProvider(): RepositoryProvider;
  getKuzuClient(mcpContext: ToolHandlerContext, clientProjectRoot: string): Promise<KuzuDBClient>;
  getSnapshotService(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
  ): Promise<SnapshotService>;

  // Domain service access methods (lazy-loaded)
  getMemoryBankService(): Promise<IMemoryBankService>;
  getMetadataService(): Promise<IMetadataService>;
  getEntityService(): Promise<IEntityService>;
  getContextService(): Promise<IContextService>;
  getGraphQueryService(): Promise<IGraphQueryService>;
  getGraphAnalysisService(): Promise<IGraphAnalysisService>;

  // Specialized entity service access methods (optional - for clients that need specific functionality)
  getComponentService?(): Promise<IComponentService>;
  getDecisionService?(): Promise<IDecisionService>;
  getRuleService?(): Promise<IRuleService>;
  getFileService?(): Promise<IFileService>;
  getTagService?(): Promise<ITagService>;
  getAssociationService?(): Promise<IAssociationService>;
  getBulkOperationsService?(): Promise<IBulkOperationsService>;

  // Lifecycle management
  shutdown(): Promise<void>;
}

/**
 * Service interfaces to break circular dependencies
 */
export interface IMemoryBankService {
  initMemoryBank(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch?: string,
  ): Promise<{ success: boolean; message?: string }>;

  getOrCreateRepository(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    name: string,
    branch?: string,
  ): Promise<any>;
}

export interface IMetadataService {
  updateMetadata(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    metadataContent: any,
    branch?: string,
  ): Promise<{ success: boolean; message?: string } | null>;

  getMetadata(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch?: string,
  ): Promise<any>;
}

// Component service interface - handles component-specific operations
export interface IComponentService {
  upsertComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentData: any,
  ): Promise<any>;
  getComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<any>;
  updateComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    updates: any,
  ): Promise<any>;
  deleteComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<boolean>;
}

// Decision service interface - handles decision-specific operations
export interface IDecisionService {
  upsertDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionData: any,
  ): Promise<any>;
  getDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<any>;
  updateDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
    updates: any,
  ): Promise<any>;
  deleteDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<boolean>;
}

// Rule service interface - handles rule-specific operations
export interface IRuleService {
  upsertRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    rule: any,
    branch?: string,
  ): Promise<any>;
  getRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
  ): Promise<any>;
  updateRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
    updates: any,
  ): Promise<any>;
  deleteRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
  ): Promise<boolean>;
}

// File service interface - handles file-specific operations
export interface IFileService {
  addFile(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileData: any,
  ): Promise<any>;
  getFile(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileId: string,
  ): Promise<any>;
  deleteFile(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileId: string,
  ): Promise<boolean>;
}

// Tag service interface - handles tag-specific operations
export interface ITagService {
  addTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagData: any,
  ): Promise<any>;
  getTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
  ): Promise<any>;
  deleteTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
  ): Promise<boolean>;
}

// Association service interface - handles relationships between entities
export interface IAssociationService {
  associateFileWithComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    fileId: string,
  ): Promise<any>;
  tagItem(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: string,
    tagId: string,
  ): Promise<any>;
}

// Bulk operations service interface - handles batch operations
export interface IBulkOperationsService {
  bulkDeleteByType(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    entityType: string,
    options?: any,
  ): Promise<any>;
  bulkDeleteByTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    options?: any,
  ): Promise<any>;
  bulkDeleteByBranch(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    targetBranch: string,
    options?: any,
  ): Promise<any>;
  bulkDeleteByRepository(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    options?: any,
  ): Promise<any>;
}

// Unified entity service interface - composes all entity services
export interface IEntityService
  extends
    IComponentService,
    IDecisionService,
    IRuleService,
    IFileService,
    ITagService,
    IAssociationService,
    IBulkOperationsService {
  // Additional operations that don't fit into specific entity categories
  deleteContext(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    contextId: string,
  ): Promise<boolean>;
}

export interface IContextService {
  updateContext(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;

  getLatestContexts(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch?: string,
    limit?: number,
  ): Promise<any>;
}

export interface IGraphQueryService {
  // Active components query
  getActiveComponents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch?: string,
  ): Promise<any>;

  countNodesByLabel(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    nodeLabel: string,
  ): Promise<any>;
  listNodesByLabel(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    nodeLabel: string,
    limit?: number,
    offset?: number,
  ): Promise<any>;
  getRelatedItems(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    opParams: any,
  ): Promise<any>;
  getComponentDependencies(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<any>;
  getComponentDependents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<any>;
  getGoverningItemsForComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<any>;
  getItemContextualHistory(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: string,
  ): Promise<any>;
  findItemsByTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    entityType?: string,
  ): Promise<any>;
  listAllNodeLabels(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
  ): Promise<any>;
  getNodeProperties(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    nodeLabel: string,
  ): Promise<any>;
  listAllIndexes(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    target?: string,
  ): Promise<any>;
}

export interface IGraphAnalysisService {
  pageRank(mcpContext: ToolHandlerContext, clientProjectRoot: string, params: any): Promise<any>;
  kCoreDecomposition(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;
  louvainCommunityDetection(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;
  shortestPath(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;
  getStronglyConnectedComponents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;
  getWeaklyConnectedComponents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;
}
