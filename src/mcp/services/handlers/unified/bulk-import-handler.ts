import { z } from 'zod';
import {
  BulkImportInputSchema,
  BulkImportOutputSchema,
} from '../../../schemas/unified-tool-schemas';
import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

/**
 * Bulk Import Handler
 * Handles bulk import of entities
 */
export const bulkImportHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Parse and validate parameters
  const validatedParams = BulkImportInputSchema.parse(params);
  const { type, repository, branch = 'main', overwrite = false } = validatedParams;

  // 2. Validate session and get clientProjectRoot
  const clientProjectRoot = validateSession(context, 'bulk-import');
  if (!memoryService.services) {
    throw new Error('ServiceRegistry not initialized in MemoryService');
  }

  // 3. Log the operation
  logToolExecution(context, `bulk import: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
    overwrite,
  });

  // 4. Validate type-specific data exists
  const data = validatedParams[type];
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error(`No ${type} data provided for import`);
  }

  const errors: Array<{ id: string; error: string }> = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  try {
    await context.sendProgress({
      status: 'in_progress',
      message: `Starting bulk import of ${data.length} ${type}...`,
      percent: 10,
    });

    switch (type) {
      case 'components': {
        const componentData = data as Array<{
          id: string;
          name: string;
          kind?: string;
          status?: 'active' | 'deprecated' | 'planned';
          depends_on?: string[];
        }>;
        for (let i = 0; i < componentData.length; i++) {
          const component = componentData[i];
          try {
            // Check if exists
            if (!overwrite) {
              const existing = await memoryService.services.entity.getComponent(
                context,
                clientProjectRoot,
                repository,
                branch,
                component.id,
              );
              if (existing) {
                skipped++;
                continue;
              }
            }

            // Import component
            await memoryService.services.entity.upsertComponent(
              context,
              clientProjectRoot,
              repository,
              branch,
              {
                id: component.id,
                name: component.name,
                kind: component.kind,
                status: component.status,
                depends_on: component.depends_on,
              },
            );
            imported++;
          } catch (error) {
            failed++;
            errors.push({
              id: component.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Update progress
          const percent = Math.floor(10 + (i / data.length) * 80);
          await context.sendProgress({
            status: 'in_progress',
            message: `Importing components: ${i + 1}/${data.length}`,
            percent,
          });
        }
        break;
      }

      case 'decisions': {
        const decisionData = data as Array<{
          id: string;
          name: string;
          date: string;
          context?: string;
        }>;
        for (let i = 0; i < decisionData.length; i++) {
          const decision = decisionData[i];
          try {
            // Check if exists
            if (!overwrite) {
              const existing = await memoryService.services.entity.getDecision(
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

            // Import decision
            await memoryService.services.entity.upsertDecision(
              context,
              clientProjectRoot,
              repository,
              branch,
              {
                id: decision.id,
                name: decision.name,
                date: decision.date,
                context: decision.context,
              },
            );
            imported++;
          } catch (error) {
            failed++;
            errors.push({
              id: decision.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Update progress
          const percent = Math.floor(10 + (i / data.length) * 80);
          await context.sendProgress({
            status: 'in_progress',
            message: `Importing decisions: ${i + 1}/${data.length}`,
            percent,
          });
        }
        break;
      }

      case 'rules': {
        const ruleData = data as Array<{
          id: string;
          name: string;
          created: string;
          content: string;
          triggers?: string[];
          status?: 'active' | 'deprecated';
        }>;
        for (let i = 0; i < ruleData.length; i++) {
          const rule = ruleData[i];
          try {
            // Check if exists
            if (!overwrite) {
              const existing = await memoryService.services.entity.getRule(
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

            // Import rule
            await memoryService.services.entity.upsertRule(
              context,
              clientProjectRoot,
              repository,
              {
                id: rule.id,
                name: rule.name,
                created: rule.created,
                content: rule.content,
                triggers: rule.triggers,
                status: rule.status || 'active',
              },
              branch,
            );
            imported++;
          } catch (error) {
            failed++;
            errors.push({
              id: rule.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Update progress
          const percent = Math.floor(10 + (i / data.length) * 80);
          await context.sendProgress({
            status: 'in_progress',
            message: `Importing rules: ${i + 1}/${data.length}`,
            percent,
          });
        }
        break;
      }

      default:
        throw new Error(`Unknown import type: ${type}`);
    }

    await context.sendProgress({
      status: 'complete',
      message: `Bulk import complete: ${imported} imported, ${skipped} skipped, ${failed} failed`,
      percent: 100,
      isFinal: true,
    });

    return {
      type,
      status: 'complete',
      imported,
      failed,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully imported ${imported} ${type}, skipped ${skipped}, failed ${failed}`,
    } satisfies z.infer<typeof BulkImportOutputSchema>;
  } catch (error) {
    await handleToolError(error, context, `bulk import: ${type}`, type);
    throw error;
  }
};
