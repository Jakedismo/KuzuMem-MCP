#!/usr/bin/env node
import { Command } from 'commander';
import { MemoryService } from '../services/memory.service';
import { Rule } from '../types'; // Import Rule type
import { EnrichedRequestHandlerExtra } from '../mcp/types/sdk-custom';
import fs from 'fs/promises';
import path from 'path';

const program = new Command();
let memoryService: MemoryService;

function createMockContext(): EnrichedRequestHandlerExtra {
  return {
    logger: console,
    session: {
      clientProjectRoot: '',
      repository: '',
      branch: 'main',
    },
    sendProgress: async () => {},
    memoryService: null as any, // Will be set after initialization
  };
}

async function initializeMemoryServiceInstance(): Promise<void> {
  if (!memoryService) {
    try {
      memoryService = await MemoryService.getInstance();
      console.log('CLI: Memory service singleton instance obtained.');
    } catch (error) {
      console.error('CLI: Failed to initialize memory service:', error);
      process.exit(1);
    }
  }
}

program
  .name('memory-bank-cli')
  .description('CLI tool for interacting with KuzuDB memory banks per project')
  .version('3.0.0')
  .option(
    '-p, --project-root <path>',
    'Specify the client project root path (defaults to current working directory)',
  );

function getEffectiveProjectRoot(): string {
  const options = program.opts(); // Access global options
  return options.projectRoot ? path.resolve(options.projectRoot) : process.cwd();
}

program
  .command('init')
  .description(
    'Initialize a new memory bank for a repository in the specified or current project root',
  )
  .argument('<repositoryName>', 'Logical name for the repository (e.g., project folder name)')
  .option('-b, --branch <branch>', 'Branch name for isolation', 'main')
  .action(async (repositoryName: string, options) => {
    await initializeMemoryServiceInstance();
    const branch = options.branch;
    try {
      const clientProjectRoot = getEffectiveProjectRoot();
      const mockContext = createMockContext();
      await memoryService.initMemoryBank(mockContext, clientProjectRoot, repositoryName, branch);
      console.log(
        `✅ Memory bank initialized for repository: ${repositoryName} (branch: ${branch})`,
      );
    } catch (error) {
      console.error('❌ Failed to initialize memory bank:', error);
      process.exit(1);
    }
  });

program
  .command('add-context')
  .description("Add an entry to today's context for a repository within the project root")
  .argument('<repositoryName>', 'Logical repository name')
  .option('-a, --agent <agent>', 'Agent name')
  .option('-i, --issue <issue>', 'Related issue number')
  .option('-s, --summary <summary>', 'Context summary')
  .option('-d, --decision <decision>', 'Add a decision')
  .option('-o, --observation <observation>', 'Add an observation')
  .option('--branch <branch>', 'Branch name', 'main')
  .action(async (repositoryName: string, options) => {
    await initializeMemoryServiceInstance();
    const branch = options.branch;
    const clientProjectRoot = getEffectiveProjectRoot();
    const contextParams = {
      repository: repositoryName,
      branch,
      agent: options.agent,
      issue: options.issue,
      summary: options.summary,
      decision: options.decision,
      observation: options.observation,
    };
    try {
      const mockContext = createMockContext();
      await memoryService.updateContext(mockContext, clientProjectRoot, contextParams);
      console.log(
        `✅ Added to today's context for repository: ${repositoryName} (branch: ${branch})`,
      );
    } catch (error) {
      console.error('❌ Failed to add to context:', error);
      process.exit(1);
    }
  });

program
  .command('add-component')
  .description('Add or update a component')
  .argument('<repositoryName>', 'Logical repository name')
  .argument('<id>', 'Component ID')
  .requiredOption('-n, --name <name>', 'Component name')
  .option('-k, --kind <kind>', 'Component kind')
  .option('-d, --depends <dependencies>', 'Comma-separated list of dependencies')
  .option('-s, --status <status>', 'Component status (active, deprecated, planned)', 'active')
  .option('-b, --branch <branch>', 'Branch name', 'main')
  .action(async (repositoryName: string, id: string, options) => {
    await initializeMemoryServiceInstance();
    const branch = options.branch;
    const clientProjectRoot = getEffectiveProjectRoot();
    const componentDataForService = {
      id: id,
      name: options.name,
      kind: options.kind,
      depends_on: options.depends ? options.depends.split(',') : [],
      status: options.status as 'active' | 'deprecated' | 'planned',
    };
    try {
      const mockContext = createMockContext();
      await memoryService.upsertComponent(
        mockContext,
        clientProjectRoot,
        repositoryName,
        branch,
        componentDataForService,
      );
      console.log(`✅ Component ${id} added to repository: ${repositoryName} (branch: ${branch})`);
    } catch (error) {
      console.error('❌ Failed to add component:', error);
      process.exit(1);
    }
  });

program
  .command('add-decision')
  .description('Add or update a decision')
  .argument('<repositoryName>', 'Logical repository name')
  .argument('<id>', 'Decision ID')
  .requiredOption('-n, --name <name>', 'Decision name')
  .option('-c, --context <context>', 'Decision context')
  .requiredOption('-d, --date <date>', 'Decision date (YYYY-MM-DD)')
  .option('-b, --branch <branch>', 'Branch name', 'main')
  .action(async (repositoryName: string, id: string, options) => {
    await initializeMemoryServiceInstance();
    const branch = options.branch;
    const clientProjectRoot = getEffectiveProjectRoot();
    const decisionDataForService = {
      id: id,
      name: options.name,
      context: options.context,
      date: options.date,
    };
    try {
      const mockContext = createMockContext();
      await memoryService.upsertDecision(
        mockContext,
        clientProjectRoot,
        repositoryName,
        branch,
        decisionDataForService,
      );
      console.log(`✅ Decision ${id} added to repository: ${repositoryName} (branch: ${branch})`);
    } catch (error) {
      console.error('❌ Failed to add decision:', error);
      process.exit(1);
    }
  });

program
  .command('add-rule')
  .description('Add or update a rule')
  .argument('<repositoryName>', 'Logical repository name')
  .argument('<id>', 'Rule ID')
  .requiredOption('-n, --name <name>', 'Rule name')
  .requiredOption('-c, --created <date>', 'Rule creation date (YYYY-MM-DD)')
  .option('-t, --triggers <triggers>', 'Comma-separated list of triggers')
  .option('-o, --content <content>', 'Rule content')
  .option('-s, --status <status>', 'Rule status (active, deprecated)', 'active')
  .option('-b, --branch <branch>', 'Branch name', 'main')
  .action(async (repositoryName: string, id: string, options) => {
    await initializeMemoryServiceInstance();
    const branch = options.branch;
    const clientProjectRoot = getEffectiveProjectRoot();
    const ruleDataForService = {
      id: id,
      name: options.name,
      created: options.created,
      triggers: options.triggers ? options.triggers.split(',') : [],
      content: options.content,
      status: options.status as 'active' | 'deprecated',
    };
    try {
      const mockContext = createMockContext();
      await memoryService.upsertRule(mockContext, clientProjectRoot, repositoryName, ruleDataForService, branch);
      console.log(`✅ Rule ${id} added to repository: ${repositoryName} (branch: ${branch})`);
    } catch (error) {
      console.error('❌ Failed to add rule:', error);
      process.exit(1);
    }
  });

// Helper functions (processDirectory, parseFilePath, getYamlType) remain unchanged if they are not directly calling MemoryService
// ... (keep existing helper functions)
async function processDirectory(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await processDirectory(fullPath);
      Object.assign(files, subFiles);
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      const content = await fs.readFile(fullPath, 'utf-8');
      files[fullPath] = content;
    }
  }
  return files;
}

function parseFilePath(filePath: string): { type: string | null; id: string | null } {
  const normalizedPath = path.normalize(filePath);
  if (normalizedPath.includes('metadata.yaml')) {
    return { type: 'metadata', id: 'meta' };
  }
  if (normalizedPath.includes('/context/')) {
    return { type: 'context', id: path.basename(normalizedPath, path.extname(normalizedPath)) };
  }
  if (normalizedPath.includes('/components/')) {
    return { type: 'component', id: path.basename(normalizedPath, path.extname(normalizedPath)) };
  }
  if (normalizedPath.includes('/decisions/')) {
    return { type: 'decision', id: path.basename(normalizedPath, path.extname(normalizedPath)) };
  }
  if (normalizedPath.includes('/rules/')) {
    return { type: 'rule', id: path.basename(normalizedPath, path.extname(normalizedPath)) };
  }
  return { type: null, id: null };
}

function getYamlType(content: string): string | null {
  const firstLine = content.split('\n')[0];
  const match = firstLine.match(/---\s+!(\w+)/);
  if (match) {
    const type = match[1].toLowerCase();
    switch (type) {
      case 'metadata':
        return 'metadata';
      case 'context':
        return 'context';
      case 'component':
        return 'component';
      case 'decision':
        return 'decision';
      case 'rule':
        return 'rule';
      default:
        return null;
    }
  }
  return null;
}

program.parse(process.argv);

if (process.argv.length <= 2 && !program.args.length) {
  // Check if any command was invoked
  program.help();
}
