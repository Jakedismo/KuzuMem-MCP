import {
  RequestHandlerExtra,
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/shared/protocol.js';
import { ProgressNotification } // Assuming ProgressNotification is the correct type for notifications/progress params
from '@modelcontextprotocol/sdk/types.js'; // Or specific schema import if available
import { MemoryService } from '../services/memory.service.js';
import {
  EnrichedRequestHandlerExtra,
  McpProgressNotification,
} from '../types/sdk-custom.js';

// TODO: Define a more specific type for toolArgs if possible
type ToolArgs = any;

/**
 * Creates an augmented context for tool handlers.
 *
 * @param sdkContext The base SDK-provided context.
 * @param toolArgs The arguments passed to the tool.
 * @param memoryService The memory service instance.
 * @param clientProjectRoot The root path of the client project.
 * @returns The enriched request handler context.
 */
export function createAugmentedContext(
  sdkContext: RequestHandlerExtra<ServerRequest, ServerNotification>,
  toolArgs: ToolArgs,
  memoryService: MemoryService,
  clientProjectRoot: string,
  // progressHandler is removed
): EnrichedRequestHandlerExtra {
  const { sessionId: sdkSessionId, requestId } = sdkContext;

  // Basic console logger
  const logger: EnrichedRequestHandlerExtra['logger'] = {
    debug: (...args) => console.debug(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  };

  return {
    ...sdkContext,
    logger,
    session: {
      clientProjectRoot,
      repository: toolArgs?.repository, // Assuming repository might be in toolArgs
      branch: toolArgs?.branch, // Assuming branch might be in toolArgs
      sdkSessionId,
    },
    memoryService,
    sendProgress: async (customProgress: McpProgressNotification) => {
      const progressToken = requestId;

      if (!progressToken) {
        logger.warn(
          'sendProgress called but sdkContext.requestId is missing. Progress not sent.',
          customProgress
        );
        return;
      }

      const progressPayload: ProgressNotification['params'] = {
        progressToken,
        progress: customProgress.percent ?? 0,
        total: 100, // Assuming percent is out of 100
        message: customProgress.message,
        // Passthrough fields
        ...(customProgress.status && { status: customProgress.status }),
        ...(customProgress.toolName && { toolName: customProgress.toolName }),
        ...(customProgress.data && { data: customProgress.data }),
      };

      try {
        await sdkContext.sendNotification({
          method: 'notifications/progress',
          params: progressPayload,
        });
      } catch (error) {
        logger.error('Failed to send SDK progress notification:', error, progressPayload);
      }
    },
  };
}
