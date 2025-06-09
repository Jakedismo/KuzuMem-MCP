import {
  addTagOp,
  tagItemOp,
  findItemsByTagOp,
} from '../../../services/memory-operations/tag.ops';
import { KuzuDBClient } from '../../../db/kuzu';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

// Mock the KuzuDBClient
jest.mock('../../../db/kuzu');

describe('Tag Operations', () => {
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

  describe('addTagOp', () => {
    const tagData = {
      id: 'tag-bug',
      name: 'Bug',
      color: '#ff0000',
      description: 'Issues that need fixing',
    };

    it('should successfully add a new tag', async () => {
      const expectedDbResult = {
        id: tagData.id,
        name: tagData.name,
        color: tagData.color,
        description: tagData.description,
        created_at: '2024-12-09T10:00:00Z',
      };

      mockKuzuClient.executeQuery.mockResolvedValue([expectedDbResult]);

      const result = await addTagOp(mockMcpContext, mockKuzuClient, tagData);

      expect(result).toEqual({
        id: tagData.id,
        name: tagData.name,
        color: tagData.color,
        description: tagData.description,
        created_at: expectedDbResult.created_at,
      });

      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (t:Tag {id: $id})'),
        expect.objectContaining({
          id: tagData.id,
          name: tagData.name,
          color: tagData.color,
          description: tagData.description,
        }),
      );

      expect(mockMcpContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          `Tag '${tagData.name}' (id: ${tagData.id}) processed successfully`,
        ),
      );
    });

    it('should handle tag with null optional fields', async () => {
      const tagDataMinimal = {
        id: 'tag-simple',
        name: 'Simple Tag',
        color: null,
        description: null,
      };

      const expectedDbResult = {
        id: tagDataMinimal.id,
        name: tagDataMinimal.name,
        color: null,
        description: null,
        created_at: '2024-12-09T10:00:00Z',
      };

      mockKuzuClient.executeQuery.mockResolvedValue([expectedDbResult]);

      const result = await addTagOp(mockMcpContext, mockKuzuClient, tagDataMinimal);

      expect(result).toEqual({
        id: tagDataMinimal.id,
        name: tagDataMinimal.name,
        color: null,
        description: null,
        created_at: expectedDbResult.created_at,
      });

      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          color: null,
          description: null,
        }),
      );
    });

    it('should return null when query returns empty result', async () => {
      mockKuzuClient.executeQuery.mockResolvedValue([]);

      const result = await addTagOp(mockMcpContext, mockKuzuClient, tagData);

      expect(result).toBeNull();
      expect(mockMcpContext.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          result: [],
        }),
        expect.stringContaining('returned no result or an empty result set'),
      );
    });

    it('should throw error when database query fails', async () => {
      const dbError = new Error('Database connection failed');
      mockKuzuClient.executeQuery.mockRejectedValue(dbError);

      await expect(addTagOp(mockMcpContext, mockKuzuClient, tagData)).rejects.toThrow(
        'Database connection failed',
      );

      expect(mockMcpContext.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: dbError,
        }),
        expect.stringContaining('Error executing addTagOp Cypher query'),
      );
    });
  });

  describe('tagItemOp', () => {
    const repositoryId = 'test-repo:main';
    const branch = 'main';
    const itemId = 'comp-TestComponent';
    const tagId = 'tag-bug';

    it('should successfully tag a Component', async () => {
      const expectedDbResult = { r: { type: 'IS_TAGGED_WITH' } };
      mockKuzuClient.executeQuery.mockResolvedValue([expectedDbResult]);

      const result = await tagItemOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        itemId,
        'Component',
        tagId,
      );

      expect(result).toBe(true);
      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'MATCH (item:Component {id: $itemId, repository: $repositoryId, branch: $branchName})',
        ),
        expect.objectContaining({
          itemId,
          tagId,
          repositoryId,
          branchName: branch,
        }),
      );

      expect(mockMcpContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          `Successfully tagged Item {type: Component, id: ${itemId}} with Tag {id: ${tagId}}`,
        ),
      );
    });

    it('should successfully tag a Decision', async () => {
      const decisionId = 'dec-20241209-api-design';
      const expectedDbResult = { r: { type: 'IS_TAGGED_WITH' } };
      mockKuzuClient.executeQuery.mockResolvedValue([expectedDbResult]);

      const result = await tagItemOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        decisionId,
        'Decision',
        tagId,
      );

      expect(result).toBe(true);
      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (item:Decision'),
        expect.objectContaining({
          itemId: decisionId,
          tagId,
          repositoryId,
          branchName: branch,
        }),
      );
    });

    it('should successfully tag a Rule', async () => {
      const ruleId = 'rule-security-auth';
      const expectedDbResult = { r: { type: 'IS_TAGGED_WITH' } };
      mockKuzuClient.executeQuery.mockResolvedValue([expectedDbResult]);

      const result = await tagItemOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        ruleId,
        'Rule',
        tagId,
      );

      expect(result).toBe(true);
      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (item:Rule'),
        expect.objectContaining({
          itemId: ruleId,
          tagId,
          repositoryId,
          branchName: branch,
        }),
      );
    });

    it('should successfully tag a File', async () => {
      const fileId = 'file-test-component';
      const expectedDbResult = { r: { type: 'IS_TAGGED_WITH' } };
      mockKuzuClient.executeQuery.mockResolvedValue([expectedDbResult]);

      const result = await tagItemOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        fileId,
        'File',
        tagId,
      );

      expect(result).toBe(true);
      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (item:File'),
        expect.objectContaining({
          itemId: fileId,
          tagId,
          repositoryId,
          branchName: branch,
        }),
      );
    });

    it('should successfully tag a Context', async () => {
      const contextId = 'context-2024-12-09';
      const expectedDbResult = { r: { type: 'IS_TAGGED_WITH' } };
      mockKuzuClient.executeQuery.mockResolvedValue([expectedDbResult]);

      const result = await tagItemOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        contextId,
        'Context',
        tagId,
      );

      expect(result).toBe(true);
      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (item:Context'),
        expect.objectContaining({
          itemId: contextId,
          tagId,
          repositoryId,
          branchName: branch,
        }),
      );
    });

    it('should return false when item or tag not found', async () => {
      mockKuzuClient.executeQuery.mockResolvedValue([]);

      const result = await tagItemOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        itemId,
        'Component',
        tagId,
      );

      expect(result).toBe(false);
      expect(mockMcpContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to tag Item'),
        expect.objectContaining({
          queryParams: expect.objectContaining({
            itemId,
            tagId,
          }),
        }),
      );
    });

    it('should throw error when database query fails', async () => {
      const dbError = new Error('Database connection failed');
      mockKuzuClient.executeQuery.mockRejectedValue(dbError);

      await expect(
        tagItemOp(mockMcpContext, mockKuzuClient, repositoryId, branch, itemId, 'Component', tagId),
      ).rejects.toThrow('Database connection failed');

      expect(mockMcpContext.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: dbError,
        }),
        expect.stringContaining('Error executing tagItemOp Cypher query'),
      );
    });
  });

  describe('findItemsByTagOp', () => {
    const repositoryId = 'test-repo:main';
    const branch = 'main';
    const tagId = 'tag-bug';

    it('should find all items with tag (no filter)', async () => {
      const mockResults = [
        {
          id: 'comp-TestComponent',
          nodeLabel: 'Component',
          properties: {
            id: 'comp-TestComponent',
            name: 'Test Component',
            repository: repositoryId,
            branch: branch,
          },
        },
        {
          id: 'dec-20241209-api-design',
          nodeLabel: 'Decision',
          properties: {
            id: 'dec-20241209-api-design',
            name: 'API Design Decision',
            repository: repositoryId,
            branch: branch,
          },
        },
      ];

      mockKuzuClient.executeQuery.mockResolvedValue(mockResults);

      const result = await findItemsByTagOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        tagId,
        'All',
      );

      expect(result).toEqual([
        {
          id: 'comp-TestComponent',
          nodeLabel: 'Component',
          properties: mockResults[0].properties,
        },
        {
          id: 'dec-20241209-api-design',
          nodeLabel: 'Decision',
          properties: mockResults[1].properties,
        },
      ]);

      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (tag:Tag {id: $tagId})<-[:IS_TAGGED_WITH]-(item)'),
        expect.objectContaining({
          tagId,
          repositoryId,
          branchName: branch,
        }),
      );
    });

    it('should find only Component items with tag', async () => {
      const mockResults = [
        {
          id: 'comp-TestComponent',
          nodeLabel: 'Component',
          properties: {
            id: 'comp-TestComponent',
            name: 'Test Component',
            repository: repositoryId,
            branch: branch,
          },
        },
      ];

      mockKuzuClient.executeQuery.mockResolvedValue(mockResults);

      const result = await findItemsByTagOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        tagId,
        'Component',
      );

      expect(result).toEqual([
        {
          id: 'comp-TestComponent',
          nodeLabel: 'Component',
          properties: mockResults[0].properties,
        },
      ]);

      expect(mockKuzuClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND $itemTypeFilter IN labels(item)'),
        expect.objectContaining({
          tagId,
          repositoryId,
          branchName: branch,
          itemTypeFilter: 'Component',
        }),
      );
    });

    it('should return empty array when no items found', async () => {
      mockKuzuClient.executeQuery.mockResolvedValue([]);

      const result = await findItemsByTagOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        tagId,
        'All',
      );

      expect(result).toEqual([]);
      expect(mockMcpContext.logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          resultsCount: 0,
        }),
        expect.stringContaining('Kuzu query executed for findItemsByTagOp'),
      );
    });

    it('should handle null query result gracefully', async () => {
      mockKuzuClient.executeQuery.mockResolvedValue(null);

      const result = await findItemsByTagOp(
        mockMcpContext,
        mockKuzuClient,
        repositoryId,
        branch,
        tagId,
        'All',
      );

      expect(result).toEqual([]);
      expect(mockMcpContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('returned null or undefined'),
      );
    });

    it('should throw error when database query fails', async () => {
      const dbError = new Error('Database connection failed');
      mockKuzuClient.executeQuery.mockRejectedValue(dbError);

      await expect(
        findItemsByTagOp(mockMcpContext, mockKuzuClient, repositoryId, branch, tagId, 'All'),
      ).rejects.toThrow('Database connection failed');

      expect(mockMcpContext.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: dbError,
        }),
        expect.stringContaining('Error executing findItemsByTagOp Cypher query'),
      );
    });
  });
});