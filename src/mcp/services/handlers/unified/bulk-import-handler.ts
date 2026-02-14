import { Component, Decision, Rule } from '../../../../types';
import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

// TypeScript interfaces for bulk-import input parameters
interface BulkImportParams {
  type: 'components' | 'decisions' | 'rules';
  clientProjectRoot?: string;
  repository: string;
  branch?: string;
  overwrite?: boolean;
  // Entity arrays
  components?: Component[];
  decisions?: Decision[];
  rules?: Rule[];
}

/**
 * Bulk Import Handler
 * Handles bulk import operations for multiple entities
 */
export const bulkImportHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Validate and extract parameters
  const validatedParams = params as unknown as BulkImportParams;

  // Basic validation
  if (!validatedParams.type) {
    throw new Error('type parameter is required');
  }
  if (!validatedParams.repository) {
    throw new Error('repository parameter is required');
  }

  const {
    type,
    repository,
    branch = 'main',
    overwrite = false,
    components,
    decisions,
    rules,
  } = validatedParams;

  // 2. Validate session and get clientProjectRoot
  const clientProjectRoot = validateSession(context, 'bulk-import');

  // 3. Additional validation before try-catch to ensure errors are thrown
  switch (type) {
    case 'components':
      if (!components || !Array.isArray(components) || components.length === 0) {
        throw new Error('No components data provided for import');
      }
      break;
    case 'decisions':
      if (!decisions || !Array.isArray(decisions) || decisions.length === 0) {
        throw new Error('No decisions data provided for import');
      }
      break;
    case 'rules':
      if (!rules || !Array.isArray(rules) || rules.length === 0) {
        throw new Error('No rules data provided for import');
      }
      break;
    default:
      throw new Error(`Unknown bulk import type: ${type}`);
  }

  // 4. Log the operation
  logToolExecution(context, `bulk-import operation: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
    type,
    overwrite,
  });

  try {
    switch (type) {
      case 'components': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Starting bulk import of ${components!.length} components...`,
          percent: 10,
        });

        const entityService = await memoryService.entity;

        // Use optimized bulk upsert
        const result = await entityService.bulkUpsertComponents(
            context,
            clientProjectRoot,
            repository,
            branch,
            components!,
            overwrite
        );

        await context.sendProgress({
          status: 'complete',
          message: `Bulk import complete: ${result.upserted} imported, ${result.skipped} skipped, ${result.failed} failed`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'components',
          success: result.failed === 0,
          imported: result.upserted,
          skipped: result.skipped,
          failed: result.failed,
          total: components!.length,
          errors: result.failed > 0 ? [{ id: 'batch', error: 'Batch failed' }] : undefined,
          message: `Successfully imported ${result.upserted} components, skipped ${result.skipped}`,
        };
      }

      case 'decisions': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Starting bulk import of ${decisions!.length} decisions...`,
          percent: 10,
        });

        let imported = 0;
        let skipped = 0;
        let failed = 0;
        const errors: Array<{ id: string; error: string }> = [];
        const entityService = await memoryService.entity;

        for (const decision of decisions!) {
          try {
            // Check if decision already exists
            if (!overwrite) {
              const existing = await entityService.getDecision(
                context,
                clientProjectRoot,
                repository,
                branch,
                decision.id,
              );
              if (existing) {
                skipped++;
                continue;
              }
            }

            // Import the decision
            await entityService.upsertDecision(
              context,
              clientProjectRoot,
              repository,
              branch,
              decision,
            );
            imported++;
          } catch (error) {
            context.logger.warn(`Failed to import decision ${decision.id}:`, error);
            failed++;
            errors.push({
              id: decision.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        await context.sendProgress({
          status: 'complete',
          message: `Bulk import complete: ${imported} imported, ${skipped} skipped, ${failed} failed`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'decisions',
          success: true,
          imported,
          skipped,
          failed,
          total: decisions!.length,
          errors: errors.length > 0 ? errors : undefined,
          message: `Successfully imported ${imported} decisions, skipped ${skipped}`,
        };
      }

      case 'rules': {
        if (!rules || !Array.isArray(rules) || rules.length === 0) {
          throw new Error('rules array is required and must not be empty for rules import');
        }

        await context.sendProgress({
          status: 'in_progress',
          message: `Starting bulk import of ${rules.length} rules...`,
          percent: 10,
        });

        let imported = 0;
        let skipped = 0;
        let failed = 0;
        const errors: Array<{ id: string; error: string }> = [];
        const entityService = await memoryService.entity;

        for (const rule of rules) {
          try {
            // Check if rule already exists
            if (!overwrite) {
              const existing = await entityService.getRule(
                context,
                clientProjectRoot,
                repository,
                branch,
                rule.id,
              );
              if (existing) {
                skipped++;
                continue;
              }
            }

            // Import the rule
            await entityService.upsertRule(context, clientProjectRoot, repository, rule, branch);
            imported++;
          } catch (error) {
            context.logger.warn(`Failed to import rule ${rule.id}:`, error);
            failed++;
            errors.push({
              id: rule.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        await context.sendProgress({
          status: 'complete',
          message: `Bulk import complete: ${imported} imported, ${skipped} skipped, ${failed} failed`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'rules',
          success: true,
          imported,
          skipped,
          failed,
          total: rules.length,
          errors: errors.length > 0 ? errors : undefined,
          message: `Successfully imported ${imported} rules, skipped ${skipped}`,
        };
      }

      default:
        throw new Error(`Unknown bulk import type: ${type}`);
    }
  } catch (error) {
    await handleToolError(error, context, `bulk-import ${type}`, 'bulk-import');

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      type,
      success: false,
      imported: 0,
      skipped: 0,
      failed: 0,
      total: 0,
      message: `Failed to execute bulk-import ${type}: ${errorMessage}`,
    };
  }
};
