import type { MemoryService } from '../../services/memory.service';

/**
 * Represents a progress notification payload, typically used with sendProgress.
 */
export interface McpProgressNotification {
  status: string; // e.g., 'initializing', 'in-progress', 'component-found', 'processing', 'complete', 'error'
  message?: string;
  percent?: number;
  isFinal?: boolean; // Indicates if this is the last progress update for an operation
  toolName?: string; // Optional: name of the tool sending progress
  data?: any; // Optional: any additional data related to the progress
  error?: {
    // Optional: error details if progress update indicates an error
    message: string;
    code?: number;
    details?: any;
  };
}

/**
 * Simplified context object for tool handlers
 */
export interface EnrichedRequestHandlerExtra {
  logger: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
  session: {
    clientProjectRoot: string;
    repository: string;
    branch: string;
  };
  sendProgress: (progress: McpProgressNotification) => Promise<void>;
  memoryService: MemoryService;
}
