import { MemoryService } from '../services/memory.service';
import {
  AddComponentInputSchema,
  AddDecisionInputSchema,
  AddFileInputSchema,
  AddRuleInputSchema,
  AddTagInputSchema,
  AssociateFileWithComponentInputSchema, // Example for next section
  CountNodesByLabelInputSchema,
  FindItemsByTagInputSchema,
  GetComponentDependenciesInputSchema,
  GetComponentDependentsInputSchema,
  GetContextInputSchema,
  GetGoverningItemsForComponentInputSchema,
  GetItemContextualHistoryInputSchema,
  GetMetadataInputSchema,
  GetNodePropertiesInputSchema,
  GetRelatedItemsInputSchema,
  InitMemoryBankInputSchema,
  KCoreDecompositionInputSchema,
  ListAllIndexesInputSchema,
  ListAllLabelsInputSchema,
  ListNodesByLabelInputSchema,
  LouvainCommunityDetectionInputSchema,
  PageRankInputSchema,
  ShortestPathInputSchema,
  StronglyConnectedComponentsInputSchema,
  TagItemInputSchema,
  UpdateContextInputSchema,
  UpdateMetadataInputSchema,
  WeaklyConnectedComponentsInputSchema,
} from './schemas/tool-schemas'; // Assuming schemas are in this path
import { EnrichedRequestHandlerExtra } from './types/sdk-custom';

// Import Operation Classes - these will be refactored or their logic moved/simplified
// For now, keep them to avoid breaking streaming tool stubs immediately.

// New Handler Type based on SDK
// Input 'params' will be typed by Zod parsing within each handler.
// Output 'Promise<any>' will be Promise<z.infer<typeof SpecificOutputSchema>>.
export type SdkToolHandler = (
  params: any,
  context: EnrichedRequestHandlerExtra,
) => Promise<any>;

/**
 * Ensures that the clientProjectRoot is available in the session context.
 * Throws an error if the session or clientProjectRoot is missing for tools other than 'init-memory-bank'.
 *
 * @param params - The tool parameters, potentially containing clientProjectRoot for init-memory-bank.
 * @param context - The MCP server request context, expected to have a session object.
 * @param toolName - The name of the tool being executed.
 * @returns The validated clientProjectRoot.
 * @throws Error if clientProjectRoot is not found when required.
 */
function ensureValidSessionContext(
  params: any,
  context: EnrichedRequestHandlerExtra,
  toolName: string,
): string {
  const logger = context.logger || console; // context.logger should always exist now
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  const sessionRepository = context.session.repository as string | undefined;
  const sessionBranch = context.session.branch as string | undefined;

  // Check if this is init-memory-bank, which establishes the context
  if (toolName === 'init-memory-bank') {
    return params.clientProjectRoot;
  }

  // For all other tools, verify session is properly initialized
  if (!clientProjectRoot || !sessionRepository || !sessionBranch) {
    const errorMsg = `Session not properly initialized for tool '${toolName}'. 'init-memory-bank' must be called first to establish clientProjectRoot, repository, and branch for this session.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (!params || typeof params !== 'object') {
    const errorMsg = `Invalid parameters for tool '${toolName}'. Expected an object with repository and branch properties.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Check that the repository and branch match what's in the session
  if (params.repository && params.branch && (sessionRepository !== params.repository || sessionBranch !== params.branch)) {
    const errorMsg = `Session/Tool mismatch for tool '${toolName}': Current session is for '${sessionRepository}:${sessionBranch}', but tool is targeting '${params.repository}:${params.branch}'. Initialize a new session for the target repository/branch if needed.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Verify the client project root is absolute and exists
  if (!clientProjectRoot) {
    const errorMsg = `Invalid clientProjectRoot for tool '${toolName}'. 'init-memory-bank' must be called first with a valid absolute path.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (!require('path').isAbsolute(clientProjectRoot)) {
    const errorMsg = `Invalid clientProjectRoot path for tool '${toolName}': '${clientProjectRoot}'. Path must be absolute.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  
  return clientProjectRoot;
}

export const toolHandlers: Record<string, SdkToolHandler> = {
  'init-memory-bank': async (params, context) => {
    const { memoryService } = context; // Get memoryService from context
    console.error('[DEBUG-HANDLER] init-memory-bank ENTERED with params:', params);
    console.error('[DEBUG-HANDLER] context keys:', Object.keys(context));
    console.error('[DEBUG-HANDLER] memoryService available:', !!memoryService);
    context.logger.info('[toolHandlers.init-memory-bank] ENTERED.', {
      params: params,
      sessionClientProjectRoot: context.session.clientProjectRoot,
    });
    
    // Send initial progress notification
    await context.sendProgress({
      status: 'initializing',
      message: 'Starting memory bank initialization...',
      percent: 5,
    });
    
    console.error('[DEBUG-HANDLER] About to validate params with schema...');
    const validatedParams = InitMemoryBankInputSchema.parse(params);
    console.error('[DEBUG-HANDLER] Params validated:', validatedParams);
    context.logger.info(
      `Executing init-memory-bank for ${validatedParams.repository}:${validatedParams.branch}`,
      { clientProjectRoot: validatedParams.clientProjectRoot },
    );

    // Store clientProjectRoot, repository, and branch in the session for subsequent calls
    context.session.clientProjectRoot = validatedParams.clientProjectRoot;
    context.session.repository = validatedParams.repository;
    context.session.branch = validatedParams.branch;

    // Send progress for database preparation
    await context.sendProgress({
      status: 'in_progress',
      message: `Preparing database path for ${validatedParams.repository}...`,
      percent: 20,
    });

    console.error('[DEBUG-HANDLER] About to call memoryService.initMemoryBank...');
    let result;
    try {
      // Notify about starting Kuzu initialization
      await context.sendProgress({
        status: 'in_progress',
        message: `Initializing Kuzu database client...`,
        percent: 40,
      });
      
      result = await memoryService.initMemoryBank(
        context,
        validatedParams.clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
      );
      
      // Send progress after database initialization is complete
      await context.sendProgress({
        status: 'in_progress',
        message: `Database client initialized successfully`,
        percent: 80,
      });
      
      console.error('[DEBUG-HANDLER] memoryService.initMemoryBank returned:', result);
    } catch (err: any) {
      const error = err as Error;
      console.error('[DEBUG-HANDLER] memoryService.initMemoryBank threw an exception:', error);
      
      // Send error progress notification
      try {
        await context.sendProgress({
          status: 'error',
          message: `Failed to initialize memory bank: ${error.message || 'Unknown error'}`,
          percent: 100,
          isFinal: true,
          error: {
            message: error.message || 'Unknown error',
            details: error.stack,
          },
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }
      
      throw error;
    }
    
    // MemoryService.initMemoryBank now returns an object matching InitMemoryBankOutputSchema
    if (!result.success) {
      console.error('[DEBUG-HANDLER] MemoryService failed with result:', result);
      context.logger.error('init-memory-bank call to MemoryService failed.', { result });
      
      // Send error progress notification for unsuccessful result
      try {
        await context.sendProgress({
          status: 'error',
          message: result.message || 'Memory bank initialization failed',
          percent: 100,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }
      
      throw new Error(
        `[DEBUG-HANDLER] MemoryService failed: ${result.message || 'init-memory-bank failed in MemoryService'}`,
      );
    }
    
    // Send final success progress notification
    await context.sendProgress({
      status: 'complete',
      message: `Memory bank successfully initialized for ${validatedParams.repository} (branch: ${validatedParams.branch})`,
      percent: 100,
      isFinal: true,
    });
    
    console.error('[DEBUG-HANDLER] init-memory-bank SUCCESS! Returning result:', result);
    return result; // This matches InitMemoryBankOutputSchema
  },

  'get-metadata': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = GetMetadataInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'get-metadata');
    context.logger.info(
      `Executing get-metadata for ${validatedParams.repository}:${validatedParams.branch}`,
      { clientProjectRoot },
    );

    const metadataContent = await memoryService.getMetadata(
      context,
      clientProjectRoot,
      validatedParams.repository,
      validatedParams.branch,
    );
    if (!metadataContent) {
      context.logger.warn(
        `Metadata not found for ${validatedParams.repository}:${validatedParams.branch}`,
      );
      throw new Error(
        `Metadata not found for repository '${validatedParams.repository}' on branch '${validatedParams.branch}'.`,
      );
    }
    return metadataContent; // This matches GetMetadataOutputSchema (which is MetadataContentSchema)
  },

  'update-metadata': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = UpdateMetadataInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'update-metadata',
    );
    context.logger.info(
      `Executing update-metadata for ${validatedParams.repository}:${validatedParams.branch}`,
      { clientProjectRoot },
    );

    // memoryService.updateMetadata expects the full metadata content (MetadataContentSchema)
    const result = await memoryService.updateMetadata(
      context,
      clientProjectRoot,
      validatedParams.repository,
      validatedParams.metadata, // This is the full content to set/merge
      validatedParams.branch,
    );
    // MemoryService.updateMetadata returns Promise<z.infer<typeof toolSchemas.UpdateMetadataOutputSchema> | null>
    // If null, it's a failure. Otherwise, it already matches the schema (message is optional).
    if (!result) {
      const errorMsg = 'Failed to update metadata (service returned null).';
      context.logger.error(errorMsg, {
        repository: validatedParams.repository,
        branch: validatedParams.branch,
      });
      throw new Error(errorMsg);
    }
    // If result is not null, it means the service operation was successful and result matches UpdateMetadataOutputSchema
    return result;
  },

  'add-component': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = AddComponentInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'add-component');
    context.logger.info(
      `Executing add-component for ${validatedParams.repository}:${validatedParams.branch}`,
      { id: validatedParams.id, clientProjectRoot },
    );

    // memoryService.upsertComponent takes the Zod AddComponentInputSchema directly
    const result = await memoryService.upsertComponent(
      context,
      clientProjectRoot,
      validatedParams.repository,
      validatedParams.branch,
      validatedParams,
    );
    if (!result) {
      const errorMsg = 'Failed to add/update component (service returned null).';
      context.logger.error(errorMsg, { params: validatedParams });
      throw new Error(errorMsg);
    }
    // Construct the object matching AddComponentOutputSchema
    return {
      success: true,
      message: `Component '${validatedParams.name}' (id: ${validatedParams.id}) added/updated successfully`,
      component: result, // result is the Component object
    };
  },

  'get-context': async (params, context) => {
    const { memoryService } = context;
    try {
      context.logger.info('[get-context handler] Handler started', { params });
      const validatedParams = GetContextInputSchema.parse(params);
      context.logger.info('[get-context handler] Parameters validated', { validatedParams });

      const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'get-context');
      context.logger.info('[get-context handler] Session context validated', { clientProjectRoot });

      context.logger.info(
        `Executing get-context for ${validatedParams.repository}:${validatedParams.branch}`,
        { params: validatedParams, clientProjectRoot },
      );

      context.logger.info('[get-context handler] About to call memoryService.getLatestContexts');
      const contexts = await memoryService.getLatestContexts(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.latest === true ? 1 : validatedParams.limit,
      );
      context.logger.info('[get-context handler] memoryService.getLatestContexts completed', {
        contextsLength: contexts?.length,
      });

      return contexts; // This matches GetContextOutputSchema (z.array(ContextSchema))
    } catch (error: any) {
      context.logger.error('[get-context handler] Error occurred', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  },

  'update-context': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = UpdateContextInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'update-context');
    context.logger.info(
      `Executing update-context for ${validatedParams.repository}:${validatedParams.branch}`,
      { params: validatedParams, clientProjectRoot },
    );

    const result = await memoryService.updateContext(context, clientProjectRoot, validatedParams);
    // MemoryService.updateContext returns Promise<z.infer<typeof toolSchemas.UpdateContextOutputSchema> | null>
    // or throws an error.
    if (!result) {
      // Service indicated failure by returning null (should not happen if it throws on error)
      const errorMsg =
        'Failed to update context (service returned null, expected throw on error or valid result).';
      context.logger.error(errorMsg, { params: validatedParams });
      throw new Error(errorMsg);
    }
    if (!result.success) {
      // Service returned a result, but indicates failure
      const errorMsg = result.message || 'Service operation to update context indicated failure.';
      context.logger.error(errorMsg, { params: validatedParams });
      throw new Error(errorMsg);
    }
    return result; // Matches UpdateContextOutputSchema {success, message?, context?}
  },

  'add-decision': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = AddDecisionInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'add-decision');
    context.logger.info(
      `Executing add-decision for ${validatedParams.repository}:${validatedParams.branch}`,
      { id: validatedParams.id, clientProjectRoot },
    );

    const result = await memoryService.upsertDecision(
      context,
      clientProjectRoot,
      validatedParams.repository,
      validatedParams.branch,
      validatedParams,
    );
    if (!result) {
      const errorMsg = 'Failed to add/update decision (service returned null).';
      context.logger.error(errorMsg, { params: validatedParams });
      throw new Error(errorMsg);
    }
    // Construct the object matching AddDecisionOutputSchema
    return {
      success: true,
      message: `Decision '${validatedParams.name}' (id: ${validatedParams.id}) added/updated successfully`,
      decision: result, // result is the Decision object
    };
  },

  'add-rule': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = AddRuleInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'add-rule');
    context.logger.info(
      `Executing add-rule for ${validatedParams.repository}:${validatedParams.branch}`,
      { id: validatedParams.id, clientProjectRoot },
    );

    const { repository, branch, ...ruleData } = validatedParams;

    const result = await memoryService.upsertRule(
      context,
      clientProjectRoot,
      repository,
      ruleData as any, // Temporary cast to bypass complex status type mismatch
      branch,
    );
    if (!result) {
      // result is Rule | null from memoryService.upsertRule
      const errorMsg = 'Failed to add/update rule (service returned null).';
      context.logger.error(errorMsg, { params: validatedParams });
      throw new Error(errorMsg);
    }
    // Construct the object matching AddRuleOutputSchema
    return {
      success: true,
      message: `Rule '${validatedParams.name}' (id: ${validatedParams.id}) added/updated successfully`,
      rule: result, // result is the Rule object
    };
  },

  // New streaming tool handler implementation
  'get-component-dependencies': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = GetComponentDependenciesInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'get-component-dependencies',
    );

    context.logger.info(
      `Executing get-component-dependencies for ${validatedParams.repository}:${validatedParams.branch}`,
      { componentId: validatedParams.componentId, clientProjectRoot },
    );

    try {
      // Report initialization progress
      await context.sendProgress({
        status: 'initializing',
        message: `Starting dependency analysis for ${validatedParams.componentId} in ${validatedParams.repository}:${validatedParams.branch}`,
      });

      // First level of dependencies
      const firstLevelDeps = await memoryService.getComponentDependencies(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.componentId,
      );

      // Type assertion for the result - assumes an array of component objects
      const dependencies = Array.isArray(firstLevelDeps)
        ? firstLevelDeps
        : firstLevelDeps.dependencies && Array.isArray(firstLevelDeps.dependencies)
          ? firstLevelDeps.dependencies
          : [];

      // Send progressive result
      await context.sendProgress({
        status: 'in_progress',
        message: 'Retrieved first level dependencies',
      });

      // If depth > 1, get next level dependencies
      // TypeScript doesn't know depth exists in validatedParams, so use a type-safe approach
      const depth =
        'depth' in validatedParams && typeof validatedParams.depth === 'number'
          ? validatedParams.depth
          : 1;

      let allDependencies = [...dependencies];

      if (depth > 1 && dependencies.length > 0) {
        for (const dep of dependencies) {
          // Report progress before processing each component
          await context.sendProgress({
            status: 'in_progress',
            message: `Processing dependencies for ${dep.id}`,
          });

          // Get next level
          const nextLevelDepsResult = await memoryService.getComponentDependencies(
            context,
            clientProjectRoot,
            validatedParams.repository,
            validatedParams.branch,
            dep.id,
          );

          // Type assertion for the result
          const nextLevelDeps = Array.isArray(nextLevelDepsResult)
            ? nextLevelDepsResult
            : nextLevelDepsResult.dependencies && Array.isArray(nextLevelDepsResult.dependencies)
              ? nextLevelDepsResult.dependencies
              : [];

          // Add to all dependencies, avoiding duplicates
          const newDeps = nextLevelDeps.filter(
            (newDep: any) => !allDependencies.some((existing: any) => existing.id === newDep.id),
          );
          allDependencies = [...allDependencies, ...newDeps];

          // Report progress after processing each component
          await context.sendProgress({
            status: 'in_progress',
            message: `Processed dependencies for ${dep.id}`,
          });
        }
      }

      // Final result payload with isFinal flag
      await context.sendProgress({
        status: 'complete',
        isFinal: true,
      });

      // Return the final result as the tool response
      return {
        status: 'complete',
        depth,
        totalDependencies: allDependencies.length,
        dependencies: allDependencies,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in get-component-dependencies handler: ${errorMessage}`, {
        error: String(error),
        repository: validatedParams.repository,
        branch: validatedParams.branch,
        componentId: validatedParams.componentId,
      });

      // Send error progress update with isFinal flag
      try {
        await context.sendProgress({
          status: 'error',
          message: `Failed to get component dependencies: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      throw error;
    }
  },

  'get-component-dependents': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = GetComponentDependentsInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'get-component-dependents',
    );

    context.logger.info(
      `Executing get-component-dependents for ${validatedParams.repository}:${validatedParams.branch}`,
      { componentId: validatedParams.componentId, clientProjectRoot },
    );

    try {
      // Report initialization progress
      await context.sendProgress({
        status: 'initializing',
        message: `Starting dependent analysis for ${validatedParams.componentId} in ${validatedParams.repository}:${validatedParams.branch}`,
      });

      // Get dependents
      const allDependentsResult = await memoryService.getComponentDependents(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.componentId,
      );

      // Type assertion for the result
      const dependents = Array.isArray(allDependentsResult)
        ? allDependentsResult
        : allDependentsResult.dependents && Array.isArray(allDependentsResult.dependents)
          ? allDependentsResult.dependents
          : [];

      // Send in-progress update
      await context.sendProgress({
        status: 'in_progress',
        message: `Retrieved ${dependents.length} dependent(s) for ${validatedParams.componentId}`,
      });

      // Final result payload with isFinal flag
      await context.sendProgress({
        status: 'complete',
        isFinal: true,
      });

      // Return the final result as the tool response
      return {
        status: 'complete',
        totalDependents: dependents.length,
        dependents,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in get-component-dependents handler: ${errorMessage}`, {
        error: String(error),
        repository: validatedParams.repository,
        branch: validatedParams.branch,
        componentId: validatedParams.componentId,
      });

      // Send error progress update with isFinal flag
      try {
        await context.sendProgress({
          status: 'error',
          message: `Failed to get component dependents: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      throw error;
    }
  },

  'get-item-contextual-history': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = GetItemContextualHistoryInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'get-item-contextual-history',
    );

    context.logger.info(
      `Executing get-item-contextual-history for ${validatedParams.repository}:${validatedParams.branch}`,
      {
        itemId: validatedParams.itemId,
        itemType: validatedParams.itemType,
        clientProjectRoot,
      },
    );

    try {
      // Report initialization progress
      await context.sendProgress({
        status: 'initializing',
        message: `Starting contextual history retrieval for ${validatedParams.itemType} ${validatedParams.itemId} in ${validatedParams.repository}:${validatedParams.branch}`,
      });

      // Get contextual history
      const historyOutput = await memoryService.getItemContextualHistory(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.itemId,
        validatedParams.itemType,
      );

      // Extract results and handle potential null/undefined
      const contextHistory = historyOutput?.contextHistory || [];
      const resultStatus = historyOutput?.status || 'complete';
      const resultMessage = historyOutput?.message;

      // Send in-progress update
      await context.sendProgress({
        status: 'in_progress',
        message: `Retrieved ${contextHistory.length} history entries for ${validatedParams.itemType} ${validatedParams.itemId}`,
      });

      // Final result payload with isFinal flag
      await context.sendProgress({
        status: resultStatus,
        message: resultMessage,
        isFinal: true,
      });

      // Return the final result as the tool response
      return {
        status: resultStatus,
        contextHistory,
        message: resultMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in get-item-contextual-history handler: ${errorMessage}`, {
        error: String(error),
        itemId: validatedParams.itemId,
        itemType: validatedParams.itemType,
      });

      // Send error progress update with isFinal flag
      try {
        await context.sendProgress({
          status: 'error',
          message: `Failed to get item contextual history: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      throw error;
    }
  },

  'get-governing-items-for-component': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = GetGoverningItemsForComponentInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'get-governing-items-for-component',
    );

    context.logger.info(
      `Executing get-governing-items-for-component for ${validatedParams.repository}:${validatedParams.branch}`,
      { componentId: validatedParams.componentId, clientProjectRoot },
    );

    try {
      // Report initialization progress
      await context.sendProgress({
        status: 'initializing',
        message: `Starting retrieval of governing items for component ${validatedParams.componentId} in ${validatedParams.repository}:${validatedParams.branch}`,
      });

      // Get governing items
      const governingItemsOutput = await memoryService.getGoverningItemsForComponent(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.componentId,
      );

      // Extract results and handle potential null/undefined
      const decisions = governingItemsOutput?.decisions || [];
      const rules = governingItemsOutput?.rules || [];
      const resultStatus = governingItemsOutput?.status || 'complete';
      const resultMessage = governingItemsOutput?.message;

      // Send progress update for decisions
      await context.sendProgress({
        status: 'in_progress',
        message: `Retrieved ${decisions.length} decision(s).`,
      });

      // Send progress update for rules
      await context.sendProgress({
        status: 'in_progress',
        message: `Retrieved ${rules.length} rule(s).`,
      });

      // Final result payload with isFinal flag
      await context.sendProgress({
        status: resultStatus,
        message: resultMessage,
        isFinal: true,
      });

      // Return the final result as the tool response
      return {
        status: resultStatus,
        decisions,
        rules,
        message: resultMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in get-governing-items-for-component handler: ${errorMessage}`, {
        error: String(error),
        repository: validatedParams.repository,
        branch: validatedParams.branch,
        componentId: validatedParams.componentId,
      });

      // Send error progress update with isFinal flag
      try {
        await context.sendProgress({
          status: 'error',
          message: `Failed to get governing items for component: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      throw error;
    }
  },

  'get-related-items': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = GetRelatedItemsInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'get-related-items',
    );

    context.logger.info(
      `Executing get-related-items for ${validatedParams.repository}:${validatedParams.branch}`,
      {
        startItemId: validatedParams.startItemId,
        depth: validatedParams.depth,
        clientProjectRoot,
      },
    );

    try {
      // Report initialization progress
      await context.sendProgress({
        status: 'initializing',
        message: `Starting retrieval of related items for ${validatedParams.startItemId} in ${validatedParams.repository}:${validatedParams.branch}`,
      });

      // Prepare operation parameters
      const opParams = {
        depth: validatedParams.depth,
        relationshipFilter: validatedParams.relationshipFilter,
        targetNodeTypeFilter: validatedParams.targetNodeTypeFilter,
      };

      // Get related items
      const relatedItemsOutput = await memoryService.getRelatedItems(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.startItemId,
        opParams,
      );

      // Extract results and handle potential null/undefined
      const relatedItems = relatedItemsOutput?.relatedItems || [];
      const resultStatus = relatedItemsOutput?.status || 'complete';
      const resultMessage = relatedItemsOutput?.message;

      // Send in-progress update
      await context.sendProgress({
        status: 'in_progress',
        message: `Retrieved ${relatedItems.length} related item(s) for ${validatedParams.startItemId}.`,
      });

      // Final result payload with isFinal flag
      await context.sendProgress({
        status: resultStatus,
        message: resultMessage,
        isFinal: true,
      });

      // Return the final result as the tool response
      return {
        status: resultStatus,
        relatedItems,
        message: resultMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in get-related-items handler: ${errorMessage}`, {
        error: String(error),
        repository: validatedParams.repository,
        branch: validatedParams.branch,
        startItemId: validatedParams.startItemId,
      });

      // Send error progress update with isFinal flag
      try {
        await context.sendProgress({
          status: 'error',
          message: `Failed to get related items: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      throw error;
    }
  },

  'k-core-decomposition': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = KCoreDecompositionInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'k-core-decomposition',
    );

    context.logger.info(
      `Executing k-core-decomposition for ${validatedParams.repository}:${validatedParams.branch}`,
      {
        k: validatedParams.k,
        projectedGraphName: validatedParams.projectedGraphName,
        clientProjectRoot,
      },
    );

    try {
      // Report initialization progress
      await context.sendProgress({
        status: 'initializing',
        message: `Starting K-Core Decomposition (k=${validatedParams.k}) for graph ${validatedParams.projectedGraphName} in ${validatedParams.repository}:${validatedParams.branch}`,
      });

      // Get k-core decomposition result
      const kCoreOutput = await memoryService.kCoreDecomposition(
        context,
        clientProjectRoot,
        validatedParams,
      );

      // Ensure kCoreOutput and kCoreOutput.results are defined before accessing components
      const components = kCoreOutput?.results?.components || [];
      const resultStatus = kCoreOutput?.status || 'complete';
      const resultMessage = kCoreOutput?.message;

      // Send in-progress update
      await context.sendProgress({
        status: 'in_progress',
        message: `K-Core Decomposition processing for ${validatedParams.repository}/${validatedParams.branch}. Components found: ${components.length}.`,
      });

      // Final result payload with isFinal flag
      await context.sendProgress({
        status: resultStatus,
        message: resultMessage,
        isFinal: true,
      });

      // Return the final result as the tool response
      return {
        status: resultStatus,
        projectedGraphName: validatedParams.projectedGraphName,
        results: {
          k: validatedParams.k,
          components,
        },
        message: resultMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in k-core-decomposition handler: ${errorMessage}`, {
        error: String(error),
        repository: validatedParams.repository,
        branch: validatedParams.branch,
        k: validatedParams.k,
      });

      // Send error progress update with isFinal flag
      try {
        await context.sendProgress({
          status: 'error',
          message: `K-Core Decomposition failed: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      throw error;
    }
  },

  'louvain-community-detection': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = LouvainCommunityDetectionInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'louvain-community-detection',
    );

    context.logger.info(
      `Executing louvain-community-detection for ${validatedParams.repository}:${validatedParams.branch}`,
      {
        projectedGraphName: validatedParams.projectedGraphName,
        clientProjectRoot,
      },
    );

    try {
      // Report initialization progress
      await context.sendProgress({
        status: 'initializing',
        message: `Starting Louvain Community Detection for graph ${validatedParams.projectedGraphName} in ${validatedParams.repository}:${validatedParams.branch}`,
      });

      // Get Louvain community detection result
      const louvainOutput = await memoryService.louvainCommunityDetection(
        context,
        clientProjectRoot,
        validatedParams,
      );

      // Extract results and handle potential null/undefined
      const communities = louvainOutput?.results?.communities || [];
      const modularity = louvainOutput?.results?.modularity ?? null;
      const resultStatus = louvainOutput?.status || 'complete';
      const resultMessage = louvainOutput?.message;

      // Send in-progress update
      await context.sendProgress({
        status: 'in_progress',
        message: `Louvain Community Detection processing for ${validatedParams.repository}/${validatedParams.branch}. Communities found: ${communities.length}. Modularity: ${modularity}.`,
      });

      // Final result payload with isFinal flag
      await context.sendProgress({
        status: resultStatus,
        message: resultMessage,
        isFinal: true,
      });

      // Return the final result as the tool response
      return {
        status: resultStatus,
        projectedGraphName: validatedParams.projectedGraphName,
        results: {
          communities,
          modularity,
        },
        message: resultMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in louvain-community-detection handler: ${errorMessage}`, {
        error: String(error),
        repository: validatedParams.repository,
        branch: validatedParams.branch,
      });

      // Send error progress update with isFinal flag
      try {
        await context.sendProgress({
          status: 'error',
          message: `Louvain Community Detection failed: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      throw error;
    }
  },

  pagerank: async (params, context) => {
    const { memoryService } = context;
    const validatedParams = PageRankInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'pagerank');

    context.logger.info(
      `Executing pagerank for ${validatedParams.repository}:${validatedParams.branch}`,
      {
        projectedGraphName: validatedParams.projectedGraphName,
        dampingFactor: validatedParams.dampingFactor,
        maxIterations: validatedParams.maxIterations,
        clientProjectRoot,
      },
    );

    try {
      // Report initialization progress
      await context.sendProgress({
        status: 'initializing',
        message: `Starting PageRank for graph ${validatedParams.projectedGraphName} in ${validatedParams.repository}:${validatedParams.branch}`,
      });

      // Get PageRank result
      const pageRankOutput = await memoryService.pageRank(
        context,
        clientProjectRoot,
        validatedParams,
      );

      // Extract results and handle potential null/undefined
      const ranks = pageRankOutput?.results?.ranks || [];
      const resultStatus = pageRankOutput?.status || 'complete';
      const resultMessage = pageRankOutput?.message;

      // Send in-progress update
      await context.sendProgress({
        status: 'in_progress',
        message: `PageRank calculation processing for ${validatedParams.projectedGraphName}. Ranks found: ${ranks.length}.`,
      });

      // Final result payload with isFinal flag
      await context.sendProgress({
        status: resultStatus,
        message: resultMessage,
        isFinal: true,
      });

      // Return the final result as the tool response
      return {
        status: resultStatus,
        projectedGraphName: validatedParams.projectedGraphName,
        results: {
          ranks,
        },
        message: resultMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in pagerank handler: ${errorMessage}`, {
        error: String(error),
        repository: validatedParams.repository,
        branch: validatedParams.branch,
        projectedGraphName: validatedParams.projectedGraphName,
      });

      // Send error progress update with isFinal flag
      try {
        await context.sendProgress({
          status: 'error',
          message: `PageRank failed: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      throw error;
    }
  },

  'strongly-connected-components': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = StronglyConnectedComponentsInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'strongly-connected-components',
    );

    context.logger.info(
      `Executing strongly-connected-components for ${validatedParams.repository}:${validatedParams.branch}`,
      {
        projectedGraphName: validatedParams.projectedGraphName,
        clientProjectRoot,
      },
    );

    try {
      // Report initialization progress
      await context.sendProgress({
        status: 'initializing',
        message: `Starting Strongly Connected Components analysis for graph ${validatedParams.projectedGraphName} in ${validatedParams.repository}:${validatedParams.branch}`,
      });

      // Get SCC result
      const sccOutput = await memoryService.getStronglyConnectedComponents(
        context,
        clientProjectRoot,
        validatedParams,
      );

      // Extract results and handle potential null/undefined
      const components = sccOutput?.results?.components || [];
      const resultStatus = sccOutput?.status || 'complete';
      const resultMessage = sccOutput?.message;

      // Send in-progress update
      await context.sendProgress({
        status: 'in_progress',
        message: `Strongly Connected Components analysis processing for ${validatedParams.projectedGraphName}. Components found: ${components.length}.`,
      });

      // Final result payload with isFinal flag
      await context.sendProgress({
        status: resultStatus,
        message: resultMessage,
        isFinal: true,
      });

      // Return the final result as the tool response
      return {
        status: resultStatus,
        projectedGraphName: validatedParams.projectedGraphName,
        results: {
          components,
        },
        message: resultMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in strongly-connected-components handler: ${errorMessage}`, {
        error: String(error),
        repository: validatedParams.repository,
        branch: validatedParams.branch,
        projectedGraphName: validatedParams.projectedGraphName,
      });

      // Send error progress update with isFinal flag
      try {
        await context.sendProgress({
          status: 'error',
          message: `Strongly Connected Components analysis failed: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      throw error;
    }
  },

  'weakly-connected-components': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = WeaklyConnectedComponentsInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'weakly-connected-components',
    );

    context.logger.info(
      `Executing weakly-connected-components for ${validatedParams.repository}:${validatedParams.branch}`,
      {
        projectedGraphName: validatedParams.projectedGraphName,
        clientProjectRoot,
      },
    );

    try {
      // Report initialization progress
      await context.sendProgress({
        status: 'initializing',
        message: `Starting Weakly Connected Components analysis for graph ${validatedParams.projectedGraphName} in ${validatedParams.repository}:${validatedParams.branch}`,
      });

      // Get WCC result
      const wccOutput = await memoryService.getWeaklyConnectedComponents(
        context,
        clientProjectRoot,
        validatedParams,
      );

      // Extract results and handle potential null/undefined
      const components = wccOutput?.results?.components || [];
      const resultStatus = wccOutput?.status || 'complete';
      const resultMessage = wccOutput?.message;

      // Send in-progress update
      await context.sendProgress({
        status: 'in_progress',
        message: `Weakly Connected Components analysis processing for ${validatedParams.projectedGraphName}. Components found: ${components.length}.`,
      });

      // Final result payload with isFinal flag
      await context.sendProgress({
        status: resultStatus,
        message: resultMessage,
        isFinal: true,
      });

      // Return the final result as the tool response
      return {
        status: resultStatus,
        repository: validatedParams.repository,
        branch: validatedParams.branch,
        projectedGraphName: validatedParams.projectedGraphName,
        results: {
          components,
        },
        message: resultMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in weakly-connected-components handler: ${errorMessage}`, {
        error: String(error),
        repository: validatedParams.repository,
        branch: validatedParams.branch,
        projectedGraphName: validatedParams.projectedGraphName,
      });

      // Send error progress update with isFinal flag
      try {
        await context.sendProgress({
          status: 'error',
          message: `Weakly Connected Components analysis failed: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      throw error;
    }
  },

  'shortest-path': async (params, context) => {
    const { memoryService } = context;
    const validatedParams = ShortestPathInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'shortest-path');

    context.logger.info(
      `Executing shortest-path for ${validatedParams.repository}:${validatedParams.branch}`,
      {
        projectedGraphName: validatedParams.projectedGraphName,
        startNodeId: validatedParams.startNodeId,
        endNodeId: validatedParams.endNodeId,
        clientProjectRoot,
      },
    );

    try {
      // Report initialization progress
      await context.sendProgress({
        status: 'initializing',
        message: `Starting shortest path search from ${validatedParams.startNodeId} to ${validatedParams.endNodeId} in graph ${validatedParams.projectedGraphName} in ${validatedParams.repository}:${validatedParams.branch}`,
      });

      // Get shortest path result
      const shortestPathOutput = await memoryService.shortestPath(
        context,
        clientProjectRoot,
        validatedParams,
      );

      // Extract results and handle potential null/undefined
      const pathFound = shortestPathOutput?.results?.pathFound || false;
      const path = shortestPathOutput?.results?.path || [];
      const pathLength = pathFound ? path.length : 0;
      const resultStatus = shortestPathOutput?.status || 'complete';
      const resultMessage = shortestPathOutput?.message;

      // Send in-progress update
      await context.sendProgress({
        status: 'in_progress',
        message: `Shortest path search processing for ${validatedParams.projectedGraphName}. Path found: ${pathFound}. Length: ${pathLength}`,
      });

      // Final result payload with isFinal flag
      await context.sendProgress({
        status: resultStatus,
        message: resultMessage,
        isFinal: true,
      });

      // Return the final result as the tool response
      return {
        status: resultStatus,
        projectedGraphName: validatedParams.projectedGraphName,
        startNodeId: validatedParams.startNodeId,
        endNodeId: validatedParams.endNodeId,
        results: {
          pathFound,
          path,
          length: pathLength,
        },
        message: resultMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in shortest-path handler: ${errorMessage}`, {
        error: String(error),
        repository: validatedParams.repository,
        branch: validatedParams.branch,
        projectedGraphName: validatedParams.projectedGraphName,
        startNodeId: validatedParams.startNodeId,
        endNodeId: validatedParams.endNodeId,
      });

      // Send error progress update with isFinal flag
      try {
        await context.sendProgress({
          status: 'error',
          message: `Shortest path search failed: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      throw error;
    }
  },

  count_nodes_by_label: async (params, context) => {
    const { memoryService } = context;
    const validatedParams = CountNodesByLabelInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'count_nodes_by_label',
    );
    context.logger.info(
      `Executing count_nodes_by_label for ${validatedParams.repository}:${validatedParams.branch}`,
      { label: validatedParams.label, clientProjectRoot },
    );

    try {
      const result = await memoryService.countNodesByLabel(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.label,
      );
      if (result.count === -1 && !result.label) {
        throw new Error(
          `Failed to count nodes for label '${validatedParams.label}' (service indicated error)`,
        );
      }
      return result;
    } catch (error: any) {
      context.logger.error(`Error in count_nodes_by_label handler: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  },

  list_nodes_by_label: async (params, context) => {
    const { memoryService } = context;
    const validatedParams = ListNodesByLabelInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'list_nodes_by_label',
    );
    context.logger.info(
      `Executing list_nodes_by_label for ${validatedParams.repository}:${validatedParams.branch}`,
      { ...validatedParams, clientProjectRoot },
    );

    try {
      const result = await memoryService.listNodesByLabel(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.label,
        validatedParams.limit,
        validatedParams.offset,
      );
      if (result.totalInLabel === -1 && !result.label) {
        throw new Error(
          `Failed to list nodes for label '${validatedParams.label}' (service indicated error)`,
        );
      }
      return result;
    } catch (error: any) {
      context.logger.error(`Error in list_nodes_by_label handler: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  },

  get_node_properties: async (params, context) => {
    const { memoryService } = context;
    const validatedParams = GetNodePropertiesInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'get_node_properties',
    );
    context.logger.info(
      `Executing get_node_properties for ${validatedParams.repository}:${validatedParams.branch}`,
      { label: validatedParams.label, clientProjectRoot },
    );

    try {
      const result = await memoryService.getNodeProperties(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.label,
      );
      return result;
    } catch (error: any) {
      context.logger.error(`Error in get_node_properties handler: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  },

  list_all_indexes: async (params, context) => {
    const { memoryService } = context;
    const validatedParams = ListAllIndexesInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'list_all_indexes',
    );
    context.logger.info(
      `Executing list_all_indexes for ${validatedParams.repository}:${validatedParams.branch}`,
      { label: validatedParams.label, clientProjectRoot },
    );

    try {
      const result = await memoryService.listAllIndexes(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.label,
      );
      return result;
    } catch (error: any) {
      context.logger.error(`Error in list_all_indexes handler: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  },

  add_file: async (params, context) => {
    const { memoryService } = context;
    const validatedParams = AddFileInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'add_file');
    context.logger.info(
      `Executing add_file for ${validatedParams.repository}:${validatedParams.branch}`,
      { path: validatedParams.path, clientProjectRoot },
    );

    try {
      const result = await memoryService.addFile(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams,
      );
      if (!result.success) {
        throw new Error(result.message || `Failed to add file '${validatedParams.path}'`);
      }
      return result;
    } catch (error: any) {
      context.logger.error(`Error in add_file handler: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  },

  associate_file_with_component: async (params, context) => {
    const { memoryService } = context;
    const validatedParams = AssociateFileWithComponentInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'associate_file_with_component',
    );
    context.logger.info(
      `Executing associate_file_with_component for ${validatedParams.repository}:${validatedParams.branch}`,
      { componentId: validatedParams.componentId, fileId: validatedParams.fileId },
    );

    try {
      const result = await memoryService.associateFileWithComponent(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.componentId,
        validatedParams.fileId,
      );
      if (!result.success) {
        throw new Error(result.message || 'Failed to associate file with component.');
      }
      return result;
    } catch (error: any) {
      context.logger.error(`Error in associate_file_with_component handler: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  },

  add_tag: async (params, context) => {
    const { memoryService } = context;
    const validatedParams = AddTagInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'add_tag');
    context.logger.info(
      `Executing add_tag for ${validatedParams.repository}:${validatedParams.branch}`,
      { tagName: validatedParams.name },
    );

    try {
      const result = await memoryService.addTag(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams,
      );
      if (!result.success) {
        throw new Error(result.message || `Failed to add tag '${validatedParams.name}'`);
      }
      return result;
    } catch (error: any) {
      context.logger.error(`Error in add_tag handler: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  },

  tag_item: async (params, context) => {
    const { memoryService } = context;
    const validatedParams = TagItemInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'tag_item');
    context.logger.info(
      `Executing tag_item for ${validatedParams.repository}:${validatedParams.branch}`,
      {
        item: `${validatedParams.itemType}:${validatedParams.itemId}`,
        tagId: validatedParams.tagId,
      },
    );

    try {
      const result = await memoryService.tagItem(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.itemId,
        validatedParams.itemType,
        validatedParams.tagId,
      );
      if (!result.success) {
        throw new Error(result.message || 'Failed to tag item.');
      }
      return result;
    } catch (error: any) {
      context.logger.error(`Error in tag_item handler: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  },

  find_items_by_tag: async (params, context) => {
    const { memoryService } = context;
    const validatedParams = FindItemsByTagInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'find_items_by_tag',
    );
    context.logger.info(
      `Executing find_items_by_tag for ${validatedParams.repository}:${validatedParams.branch}`,
      { tagId: validatedParams.tagId, itemTypeFilter: validatedParams.itemTypeFilter },
    );

    try {
      const result = await memoryService.findItemsByTag(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
        validatedParams.tagId,
        validatedParams.itemTypeFilter,
      );
      return result;
    } catch (error: any) {
      context.logger.error(`Error in find_items_by_tag handler: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  },

  list_all_labels: async (params, context) => {
    const { memoryService } = context;
    const validatedParams = ListAllLabelsInputSchema.parse(params);
    const clientProjectRoot = ensureValidSessionContext(
      validatedParams,
      context,
      'list_all_labels',
    );
    context.logger.info(
      `Executing list_all_labels for ${validatedParams.repository}:${validatedParams.branch}`,
      { clientProjectRoot },
    );

    try {
      await context.sendProgress({
        status: 'initializing',
        message: `Fetching all node labels for ${validatedParams.repository}:${validatedParams.branch}`,
      });

      const result = await memoryService.listAllNodeLabels(
        context,
        clientProjectRoot,
        validatedParams.repository,
        validatedParams.branch,
      );

      await context.sendProgress({
        status: 'complete',
        message: `Successfully fetched ${result.labels.length} labels.`,
        data: {
          labels: result.labels,
        },
        isFinal: true,
      });

      return result; // This should match ListAllLabelsOutputSchema
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Error in list_all_labels handler: ${errorMessage}`, {
        error: String(error),
        repository: validatedParams.repository,
        branch: validatedParams.branch,
      });
      try {
        await context.sendProgress({
          status: 'error',
          message: `Failed to list all labels: ${errorMessage}`,
          isFinal: true,
        });
      } catch (progressError) {
        context.logger.error(`Failed to send error progress: ${String(progressError)}`);
      }
      throw error;
    }
  },
};
