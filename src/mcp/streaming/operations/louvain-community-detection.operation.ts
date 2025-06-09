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
 * Operation class for Louvain Community Detection with streaming support.
 */
export class LouvainCommunityDetectionOperation {
  /**
   * Execute the Louvain Community Detection operation with streaming support.
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    projectedGraphName: string,
    nodeTableNames: string[],
    relationshipTableNames: string[],
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      if (!repositoryName || !projectedGraphName || !nodeTableNames || !relationshipTableNames) {
        return { error: 'Missing required parameters for Louvain Community Detection' };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting Louvain Community Detection for graph ${projectedGraphName} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      const params = {
        repository: repositoryName,
        branch: branch,
        projectedGraphName: projectedGraphName,
        nodeTableNames: nodeTableNames,
        relationshipTableNames: relationshipTableNames,
      };

      // Call the MemoryService's louvainCommunityDetection method with the correct signature
      const louvainOutput = await memoryService.louvainCommunityDetection(
        createMockContext(),
        clientProjectRoot,
        params,
      );

      const communities = louvainOutput?.results?.communities || [];
      const modularity = louvainOutput?.results?.modularity ?? null;
      const resultStatus = louvainOutput?.status || 'error';

      const resultPayload = {
        status: resultStatus,
        clientProjectRoot,
        repository: repositoryName,
        branch,
        projectedGraphName,
        results: {
          communities: communities,
          modularity: modularity,
        },
        message: louvainOutput?.message,
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Louvain Community Detection processing for ${repositoryName}/${branch}. Communities found: ${communities.length}. Modularity: ${modularity}.`,
          communitiesCount: communities.length,
          modularity: modularity,
        });

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      // If status is error and no progress handler, throw or return error structure
      if (resultStatus === 'error' && !progressHandler) {
        throw new Error(
          resultPayload.message || 'Louvain Community Detection failed in operation.',
        );
      }

      return resultPayload;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (progressHandler) {
        const errorPayload = { error: `Louvain Community Detection failed: ${errorMessage}` };
        progressHandler.progress({
          ...errorPayload,
          status: 'error',
          message: errorPayload.error,
          isFinal: true,
        });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null; // Indicate error was handled via progress mechanism
      }
      throw new Error(`Louvain Community Detection failed: ${errorMessage}`);
    }
  }
}
