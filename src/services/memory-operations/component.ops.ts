import { KuzuDBClient } from '../../db/kuzu';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { ComponentRepository, RepositoryRepository } from '../../repositories';
import { Component, ComponentInput } from '../../types';

// Helper function to parse timestamps from BaseEntity (Date | undefined) to string | null
function parseBaseEntityTimestamp(timestamp: Date | undefined): string | null {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return null;
}

/**
 * Creates or updates a component in a repository.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param componentData - Data for the component to be upserted.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to the upserted Component object or null if repository not found.
 */
export async function upsertComponentOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  componentData: ComponentInput,
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository,
): Promise<Component | null> {
  const logger = mcpContext.logger;

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(
      `[component.ops.upsertComponentOp] Repository not found: ${repositoryName}/${branch}`,
    );
    return null;
  }

  const inputForRepo: ComponentInput = {
    id: componentData.id,
    name: componentData.name,
    kind: componentData.kind,
    status: componentData.status || 'active',
    depends_on: componentData.depends_on || componentData.dependsOn || undefined,
    branch: branch,
  };

  logger.debug(
    `[component.ops.upsertComponentOp] Calling componentRepo.upsertComponent for ${inputForRepo.id} in repo ${repository.id}`,
    { inputForRepo },
  );
  const upsertedComponent = await componentRepo.upsertComponent(repository.id, inputForRepo);
  if (!upsertedComponent) {
    logger.warn(
      `[component.ops.upsertComponentOp] componentRepo.upsertComponent returned null for ${componentData.id} in ${repositoryName}:${branch}`,
    );
    return null;
  }
  logger.info(
    `[component.ops.upsertComponentOp] Component ${upsertedComponent.id} upserted successfully in ${repositoryName}:${branch}.`,
  );
  return normalizeComponent(upsertedComponent, repositoryName, branch);
}

/**
 * Bulk creates or updates components in a repository.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param componentsData - Array of data for the components to be upserted.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @param overwrite - Whether to overwrite existing components.
 * @returns A Promise resolving to stats about the operation.
 */
export async function bulkUpsertComponentOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  componentsData: ComponentInput[],
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository,
  overwrite: boolean = true,
): Promise<{ upserted: number; skipped: number; failed: number }> {
  const logger = mcpContext.logger;

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(
      `[component.ops.bulkUpsertComponentOp] Repository not found: ${repositoryName}/${branch}`,
    );
    return { upserted: 0, skipped: 0, failed: componentsData.length };
  }

  // Normalize inputs
  const inputsForRepo: ComponentInput[] = componentsData.map(c => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    status: c.status || 'active',
    depends_on: c.depends_on || c.dependsOn || undefined,
    branch: branch, // Enforce branch
    repository: repositoryName // Enforce repository name
  }));

  try {
    const result = await componentRepo.bulkUpsertComponents(
      repository.id,
      inputsForRepo,
      overwrite
    );

    logger.info(
      `[component.ops.bulkUpsertComponentOp] Batch complete: ${result.upserted} upserted, ${result.skipped} skipped in ${repositoryName}:${branch}.`,
    );
    return { upserted: result.upserted, skipped: result.skipped, failed: 0 };
  } catch (error) {
    logger.error(
      `[component.ops.bulkUpsertComponentOp] Batch failed in ${repositoryName}:${branch}: ${error}`,
    );
    return { upserted: 0, skipped: 0, failed: componentsData.length };
  }
}


/**
 * Retrieves all upstream dependencies for a component.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param componentId - The ID (yaml_id) of the component.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to an array of dependent Component objects.
 */
export async function getComponentDependenciesOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  componentId: string,
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository,
): Promise<Component[]> {
  const logger = mcpContext.logger;
  logger.debug(
    `[component.ops.getComponentDependenciesOp] For component ${componentId} in ${repositoryName}:${branch}`,
  );

  const dependencies = await componentRepo.getComponentDependencies(
    repositoryName,
    componentId,
    branch,
  );
  logger.debug(
    `[component.ops.getComponentDependenciesOp] Found ${dependencies.length} dependencies for ${componentId}.`,
  );
  return dependencies.map((comp) => normalizeComponent(comp, repositoryName, branch));
}

/**
 * Retrieves all downstream dependents of a component.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param componentId - The ID (yaml_id) of the component.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to an array of dependent Component objects.
 */
export async function getComponentDependentsOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  componentId: string,
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository,
): Promise<Component[]> {
  const logger = mcpContext.logger;
  logger.debug(
    `[component.ops.getComponentDependentsOp] For component ${componentId} in ${repositoryName}:${branch}`,
  );

  const dependents = await componentRepo.getComponentDependents(
    repositoryName,
    componentId,
    branch,
  );
  logger.debug(
    `[component.ops.getComponentDependentsOp] Found ${dependents.length} dependents for ${componentId}.`,
  );
  return dependents.map((comp) => normalizeComponent(comp, repositoryName, branch));
}

/**
 * Retrieves all active components for a repository and branch.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to an array of active Component objects.
 */
export async function getActiveComponentsOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository,
): Promise<Component[]> {
  const logger = mcpContext.logger;

  logger.debug(`[component.ops.getActiveComponentsOp] For ${repositoryName}:${branch}`);
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(
      `[component.ops.getActiveComponentsOp] Repository not found: ${repositoryName}/${branch}`,
    );
    return [];
  }
  const activeComponents = await componentRepo.getActiveComponents(repository.id, branch);
  logger.debug(
    `[component.ops.getActiveComponentsOp] Found ${activeComponents.length} active components for ${repositoryName}:${branch}.`,
  );
  return activeComponents.map((comp) => normalizeComponent(comp, repositoryName, branch));
}

/**
 * Helper function to ensure component has repository and branch fields populated
 */
function normalizeComponent(
  component: Component,
  repositoryName: string,
  branch: string,
): Component {
  return {
    ...component,
    repository: repositoryName,
    branch: branch,
  };
}

export async function deleteComponentOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  repositoryRepo: RepositoryRepository,
  repositoryName: string,
  branch: string,
  componentId: string,
): Promise<boolean> {
  const logger = mcpContext.logger;

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(
      `[component.ops.deleteComponentOp] Repository ${repositoryName}:${branch} not found.`,
    );
    return false;
  }

  const graphUniqueId = `${repositoryName}:${branch}:${componentId}`;
  const deleteQuery = `
    MATCH (c:Component {graph_unique_id: $graphUniqueId})
    DETACH DELETE c
    RETURN 1 as deletedCount
  `;

  const result = await kuzuClient.executeQuery(deleteQuery, { graphUniqueId });
  const deletedCount = result[0]?.deletedCount || 0;

  logger.info(
    `[component.ops.deleteComponentOp] Deleted ${deletedCount} component(s) with ID ${componentId}`,
  );
  return deletedCount > 0;
}
