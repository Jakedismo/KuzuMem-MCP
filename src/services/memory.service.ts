import * as path from 'path';
import { z } from 'zod';
import { RepositoryProvider } from '../db';
import { KuzuDBClient } from '../db/kuzu';
import * as toolSchemas from '../mcp/schemas/tool-schemas';
import { EnrichedRequestHandlerExtra } from '../mcp/types/sdk-custom';
import {
    Component,
    ComponentStatus,
    Context,
    Decision,
    Metadata,
    Repository,
    Rule
} from '../types';
import { Mutex } from '../utils/mutex';

// Import operation modules
import * as componentOps from './memory-operations/component.ops';
import * as contextOps from './memory-operations/context.ops';
import * as decisionOps from './memory-operations/decision.ops';
import * as fileOps from './memory-operations/file.ops';
import * as graphOps from './memory-operations/graph.ops';
import * as metadataOps from './memory-operations/metadata.ops';
import * as ruleOps from './memory-operations/rule.ops';
import * as tagOps from './memory-operations/tag.ops';

/**
 * Service for memory bank operations
 * Implements the singleton pattern as per best practices
 *
 * Refactored to use RepositoryProvider for repository management
 */
export class MemoryService {
  private static instance: MemoryService;
  private static lock = new Mutex();

  // Multi-root support
  private kuzuClients: Map<string, KuzuDBClient> = new Map();

  // Repository provider for managing repository instances
  private repositoryProvider: RepositoryProvider | null = null;

  private constructor() {
    // No initialization here - will be done in initialize()
  }

  private async initialize(initialMcpContext?: EnrichedRequestHandlerExtra): Promise<void> {
    // Do not attempt any database initialization in the initial setup
    // This will make the MemoryService lightweight during creation
    // The real database work will be done on-demand when specific methods are called with valid clientProjectRoot
    this.repositoryProvider = await RepositoryProvider.getInstance();
    
    // Use logger if available, otherwise console for this early init log
    const logger = initialMcpContext?.logger || console;
    logger.info('MemoryService: Initialized with RepositoryProvider - database access deferred until needed');
  }

  /**
   * Get a KuzuDBClient for the given client project root
   * Also initializes all repositories for this client if not already initialized
   *
   * @param clientProjectRoot The absolute path to the client project root
   * @returns Initialized KuzuDBClient instance
   */
  public async getKuzuClient(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
  ): Promise<KuzuDBClient> {
    process.stdout.write(
      `[STDOUT-DEBUG] MemoryService.getKuzuClient ENTERED with CPR: ${clientProjectRoot}\n`,
    );
    const logger = mcpContext.logger || console; // Fallback for safety, though context should always have logger
    
    // Validate clientProjectRoot - this is critical for correct operation
    if (!clientProjectRoot) {
      const error = new Error('clientProjectRoot is required but was undefined or empty');
      logger.error('[MemoryService.getKuzuClient] CRITICAL ERROR: clientProjectRoot is missing', error);
      throw error;
    }
    
    // Ensure path is absolute
    clientProjectRoot = this.ensureAbsoluteRoot(clientProjectRoot);
    logger.info(`[MemoryService.getKuzuClient] Using absolute clientProjectRoot: ${clientProjectRoot}`);
    
    // Check repository provider
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getKuzuClient] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }
    
    // Return cached client if available
    if (this.kuzuClients.has(clientProjectRoot)) {
      logger.info(`[MemoryService.getKuzuClient] Found cached KuzuDBClient for: ${clientProjectRoot}`);
      const cachedClient = this.kuzuClients.get(clientProjectRoot)!;
      return cachedClient;
    }
    
    // Create new client if needed
    logger.info(
      `[MemoryService.getKuzuClient] Creating new KuzuDBClient for: ${clientProjectRoot}`,
    );
    
    try {
      const newClient = new KuzuDBClient(clientProjectRoot); // KuzuDBClient constructor handles path joining for db file
      // Pass the mcpContext to allow for progress notifications during initialization
      await newClient.initialize(mcpContext); // This now also handles schema init
      this.kuzuClients.set(clientProjectRoot, newClient);
      await this.repositoryProvider.initializeRepositories(clientProjectRoot, newClient);
      logger.info(`[MemoryService.getKuzuClient] KuzuDBClient and repositories initialized for: ${clientProjectRoot}`);
      return newClient;
    } catch (error) {
      logger.error(`[MemoryService.getKuzuClient] Failed to initialize KuzuDBClient for ${clientProjectRoot}:`, error);
      throw new Error(`Failed to initialize database for project root ${clientProjectRoot}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static async getInstance(
    initialMcpContext?: EnrichedRequestHandlerExtra,
  ): Promise<MemoryService> {
    const release = await MemoryService.lock.acquire();
    try {
      if (!MemoryService.instance) {
        MemoryService.instance = new MemoryService();
        await MemoryService.instance.initialize(initialMcpContext);
      }
      return MemoryService.instance;
    } finally {
      release();
    }
  }

  /**
   * Initialize memory bank for a repository
   * Creates metadata with stub values if it doesn't exist
   */
  async initMemoryBank(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.InitMemoryBankOutputSchema>> {
    const logger = mcpContext.logger || console;
    console.error(
      `[DEBUG] MemoryService.initMemoryBank ENTERED. Repo: ${repositoryName}:${branch}, CPR: ${clientProjectRoot}`,
    );
    logger.info(
      `[MemoryService.initMemoryBank] ENTERED. Repo: ${repositoryName}:${branch}, CPR: ${clientProjectRoot}`,
    );
    clientProjectRoot = this.ensureAbsoluteRoot(clientProjectRoot);
    console.error(`[DEBUG] MemoryService.initMemoryBank Absolute CPR: ${clientProjectRoot}`);
    logger.info(`[MemoryService.initMemoryBank] Absolute CPR: ${clientProjectRoot}`);

    // Send progress update for path validation
    await mcpContext.sendProgress({
      status: 'in_progress',
      message: `Validating database path for ${repositoryName}:${branch}...`,
      percent: 25,
    });

    console.error(
      `[DEBUG] MemoryService.initMemoryBank checking repositoryProvider: ${!!this.repositoryProvider}`,
    );
    if (!this.repositoryProvider) {
      console.log(
        `[DEBUG] MemoryService.initMemoryBank CRITICAL: RepositoryProvider is NOT INITIALIZED`,
      );
      logger.error(
        '[MemoryService.initMemoryBank] CRITICAL: RepositoryProvider is NOT INITIALIZED before getKuzuClient call.',
      );
      return {
        success: false,
        message: 'Critical error: RepositoryProvider not initialized in MemoryService',
      };
    }
    console.log(
      `[DEBUG] MemoryService.initMemoryBank RepositoryProvider appears to be initialized. Proceeding.`,
    );
    logger.info(
      '[MemoryService.initMemoryBank] RepositoryProvider appears to be initialized. Proceeding.',
    );

    try {
      console.error(`[DEBUG] MemoryService.initMemoryBank ENTERING TRY BLOCK`);
      logger.info(
        `[MemoryService.initMemoryBank] Attempting to call this.getKuzuClient for CPR: ${clientProjectRoot}`,
      );
      
      // Send progress update for database client initialization
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Creating Kuzu database client for ${repositoryName}:${branch}...`,
        percent: 45,
      });
      
      console.error(`[DEBUG] MemoryService.initMemoryBank ABOUT TO CALL getKuzuClient`);
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      console.error(`[DEBUG] MemoryService.initMemoryBank getKuzuClient RETURNED:`, !!kuzuClient);
      logger.info(
        `[MemoryService.initMemoryBank] Successfully RETURNED from this.getKuzuClient for CPR: ${clientProjectRoot}`,
      );

      // Send progress update for repository initialization
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Initializing repository structure...`,
        percent: 60,
      });

      logger.info(`[MemoryService.initMemoryBank] Getting repository instances...`);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const metadataRepo = this.repositoryProvider.getMetadataRepository(clientProjectRoot);

      logger.info(
        `[MemoryService.initMemoryBank] Attempting to find repository ${repositoryName}:${branch}...`,
      );
      let repository = await repositoryRepo.findByName(repositoryName, branch);
      logger.info(`[MemoryService.initMemoryBank] findByName result:`, repository);

      // Send progress update for repository creation/verification
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `${repository ? 'Found' : 'Creating'} repository node for ${repositoryName}:${branch}...`,
        percent: 70,
      });

      if (!repository) {
        logger.info(`Repository ${repositoryName}:${branch} not found, creating...`);
        repository = await repositoryRepo.create({ name: repositoryName, branch });
        logger.info(`[MemoryService.initMemoryBank] create result:`, repository);
      }
      if (!repository || !repository.id) {
        logger.error(`Repository ${repositoryName}:${branch} could not be found or created.`);
        return {
          success: false,
          message: `Repository ${repositoryName}:${branch} could not be found or created.`,
        };
      }
      logger.info(`Repository node ID for ${repositoryName}:${branch} is ${repository.id}`);
      
      // Send progress update for metadata initialization
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Looking for existing metadata for ${repositoryName}:${branch}...`,
        percent: 80,
      });
      
      const existingMetadata = await metadataRepo.findMetadata(
        mcpContext,
        repositoryName,
        branch,
        'meta',
      );
      if (!existingMetadata) {
        await mcpContext.sendProgress({
          status: 'in_progress',
          message: `Creating initial metadata for ${repositoryName}:${branch}...`,
          percent: 85,
        });
        
        logger.info(`No existing metadata for ${repositoryName}:${branch}, creating stub...`);
        const today = new Date().toISOString().split('T')[0];
        const metadataToCreate = {
          repository: repository.id,
          branch: branch,
          id: 'meta',
          name: repositoryName,
          content: {
            id: 'meta',
            project: { name: repositoryName, created: today },
            tech_stack: { language: 'Unknown', framework: 'Unknown', datastore: 'Unknown' },
            architecture: 'unknown',
            memory_spec_version: '3.0.0',
          },
        } as Metadata;
        const createdMetadata = await metadataRepo.upsertMetadata(mcpContext, metadataToCreate);
        if (!createdMetadata) {
          throw new Error(`Failed to create metadata for ${repositoryName}:${branch}`);
        }
        logger.info(`Stub metadata created for ${repositoryName}:${branch}`);
      } else {
        logger.info(`Existing metadata found for ${repositoryName}:${branch}`);
      }
      
      // Send progress update for completion
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Finalizing memory bank initialization for ${repositoryName}:${branch}...`,
        percent: 90,
      });
      
      return {
        success: true,
        message: `Memory bank initialized for ${repositoryName} (branch: ${branch})`,
        dbPath: clientProjectRoot,
      };
    } catch (error: any) {
      console.error(`[DEBUG] MemoryService.initMemoryBank CAUGHT EXCEPTION:`, error);
      logger.error(`Error in initMemoryBank for ${repositoryName}:${branch}: ${error.message}`, {
        error: error.toString(),
        stack: error.stack,
      });
      
      // Send error progress notification
      try {
        await mcpContext.sendProgress({
          status: 'error',
          message: `Error initializing memory bank: ${error.message || 'Unknown error'}`,
          error: {
            message: error.message || 'Failed to initialize memory bank',
            details: error.stack,
          },
        });
      } catch (progressError: any) {
        logger.error(`Failed to send error progress: ${String(progressError)}`);
      }
      
      return { success: false, message: error.message || 'Failed to initialize memory bank' };
    }
  }

  /**
   * Get or create a repository by name
   */
  async getOrCreateRepository(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    name: string,
    branch: string = 'main',
  ): Promise<Repository | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('RepositoryProvider not initialized in getOrCreateRepository');
      throw new Error('RepositoryProvider not initialized');
    }
    await this.getKuzuClient(mcpContext, clientProjectRoot); // Pass mcpContext
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const existingRepo = await repositoryRepo.findByName(name, branch);
    if (existingRepo) {
      return existingRepo;
    }
    try {
      logger.info(`Creating new repository ${name}/${branch} at root ${clientProjectRoot}`);
      return await repositoryRepo.create({ name, branch });
    } catch (error: any) {
      logger.error(`Failed to create repository ${name}/${branch}: ${error.message}`, {
        error: error.toString(),
      });
      return null;
    }
  }

  /**
   * Get metadata for a repository
   */
  async getMetadata(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.GetMetadataOutputSchema> | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('RepositoryProvider not initialized in getMetadata');
      return null;
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const metadataRepo = this.repositoryProvider.getMetadataRepository(clientProjectRoot);

      const metadataContent = await metadataOps.getMetadataOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
        metadataRepo,
      );
      if (!metadataContent) {
        logger.warn(`Metadata not found for ${repositoryName}:${branch} by getMetadataOp`);
        return null;
      }
      return metadataContent as z.infer<typeof toolSchemas.GetMetadataOutputSchema>;
    } catch (error: any) {
      logger.error(`Error in getMetadata for ${repositoryName}:${branch}: ${error.message}`, {
        error: error.toString(),
      });
      return null;
    }
  }

  /**
   * Update metadata for a repository
   */
  async updateMetadata(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    metadataContentChanges: z.infer<typeof toolSchemas.MetadataContentSchema>,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.UpdateMetadataOutputSchema> | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('RepositoryProvider not initialized in updateMetadata');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const metadataRepo = this.repositoryProvider.getMetadataRepository(clientProjectRoot);

      const updatedContent = await metadataOps.updateMetadataOp(
        mcpContext,
        repositoryName,
        branch,
        metadataContentChanges,
        repositoryRepo,
        metadataRepo,
      );

      if (!updatedContent) {
        logger.warn(
          `Failed to update metadata for ${repositoryName}:${branch}. updateMetadataOp returned null.`,
        );
        return null;
      }
      logger.info(`Metadata updated successfully for ${repositoryName}:${branch}.`);
      return {
        success: true,
        metadata: updatedContent,
      };
    } catch (error: any) {
      logger.error(`Error in updateMetadata for ${repositoryName}:${branch}: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  }

  /**
   * Get today's context or create it if it doesn't exist
   */
  async getTodayContext(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.ContextSchema> | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getTodayContext] RepositoryProvider not initialized');
      return null;
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);
      const context = await contextOps.getTodayContextOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
        contextRepo,
      );
      if (!context) {
        logger.info(
          `[MemoryService.getTodayContext] No context found for today for ${repositoryName}:${branch}`,
        );
        return null;
      }
      logger.info(
        `[MemoryService.getTodayContext] Retrieved today's context for ${repositoryName}:${branch}`,
      );
      return context as z.infer<typeof toolSchemas.ContextSchema> | null;
    } catch (error: any) {
      logger.error(
        `[MemoryService.getTodayContext] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return null;
    }
  }

  /**
   * Update today's context
   */
  async updateTodayContext(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    contextUpdate: Partial<
      Omit<Context, 'repository' | 'id' | 'iso_date' | 'branch' | 'created_at' | 'updated_at'>
    > & {
      // Allow these to be passed directly for convenience, maps to Context fields
      issue?: string;
      decision?: string;
      observation?: string;
    },
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.ContextSchema> | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.updateTodayContext] RepositoryProvider not initialized');
      return null;
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[MemoryService.updateTodayContext] Repository ${repositoryName}:${branch} not found.`,
        );
        return null;
      }
      const todayIsoDate = new Date().toISOString().split('T')[0];
      let currentContextInternal = await contextRepo.getContextByDate(
        mcpContext,
        repositoryName,
        branch,
        todayIsoDate,
      );
      const effectiveName =
        contextUpdate.name ||
        contextUpdate.summary ||
        currentContextInternal?.name ||
        `context-${todayIsoDate}`;

      if (!currentContextInternal) {
        logger.info(
          `[MemoryService.updateTodayContext] No context for today, creating new one for ${repositoryName}:${branch}`,
        );
        const contextToCreate: Context = {
          repository: repository.id,
          branch: branch,
          id: `context-${todayIsoDate}`,
          name: effectiveName,
          iso_date: todayIsoDate,
          summary: contextUpdate.summary || '',
          agent: contextUpdate.agent,
          related_issue: contextUpdate.issue,
          decisions: contextUpdate.decision ? [contextUpdate.decision] : [],
          observations: contextUpdate.observation ? [contextUpdate.observation] : [],
          created_at: new Date(),
          updated_at: new Date(),
        } as Context;
        currentContextInternal = await contextRepo.upsertContext(mcpContext, contextToCreate);
      } else {
        logger.info(
          `[MemoryService.updateTodayContext] Updating existing context for today for ${repositoryName}:${branch}`,
        );
        const updatedData: Context = {
          ...currentContextInternal,
          name: effectiveName,
          summary:
            contextUpdate.summary !== undefined
              ? contextUpdate.summary
              : currentContextInternal.summary,
          agent:
            contextUpdate.agent !== undefined ? contextUpdate.agent : currentContextInternal.agent,
          related_issue:
            contextUpdate.issue !== undefined
              ? contextUpdate.issue
              : currentContextInternal.related_issue,
          decisions:
            contextUpdate.decision && currentContextInternal.decisions
              ? Array.from(new Set([...currentContextInternal.decisions, contextUpdate.decision]))
              : contextUpdate.decision
                ? [contextUpdate.decision]
                : currentContextInternal.decisions || [],
          observations:
            contextUpdate.observation && currentContextInternal.observations
              ? Array.from(
                  new Set([...currentContextInternal.observations, contextUpdate.observation]),
                )
              : contextUpdate.observation
                ? [contextUpdate.observation]
                : currentContextInternal.observations || [],
          updated_at: new Date(),
        };
        currentContextInternal = await contextRepo.upsertContext(mcpContext, updatedData);
      }
      if (!currentContextInternal) {
        logger.error(
          `[MemoryService.updateTodayContext] Failed to upsert context for ${repositoryName}:${branch}`,
        );
        return null;
      }
      logger.info(
        `[MemoryService.updateTodayContext] Context for today updated/created for ${repositoryName}:${branch}`,
      );
      return currentContextInternal as z.infer<typeof toolSchemas.ContextSchema>;
    } catch (error: any) {
      logger.error(
        `[MemoryService.updateTodayContext] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return null;
    }
  }

  /**
   * Get latest contexts
   */
  async getLatestContexts(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
    limit?: number,
  ): Promise<z.infer<typeof toolSchemas.GetContextOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getLatestContexts] RepositoryProvider not initialized');
      return [];
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[MemoryService.getLatestContexts] Repository ${repositoryName}:${branch} not found.`,
        );
        return [];
      }
      const contexts = await contextOps.getLatestContextsOp(
        mcpContext,
        repositoryName,
        branch,
        limit,
        repositoryRepo,
        contextRepo,
      );
      logger.info(
        `[MemoryService.getLatestContexts] Retrieved ${contexts.length} latest contexts for ${repositoryName}:${branch}`,
      );
      return contexts as z.infer<typeof toolSchemas.GetContextOutputSchema>;
    } catch (error: any) {
      logger.error(
        `[MemoryService.getLatestContexts] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return [];
    }
  }

  /**
   * Update today's context for a repository/branch (MCP tool compatibility)
   * Accepts summary, agent, decision, issue, observation. Merges with existing.
   */
  async updateContext(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.UpdateContextInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.UpdateContextOutputSchema> | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.updateContext] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);

      const updatedCtxNode = await contextOps.updateContextOp(
        mcpContext,
        params,
        repositoryRepo,
        contextRepo,
      );

      if (!updatedCtxNode) {
        logger.warn(
          `[MemoryService.updateContext] Failed to update context for ${params.repository}:${params.branch}. Ops function returned null.`,
        );
        return { success: false, message: 'Context not found or not updated', context: undefined };
      }
      logger.info(
        `[MemoryService.updateContext] Context updated successfully for ${params.repository}:${params.branch}`,
      );
      return {
        success: true,
        message: 'Context updated successfully',
        context: updatedCtxNode as z.infer<typeof toolSchemas.ContextSchema>,
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.updateContext] Error for ${params.repository}:${params.branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  /**
   * Create or update a rule for a repository
   */
  async upsertRule(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    rule: Omit<Rule, 'repository' | 'branch' | 'id'> & { id: string },
    branch: string = 'main',
  ): Promise<Rule | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.upsertRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);

    return ruleOps.upsertRuleOp(
      mcpContext,
      repositoryName,
      branch,
      rule as Rule,
      repositoryRepo,
      ruleRepo,
    ) as Promise<Rule | null>;
  }

  // Add new methods for tools, delegating to Ops
  async upsertComponent(
    mcpContext: EnrichedRequestHandlerExtra,
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
      logger.error('[MemoryService.upsertComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    // Construct the data object expected by componentOps.upsertComponentOp
    const componentOpData = {
      ...componentData,
      repository: repositoryName,
      branch: branch,
    };

    return componentOps.upsertComponentOp(
      mcpContext,
      repositoryName,
      branch,
      componentOpData,
      repositoryRepo,
      componentRepo,
    ) as Promise<Component | null>;
  }

  async upsertDecision(
    mcpContext: EnrichedRequestHandlerExtra,
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
      logger.error('[MemoryService.upsertDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);

    // Construct the data object expected by decisionOps.upsertDecisionOp
    const decisionOpData = {
      ...decisionData,
      repository: repositoryName,
      branch: branch,
    };

    return decisionOps.upsertDecisionOp(
      mcpContext,
      repositoryName,
      branch,
      decisionOpData as any,
      repositoryRepo,
      decisionRepo,
    ) as Promise<Decision | null>;
  }

  /**
   * Get all upstream dependencies for a component (transitive DEPENDS_ON)
   */
  async getComponentDependencies(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<z.infer<typeof toolSchemas.GetComponentDependenciesOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getComponentDependencies] RepositoryProvider not initialized');
      return { status: 'error', dependencies: [], message: 'RepositoryProvider not initialized' };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

      const dependencies = await componentOps.getComponentDependenciesOp(
        mcpContext,
        repositoryName,
        branch,
        componentId,
        repositoryRepo,
        componentRepo,
      );
      return {
        status: 'complete',
        dependencies: dependencies as z.infer<typeof toolSchemas.ComponentSchema>[],
      };
    } catch (error: any) {
      logger.error(`[MemoryService.getComponentDependencies] Error for ${componentId}:`, error);
      return {
        status: 'error',
        dependencies: [],
        message: error.message || 'Failed to get dependencies',
      };
    }
  }

  async getActiveComponents(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<Component[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getActiveComponents] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      logger.warn(
        `[MemoryService.getActiveComponents] Repository ${repositoryName}:${branch} not found.`,
      );
      return [];
    }
    return componentOps.getActiveComponentsOp(
      mcpContext,
      repository.id,
      branch,
      repositoryRepo,
      componentRepo,
    ) as Promise<Component[]>;
  }

  async getComponentDependents(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<z.infer<typeof toolSchemas.GetComponentDependentsOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getComponentDependents] RepositoryProvider not initialized');
      return { status: 'error', dependents: [], message: 'RepositoryProvider not initialized' };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const dependents = await componentOps.getComponentDependentsOp(
        mcpContext,
        repositoryName,
        branch,
        componentId,
        repositoryRepo,
        componentRepo,
      );
      return {
        status: 'complete',
        dependents: dependents as z.infer<typeof toolSchemas.ComponentSchema>[],
      };
    } catch (error: any) {
      logger.error(`[MemoryService.getComponentDependents] Error for ${componentId}:`, {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        status: 'error',
        dependents: [],
        message: error.message || 'Failed to get dependents',
      };
    }
  }

  async getItemContextualHistory(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: 'Component' | 'Decision' | 'Rule',
  ): Promise<z.infer<typeof toolSchemas.GetItemContextualHistoryOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getItemContextualHistory] RepositoryProvider not initialized');
      return { status: 'error', contextHistory: [], message: 'RepositoryProvider not initialized' };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams: z.infer<typeof toolSchemas.GetItemContextualHistoryInputSchema> = {
        repository: repositoryName,
        branch: branch,
        itemId: itemId,
        itemType: itemType,
      };

      logger.debug(
        '[MemoryService.getItemContextualHistory] Calling graphOps.getItemContextualHistoryOp with params:',
        graphOpsParams,
      );

      const contextItemsArray = await graphOps.getItemContextualHistoryOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      return {
        status: 'complete',
        contextHistory: contextItemsArray || [], // Ensure array even if op somehow returns null/undefined
        message:
          contextItemsArray && contextItemsArray.length > 0
            ? 'Successfully retrieved history.'
            : 'No history found.',
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.getItemContextualHistory] Error for ${itemType} ${itemId} in ${repositoryName}:${branch}:`,
        { error: error.toString(), stack: error.stack },
      );
      return {
        status: 'error',
        contextHistory: [],
        message: error.message || 'Failed to get history in MemoryService',
        // Do not add repo, branch, itemId, itemType here
      };
    }
  }

  async getGoverningItemsForComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<z.infer<typeof toolSchemas.GetGoverningItemsForComponentOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[MemoryService.getGoverningItemsForComponent] RepositoryProvider not initialized',
      );
      return {
        status: 'error',
        decisions: [],
        rules: [],
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams: z.infer<typeof toolSchemas.GetGoverningItemsForComponentInputSchema> = {
        repository: repositoryName,
        branch: branch,
        componentId: componentId,
      };

      logger.debug(
        '[MemoryService.getGoverningItemsForComponent] Calling graphOps.getGoverningItemsForComponentOp with params:',
        graphOpsParams,
      );

      const operationResult = await graphOps.getGoverningItemsForComponentOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      return operationResult;
    } catch (error: any) {
      logger.error(
        `[MemoryService.getGoverningItemsForComponent] Error for component ${componentId} in ${repositoryName}:${branch}:`,
        { error: error.toString(), stack: error.stack },
      );
      return {
        status: 'error',
        decisions: [],
        rules: [],
        message: error.message || 'Failed to get governing items in MemoryService',
      };
    }
  }

  async getRelatedItems(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    opParams: {
      projectedGraphName?: string;
      nodeTableNames?: string[];
      relationshipTableNames?: string[];
      depth?: number;
      relationshipFilter?: string;
      targetNodeTypeFilter?: string;
    },
  ): Promise<z.infer<typeof toolSchemas.GetRelatedItemsOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getRelatedItems] RepositoryProvider not initialized');
      return { status: 'error', relatedItems: [], message: 'RepositoryProvider not initialized' };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams: z.infer<typeof toolSchemas.GetRelatedItemsInputSchema> = {
        repository: repositoryName,
        branch: branch,
        startItemId: itemId,
        depth: opParams.depth,
        relationshipFilter: opParams.relationshipFilter,
        targetNodeTypeFilter: opParams.targetNodeTypeFilter,
      };

      logger.debug(
        '[MemoryService.getRelatedItems] Calling graphOps.getRelatedItemsOp with params:',
        graphOpsParams,
      );

      const operationResult = await graphOps.getRelatedItemsOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      return operationResult;
    } catch (error: any) {
      logger.error(
        `[MemoryService.getRelatedItems] Error for item ${itemId} in ${repositoryName}:${branch}:`,
        { error: error.toString(), stack: error.stack },
      );
      return {
        status: 'error',
        relatedItems: [],
        message: error.message || 'Failed to get related items in MemoryService',
      };
    }
  }

  // --- ALGORITHM METHODS (Corrected calls to NEW ops signatures) ---

  async kCoreDecomposition(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.KCoreDecompositionInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.KCoreDecompositionOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.kCoreDecomposition] RepositoryProvider not initialized');
      return {
        status: 'error',
        results: { k: params.k, components: [] },
        message: 'RepositoryProvider not initialized',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error(
          '[MemoryService.kCoreDecomposition] KuzuDBClient not found after getKuzuClient call.',
        );
        throw new Error('KuzuDBClient not found for this project root.');
      }

      const algorithmResults = await graphOps.kCoreDecompositionOp(mcpContext, kuzuClient, params);

      return {
        status: 'complete',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        results: algorithmResults,
        message: 'K-Core decomposition completed successfully.',
      };
    } catch (error: any) {
      logger.error(`[MemoryService.kCoreDecomposition] Error for ${params.projectedGraphName}:`, {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        status: 'error',
        results: { k: params.k, components: [] },
        message: error.message || 'K-Core failed in MemoryService',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
  }

  async louvainCommunityDetection(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.LouvainCommunityDetectionInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.LouvainCommunityDetectionOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.louvainCommunityDetection] RepositoryProvider not initialized');
      return {
        status: 'error',
        results: { communities: [], modularity: undefined },
        message: 'RepositoryProvider not initialized',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error(
          '[MemoryService.louvainCommunityDetection] KuzuDBClient not found after getKuzuClient call.',
        );
        throw new Error('KuzuDBClient not found for this project root.');
      }
      const algorithmResults = await graphOps.louvainCommunityDetectionOp(
        mcpContext,
        kuzuClient,
        params,
      );

      return {
        status: 'complete',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        results: algorithmResults,
        message: 'Louvain community detection completed successfully.',
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.louvainCommunityDetection] Error for ${params.projectedGraphName}:`,
        {
          error: error.toString(),
          stack: error.stack,
        },
      );
      return {
        status: 'error',
        results: { communities: [], modularity: undefined },
        message: error.message || 'Louvain failed in MemoryService',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
  }

  async pageRank(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.PageRankInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.PageRankOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.pageRank] RepositoryProvider not initialized');
      return {
        status: 'error',
        results: { ranks: [] },
        message: 'RepositoryProvider not initialized',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error('[MemoryService.pageRank] KuzuDBClient not found after getKuzuClient call.');
        throw new Error('KuzuDBClient not found for this project root.');
      }
      const algorithmResults = await graphOps.pageRankOp(mcpContext, kuzuClient, params);

      return {
        status: 'complete',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        results: algorithmResults,
        message: 'PageRank computed successfully',
      };
    } catch (error: any) {
      logger.error(`[MemoryService.pageRank] Error for ${params.projectedGraphName}:`, {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        status: 'error',
        results: { ranks: [] },
        message: error.message || 'PageRank failed in MemoryService',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
  }

  async getStronglyConnectedComponents(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.StronglyConnectedComponentsInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.StronglyConnectedComponentsOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[MemoryService.getStronglyConnectedComponents] RepositoryProvider not initialized',
      );
      return {
        status: 'error',
        results: { components: [] },
        message: 'RepositoryProvider not initialized',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error(
          '[MemoryService.getStronglyConnectedComponents] KuzuDBClient not found after getKuzuClient call.',
        );
        throw new Error('KuzuDBClient not found for this project root.');
      }
      const algorithmResults = await graphOps.stronglyConnectedComponentsOp(
        mcpContext,
        kuzuClient,
        params,
      );

      return {
        status: 'complete',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        results: algorithmResults,
        message: 'Strongly Connected Components found successfully.',
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.getStronglyConnectedComponents] Error for ${params.projectedGraphName}:`,
        {
          error: error.toString(),
          stack: error.stack,
        },
      );
      return {
        status: 'error',
        results: { components: [] },
        message: error.message || 'SCC failed in MemoryService',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
  }

  async getWeaklyConnectedComponents(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.WeaklyConnectedComponentsInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.WeaklyConnectedComponentsOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[MemoryService.getWeaklyConnectedComponents] RepositoryProvider not initialized',
      );
      return {
        status: 'error',
        results: { components: [] },
        message: 'RepositoryProvider not initialized',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error(
          '[MemoryService.getWeaklyConnectedComponents] KuzuDBClient not found after getKuzuClient call.',
        );
        throw new Error('KuzuDBClient not found for this project root.');
      }
      const algorithmResults = await graphOps.weaklyConnectedComponentsOp(
        mcpContext,
        kuzuClient,
        params,
      );

      return {
        status: 'complete',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        results: algorithmResults,
        message: 'Weakly Connected Components found successfully.',
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.getWeaklyConnectedComponents] Error for ${params.projectedGraphName}:`,
        {
          error: error.toString(),
          stack: error.stack,
        },
      );
      return {
        status: 'error',
        results: { components: [] },
        message: error.message || 'WCC failed in MemoryService',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
  }

  async shortestPath(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.ShortestPathInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.ShortestPathOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.shortestPath] RepositoryProvider not initialized');
      return {
        status: 'error',
        results: { pathFound: false, path: [] },
        message: 'RepositoryProvider not initialized',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error(
          '[MemoryService.shortestPath] KuzuDBClient not found after getKuzuClient call.',
        );
        throw new Error('KuzuDBClient not found for this project root.');
      }
      const algorithmResults = await graphOps.shortestPathOp(mcpContext, kuzuClient, params);

      return {
        status: 'complete',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        results: algorithmResults,
        message: algorithmResults.pathFound ? 'Shortest path found.' : 'Shortest path not found.',
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.shortestPath] Error for ${params.projectedGraphName} from ${params.startNodeId} to ${params.endNodeId}:`,
        {
          error: error.toString(),
          stack: error.stack,
        },
      );
      return {
        status: 'error',
        results: { pathFound: false, path: [] },
        message: error.message || 'ShortestPath failed in MemoryService',
        clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
      };
    }
  }

  async getDecisionsByDateRange(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
    startDate: string,
    endDate: string,
  ): Promise<z.infer<typeof toolSchemas.DecisionSchema>[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getDecisionsByDateRange] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);
      const decisions = await decisionOps.getDecisionsByDateRangeOp(
        mcpContext,
        repositoryName,
        branch,
        startDate,
        endDate,
        repositoryRepo,
        decisionRepo,
      );
      const repoId = `${repositoryName}:${branch}`;
      logger.info(
        `[MemoryService.getDecisionsByDateRange] Retrieved ${decisions.length} decisions for ${repoId} between ${startDate} and ${endDate}`,
      );
      return decisions.map((d) => ({ ...d, repository: repoId, branch })) as z.infer<
        typeof toolSchemas.DecisionSchema
      >[];
    } catch (error: any) {
      logger.error(
        `[MemoryService.getDecisionsByDateRange] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return [];
    }
  }

  async getActiveRules(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.RuleSchema>[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getActiveRules] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      // Ensure Kuzu client and repositories for this root are initialized
      await this.getKuzuClient(mcpContext, clientProjectRoot);

      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);

      const rules = await ruleOps.getActiveRulesOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
        ruleRepo,
      );
      const repoId = `${repositoryName}:${branch}`;
      logger.info(
        `[MemoryService.getActiveRules] Retrieved ${rules.length} active rules for ${repoId}`,
      );
      return rules.map((r) => ({ ...r, repository: repoId, branch })) as z.infer<
        typeof toolSchemas.RuleSchema
      >[];
    } catch (error: any) {
      logger.error(
        `[MemoryService.getActiveRules] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return [];
    }
  }

  // ------------------------------------------------------------------------
  // REFINED STUB METHODS FOR GRAPH INTROSPECTION TOOLS - WITH LOGGING
  // ------------------------------------------------------------------------

  async countNodesByLabel(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label: string,
  ): Promise<z.infer<typeof toolSchemas.CountNodesByLabelOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(`[MemoryService.countNodesByLabel] For ${label} in ${repositoryName}:${branch}`);
    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repoId = `${repositoryName}:${branch}`;
    const sanitizedLabel = label.replace(/[^a-zA-Z0-9_]/g, '');
    if (!sanitizedLabel) {
      logger.error(
        '[MemoryService.countNodesByLabel] Invalid or empty label provided after sanitization.',
        { originalLabel: label },
      );
      return { label: label, count: -1 };
    }
    const query = `MATCH (n:\`${sanitizedLabel}\`) WHERE n.repository = $repoId AND n.branch = $branch RETURN count(n) AS node_count`;
    try {
      logger.debug(`[MemoryService.countNodesByLabel] Executing Kuzu query: ${query}`, { repoId });
      const result = await kuzuClient.executeQuery(query, { repoId });
      const count =
        result && result.length > 0 && result[0].node_count !== null
          ? Number(result[0].node_count)
          : 0;
      return { label: sanitizedLabel, count };
    } catch (error: any) {
      logger.error(
        `[MemoryService.countNodesByLabel] Error for ${label} in ${repoId}: ${error.message}`,
        { error: error.toString() },
      );
      throw new Error(
        `Failed to count nodes for label \\\'${sanitizedLabel}\\\': ${error.message}`,
      );
    }
  }

  async listNodesByLabel(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<z.infer<typeof toolSchemas.ListNodesByLabelOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(`[MemoryService.listNodesByLabel] For ${label} in ${repositoryName}:${branch}`, {
      limit,
      offset,
    });
    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repoId = `${repositoryName}:${branch}`;
    const sanitizedLabel = label.replace(/[^a-zA-Z0-9_]/g, '');
    if (!sanitizedLabel) {
      logger.error('[MemoryService.listNodesByLabel] Invalid or empty label.', {
        originalLabel: label,
      });
      return { label, nodes: [], limit, offset, totalInLabel: -1 };
    }
    const query = `MATCH (n:\`${sanitizedLabel}\`) WHERE n.repository = $repoId AND n.branch = $branch RETURN n SKIP $offset LIMIT $limit`;
    const countQuery = `MATCH (n:\`${sanitizedLabel}\`) WHERE n.repository = $repoId AND n.branch = $branch RETURN count(n) AS total`;
    try {
      logger.debug(`[MemoryService.listNodesByLabel] Query: ${query}, CountQuery: ${countQuery}`, {
        repoId,
        offset,
        limit,
      });
      const [nodesResult, countResult] = await Promise.all([
        kuzuClient.executeQuery(query, { repoId, offset, limit }),
        kuzuClient.executeQuery(countQuery, { repoId }),
      ]);
      const nodes = nodesResult
        ? nodesResult.map((n: any) => ({ id: n._id?.toString() || n.id?.toString(), ...n }))
        : [];
      const totalInLabel =
        countResult && countResult.length > 0 && countResult[0].total !== null
          ? Number(countResult[0].total)
          : 0;
      return { label: sanitizedLabel, nodes, limit, offset, totalInLabel };
    } catch (error: any) {
      logger.error(
        `[MemoryService.listNodesByLabel] Error for ${label} in ${repoId}: ${error.message}`,
        { error: error.toString() },
      );
      return { label: sanitizedLabel, nodes: [], limit, offset, totalInLabel: -1 };
    }
  }

  async getNodeProperties(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label: string,
  ): Promise<z.infer<typeof toolSchemas.GetNodePropertiesOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(`[MemoryService.getNodeProperties] For label ${label}`);
    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const sanitizedLabel = label.replace(/[^a-zA-Z0-9_]/g, '');
    if (!sanitizedLabel) {
      logger.error('[MemoryService.getNodeProperties] Invalid or empty label.', {
        originalLabel: label,
      });
      return { label, properties: [] };
    }
    const query = `CALL TABLE_INFO('${sanitizedLabel.replace(/'/g, "''")}')`;
    try {
      logger.debug(`[MemoryService.getNodeProperties] Query: ${query}`);
      const result = await kuzuClient.executeQuery(query, {});
      const properties = result
        ? result.map((row: any) => ({ name: row.name, type: row.type }))
        : [];
      return { label: sanitizedLabel, properties };
    } catch (error: any) {
      logger.error(`[MemoryService.getNodeProperties] Error for ${label}: ${error.message}`, {
        error: error.toString(),
      });
      return { label: sanitizedLabel, properties: [] };
    }
  }

  async listAllIndexes(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label?: string,
  ): Promise<z.infer<typeof toolSchemas.ListAllIndexesOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(`[MemoryService.listAllIndexes] Label filter: ${label}`);
    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const query = `SHOW INDEXES;`;
    try {
      logger.debug(`[MemoryService.listAllIndexes] Query: ${query}`);
      const result = await kuzuClient.executeQuery(query, {});
      let indexesData = result
        ? result.map((row: any) => ({
            name: row.index_name || row.name || 'N/A',
            tableName: row.table_name || row.table,
            propertyName: Array.isArray(row.on_properties)
              ? row.on_properties.join(', ')
              : String(row.on_properties || row.property_name || ''),
            isPrimaryKey:
              typeof row.is_primary === 'boolean'
                ? row.is_primary
                : String(row.is_primary).toLowerCase() === 'true',
            indexType: row.type || 'UNKNOWN',
          }))
        : [];
      if (label) {
        const sanitizedLabel = label.replace(/[^a-zA-Z0-9_]/g, '');
        indexesData = indexesData.filter(
          (idx: { tableName: string; [key: string]: any }) => idx.tableName === sanitizedLabel,
        );
      }
      return { indexes: indexesData };
    } catch (error: any) {
      logger.error(`[MemoryService.listAllIndexes] Error: ${error.message}`, {
        error: error.toString(),
      });
      return { indexes: [] };
    }
  }

  // ------------------------------------------------------------------------
  // REFINED STUB METHODS FOR FILE AND TAGGING TOOLS - WITH LOGGING
  // ------------------------------------------------------------------------

  async addFile(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileData: z.infer<typeof toolSchemas.AddFileInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.AddFileOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(`[MemoryService.addFile] For path ${fileData.path} in ${repositoryName}:${branch}`);

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryId = `${repositoryName}:${branch}`; // As per plan

      // Call the actual operation function
      const createdFileNode = await fileOps.addFileOp(
        mcpContext,
        kuzuClient,
        repositoryId,
        branch, // Pass branch name explicitly as per addFileOp signature
        fileData,
      );

      if (createdFileNode) {
        logger.info(`[MemoryService.addFile] File ${createdFileNode.path} added/updated successfully in ${repositoryId}.`);
        return {
          success: true,
          message: 'File added/updated successfully.',
          file: createdFileNode,
        };
      } else {
        // This case might occur if addFileOp returns null without throwing an error
        logger.error(`[MemoryService.addFile] addFileOp returned null for ${fileData.path} in ${repositoryId}.`);
        throw new Error('Failed to add/update file: operation returned no data.');
      }
    } catch (error: any) {
      logger.error(
        `[MemoryService.addFile] Error processing file ${fileData.path} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString(), stack: error.stack },
      );
      // Rethrow the error to be handled by the tool handler, as per plan
      throw error;
    }
  }

  async associateFileWithComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    fileId: string,
  ): Promise<z.infer<typeof toolSchemas.AssociateFileWithComponentOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(
      `[MemoryService.associateFileWithComponent] Attempting for C:${componentId}, F:${fileId} in ${repositoryName}:${branch}`
    );

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryId = `${repositoryName}:${branch}`;

      const associationResult = await fileOps.associateFileWithComponentOp(
        mcpContext,
        kuzuClient,
        repositoryId,
        branch, // Pass branch name explicitly
        componentId,
        fileId
      );

      if (associationResult) {
        logger.info(
          `[MemoryService.associateFileWithComponent] Successfully associated C:${componentId} with F:${fileId} in ${repositoryId}.`
        );
        return { success: true, message: 'File associated successfully with component.' };
      } else {
        logger.warn(
          `[MemoryService.associateFileWithComponent] Failed to associate C:${componentId} with F:${fileId} in ${repositoryId}. Op returned false, possibly due to non-existent nodes.`
        );
        throw new Error('Failed to associate file with component. Ensure Component and File exist and match repository/branch.');
      }
    } catch (error: any) {
      logger.error(
        `[MemoryService.associateFileWithComponent] Error for C:${componentId}, F:${fileId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString(), stack: error.stack }
      );
      // Rethrow the error to be handled by the tool handler, as per plan
      throw error;
    }
  }

  async addTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagData: z.infer<typeof toolSchemas.AddTagInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.AddTagOutputSchema>> {
    const logger = mcpContext.logger || console;
    // Log includes repository and branch for context, even though tags are global
    logger.info(`[MemoryService.addTag] Attempting for tag '${tagData.name}' (id: ${tagData.id}) in context of ${repositoryName}:${branch}`);

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Prepare data for the tagOps.addTagOp function
      // It does not need repositoryName or branch as tags are global
      const tagInputForOp = {
        id: tagData.id,
        name: tagData.name,
        color: tagData.color, // Pass through, op will handle null/undefined
        description: tagData.description, // Pass through, op will handle null/undefined
      };

      const createdTagNode = await tagOps.addTagOp(mcpContext, kuzuClient, tagInputForOp);

      if (createdTagNode) {
        logger.info(`[MemoryService.addTag] Tag '${createdTagNode.name}' (id: ${createdTagNode.id}) processed successfully.`);
        return {
          success: true,
          message: 'Tag added/updated successfully.',
          tag: createdTagNode,
        };
      } else {
        // This case should ideally be covered by addTagOp throwing an error if it returns null unexpectedly
        logger.error(`[MemoryService.addTag] addTagOp returned null for tag '${tagData.name}' (id: ${tagData.id}). This indicates an issue in the op.`);
        throw new Error(`Failed to add/update tag '${tagData.name}': operation returned no data.`);
      }
    } catch (error: any) {
      logger.error(
        `[MemoryService.addTag] Error processing tag '${tagData.name}' (id: ${tagData.id}): ${error.message}`,
        { error: error.toString(), stack: error.stack },
      );
      // Rethrow the error to be handled by the tool handler, as per plan
      throw error;
    }
  }

  async tagItem(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: 'Component' | 'Decision' | 'Rule' | 'File' | 'Context',
    tagId: string,
  ): Promise<z.infer<typeof toolSchemas.TagItemOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(
      `[MemoryService.tagItem] Attempting for ${itemType}:${itemId} with Tag:${tagId} in ${repositoryName}:${branch}`
    );

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryId = `${repositoryName}:${branch}`;

      const success = await tagOps.tagItemOp(
        mcpContext,
        kuzuClient,
        repositoryId,
        branch, // Pass branch name explicitly
        itemId,
        itemType,
        tagId
      );

      if (success) {
        logger.info(
          `[MemoryService.tagItem] Successfully tagged ${itemType}:${itemId} with Tag:${tagId} in ${repositoryId}.`
        );
        return { success: true, message: 'Item tagged successfully.' };
      } else {
        logger.warn(
          `[MemoryService.tagItem] Failed to tag ${itemType}:${itemId} with Tag:${tagId} in ${repositoryId}. Op returned false (item or tag might not exist, or item not in specified repo/branch).`
        );
        throw new Error('Failed to tag item. Ensure item and tag exist, and item matches repository/branch.');
      }
    } catch (error: any) {
      logger.error(
        `[MemoryService.tagItem] Error for ${itemType}:${itemId} with Tag:${tagId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString(), stack: error.stack }
      );
      // Rethrow the error to be handled by the tool handler, as per plan
      throw error;
    }
  }

  async findItemsByTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    itemTypeFilter?: string,
  ): Promise<z.infer<typeof toolSchemas.FindItemsByTagOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(
      `[MemoryService.findItemsByTag] Attempting for Tag:${tagId}, Filter:${itemTypeFilter || 'All'} in ${repositoryName}:${branch}`
    );

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryId = `${repositoryName}:${branch}`;

      // Use 'All' if itemTypeFilter is null, undefined, or empty string
      const effectiveItemTypeFilter = itemTypeFilter || 'All';

      const items = await tagOps.findItemsByTagOp(
        mcpContext,
        kuzuClient,
        repositoryId,
        branch, // Pass branch name explicitly
        tagId,
        effectiveItemTypeFilter
      );

      // The items from findItemsByTagOp are already structured Records.
      // If they needed to be mapped to a more specific schema like GenericNodeSchema,
      // that mapping would happen here. For now, they are returned as is.
      logger.info(`[MemoryService.findItemsByTag] Found ${items.length} items for Tag:${tagId} with filter '${effectiveItemTypeFilter}'.`);
      return { tagId, items: items as z.infer<typeof toolSchemas.GenericNodeSchema>[] }; // Cast to schema type for return
    } catch (error: any) {
      logger.error(
        `[MemoryService.findItemsByTag] Error for Tag:${tagId}, Filter:${itemTypeFilter || 'All'} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString(), stack: error.stack }
      );
      // Rethrowing as per plan, tool handler can decide final response format.
      throw error;
    }
  }

  async listAllNodeLabels(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
  ): Promise<z.infer<typeof toolSchemas.ListAllLabelsOutputSchema>> {
    const logger = mcpContext.logger || console;
    clientProjectRoot = this.ensureAbsoluteRoot(clientProjectRoot);
    logger.info(
      `[MemoryService] Listing all node labels for ${repository}:${branch} at ${clientProjectRoot}`,
    );

    if (!this.repositoryProvider) {
      const errorMessage = '[MemoryService] RepositoryProvider not initialized.';
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    try {
      const repoRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const kuzuClient = repoRepo.getClient();

      const query = "CALL TABLE_INFO() RETURN name WHERE type = 'NODE' ORDER BY name;";
      const queryResult = await kuzuClient.executeQuery(query);

      const labels = queryResult.map((row: any) => row.name as string);

      logger.info(`[MemoryService] Found ${labels.length} labels for ${repository}:${branch}.`);
      return {
        labels,
        status: 'complete',
        message: `Successfully fetched ${labels.length} node labels.`,
      };
    } catch (error: any) {
      const errorMessage = `[MemoryService] Error listing node labels for ${repository}:${branch}: ${error.message}`;
      logger.error(errorMessage, { error: error.toString() });
      throw new Error(errorMessage);
    }
  }

  private ensureAbsoluteRoot(clientProjectRoot: string): string {
    if (!path.isAbsolute(clientProjectRoot)) {
      return path.resolve(clientProjectRoot);
    }
    return clientProjectRoot;
  }
}
