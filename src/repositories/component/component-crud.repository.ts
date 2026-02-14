import { Component, ComponentInput, ComponentStatus } from '../../types';
import { BaseComponentRepository } from '../base/base-component.repository';

/**
 * Repository for basic Component CRUD operations
 * Handles create, read, update, delete operations for components
 */
export class ComponentCrudRepository extends BaseComponentRepository {
  /**
   * Get all active components for a specific repository and branch
   */
  async getActiveComponents(
    repositoryNodeId: string,
    componentBranch: string,
  ): Promise<Component[]> {
    const query = `
      MATCH (r:Repository {id: $repositoryNodeId})<-[:PART_OF]-(c:Component)
      WHERE c.status = $status AND c.branch = $componentBranch 
      RETURN c ORDER BY c.name ASC
    `;
    const params = { repositoryNodeId, status: 'active', componentBranch };

    try {
      const result = await this.executeQueryWithLogging(query, params, 'getActiveComponents');
      if (result.length === 0) {
        return [];
      }
      const repoNameFromNodeId = repositoryNodeId.split(':')[0];
      return result.map((row: any) =>
        this.formatKuzuRowToComponent(row.c, repoNameFromNodeId, componentBranch),
      );
    } catch (error: any) {
      this.logger.error(
        `Error in getActiveComponents for ${repositoryNodeId}, branch ${componentBranch}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Find a component by its logical ID and branch, within a given repository context
   */
  async findByIdAndBranch(
    repositoryName: string,
    itemId: string,
    itemBranch: string,
  ): Promise<Component | null> {
    const graphUniqueId = this.createGraphUniqueId(repositoryName, itemBranch, itemId);

    try {
      // Step 1: Get the basic component info
      const query = `MATCH (c:Component {graph_unique_id: $graphUniqueId}) RETURN c LIMIT 1`;
      const result = await this.executeQueryWithLogging(
        query,
        { graphUniqueId },
        'findByIdAndBranch',
      );

      if (result.length === 0) {
        this.logger.debug(`Component not found for GID: ${graphUniqueId}`);
        return null;
      }

      const componentNode = result[0]?.c;
      if (!componentNode) {
        this.logger.debug(`Component result format invalid for GID: ${graphUniqueId}`);
        return null;
      }

      // Get component data from the basic result
      const componentData = this.formatKuzuRowToComponent(
        componentNode,
        repositoryName,
        itemBranch,
      );

      // Step 2: Get the component's dependencies
      const depsQuery = `
        MATCH (c:Component {graph_unique_id: $graphUniqueId})-[:DEPENDS_ON]->(dep:Component)
        RETURN dep.id as depId
      `;

      const depsResult = await this.executeQueryWithLogging(
        depsQuery,
        { graphUniqueId },
        'findByIdAndBranch-dependencies',
      );

      // Update the dependencies
      componentData.depends_on =
        depsResult.length > 0 ? depsResult.map((dep: any) => dep.depId) : [];

      this.logger.debug(`Found ${depsResult.length} dependencies for ${graphUniqueId}`);

      return componentData;
    } catch (error: any) {
      this.logger.error(`Error in findByIdAndBranch for GID ${graphUniqueId}:`, error);
      return null;
    }
  }

  /**
   * Update component status
   */
  async updateComponentStatus(
    repositoryName: string,
    itemId: string,
    branch: string,
    status: ComponentStatus,
  ): Promise<Component | null> {
    const graphUniqueId = this.createGraphUniqueId(repositoryName, branch, itemId);
    const now = new Date();

    const query = `
      MATCH (c:Component {graph_unique_id: $graphUniqueId})
      SET c.status = $status, c.updated_at = $updatedAt
      RETURN c
    `;

    const params = {
      graphUniqueId,
      status,
      updatedAt: now,
    };

    try {
      const result = await this.executeQueryWithLogging(query, params, 'updateComponentStatus');

      if (result.length > 0 && result[0].c) {
        this.logger.info(`Status updated for component ${graphUniqueId} to ${status}`);
        return this.formatKuzuRowToComponent(result[0].c, repositoryName, branch);
      } else {
        this.logger.warn(
          `Component ${graphUniqueId} not found or status update failed to return node.`,
        );
        return this.findByIdAndBranch(repositoryName, itemId, branch);
      }
    } catch (error: any) {
      this.logger.error(
        `Error executing updateComponentStatus for ${graphUniqueId} to status ${status}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Upsert a component with basic information
   */
  async upsertComponent(
    repositoryNodeId: string,
    component: ComponentInput,
  ): Promise<Component | null> {
    const logicalRepositoryName = this.validateRepositoryNodeId(
      repositoryNodeId,
      'upsertComponent',
    );
    const componentId = String(component.id);
    const componentBranch = String(component.branch || 'main');
    const graphUniqueId = this.createGraphUniqueId(
      logicalRepositoryName,
      componentBranch,
      componentId,
    );
    const now = new Date();

    try {
      const result = await this.kuzuClient.transaction(async (tx) => {
        // Atomic MERGE query that includes PART_OF relationship creation
        const upsertNodeQuery = `
          MERGE (repo:Repository {id: $repositoryId})
          ON CREATE SET repo.name = $repository, repo.created_at = $now
          MERGE (c:Component {id: $componentId, graph_unique_id: $graphUniqueId})
          ON CREATE SET
            c.id = $componentId,
            c.name = $name,
            c.kind = $kind,
            c.status = $status,
            c.branch = $branch,
            c.repository = $repository,
            c.created_at = $createdAt,
            c.updated_at = $now
          ON MATCH SET
            c.id = $componentId,
            c.name = $name,
            c.kind = $kind,
            c.status = $status,
            c.branch = $branch,
            c.repository = $repository,
            c.created_at = $createdAt,
            c.updated_at = $now
          MERGE (c)-[:PART_OF]->(repo)
        `;
        await tx.executeQuery(upsertNodeQuery, {
          graphUniqueId,
          componentId,
          name: component.name,
          kind: component.kind || 'Unknown',
          status: component.status || 'active',
          branch: componentBranch,
          repository: logicalRepositoryName,
          repositoryId: repositoryNodeId,
          now: now,
          createdAt: component.created_at ? new Date(component.created_at) : now,
        });

        // Handle dependencies
        if (component.depends_on && component.depends_on.length > 0) {
          // First, delete existing dependencies for this component
          await tx.executeQuery(
            'MATCH (c:Component {graph_unique_id: $graphUniqueId})-[r:DEPENDS_ON]->() DELETE r',
            { graphUniqueId },
          );

          for (const depId of component.depends_on) {
            const depGraphUniqueId = this.createGraphUniqueId(
              logicalRepositoryName,
              componentBranch,
              depId,
            );
            // Ensure dependency node exists (as a placeholder if needed)
            await tx.executeQuery(
              `MERGE (dep:Component {graph_unique_id: $depGraphUniqueId}) ON CREATE SET dep.id = $depId, dep.name = $depName, dep.status = 'planned', dep.branch = $branch`,
              {
                depGraphUniqueId,
                depId,
                depName: `Placeholder for ${depId}`,
                branch: componentBranch,
              },
            );

            // Create the new dependency relationship
            await tx.executeQuery(
              'MATCH (c:Component {graph_unique_id: $cId}), (d:Component {graph_unique_id: $dId}) MERGE (c)-[:DEPENDS_ON]->(d)',
              { cId: graphUniqueId, dId: depGraphUniqueId },
            );
          }
        }

        return true;
      });

      if (result) {
        return this.findByIdAndBranch(logicalRepositoryName, componentId, componentBranch);
      }
      return null;
    } catch (error: any) {
      this.logger.error(`ERROR in upsertComponent for ${graphUniqueId}:`, error);
      throw error;
    }
  }

  /**
   * Bulk upsert components
   */
  async bulkUpsertComponents(
    repositoryNodeId: string,
    components: ComponentInput[],
    overwrite: boolean = true,
  ): Promise<{ upserted: number; skipped: number }> {
    const logicalRepositoryName = this.validateRepositoryNodeId(
      repositoryNodeId,
      'bulkUpsertComponents',
    );
    const now = new Date();

    if (components.length === 0) {
      return { upserted: 0, skipped: 0 };
    }

    // Filter nulls or invalid
    let validComponents = components.filter((c) => c && c.id);
    let skipped = 0;

    // Prepare metadata
    const componentMeta = validComponents.map((c) => {
      const branch = String(c.branch || 'main');
      return {
        ...c,
        branch,
        graphUniqueId: this.createGraphUniqueId(logicalRepositoryName, branch, String(c.id)),
      };
    });

    // Handle skipped items (check existence) if not overwriting
    if (!overwrite) {
      const gids = componentMeta.map((c) => c.graphUniqueId);
      const query = `
        UNWIND $gids AS gid
        MATCH (c:Component {graph_unique_id: gid})
        RETURN c.graph_unique_id as id
      `;

      try {
        const existingResult = await this.executeQueryWithLogging(query, { gids }, 'bulkUpsert-check');
        const existingIds = new Set(existingResult.map((r: any) => r.id));

        if (existingIds.size > 0) {
           const newComponents = [];
           for (const meta of componentMeta) {
               if (existingIds.has(meta.graphUniqueId)) {
                   skipped++;
               } else {
                   newComponents.push(meta);
               }
           }
           validComponents = newComponents;
        }
      } catch (error) {
        this.logger.error('Error checking existing components in bulk upsert', error);
        throw error;
      }
    } else {
        validComponents = componentMeta;
    }

    if (validComponents.length === 0) {
        return { upserted: 0, skipped };
    }

    // Prepare arrays for bulk insert
    const count = validComponents.length;
    // Cast to any to access graphUniqueId added in previous step
    const comps = validComponents as any[];

    const ids = comps.map(c => String(c.id));
    const names = comps.map(c => c.name);
    const kinds = comps.map(c => c.kind || 'Unknown');
    const statuses = comps.map(c => c.status || 'active');
    const branches = comps.map(c => c.branch);
    const repositories = comps.map(_ => logicalRepositoryName);
    const graphUniqueIds = comps.map(c => c.graphUniqueId);

    try {
        await this.kuzuClient.transaction(async (tx) => {
           // Upsert components and connect to repository
           // Optimized query: Merge repo once, then unwind components
           // Using  for created_at/updated_at to avoid casting issues with lists
           const query = `
             MERGE (repo:Repository {id: $repositoryId})
             ON CREATE SET repo.name = $repoName, repo.created_at = $now

             WITH repo
             UNWIND range(1, $count) AS idx

             MERGE (c:Component {graph_unique_id: $graphUniqueIds[idx]})
             ON CREATE SET
                c.id = $ids[idx],
                c.name = $names[idx],
                c.kind = $kinds[idx],
                c.status = $statuses[idx],
                c.branch = $branches[idx],
                c.repository = $repositories[idx],
                c.created_at = $now,
                c.updated_at = $now
             ON MATCH SET
                c.id = $ids[idx],
                c.name = $names[idx],
                c.kind = $kinds[idx],
                c.status = $statuses[idx],
                c.branch = $branches[idx],
                c.repository = $repositories[idx],
                c.created_at = $now,
                c.updated_at = $now

             MERGE (c)-[:PART_OF]->(repo)
           `;

           await tx.executeQuery(query, {
             count,
             repositoryId: repositoryNodeId,
             repoName: logicalRepositoryName,
             now,
             ids,
             graphUniqueIds,
             names,
             kinds,
             statuses,
             branches,
             repositories
           });

           // Flatten dependencies and identify components with deps
           const depPairs: {source: string, target: string, depId: string, branch: string}[] = [];
           const componentsWithNewDeps = new Set<string>();

           comps.forEach(c => {
               const hasDeps = (c.depends_on && c.depends_on.length > 0) || (c.dependsOn && c.dependsOn.length > 0);
               if (hasDeps) {
                   componentsWithNewDeps.add(c.graphUniqueId);
               }

               if (c.depends_on && c.depends_on.length > 0) {
                   c.depends_on.forEach((depId: string) => {
                       const targetGid = this.createGraphUniqueId(logicalRepositoryName, c.branch, depId);
                       depPairs.push({
                           source: c.graphUniqueId,
                           target: targetGid,
                           depId: depId,
                           branch: c.branch
                       });
                   });
               }
               // Also check 'dependsOn' alternative casing
               if (c.dependsOn && c.dependsOn.length > 0) {
                   c.dependsOn.forEach((depId: string) => {
                       const targetGid = this.createGraphUniqueId(logicalRepositoryName, c.branch, depId);
                       depPairs.push({
                           source: c.graphUniqueId,
                           target: targetGid,
                           depId: depId,
                           branch: c.branch
                       });
                   });
               }
           });

           // Cleanup existing dependencies for components that provided new dependencies
           // This maintains consistency with single upsert behavior (replace if provided)
           if (componentsWithNewDeps.size > 0) {
               const gidsToClean = Array.from(componentsWithNewDeps);
               await tx.executeQuery(`
                 UNWIND $gidsToClean AS gid
                 MATCH (c:Component {graph_unique_id: gid})-[r:DEPENDS_ON]->()
                 DELETE r
               `, { gidsToClean });
           }

           if (depPairs.length > 0) {
               const sourceGids = depPairs.map(d => d.source);
               const targetGids = depPairs.map(d => d.target);
               const targetIds = depPairs.map(d => d.depId);
               const targetBranches = depPairs.map(d => d.branch);

               // Create placeholders for dependencies
                const placeholderQuery = `
                 UNWIND range(1, $count) AS idx
                 MERGE (dep:Component {graph_unique_id: $targetGids[idx]})
                 ON CREATE SET
                    dep.id = $targetIds[idx],
                    dep.name = 'Placeholder for ' + $targetIds[idx],
                    dep.status = 'planned',
                    dep.branch = $targetBranches[idx]
               `;
               await tx.executeQuery(placeholderQuery, {
                   count: depPairs.length,
                   targetGids,
                   targetIds,
                   targetBranches
               });

               // Create relationships
               const relQuery = `
                 UNWIND range(1, $count) AS idx
                 MATCH (c:Component {graph_unique_id: $sourceGids[idx]})
                 MATCH (d:Component {graph_unique_id: $targetGids[idx]})
                 MERGE (c)-[:DEPENDS_ON]->(d)
               `;

               await tx.executeQuery(relQuery, {
                   count: depPairs.length,
                   sourceGids,
                   targetGids
               });
           }
        });

        return { upserted: count, skipped };
    } catch (error: any) {
        this.logger.error(`ERROR in bulkUpsertComponents`, error);
        throw error;
    }
  }
}
