import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';
import { EnrichedRequestHandlerExtra } from '../../types/sdk-custom';

/**
 * Creates a mock context for service calls
 */
function createMockContext(): EnrichedRequestHandlerExtra {
  return {
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    session: {
      clientProjectRoot: '',
      repository: '',
      branch: 'main',
    },
    sendProgress: async () => {},
    memoryService: {} as MemoryService,
  };
}

/**
 * Operation class for PageRank calculation with streaming support.
 */
export class PageRankOperation {
  /**
   * Execute the PageRank operation with streaming support.
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    projectedGraphName: string,
    nodeTableNames: string[],
    relationshipTableNames: string[],
    dampingFactor?: number,
    maxIterations?: number,
    memoryService?: MemoryService, // Make optional for flexibility, but check inside
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    if (!memoryService) {
      return { error: 'MemoryService instance is required for PageRankOperation' };
    }
    if (!repositoryName || !projectedGraphName || !nodeTableNames || !relationshipTableNames) {
      return { error: 'Missing required parameters for PageRank' };
    }

    try {
      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting PageRank for graph ${projectedGraphName} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      const params: any = {
        repository: repositoryName,
        branch: branch,
        projectedGraphName: projectedGraphName,
        nodeTableNames: nodeTableNames,
        relationshipTableNames: relationshipTableNames,
      };
      if (dampingFactor !== undefined) {
        params.dampingFactor = dampingFactor;
      }
      if (maxIterations !== undefined) {
        params.maxIterations = maxIterations;
      }

      const pageRankOutput = await memoryService.pageRank(createMockContext(), clientProjectRoot, params);

      const ranks = pageRankOutput?.results?.ranks || [];
      const resultStatus = pageRankOutput?.status || 'error';

      const resultPayload = {
        status: resultStatus,
        clientProjectRoot,
        repository: repositoryName,
        branch,
        projectedGraphName,
        results: {
          ranks: ranks,
        },
        message: pageRankOutput?.message,
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `PageRank calculation processing for ${projectedGraphName}. Ranks found: ${ranks.length}.`,
          ranksCount: ranks.length,
        });

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      if (resultStatus === 'error' && !progressHandler) {
        throw new Error(resultPayload.message || 'PageRank failed in operation.');
      }

      return resultPayload;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (progressHandler) {
        const errorPayload = { error: `PageRank failed: ${errorMessage}` };
        progressHandler.progress({
          ...errorPayload,
          status: 'error',
          message: errorPayload.error,
          isFinal: true,
        });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null; // Indicate error was handled via progress mechanism
      }
      throw new Error(`PageRank failed: ${errorMessage}`);
    }
  }
}
