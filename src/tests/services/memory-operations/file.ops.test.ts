import {
  addFileOp,
  associateFileWithComponentOp,
} from '../../../services/memory-operations/file.ops';
import { KuzuDBClient } from '../../../db/kuzu';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

// Mock the KuzuDBClient
jest.mock('../../../db/kuzu');

describe('File Operations', () => {
  let mockKuzuClient: jest.Mocked<KuzuDBClient>;
  let mockMcpContext: jest.Mocked<EnrichedRequestHandlerExtra>;

  beforeEach(() => {
    // Create mock KuzuDBClient with the actual method that exists
    mockKuzuClient = {
      executeQuery: jest.fn(),
    } as any;

    // Create mock MCP context
    mockMcpContext = {
      logger: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      signal: new AbortController().signal,
      requestId: 'test-request-id',
      sendNotification: jest.fn(),
      sendRequest: jest.fn(),
      session: {},
      sendProgress: jest.fn(),
      memoryService: {} as any,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addFileOp', () => {
    const repositoryId = 'test-repo:main';
    const branch = 'main';
    const fileData = {
      id: 'file-test-component',
      name: 'TestComponent.ts',
      path: '/src/components/TestComponent.ts',
      language: 'typescript',
      metrics: { lines: 100, complexity: 5 },
      content_hash: 'abc123',
      mime_type: 'text/typescript',
      size_bytes: 2048,
    };

    it('should successfully add a new file', async () => {
      const expectedDbResult = {
        id: fileData.id,
        name: fileData.name,
        path: fileData.path,
        language: fileData.language,
        metrics_json: JSON.stringify(fileData.metrics),
        content_hash: fileData.content_hash,
        mime_type: fileData.mime_type,
        size_bytes: fileData.size_bytes,
        created_at: '2024-12-09T10:00:00Z',
        updated_at: '2024-12-09T10:00:00Z',
        repository: repositoryId,
        branch: branch,
      };

      mockKuzuClient.executeQuery.mockResolvedValue([expectedDbResult]);

      const result = await addFileOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        fileData,
      );

      expect(result).toEqual({
        id: fileData.id,
        name: fileData.name,
        path: fileData.path,
        language: fileData.language,
        metrics: fileData.metrics,
        content_hash: fileData.content_hash,
        mime_type: fileData.mime_type,
        size_bytes: fileData.size_bytes,
        created_at: expectedDbResult.created_at,
        updated_at: expectedDbResult.updated_at,
        repository: repositoryId,
        branch: branch,
      });

      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'MERGE (f:File {id: $id, repository: $repository, branch: $branch})',
        ),
        expect.objectContaining({
          id: fileData.id,
          repository: repositoryId,
          branch: branch,
          name: fileData.name,
          path: fileData.path,
        }),
      );

      expect(mockMcpContext.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: fileData.id,
          filePath: fileData.path,
        }),
        expect.stringContaining(`File node ${fileData.id} processed successfully`),
      );
    });

    it('should handle file with null metrics', async () => {
      const fileDataWithNullMetrics = {
        ...fileData,
        metrics: undefined,
      };

      const expectedDbResult = {
        ...fileData,
        metrics_json: null,
        created_at: '2024-12-09T10:00:00Z',
        updated_at: '2024-12-09T10:00:00Z',
        repository: repositoryId,
        branch: branch,
      };

      mockKuzuClient.executeQuery.mockResolvedValue([expectedDbResult]);

      const result = await addFileOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        fileDataWithNullMetrics,
      );

      expect(result?.metrics).toBeUndefined();
      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          metrics_json: null,
        }),
      );
    });

    it('should return null when query returns empty result', async () => {
      mockKuzuClient.executeQuery.mockResolvedValue([]);

      const result = await addFileOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        fileData,
      );

      expect(result).toBeNull();
      expect(mockMcpContext.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          result: [],
        }),
        expect.stringContaining('returned no result or an empty result set'),
      );
    });

    it('should handle invalid JSON in metrics_json from database', async () => {
      const expectedDbResult = {
        ...fileData,
        metrics_json: 'invalid-json-{',
        created_at: '2024-12-09T10:00:00Z',
        updated_at: '2024-12-09T10:00:00Z',
        repository: repositoryId,
        branch: branch,
      };

      mockKuzuClient.executeQuery.mockResolvedValue([expectedDbResult]);

      const result = await addFileOp(mockMcpContext, mockKuzuClient, repositoryId, branch, fileData);

      expect(result?.metrics).toBeUndefined();
      expect(mockMcpContext.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics_json: 'invalid-json-{',
          fileId: fileData.id,
        }),
        expect.stringContaining('Failed to parse metrics_json from DB result'),
      );
    });

    it('should throw error when database query fails', async () => {
      const dbError = new Error('Database connection failed');
      mockKuzuClient.executeQuery.mockRejectedValue(dbError);

      await expect(
        addFileOp(mockMcpContext, mockKuzuClient, repositoryId, branch, fileData),
      ).rejects.toThrow('Database connection failed');

      expect(mockMcpContext.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: dbError,
        }),
        expect.stringContaining('Error executing addFileOp Cypher query'),
      );
    });
  });

  describe('associateFileWithComponentOp', () => {
    const repositoryId = 'test-repo:main';
    const branch = 'main';
    const componentId = 'comp-TestComponent';
    const fileId = 'file-test-component';

    it('should successfully associate file with component', async () => {
      const expectedDbResult = { r: { type: 'CONTAINS_FILE' } };
      mockKuzuClient.executeQuery.mockResolvedValue([expectedDbResult]);

      const result = await associateFileWithComponentOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        componentId,
        fileId,
      );

      expect(result).toBe(true);
      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'MATCH (c:Component {id: $componentId, repository: $repositoryId, branch: $branchName})',
        ),
        expect.objectContaining({
          componentId,
          fileId,
          repositoryId,
          branchName: branch,
        }),
      );

      expect(mockMcpContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          `Successfully associated Component ${componentId} with File ${fileId}`,
        ),
      );
    });

    it('should return false when component or file not found', async () => {
      mockKuzuClient.executeQuery.mockResolvedValue([]);

      const result = await associateFileWithComponentOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        componentId,
        fileId,
      );

      expect(result).toBe(false);
      expect(mockMcpContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to associate'),
        expect.objectContaining({
          queryParams: expect.objectContaining({
            componentId,
            fileId,
          }),
        }),
      );
    });

    it('should throw error when database query fails', async () => {
      const dbError = new Error('Database connection failed');
      mockKuzuClient.executeQuery.mockRejectedValue(dbError);

      await expect(
        associateFileWithComponentOp(
          mockMcpContext,
          mockKuzuClient,
          repositoryId,
          branch,
          componentId,
          fileId,
        ),
      ).rejects.toThrow('Database connection failed');

      expect(mockMcpContext.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: dbError,
        }),
        expect.stringContaining('Error executing associateFileWithComponentOp Cypher query'),
      );
    });
  });
});