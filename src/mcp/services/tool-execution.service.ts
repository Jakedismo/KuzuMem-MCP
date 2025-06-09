import {
  // ServerNotification,
  // ServerRequest,
} from '@modelcontextprotocol/sdk/shared/protocol.js';
import { MemoryService } from '../../services/memory.service';
import { EnrichedRequestHandlerExtra } from '../types/sdk-custom';

// Align with tool handlers signature
type SdkToolHandler = (
  params: any,
  context: EnrichedRequestHandlerExtra,
) => Promise<any>;

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
   * Execute a tool
   */
  public async executeTool(
    toolName: string,
    toolArgs: any,
    toolHandlers: Record<string, SdkToolHandler>,
    clientProjectRoot: string,
    progressHandler?: any,
  ): Promise<any> {
    const memoryService = await this.ensureMemoryService();

    // Create context that matches what tool handlers expect
    const context: EnrichedRequestHandlerExtra = {
      logger: {
        debug: (msg: string, ...args: any[]) => console.debug(`[DEBUG] ${msg}`, ...args),
        info: (msg: string, ...args: any[]) => console.info(`[INFO] ${msg}`, ...args),
        warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args),
        error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
      },
      session: {
        clientProjectRoot,
        repository: toolArgs.repository || '',
        branch: toolArgs.branch || 'main',
      },
      sendProgress: async (progress: any) => {
        if (progressHandler && typeof progressHandler.progress === 'function') {
          progressHandler.progress(progress);
        }
      },
      memoryService,
    };

    try {
      const handler = toolHandlers[toolName];
      if (!handler) {
        const errorMsg = `Tool execution handler not implemented for '${toolName}'.`;
        context.logger.warn(`Tool handler not found: ${toolName}`);
        return { error: errorMsg };
      }

      // Execute the tool handler with the correct signature
      return await handler(toolArgs, context);
    } catch (err: any) {
      const errorMsg = `Error executing tool '${toolName}': ${err.message || String(err)}`;
      context.logger.error(errorMsg, err.stack);
      return { error: errorMsg };
    }
  }
}
