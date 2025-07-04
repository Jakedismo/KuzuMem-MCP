import { ToolHandlerContext } from '../mcp/types/sdk-custom';
import { ServiceContainer } from './core/service-container';
import {
  IContextService,
  IEntityService,
  IGraphAnalysisService,
  IGraphQueryService,
  IMetadataService,
  IServiceContainer,
} from './core/service-container.interface';
import { MemoryBankService } from './domain/memory-bank.service';

// Import operation modules
import { loggers } from '../utils/logger';

/**
 * Service for memory bank operations
 * Refactored to use ServiceContainer pattern for dependency injection
 * Eliminates circular dependencies and provides clean initialization order
 */
export class MemoryService {
  private logger = loggers.memoryService();
  private static instance: MemoryService;
  private static initializationPromise: Promise<MemoryService> | null = null;

  // Service container for dependency injection (optional until initialized)
  private serviceContainer?: IServiceContainer;

  // Services property removed to eliminate API confusion
  // Use getServices() method instead for consistent async access to all services

  /**
   * Get all services with consistent async interface
   *
   * This is the recommended way to access multiple services. All service instances
   * are properly initialized and ready for use when returned.
   *
   * @returns Promise resolving to an object containing all service instances
   * @example
   * ```typescript
   * const services = await memoryService.getServices();
   * await services.entity.createComponent(data);
   * await services.graphQuery.findComponents(filters);
   * ```
   */
  public async getServices() {
    return {
      memoryBank: await this.memoryBank,
      metadata: await this.metadata,
      entity: await this.entity,
      context: await this.context,
      graphQuery: await this.graphQuery,
      graphAnalysis: await this.graphAnalysis,
    };
  }

  // Lazy-loaded service getters - ALL now return Promises for consistency

  /**
   * Get MemoryBankService instance
   * Returns Promise<MemoryBankService> for consistency with other service getters
   */
  public get memoryBank(): Promise<MemoryBankService> {
    if (!this.serviceContainer) {
      throw new Error('MemoryService not initialized - call getInstance() first');
    }
    return this.serviceContainer.getMemoryBankService() as Promise<MemoryBankService>;
  }

  public get metadata(): Promise<IMetadataService> {
    if (!this.serviceContainer) {
      throw new Error('MemoryService not initialized - call getInstance() first');
    }
    return this.serviceContainer.getMetadataService();
  }

  public get entity(): Promise<IEntityService> {
    if (!this.serviceContainer) {
      throw new Error('MemoryService not initialized - call getInstance() first');
    }
    return this.serviceContainer.getEntityService();
  }

  public get context(): Promise<IContextService> {
    if (!this.serviceContainer) {
      throw new Error('MemoryService not initialized - call getInstance() first');
    }
    return this.serviceContainer.getContextService();
  }

  public get graphQuery(): Promise<IGraphQueryService> {
    if (!this.serviceContainer) {
      throw new Error('MemoryService not initialized - call getInstance() first');
    }
    return this.serviceContainer.getGraphQueryService();
  }

  public get graphAnalysis(): Promise<IGraphAnalysisService> {
    if (!this.serviceContainer) {
      throw new Error('MemoryService not initialized - call getInstance() first');
    }
    return this.serviceContainer.getGraphAnalysisService();
  }

  private constructor() {
    // No initialization here - will be done in initialize()
  }

  private async initialize(initialMcpContext?: ToolHandlerContext): Promise<void> {
    // Use logger if available, otherwise console for this early init log
    const logger = initialMcpContext?.logger || console;

    try {
      // Initialize the service container
      this.serviceContainer = await ServiceContainer.getInstance();

      logger.info(
        'MemoryService: Initialized with ServiceContainer - eliminates circular dependencies',
      );

      logger.info('MemoryService: All services configured with clean dependency injection');
    } catch (error: any) {
      const errorMessage = `Failed to initialize ServiceContainer: ${error?.message || error}`;
      logger.error(`[MemoryService.initialize] ${errorMessage}`, error);

      // Ensure MemoryService is left in a consistent state by clearing any partial state
      this.serviceContainer = undefined;

      // Re-throw to prevent incomplete initialization
      throw new Error(errorMessage);
    }
  }

  /**
   * Get or create KuzuDB client for a project root
   * Delegates to service container
   */
  public async getKuzuClient(mcpContext: ToolHandlerContext, clientProjectRoot: string) {
    if (!this.serviceContainer) {
      throw new Error('MemoryService not initialized - call getInstance() first');
    }
    return this.serviceContainer.getKuzuClient(mcpContext, clientProjectRoot);
  }

  /**
   * Get SnapshotService for a project root
   * Delegates to service container
   */
  public async getSnapshotService(mcpContext: ToolHandlerContext, clientProjectRoot: string) {
    if (!this.serviceContainer) {
      throw new Error('MemoryService not initialized - call getInstance() first');
    }
    return this.serviceContainer.getSnapshotService(mcpContext, clientProjectRoot);
  }

  /**
   * Get singleton instance of MemoryService
   * Thread-safe implementation using promise-based locking to prevent race conditions
   */
  static async getInstance(initialMcpContext?: ToolHandlerContext): Promise<MemoryService> {
    // Return existing instance if already created
    if (MemoryService.instance) {
      return MemoryService.instance;
    }

    // Return pending initialization promise if already in progress
    if (MemoryService.initializationPromise) {
      return MemoryService.initializationPromise;
    }

    // Create and store initialization promise to prevent concurrent initialization
    MemoryService.initializationPromise = (async (): Promise<MemoryService> => {
      try {
        // Double-check pattern: verify instance wasn't created while waiting
        if (MemoryService.instance) {
          return MemoryService.instance;
        }

        // Create and initialize the singleton instance
        const instance = new MemoryService();
        await instance.initialize(initialMcpContext);

        // Atomically assign the instance
        MemoryService.instance = instance;

        // Clear the initialization promise as we're done
        MemoryService.initializationPromise = null;

        return instance;
      } catch (error: any) {
        // Clear the initialization promise on failure to allow retry
        MemoryService.initializationPromise = null;

        // Log the error and re-throw
        const logger = initialMcpContext?.logger || console;
        logger.error('[MemoryService.getInstance] Failed to create MemoryService instance:', error);
        throw error;
      }
    })();

    return MemoryService.initializationPromise;
  }

  /**
   * Shutdown method to close all connections and cleanup resources
   */
  async shutdown(): Promise<void> {
    const logger = console;
    logger.info('[MemoryService.shutdown] Starting shutdown process');

    try {
      // Delegate shutdown to service container
      if (this.serviceContainer) {
        await this.serviceContainer.shutdown();
      }

      // Service instances are cleared by the service container

      logger.info('[MemoryService.shutdown] Shutdown completed successfully');
    } catch (error: any) {
      logger.error('[MemoryService.shutdown] Error during shutdown:', error);
      throw error;
    }
  }
}

// -----------------------------------------------------------------------------
// Ensure that any accidental console.log calls inside runtime paths emit to
// stderr instead of stdout so that the MCP JSON channel remains clean.
// We do it once here because MemoryService is loaded by all runtime servers
// very early on.
// -----------------------------------------------------------------------------
/* eslint-disable no-global-assign */
console.log = (...args: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.error(...args);
};
/* eslint-enable no-global-assign */
