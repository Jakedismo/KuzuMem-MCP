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
 * Operation class for K-Core Decomposition with streaming support.
 */
export class KCoreDecompositionOperation {
  /**
   * Execute the K-Core Decomposition operation with streaming support.
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    projectedGraphName: string,
    nodeTableNames: string[],
    relationshipTableNames: string[],
    k: number,
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      if (!repositoryName || !projectedGraphName || !nodeTableNames || !relationshipTableNames) {
        return { error: 'Missing required parameters for K-Core Decomposition' };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting K-Core Decomposition (k=${k}) for graph ${projectedGraphName} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      // Call the MemoryService's kCoreDecomposition method with the correct signature
      const kCoreOutput = await memoryService.kCoreDecomposition(createMockContext(), clientProjectRoot, {
        repository: repositoryName,
        branch: branch,
        projectedGraphName: projectedGraphName,
        nodeTableNames: nodeTableNames,
        relationshipTableNames: relationshipTableNames,
        k: k,
      });

      // Ensure kCoreOutput and kCoreOutput.results are defined before accessing components
      const components = kCoreOutput?.results?.components || [];
      const resultStatus = kCoreOutput?.status || 'error'; // Default to error if status is not present

      const resultPayload = {
        status: resultStatus, // Use status from kCoreOutput
        clientProjectRoot,
        repository: repositoryName,
        branch,
        projectedGraphName,
        results: {
          k: k, // k is passed in, so it's known
          components: components,
        },
        message: kCoreOutput?.message, // Include message from output if available
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `K-Core Decomposition processing for ${repositoryName}/${branch}. Components found: ${components.length}.`,
          componentsCount: components.length,
        });

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
      }

      // If status is error and no progress handler, throw or return error structure
      if (resultStatus === 'error' && !progressHandler) {
        // Prefer throwing an error that the main tool handler can catch and format
        throw new Error(resultPayload.message || 'K-Core Decomposition failed in operation.');
      }

      return resultPayload;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (progressHandler) {
        const errorPayload = { error: `K-Core Decomposition failed: ${errorMessage}` };
        progressHandler.progress({
          ...errorPayload,
          status: 'error',
          message: errorPayload.error,
          isFinal: true,
        });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null;
      }
      throw new Error(`K-Core Decomposition failed: ${errorMessage}`);
    }
  }
}
