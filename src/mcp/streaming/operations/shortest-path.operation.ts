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
 * Operation class for finding the shortest path between two nodes with streaming support.
 */
export class ShortestPathOperation {
  /**
   * Execute the shortest path operation with streaming support.
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    projectedGraphName: string,
    nodeTableNames: string[],
    relationshipTableNames: string[],
    startNodeId: string,
    endNodeId: string,
    additionalKuzuParams?: any, // Renamed for clarity, for options like costProperty
    memoryService?: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    if (!memoryService) {
      return { error: 'MemoryService instance is required for ShortestPathOperation' };
    }
    if (
      !repositoryName ||
      !projectedGraphName ||
      !nodeTableNames ||
      !relationshipTableNames ||
      !startNodeId ||
      !endNodeId
    ) {
      return { error: 'Missing required parameters for Shortest Path' };
    }

    try {
      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting shortest path search from ${startNodeId} to ${endNodeId} in graph ${projectedGraphName} (${repositoryName}:${branch}, Project: ${clientProjectRoot})`,
        });
      }

      const paramsForService = {
        repository: repositoryName,
        branch: branch,
        projectedGraphName: projectedGraphName,
        nodeTableNames: nodeTableNames,
        relationshipTableNames: relationshipTableNames,
        startNodeId: startNodeId,
        endNodeId: endNodeId,
        ...(additionalKuzuParams || {}), // Spread any additional Kuzu options
      };

      const shortestPathOutput = await memoryService.shortestPath(
        createMockContext(),
        clientProjectRoot,
        paramsForService,
      );

      const pathFound = shortestPathOutput?.results?.pathFound || false;
      const path = shortestPathOutput?.results?.path || [];
      // Kuzu's shortest path op might not directly return length, it's often len(path)-1 or based on cost.
      // For now, assume path is an array of nodes, so length can be path.length if pathFound.
      const pathLength = pathFound ? path.length : 0;
      const resultStatus = shortestPathOutput?.status || 'error';

      const resultPayload = {
        status: resultStatus,
        clientProjectRoot,
        repository: repositoryName,
        branch,
        projectedGraphName,
        startNodeId,
        endNodeId,
        results: {
          pathFound,
          path,
          length: pathLength, // Use calculated/derived length
        },
        message: shortestPathOutput?.message,
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Shortest path search processing for ${projectedGraphName}... Path found: ${pathFound}. Length: ${pathLength}`,
          pathFound: pathFound,
          path: path,
          length: pathLength,
        });

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      if (resultStatus === 'error' && !progressHandler) {
        throw new Error(resultPayload.message || 'Shortest path search failed in operation.');
      }

      return resultPayload;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (progressHandler) {
        const errorPayload = { error: `Shortest path search failed: ${errorMessage}` };
        progressHandler.progress({
          ...errorPayload,
          status: 'error',
          message: errorPayload.error,
          isFinal: true,
        });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null; // Indicate error was handled via progress mechanism
      }
      throw new Error(`Shortest path search failed: ${errorMessage}`);
    }
  }
}
