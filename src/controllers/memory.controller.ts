import { Request, Response } from 'express';
import { MemoryService } from '../services/memory.service';
import {
  metadataSchema,
  contextSchema,
  Rule
} from '../types';
import { Mutex } from '../utils/mutex';
import { EnrichedRequestHandlerExtra } from '../mcp/types/sdk-custom';

/**
 * Controller for memory bank operations
 * Implements the singleton pattern as per best practices
 */
export class MemoryController {
  private static instance: MemoryController;
  private static lock = new Mutex();
  private memoryService!: MemoryService;
  private serviceInitializationLock = false; // Simple lock

  private constructor() {
    this.initializeService();
  }

  /**
   * Initialize the controller with memory service
   * Uses proper lazy initialization
   */
  private async initializeService(): Promise<void> {
    if (this.serviceInitializationLock) {
      return;
    } // Prevent re-entry if already initializing
    this.serviceInitializationLock = true;
    try {
      this.memoryService = await MemoryService.getInstance();
      console.log('MemoryService initialized in MemoryController constructor.');
    } catch (error) {
      console.error('Failed to initialize MemoryService in MemoryController:', error);
      // Propagate or handle critical failure
      throw new Error('MemoryService initialization failed');
    } finally {
      this.serviceInitializationLock = false;
    }
  }

  static async getInstance(): Promise<MemoryController> {
    // Acquire lock for thread safety
    const release = await MemoryController.lock.acquire();

    try {
      if (!MemoryController.instance) {
        MemoryController.instance = new MemoryController();
      }

      return MemoryController.instance;
    } finally {
      // Always release the lock
      release();
    }
  }

  /**
   * Async handler wrapper to properly handle Express middleware async functions
   */
  private asyncHandler = (fn: (req: Request, res: Response, next?: any) => Promise<void>) => {
    return (req: Request, res: Response, next?: any) => {
      Promise.resolve(fn(req, res, next)).catch((err) => {
        console.error('Error in controller method:', err);
        res.status(500).json({ error: 'Internal server error' });
      });
    };
  };

  /**
   * Create mock MCP context for controller calls
   */
  private createMockContext(): EnrichedRequestHandlerExtra {
    return {
      logger: console,
      session: {
        clientProjectRoot: '',
        repository: '',
        branch: 'main',
      },
      sendProgress: async () => {},
      memoryService: this.memoryService
    };
  }

  /**
   * Initialize a memory bank for a repository
   */
  initMemoryBank = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.ensureService();
    const { clientProjectRoot, repositoryName, branch } = req.body;
    if (!clientProjectRoot || !repositoryName) {
      res
        .status(400)
        .json({ error: 'clientProjectRoot and repositoryName are required in the request body' });
      return;
    }
    await this.memoryService.initMemoryBank(this.createMockContext(), clientProjectRoot, repositoryName, branch);
    res.status(200).json({
      message: `Memory bank for ${repositoryName} initialized successfully at ${clientProjectRoot}.`,
    });
  });

  /**
   * Get metadata for a repository
   */
  getMetadata = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.ensureService();
    const { clientProjectRoot, repositoryName, branch } = req.body;
    if (!clientProjectRoot || !repositoryName) {
      res
        .status(400)
        .json({ error: 'clientProjectRoot and repositoryName are required in the request body' });
      return;
    }
    const metadata = await this.memoryService.getMetadata(
      this.createMockContext(),
      clientProjectRoot,
      repositoryName,
      branch,
    );
    if (metadata) {
      res.status(200).json(metadata);
    } else {
      res.status(404).json({ message: 'Metadata not found' });
    }
  });

  /**
   * Update metadata for a repository
   */
  updateMetadata = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.ensureService();
    const { clientProjectRoot, repositoryName, branch, metadata } = req.body;

    if (!clientProjectRoot || !repositoryName) {
      res
        .status(400)
        .json({ error: 'clientProjectRoot and repositoryName are required in the request body' });
      return;
    }
    if (!metadata) {
      res.status(400).json({ error: 'metadata (content) is required in the request body' });
      return;
    }

    const result = metadataSchema.safeParse(metadata);

    if (!result.success) {
      res.status(400).json({
        error: 'Invalid metadata format',
        details: result.error.format(),
      });
      return;
    }

    const updatedMetadata = await this.memoryService.updateMetadata(
      this.createMockContext(),
      clientProjectRoot,
      repositoryName,
      metadata,
      branch,
    );

    if (!updatedMetadata) {
      res.status(404).json({ error: 'Metadata not found or update failed' });
      return;
    }

    res.status(200).json(updatedMetadata);
  });

  /**
   * Get today's context
   */
  getTodayContext = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.ensureService();
    const { clientProjectRoot, repositoryName, branch } = req.body;

    if (!clientProjectRoot || !repositoryName) {
      res
        .status(400)
        .json({ error: 'clientProjectRoot and repositoryName are required in the request body' });
      return;
    }

    const context = await this.memoryService.getTodayContext(
      this.createMockContext(),
      clientProjectRoot,
      repositoryName,
      branch,
    );
    if (!context) {
      res.status(404).json({ error: 'Context not found' });
      return;
    }

    res.status(200).json(context);
  });

  /**
   * Update today's context
   */
  updateContext = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.ensureService();
    const { clientProjectRoot, repositoryName, branch, ...contextUpdateFields } = req.body;

    if (!clientProjectRoot || !repositoryName) {
      res
        .status(400)
        .json({ error: 'clientProjectRoot and repositoryName are required in the request body' });
      return;
    }

    const result = contextSchema.partial().safeParse(contextUpdateFields);

    if (!result.success) {
      res.status(400).json({
        error: 'Invalid context format for updatable fields',
        details: result.error.format(),
      });
      return;
    }

    const updatedContext = await this.memoryService.updateContext(
      this.createMockContext(),
      clientProjectRoot,
      {
        repository: repositoryName,
        branch,
        ...result.data,
      }
    );

    if (!updatedContext) {
      res.status(404).json({ error: 'Context not found or update failed' });
      return;
    }

    res.status(200).json(updatedContext);
  });

  /**
   * Get latest contexts
   */
  getLatestContexts = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.ensureService();
    const { clientProjectRoot, repositoryName } = req.body;
    const { limit, branch } = req.query;

    if (!clientProjectRoot || !repositoryName) {
      res
        .status(400)
        .json({ error: 'clientProjectRoot and repositoryName are required in the request body' });
      return;
    }

    const branchName = branch ? String(branch) : undefined;
    const limitNum = limit ? parseInt(limit as string, 10) : undefined;

    const contexts = await this.memoryService.getLatestContexts(
      this.createMockContext(),
      clientProjectRoot,
      repositoryName,
      branchName || 'main',
      limitNum,
    );

    res.status(200).json(contexts);
  });

  /**
   * Get active components
   */
  getActiveComponents = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.ensureService();
    const { clientProjectRoot, repositoryName } = req.body;
    const branch = (req.query.branch as string) || 'main';

    if (!clientProjectRoot || !repositoryName) {
      res
        .status(400)
        .json({ error: 'clientProjectRoot and repositoryName are required in the request body' });
      return;
    }

    const components = await this.memoryService.getActiveComponents(
      this.createMockContext(),
      clientProjectRoot,
      repositoryName,
      branch,
    );
    res.status(200).json(components);
  });

  /**
   * Create or update a decision
   */
  upsertDecision = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.ensureService();
    const { clientProjectRoot, repositoryName } = req.body;
    const { id } = req.params;
    const decisionInput = req.body;

    const branch = decisionInput.branch || (req.query.branch as string) || 'main';

    if (!clientProjectRoot || !repositoryName) {
      res
        .status(400)
        .json({ error: 'clientProjectRoot and repositoryName are required in the request body' });
      return;
    }
    if (!id) {
      res.status(400).json({ error: 'Decision ID is required as a route parameter' });
      return;
    }

    const decisionDataForService = {
      id: id,
      name: decisionInput.name,
      context: decisionInput.context,
      date: decisionInput.date,
    };
    if (!decisionDataForService.name || !decisionDataForService.date) {
      res.status(400).json({ error: 'Decision name and date are required in the request body' });
      return;
    }

    const updatedDecision = await this.memoryService.upsertDecision(
      this.createMockContext(),
      clientProjectRoot,
      repositoryName,
      branch,
      decisionDataForService,
    );

    if (!updatedDecision) {
      res.status(404).json({ error: 'Failed to create or update decision' });
      return;
    }

    res.status(200).json(updatedDecision);
  });

  /**
   * Get decisions by date range
   */
  getDecisionsByDateRange = this.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      await this.ensureService();
      const { clientProjectRoot, repositoryName } = req.body;
      const { startDate, endDate, branch } = req.query;

      const branchName = (branch as string) || 'main';

      if (!clientProjectRoot || !repositoryName) {
        res
          .status(400)
          .json({ error: 'clientProjectRoot and repositoryName are required in the request body' });
        return;
      }

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'startDate and endDate query parameters are required' });
        return;
      }

      const decisions = await this.memoryService.getDecisionsByDateRange(
        this.createMockContext(),
        clientProjectRoot,
        repositoryName,
        branchName,
        startDate as string,
        endDate as string,
      );

      res.status(200).json(decisions);
    },
  );

  /**
   * Create or update a rule
   */
  upsertRule = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.ensureService();
    const { clientProjectRoot, repositoryName } = req.body;
    const { id } = req.params;
    const ruleInput = req.body;

    const branch = ruleInput.branch || (req.query.branch as string) || 'main';

    if (!clientProjectRoot || !repositoryName) {
      res
        .status(400)
        .json({ error: 'clientProjectRoot and repositoryName are required in the request body' });
      return;
    }
    if (!id) {
      res.status(400).json({ error: 'Rule ID is required as a route parameter' });
      return;
    }

    const ruleDataForService = {
      id: id,
      name: ruleInput.name,
      created: ruleInput.created,
      triggers: ruleInput.triggers,
      content: ruleInput.content,
      status: ruleInput.status || 'active',
    };

    if (!ruleDataForService.name || !ruleDataForService.created) {
      res
        .status(400)
        .json({ error: 'Rule name and created date are required in the request body' });
      return;
    }

    const updatedRule = await this.memoryService.upsertRule(
      this.createMockContext(),
      clientProjectRoot,
      repositoryName,
      ruleDataForService as Omit<Rule, 'repository' | 'branch' | 'id'> & { id: string },
      branch,
    );

    if (!updatedRule) {
      res.status(404).json({ error: 'Failed to create or update rule' });
      return;
    }

    res.status(200).json(updatedRule);
  });

  /**
   * Get active rules
   */
  getActiveRules = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.ensureService();
    try {
      const { repository } = req.params;
      const branch = (req.query.branch as string) || 'main';
      const clientProjectRoot = req.body.clientProjectRoot;

      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }

      if (!clientProjectRoot) {
        res.status(400).json({ error: 'clientProjectRoot is required in the request body' });
        return;
      }

      const rules = await this.memoryService.getActiveRules(this.createMockContext(), clientProjectRoot, repository, branch);

      res.status(200).json(rules);
    } catch (error) {
      console.error('Error getting active rules:', error);
      res.status(500).json({ error: 'Failed to get active rules' });
    }
  });

  // /**
  //  * Export memory bank
  //  */
  // exportMemoryBank = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
  //   try {
  //     const { repository } = req.params;
  //
  //     if (!repository) {
  //       res.status(400).json({ error: 'Repository name is required' });
  //       return;
  //     }
  //
  //     const success = await this.memoryService.exportMemoryBank(repository);
  //
  //     if (!success) {
  //       res.status(400).json({ error: 'Failed to export memory bank' });
  //       return;
  //     }
  //
  //     res.status(200).json({ message: 'Memory bank exported successfully' });
  //   } catch (error) {
  //     console.error('Error exporting memory bank:', error);
  //     res.status(500).json({ error: 'Failed to export memory bank' });
  //   }
  // });

  // /**
  //  * Import memory bank
  //  */
  // importMemoryBank = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
  //   try {
  //     const { repository } = req.params;
  //     const { content, type, id } = req.body;
  //
  //     if (!repository) {
  //       res.status(400).json({ error: 'Repository name is required' });
  //       return;
  //     }
  //
  //     if (!content || !type || !id) {
  //       res.status(400).json({
  //         error: 'Content, memory type, and ID are required',
  //       });
  //       return;
  //     }
  //
  //     const typeSchema = z.enum(['metadata', 'context', 'component', 'decision', 'rule']);
  //     const typeResult = typeSchema.safeParse(type);
  //
  //     if (!typeResult.success) {
  //       res.status(400).json({
  //         error:
  //           'Invalid memory type. Must be one of: metadata, context, component, decision, rule',
  //       });
  //       return;
  //     }
  //
  //     const success = await this.memoryService.importMemoryBank(repository, content, type, id);
  //
  //     if (!success) {
  //       res.status(400).json({ error: 'Failed to import memory bank' });
  //       return;
  //     }
  //
  //     res.status(200).json({ message: 'Memory bank imported successfully' });
  //   } catch (error) {
  //     console.error('Error importing memory bank:', error);
  //     res.status(500).json({ error: 'Failed to import memory bank' });
  //   }
  // });

  // Helper to ensure service is initialized
  private async ensureService(): Promise<void> {
    if (!this.memoryService) {
      console.warn('MemoryService not yet available, attempting to initialize...');
      await this.initializeService(); // Re-attempt initialization
      if (!this.memoryService) {
        // Check again after attempt
        throw new Error('MemoryService could not be initialized on demand.');
      }
    }
  }
}
