import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import {
  Component,
  ComponentStatus,
  Decision,
  FileInput,
  File as FileRecord,
  Rule,
  RuleInput,
  Tag,
  TagInput,
} from '../../types';
import { CoreService } from '../core/core.service';
import { IEntityService, IServiceContainer } from '../core/service-container.interface';
import * as componentOps from '../memory-operations/component.ops';
import * as decisionOps from '../memory-operations/decision.ops';
import * as fileOps from '../memory-operations/file.ops';
import * as ruleOps from '../memory-operations/rule.ops';
import * as tagOps from '../memory-operations/tag.ops';

/**
 * Entity Service with full database functionality restored
 */
export class EntityService extends CoreService implements IEntityService {
  constructor(serviceContainer: IServiceContainer) {
    super(serviceContainer);
  }
  // Component operations
  async upsertComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentData: {
      id: string;
      name: string;
      kind?: string;
      status?: ComponentStatus;
      depends_on?: string[];
    },
  ): Promise<Component | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.upsertComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

      const component = await componentOps.upsertComponentOp(
        mcpContext,
        repositoryName,
        branch,
        componentData,
        repositoryRepo,
        componentRepo,
      );

      logger.info(
        `[EntityService.upsertComponent] Component ${componentData.id} upserted successfully in ${repositoryName}:${branch}`,
      );
      return component;
    } catch (error: any) {
      logger.error(
        `[EntityService.upsertComponent] Error upserting component ${componentData.id} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<Component | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.getComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);
      const component = await componentRepo.findByIdAndBranch(repositoryName, componentId, branch);
      return component;
    } catch (error: any) {
      logger.error(
        `[EntityService.getComponent] Error getting component ${componentId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async updateComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    updates: Partial<Component>,
  ): Promise<Component | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.updateComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

      // For updates, we need to get the existing component first, then upsert with updates
      const existingComponent = await componentRepo.findByIdAndBranch(
        repositoryName,
        componentId,
        branch,
      );
      if (!existingComponent) {
        logger.warn(
          `[EntityService.updateComponent] Component ${componentId} not found in ${repositoryName}:${branch}`,
        );
        return null;
      }

      const updatedData = {
        id: componentId,
        name: updates.name || existingComponent.name,
        kind: updates.kind || existingComponent.kind || undefined,
        status: updates.status || existingComponent.status || undefined,
        depends_on: updates.depends_on || existingComponent.depends_on,
      };

      const component = await componentOps.upsertComponentOp(
        mcpContext,
        repositoryName,
        branch,
        updatedData,
        repositoryRepo,
        componentRepo,
      );

      logger.info(
        `[EntityService.updateComponent] Component ${componentId} updated successfully in ${repositoryName}:${branch}`,
      );
      return component;
    } catch (error: any) {
      logger.error(
        `[EntityService.updateComponent] Error updating component ${componentId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async deleteComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const result = await componentOps.deleteComponentOp(
        mcpContext,
        kuzuClient,
        repositoryRepo,
        repositoryName,
        branch,
        componentId,
      );

      logger.info(
        `[EntityService.deleteComponent] Component ${componentId} deletion result: ${result} in ${repositoryName}:${branch}`,
      );
      return result;
    } catch (error: any) {
      logger.error(
        `[EntityService.deleteComponent] Error deleting component ${componentId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  // Decision operations
  async upsertDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionData: {
      id: string;
      name: string;
      date: string;
      context?: string;
    },
  ): Promise<Decision | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.upsertDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);

      const decisionInput = {
        ...decisionData,
        repository: repositoryName,
        branch,
      };

      const decision = await decisionOps.upsertDecisionOp(
        mcpContext,
        repositoryName,
        branch,
        decisionInput,
        repositoryRepo,
        decisionRepo,
      );

      logger.info(
        `[EntityService.upsertDecision] Decision ${decisionData.id} upserted successfully in ${repositoryName}:${branch}`,
      );
      return decision;
    } catch (error: any) {
      logger.error(
        `[EntityService.upsertDecision] Error upserting decision ${decisionData.id} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<Decision | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.getDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);
      const decision = await decisionRepo.findByIdAndBranch(repositoryName, decisionId, branch);
      return decision;
    } catch (error: any) {
      logger.error(
        `[EntityService.getDecision] Error getting decision ${decisionId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async updateDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
    updates: Partial<Decision>,
  ): Promise<Decision | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.updateDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);

      // For updates, get existing decision first, then upsert with updates
      const existingDecision = await decisionRepo.findByIdAndBranch(
        repositoryName,
        decisionId,
        branch,
      );
      if (!existingDecision) {
        logger.warn(
          `[EntityService.updateDecision] Decision ${decisionId} not found in ${repositoryName}:${branch}`,
        );
        return null;
      }

      const updatedData: any = {
        id: decisionId,
        name: updates.name || existingDecision.name,
        date: updates.date || existingDecision.date,
        repository: repositoryName,
        branch,
      };

      // Only add context if it's not null
      if (updates.context !== undefined) {
        updatedData.context = updates.context;
      } else if (existingDecision.context !== null) {
        updatedData.context = existingDecision.context;
      }

      const decision = await decisionOps.upsertDecisionOp(
        mcpContext,
        repositoryName,
        branch,
        updatedData,
        repositoryRepo,
        decisionRepo,
      );

      logger.info(
        `[EntityService.updateDecision] Decision ${decisionId} updated successfully in ${repositoryName}:${branch}`,
      );
      return decision;
    } catch (error: any) {
      logger.error(
        `[EntityService.updateDecision] Error updating decision ${decisionId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async deleteDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const result = await decisionOps.deleteDecisionOp(
        mcpContext,
        kuzuClient,
        repositoryRepo,
        repositoryName,
        branch,
        decisionId,
      );

      logger.info(
        `[EntityService.deleteDecision] Decision ${decisionId} deletion result: ${result} in ${repositoryName}:${branch}`,
      );
      return result;
    } catch (error: any) {
      logger.error(
        `[EntityService.deleteDecision] Error deleting decision ${decisionId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  // Rule operations
  async upsertRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    rule: RuleInput,
    branch: string = 'main',
  ): Promise<Rule | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.upsertRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);

      const ruleResult = await ruleOps.upsertRuleOp(
        mcpContext,
        repositoryName,
        branch,
        rule,
        repositoryRepo,
        ruleRepo,
      );

      logger.info(
        `[EntityService.upsertRule] Rule ${rule.id} upserted successfully in ${repositoryName}:${branch}`,
      );
      return ruleResult;
    } catch (error: any) {
      logger.error(
        `[EntityService.upsertRule] Error upserting rule ${rule.id} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
  ): Promise<Rule | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.getRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);
      const rule = await ruleRepo.findByIdAndBranch(repositoryName, ruleId, branch);
      return rule;
    } catch (error: any) {
      logger.error(
        `[EntityService.getRule] Error getting rule ${ruleId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async updateRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
    updates: Partial<Rule>,
  ): Promise<Rule | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.updateRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);

      // For updates, get existing rule first, then upsert with updates
      const existingRule = await ruleRepo.findByIdAndBranch(repositoryName, ruleId, branch);
      if (!existingRule) {
        logger.warn(
          `[EntityService.updateRule] Rule ${ruleId} not found in ${repositoryName}:${branch}`,
        );
        return null;
      }

      const updatedData: any = {
        id: ruleId,
        name: updates.name || existingRule.name,
        created: updates.created || existingRule.created,
        repository: repositoryName,
        branch,
      };

      // Only add optional fields if they're not null
      if (updates.triggers !== undefined) {
        updatedData.triggers = updates.triggers;
      } else if (existingRule.triggers !== null) {
        updatedData.triggers = existingRule.triggers;
      }

      if (updates.content !== undefined) {
        updatedData.content = updates.content;
      } else if (existingRule.content !== null) {
        updatedData.content = existingRule.content;
      }

      if (updates.status || existingRule.status) {
        updatedData.status = updates.status || existingRule.status;
      }

      const rule = await ruleOps.upsertRuleOp(
        mcpContext,
        repositoryName,
        branch,
        updatedData,
        repositoryRepo,
        ruleRepo,
      );

      logger.info(
        `[EntityService.updateRule] Rule ${ruleId} updated successfully in ${repositoryName}:${branch}`,
      );
      return rule;
    } catch (error: any) {
      logger.error(
        `[EntityService.updateRule] Error updating rule ${ruleId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async deleteRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const result = await ruleOps.deleteRuleOp(
        mcpContext,
        kuzuClient,
        repositoryRepo,
        repositoryName,
        branch,
        ruleId,
      );

      logger.info(
        `[EntityService.deleteRule] Rule ${ruleId} deletion result: ${result} in ${repositoryName}:${branch}`,
      );
      return result;
    } catch (error: any) {
      logger.error(
        `[EntityService.deleteRule] Error deleting rule ${ruleId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  // File operations
  async addFile(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileData: FileInput,
  ): Promise<any> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.addFile] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const fileRepo = this.repositoryProvider.getFileRepository(clientProjectRoot);

      const fileResult = await fileOps.addFileOp(
        mcpContext,
        repositoryName,
        branch,
        fileData,
        repositoryRepo,
        fileRepo,
      );

      logger.info(
        `[EntityService.addFile] File ${fileData.id} added successfully in ${repositoryName}:${branch}`,
      );
      return {
        success: fileResult.success,
        message: fileResult.message,
        entity: fileResult.file,
      };
    } catch (error: any) {
      logger.error(
        `[EntityService.addFile] Error adding file ${fileData.id} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getFile(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileId: string,
  ): Promise<FileRecord | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.getFile] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const fileRepo = this.repositoryProvider.getFileRepository(clientProjectRoot);
      // Get repository first to get the repo node ID
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(`[EntityService.getFile] Repository ${repositoryName}:${branch} not found.`);
        return null;
      }

      const file = await fileRepo.findFileById(repository.id, branch, fileId);
      return file;
    } catch (error: any) {
      logger.error(
        `[EntityService.getFile] Error getting file ${fileId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async deleteFile(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteFile] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const result = await fileOps.deleteFileOp(
        mcpContext,
        kuzuClient,
        repositoryRepo,
        repositoryName,
        branch,
        fileId,
      );

      logger.info(
        `[EntityService.deleteFile] File ${fileId} deletion result: ${result} in ${repositoryName}:${branch}`,
      );
      return result;
    } catch (error: any) {
      logger.error(
        `[EntityService.deleteFile] Error deleting file ${fileId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  // Tag operations
  async addTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagData: TagInput,
  ): Promise<any> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.addTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const tagRepo = this.repositoryProvider.getTagRepository(clientProjectRoot);

      const tagResult = await tagOps.addTagOp(
        mcpContext,
        repositoryName,
        branch,
        tagData,
        repositoryRepo,
        tagRepo,
      );

      logger.info(
        `[EntityService.addTag] Tag ${tagData.id} added successfully in ${repositoryName}:${branch}`,
      );
      return {
        success: tagResult.success,
        message: tagResult.message,
        entity: tagResult.tag,
      };
    } catch (error: any) {
      logger.error(
        `[EntityService.addTag] Error adding tag ${tagData.id} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
  ): Promise<Tag | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.getTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const tagRepo = this.repositoryProvider.getTagRepository(clientProjectRoot);
      const tag = await tagRepo.findTagById(tagId);
      return tag;
    } catch (error: any) {
      logger.error(
        `[EntityService.getTag] Error getting tag ${tagId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async deleteTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const result = await tagOps.deleteTagOp(mcpContext, kuzuClient, tagId);

      logger.info(
        `[EntityService.deleteTag] Tag ${tagId} deletion result: ${result} in ${repositoryName}:${branch}`,
      );
      return result;
    } catch (error: any) {
      logger.error(
        `[EntityService.deleteTag] Error deleting tag ${tagId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  // Context operations
  async deleteContext(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    contextId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteContext] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[EntityService.deleteContext] Repository ${repositoryName}:${branch} not found.`,
        );
        return false;
      }

      const graphUniqueId = `${repositoryName}:${branch}:${contextId}`;
      const deleteQuery = `
        MATCH (c:Context {graph_unique_id: $graphUniqueId})
        DETACH DELETE c
        RETURN 1 as deletedCount
      `;

      const result = await kuzuClient.executeQuery(deleteQuery, { graphUniqueId });
      const success = result.length > 0;

      logger.info(
        `[EntityService.deleteContext] Context ${contextId} deletion result: ${success} in ${repositoryName}:${branch}`,
      );
      return success;
    } catch (error: any) {
      logger.error(
        `[EntityService.deleteContext] Error deleting context ${contextId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  // Association operations
  async associateFileWithComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    fileId: string,
  ): Promise<any> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.associateFileWithComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const componentGraphId = `${repositoryName}:${branch}:${componentId}`;

      // Note: File table uses 'id' as primary key, Component table uses 'graph_unique_id'
      // Schema: IMPLEMENTS relationship goes FROM Component TO File
      const associationQuery = `
        MATCH (f:File {id: $fileId})
        MATCH (c:Component {graph_unique_id: $componentGraphId})
        WHERE f.repository = $repositoryName AND f.branch = $branch
        MERGE (c)-[:IMPLEMENTS]->(f)
        RETURN f, c
      `;

      const result = await kuzuClient.executeQuery(associationQuery, {
        fileId,
        componentGraphId,
        repositoryName,
        branch,
      });

      const success = result.length > 0;
      logger.info(
        `[EntityService.associateFileWithComponent] File ${fileId} associated with component ${componentId}: ${success} in ${repositoryName}:${branch}`,
      );

      return {
        type: 'file-component',
        success,
        message: success
          ? 'File associated with component successfully'
          : 'Failed to associate file with component',
        association: {
          from: fileId,
          to: componentId,
          relationship: 'IMPLEMENTS',
        },
      };
    } catch (error: any) {
      logger.error(
        `[EntityService.associateFileWithComponent] Error associating file ${fileId} with component ${componentId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async tagItem(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: string,
    tagId: string,
  ): Promise<any> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.tagItem] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const itemGraphId = `${repositoryName}:${branch}:${itemId}`;

      // Note: Tag table uses 'id' as primary key, Component table uses 'graph_unique_id'
      const tagQuery = `
        MATCH (item:${itemType} {graph_unique_id: $itemGraphId})
        MATCH (tag:Tag {id: $tagId})
        WHERE tag.repository = $repositoryName AND tag.branch = $branch
        MERGE (item)-[:TAGGED_WITH]->(tag)
        RETURN item, tag
      `;

      const result = await kuzuClient.executeQuery(tagQuery, {
        itemGraphId,
        tagId,
        repositoryName,
        branch,
      });

      const success = result.length > 0;
      logger.info(
        `[EntityService.tagItem] ${itemType} ${itemId} tagged with ${tagId}: ${success} in ${repositoryName}:${branch}`,
      );

      return {
        type: 'item-tag',
        success,
        message: success ? 'Item tagged successfully' : 'Failed to tag item',
        association: {
          from: itemId,
          to: tagId,
          relationship: 'TAGGED_WITH',
        },
      };
    } catch (error: any) {
      logger.error(
        `[EntityService.tagItem] Error tagging ${itemType} ${itemId} with ${tagId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  // Bulk operations
  async bulkDeleteByType(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    entityType: string,
    options: { dryRun?: boolean; force?: boolean } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.bulkDeleteByType] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[EntityService.bulkDeleteByType] Repository ${repositoryName}:${branch} not found.`,
        );
        return {
          count: 0,
          entities: [],
          warnings: [`Repository ${repositoryName}:${branch} not found`],
        };
      }

      // Query to find entities of the specified type
      const findQuery = `
        MATCH (n:${entityType})
        WHERE n.repository = $repositoryName AND n.branch = $branch
        RETURN n.id as id, n.name as name
      `;

      const entities = await kuzuClient.executeQuery(findQuery, { repositoryName, branch });

      if (options.dryRun) {
        logger.info(
          `[EntityService.bulkDeleteByType] Dry run: Would delete ${entities.length} ${entityType} entities`,
        );
        return {
          count: entities.length,
          entities: entities.map((e: any) => ({ type: entityType, id: e.id, name: e.name })),
          warnings: [],
        };
      }

      // Perform actual deletion
      const deleteQuery = `
        MATCH (n:${entityType})
        WHERE n.repository = $repositoryName AND n.branch = $branch
        DETACH DELETE n
        RETURN count(n) as deletedCount
      `;

      const result = await kuzuClient.executeQuery(deleteQuery, { repositoryName, branch });
      const deletedCount = result[0]?.deletedCount || 0;

      logger.info(
        `[EntityService.bulkDeleteByType] Deleted ${deletedCount} ${entityType} entities in ${repositoryName}:${branch}`,
      );

      return {
        count: deletedCount,
        entities: entities.map((e: any) => ({ type: entityType, id: e.id, name: e.name })),
        warnings: [],
      };
    } catch (error: any) {
      logger.error(
        `[EntityService.bulkDeleteByType] Error deleting ${entityType} entities in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async bulkDeleteByTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    options: { dryRun?: boolean; force?: boolean } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.bulkDeleteByTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Find all entities tagged with the specified tag
      const findQuery = `
        MATCH (n)-[:TAGGED_WITH]->(t:Tag {id: $tagId})
        WHERE
          (n.repository = $repositoryName AND n.branch = $branch) OR
          (n.graph_unique_id STARTS WITH $repoPrefix)
        RETURN n.id as id, n.name as name, labels(n)[0] as type
      `;

      const repoPrefix = `${repositoryName}:${branch}:`;
      const entities = await kuzuClient.executeQuery(findQuery, {
        tagId,
        repositoryName,
        branch,
        repoPrefix,
      });

      if (options.dryRun) {
        logger.info(
          `[EntityService.bulkDeleteByTag] Dry run: Would delete ${entities.length} entities tagged with ${tagId}`,
        );
        return {
          count: entities.length,
          entities: entities.map((e: any) => ({ type: e.type, id: e.id, name: e.name })),
          warnings: [],
        };
      }

      // Delete entities one by one to handle different entity types
      let deletedCount = 0;
      for (const entity of entities) {
        try {
          const deleteQuery = `
            MATCH (n:${entity.type} {id: $id})
            WHERE
              (n.repository = $repositoryName AND n.branch = $branch) OR
              (n.graph_unique_id STARTS WITH $repoPrefix)
            DETACH DELETE n
            RETURN 1 as deleted
          `;

          const result = await kuzuClient.executeQuery(deleteQuery, {
            id: entity.id,
            repositoryName,
            branch,
            repoPrefix,
          });

          if (result.length > 0) {
            deletedCount++;
          }
        } catch (error: any) {
          logger.warn(`Failed to delete ${entity.type} ${entity.id}: ${error.message}`);
        }
      }

      logger.info(
        `[EntityService.bulkDeleteByTag] Deleted ${deletedCount} entities tagged with ${tagId} in ${repositoryName}:${branch}`,
      );

      return {
        count: deletedCount,
        entities: entities.map((e: any) => ({ type: e.type, id: e.id, name: e.name })),
        warnings: [],
      };
    } catch (error: any) {
      logger.error(
        `[EntityService.bulkDeleteByTag] Error deleting entities tagged with ${tagId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async bulkDeleteByBranch(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    targetBranch: string,
    options: { dryRun?: boolean; force?: boolean } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.bulkDeleteByBranch] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Find all entities in the target branch
      const entityTypes = ['Component', 'Decision', 'Rule', 'Context'];
      let allEntities: any[] = [];

      for (const entityType of entityTypes) {
        const findQuery = `
          MATCH (n:${entityType})
          WHERE n.repository = $repositoryName AND n.branch = $targetBranch
          RETURN n.id as id, n.name as name, '${entityType}' as type
        `;

        const entities = await kuzuClient.executeQuery(findQuery, { repositoryName, targetBranch });
        allEntities = allEntities.concat(entities);
      }

      if (options.dryRun) {
        logger.info(
          `[EntityService.bulkDeleteByBranch] Dry run: Would delete ${allEntities.length} entities from branch ${targetBranch}`,
        );
        return {
          count: allEntities.length,
          entities: allEntities.map((e: any) => ({ type: e.type, id: e.id, name: e.name })),
          warnings: [],
        };
      }

      // Delete all entities from the branch
      let totalDeleted = 0;
      for (const entityType of entityTypes) {
        const deleteQuery = `
          MATCH (n:${entityType})
          WHERE n.repository = $repositoryName AND n.branch = $targetBranch
          DETACH DELETE n
          RETURN count(n) as deletedCount
        `;

        const result = await kuzuClient.executeQuery(deleteQuery, { repositoryName, targetBranch });
        totalDeleted += result[0]?.deletedCount || 0;
      }

      logger.info(
        `[EntityService.bulkDeleteByBranch] Deleted ${totalDeleted} entities from branch ${targetBranch} in ${repositoryName}`,
      );

      return {
        count: totalDeleted,
        entities: allEntities.map((e: any) => ({ type: e.type, id: e.id, name: e.name })),
        warnings: [],
      };
    } catch (error: any) {
      logger.error(
        `[EntityService.bulkDeleteByBranch] Error deleting entities from branch ${targetBranch} in ${repositoryName}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async bulkDeleteByRepository(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    options: { dryRun?: boolean; force?: boolean } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.bulkDeleteByRepository] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Find all entities in the repository (all branches)
      const entityTypes = ['Component', 'Decision', 'Rule', 'Context'];
      let allEntities: any[] = [];

      for (const entityType of entityTypes) {
        const findQuery = `
          MATCH (n:${entityType})
          WHERE n.repository = $repositoryName
          RETURN n.id as id, n.name as name, n.branch as branch, '${entityType}' as type
        `;

        const entities = await kuzuClient.executeQuery(findQuery, { repositoryName });
        allEntities = allEntities.concat(entities);
      }

      if (options.dryRun) {
        logger.info(
          `[EntityService.bulkDeleteByRepository] Dry run: Would delete ${allEntities.length} entities from repository ${repositoryName}`,
        );
        return {
          count: allEntities.length,
          entities: allEntities.map((e: any) => ({ type: e.type, id: e.id, name: e.name })),
          warnings: [],
        };
      }

      // Delete all entities from the repository
      let totalDeleted = 0;
      for (const entityType of entityTypes) {
        const deleteQuery = `
          MATCH (n:${entityType})
          WHERE n.repository = $repositoryName
          DETACH DELETE n
          RETURN count(n) as deletedCount
        `;

        const result = await kuzuClient.executeQuery(deleteQuery, { repositoryName });
        totalDeleted += result[0]?.deletedCount || 0;
      }

      logger.info(
        `[EntityService.bulkDeleteByRepository] Deleted ${totalDeleted} entities from repository ${repositoryName}`,
      );

      return {
        count: totalDeleted,
        entities: allEntities.map((e: any) => ({ type: e.type, id: e.id, name: e.name })),
        warnings: [],
      };
    } catch (error: any) {
      logger.error(
        `[EntityService.bulkDeleteByRepository] Error deleting entities from repository ${repositoryName}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async upsertRules(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    rules: RuleInput[],
    branch: string = 'main',
  ): Promise<Rule[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.upsertRules] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);

      const rulesResult = await ruleOps.upsertRulesOp(
        mcpContext,
        repositoryName,
        branch,
        rules,
        repositoryRepo,
        ruleRepo,
      );

      logger.info(
        `[EntityService.upsertRules] ${rulesResult.length} rules upserted successfully in ${repositoryName}:${branch}`,
      );
      return rulesResult;
    } catch (error: any) {
      logger.error(
        `[EntityService.upsertRules] Error upserting rules in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getAllRuleIds(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<string[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.getAllRuleIds] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);

      const ruleIds = await ruleOps.getAllRuleIdsOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
        ruleRepo,
      );

      logger.debug(
        `[EntityService.getAllRuleIds] Retrieved ${ruleIds.length} rule IDs for ${repositoryName}:${branch}`,
      );
      return ruleIds;
    } catch (error: any) {
      logger.error(
        `[EntityService.getAllRuleIds] Error retrieving rule IDs in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }
}
