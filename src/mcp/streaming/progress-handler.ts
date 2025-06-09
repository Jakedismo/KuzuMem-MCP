/**
 * Progress Handler Interface for Streaming Operations
 */
export interface ProgressHandler {
  progress(data: any): void;
  sendFinalResponse(data: any, isError: boolean): void;
}

/**
 * Transport interface for handling progress notifications
 */
export interface ProgressTransport {
  sendProgress(progress: any): Promise<void>;
}