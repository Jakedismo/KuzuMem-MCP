import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';
import { EnrichedRequestHandlerExtra } from '../../types/sdk-custom';

/**
 * Operation class for component dependents retrieval with streaming support
 */
export class ComponentDependentsOperation {
  /**
   * Execute the component dependents operation with streaming support
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      // Validate required args
      if (!repositoryName || !componentId) {
        return {
          error: 'Missing required parameters: repositoryName and componentId are required',
        };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting dependent analysis for ${componentId} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      // Assume memoryService.getComponentDependents might be an expensive operation
      // or could be refactored to internally stream/yield results.
      // For now, we'll call it and then can simulate progress if needed,
      // or directly return if the operation is quick.
      // The example in README2 shows paths, suggesting a traversal.

      // Create mock context for service calls
      const mockContext: EnrichedRequestHandlerExtra = {
        logger: console,
        session: {
          clientProjectRoot,
          repository: repositoryName,
          branch,
        },
        sendProgress: async () => {},
        memoryService: memoryService
      };

      // Placeholder for actual logic that might involve complex graph traversal and path reconstruction
      // which would be the source of multiple progressHandler.progress() calls.
      const allDependentsResult = await memoryService.getComponentDependents(
        mockContext,
        clientProjectRoot,
        repositoryName,
        branch,
        componentId,
      );

      const allDependents = allDependentsResult.dependents || [];

      const resultPayload = {
        status: 'complete',
        clientProjectRoot,
        repository: repositoryName,
        branch,
        componentId,
        totalDependents: allDependents.length,
        dependents: allDependents,
      };

      if (progressHandler) {
        // Send in_progress (could be chunked if data is large)
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${allDependents.length} dependent(s) for ${componentId}`,
          count: allDependents.length,
          dependents: allDependents, // Or a chunk of it
        });

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      // If no progressHandler, return the result directly (for non-SSE calls)
      return resultPayload;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get component dependents: ${errorMessage}`);
    }
  }
}
