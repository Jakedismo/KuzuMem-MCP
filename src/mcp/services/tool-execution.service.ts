import {
  // ServerNotification,
  // ServerRequest,
} from '@modelcontextprotocol/sdk/shared/protocol.js';
import { ToolHandler } from '../types';
import { MemoryService } from '../../services/memory.service';
// import { ProgressHandler } from '../streaming/progress-handler'; // Removed
import { createAugmentedContext } from '../utils/context-utils.js';
import { EnrichedRequestHandlerExtra } from '../types/sdk-custom.js';

/**
 * Singleton service for executing tools with progress support
 */
export class ToolExecutionService {
  private static instance: ToolExecutionService;
  private memoryService: MemoryService | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of ToolExecutionService
   */
  public static async getInstance(): Promise<ToolExecutionService> {
    if (!ToolExecutionService.instance) {
      ToolExecutionService.instance = new ToolExecutionService();
    }
    return ToolExecutionService.instance;
  }

  /**
   * Initialize the memory service if not already initialized
   */
  private async ensureMemoryService(): Promise<MemoryService> {
    if (!this.memoryService) {
      this.memoryService = await MemoryService.getInstance();
    }
    return this.memoryService;
  }

  /**
   * Execute a tool with progress support
   */
  public async executeTool(
    toolName: string,
    toolArgs: any,
    toolHandlers: Record<string, ToolHandler>,
    clientProjectRoot: string, // Will be part of EnrichedRequestHandlerExtra.session
    sdkContext: RequestHandlerExtra<ServerRequest, ServerNotification>,
    // progressHandler is removed
    // debugLog is removed, use logger from augmentedContext
  ): Promise<any> {
    const memoryService = await this.ensureMemoryService();

    // Create the augmented context
    const augmentedContext = createAugmentedContext(
      sdkContext,
      toolArgs,
      memoryService,
      clientProjectRoot
      // progressHandler is no longer passed
    );

    try {
      const handler = toolHandlers[toolName];
      if (!handler) {
        const errorMsg = `Tool execution handler not implemented for '${toolName}'.`;
        // The call to augmentedContext.sendProgress is removed from here.
        // The server will send a final error response based on this return.
        augmentedContext.logger.warn(`Tool handler not found: ${toolName}`); // Log it internally
        return { error: errorMsg };
      }

      // Execute the tool handler with the new augmented context.
      // Tool handlers are now expected to have the signature:
      // `async (params: SomeParams, context: EnrichedRequestHandlerExtra)`
      return await handler(toolArgs, augmentedContext);
    } catch (err: any) {
      const errorMsg = `Error executing tool '${toolName}': ${err.message || String(err)}`;
      augmentedContext.logger.error(errorMsg, err.stack);

      // The call to augmentedContext.sendProgress is removed from here.
      // The server will send a final error response based on this return.
      return { error: errorMsg };
    }
  }
}
