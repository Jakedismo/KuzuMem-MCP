import * as fs from 'fs';
import * as path from 'path';
import { ToolHandlerContext } from '../mcp/types/sdk-custom';
import { MemoryService } from '../services/memory.service';

describe('Rule Import Benchmark', () => {
  const repository = 'benchmark-repo';
  const branch = 'main';
  let clientProjectRoot: string;
  let memoryService: MemoryService;
  let entityService: any;
  const mcpContext: ToolHandlerContext = {
    logger: console,
    sendProgress: async () => {}, // no-op
  } as unknown as ToolHandlerContext;

  beforeAll(async () => {
    // Create a temporary directory for the Kùzu database file
    clientProjectRoot = fs.mkdtempSync(path.join(__dirname, 'kuzu-bench-'));
    memoryService = await MemoryService.getInstance(mcpContext);

    // Initialize the memory bank
    const initResult = await (
      await memoryService.memoryBank
    ).initMemoryBank(mcpContext, clientProjectRoot, repository, branch);

    // Explicitly ensure repository exists (in case initMemoryBank had issues)
    await (await memoryService.memoryBank).getOrCreateRepository(
      mcpContext,
      clientProjectRoot,
      repository,
      branch
    );

    // Get entity service
    entityService = await memoryService.entity;
  }, 30000);

  afterAll(async () => {
    // Cleanup temp directory
    if (clientProjectRoot && fs.existsSync(clientProjectRoot)) {
       fs.rmSync(clientProjectRoot, { recursive: true, force: true });
    }
  });

  it('should measure time for N+1 rule import (Baseline)', async () => {
    const rulesCount = 100;
    const rules: any[] = [];

    for (let i = 0; i < rulesCount; i++) {
      rules.push({
        id: `rule-old-${i}`,
        name: `Rule Old ${i}`,
        description: `Description for rule ${i}`,
        status: 'active',
        severity: 'medium',
        category: 'general',
        scope: 'component',
        created: new Date().toISOString()
      });
    }

    const start = Date.now();

    for (const rule of rules) {
        const existing = await entityService.getRule(
            mcpContext,
            clientProjectRoot,
            repository,
            branch,
            rule.id,
        );
        if (!existing) {
             await entityService.upsertRule(
                mcpContext,
                clientProjectRoot,
                repository,
                rule,
                branch
             );
        }
    }

    const duration = Date.now() - start;
    console.log(`[BENCHMARK] N+1 Import of ${rulesCount} rules took ${duration}ms`);
  }, 60000);

  it('should measure time for Batch rule import (Optimized)', async () => {
    const rulesCount = 100;
    const rules: any[] = [];

    for (let i = 0; i < rulesCount; i++) {
      rules.push({
        id: `rule-new-${i}`,
        name: `Rule New ${i}`,
        description: `Description for rule ${i}`,
        status: 'active',
        severity: 'medium',
        category: 'general',
        scope: 'component',
        created: new Date().toISOString()
      });
    }

    const start = Date.now();

    await entityService.upsertRules(
        mcpContext,
        clientProjectRoot,
        repository,
        rules,
        branch
    );

    const duration = Date.now() - start;
    console.log(`[BENCHMARK] Batch Import of ${rulesCount} rules took ${duration}ms`);

    // Verify one
    const rule = await entityService.getRule(mcpContext, clientProjectRoot, repository, branch, 'rule-new-0');
    expect(rule).toBeDefined();
    expect(rule.id).toBe('rule-new-0');

  }, 60000);
});
