import { KuzuDBClient } from '../db/kuzu.js';
import { logger } from '../utils/logger';

export interface SnapshotResult {
  snapshotId: string;
  entitiesCount: number;
  relationshipsCount: number;
  created: string;
  description: string;
}

export interface RollbackResult {
  success: boolean;
  restoredEntities: number;
  restoredRelationships: number;
  rollbackTime: string;
  snapshotId: string;
}

export interface SnapshotInfo {
  id: string;
  repository: string;
  branch: string;
  description: string;
  created: string;
  entitiesCount: number;
  relationshipsCount: number;
  size: number; // Size in bytes
}

export interface ValidationResult {
  valid: boolean;
  snapshotId: string;
  entityCount: number;
  relationshipCount: number;
  issues: string[];
  reason?: string;
}

export interface SnapshotData {
  snapshotId: string;
  repository: string;
  branch: string;
  description: string;
  created: string;
  entities: any[];
  relationships: any[];
  metadata: any;
}

/**
 * Snapshot Service for Core Memory Optimization Agent
 *
 * Provides safe backup and restore capabilities for memory graphs,
 * enabling confident optimization with rollback guarantees.
 */
export class SnapshotService {
  private snapshotLogger = logger.child({ service: 'SnapshotService' });

  constructor(private kuzuClient: KuzuDBClient) {
    this.snapshotLogger.info('SnapshotService initialized');
  }

  /**
   * Create a snapshot of the current memory state for a repository/branch
   */
  async createSnapshot(
    repository: string,
    branch: string,
    description: string = 'Memory optimization snapshot',
  ): Promise<SnapshotResult> {
    const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const created = new Date().toISOString();

    const snapshotLogger = this.snapshotLogger.child({
      operation: 'createSnapshot',
      snapshotId,
      repository,
      branch,
    });

    try {
      snapshotLogger.info('Creating memory snapshot');

      // Ensure snapshot table exists
      await this.ensureSnapshotSchema();

      // Export all entities for this repository/branch
      const entities = await this.exportAllEntities(repository, branch);
      snapshotLogger.debug(`Exported ${entities.length} entities`);

      // Export all relationships for this repository/branch
      const relationships = await this.exportAllRelationships(repository, branch);
      snapshotLogger.debug(`Exported ${relationships.length} relationships`);

      // Get repository metadata
      const metadata = await this.getRepositoryMetadata(repository, branch);

      // Store snapshot data
      const snapshotData: SnapshotData = {
        snapshotId,
        repository,
        branch,
        description,
        created,
        entities,
        relationships,
        metadata,
      };

      await this.storeSnapshot(snapshotData);

      const result: SnapshotResult = {
        snapshotId,
        entitiesCount: entities.length,
        relationshipsCount: relationships.length,
        created,
        description,
      };

      snapshotLogger.info('Snapshot created successfully', {
        entitiesCount: entities.length,
        relationshipsCount: relationships.length,
      });

      return result;
    } catch (error) {
      snapshotLogger.error('Failed to create snapshot:', error);
      throw new Error(`Failed to create snapshot: ${error}`);
    }
  }

  /**
   * Rollback to a specific snapshot
   */
  async rollbackToSnapshot(snapshotId: string): Promise<RollbackResult> {
    const rollbackLogger = this.snapshotLogger.child({
      operation: 'rollbackToSnapshot',
      snapshotId,
    });

    try {
      rollbackLogger.info('Starting rollback to snapshot');

      // Get snapshot data
      const snapshot = await this.getSnapshot(snapshotId);
      if (!snapshot) {
        throw new Error(`Snapshot ${snapshotId} not found`);
      }

      // Validate snapshot before rollback
      const validation = await this.validateSnapshot(snapshotId);
      if (!validation.valid) {
        throw new Error(`Snapshot validation failed: ${validation.issues.join(', ')}`);
      }

      rollbackLogger.info('Snapshot validation passed, beginning rollback', {
        repository: snapshot.repository,
        branch: snapshot.branch,
        entitiesCount: snapshot.entities.length,
        relationshipsCount: snapshot.relationships.length,
      });

      // Execute rollback within a transaction
      const result = await this.kuzuClient.transaction(async (tx) => {
        // Clear current state for repository/branch
        await this.clearRepositoryState(snapshot.repository, snapshot.branch, tx);
        rollbackLogger.debug('Cleared current repository state');

        // Restore entities
        const restoredEntities = snapshot.entities.length;
        await this.restoreEntitiesBatch(snapshot.entities, tx);
        rollbackLogger.debug(`Restored ${restoredEntities} entities`);

        // Restore relationships
        let restoredRelationships = 0;
        for (const relationship of snapshot.relationships) {
          await this.restoreRelationship(relationship, tx);
          restoredRelationships++;
        }
        rollbackLogger.debug(`Restored ${restoredRelationships} relationships`);

        const rollbackResult: RollbackResult = {
          success: true,
          restoredEntities,
          restoredRelationships,
          rollbackTime: new Date().toISOString(),
          snapshotId,
        };

        rollbackLogger.info('Rollback completed successfully', {
          restoredEntities,
          restoredRelationships,
        });

        return rollbackResult;
      });

      return result;
    } catch (error) {
      rollbackLogger.error('Rollback failed:', error);
      throw new Error(`Rollback failed: ${error}`);
    }
  }

  /**
   * List all snapshots for a repository (optionally filtered by branch)
   */
  async listSnapshots(repository: string, branch?: string): Promise<SnapshotInfo[]> {
    try {
      // Ensure snapshot schema exists before querying
      await this.ensureSnapshotSchema();

      const query = `
        MATCH (s:Snapshot)
        WHERE s.repository = $repository
          ${branch ? 'AND s.branch = $branch' : ''}
        RETURN s.id AS id, s.repository AS repository, s.branch AS branch,
               s.description AS description, s.created AS created,
               s.entitiesCount AS entitiesCount, s.relationshipsCount AS relationshipsCount,
               s.size AS size
        ORDER BY s.created DESC
      `;

      const results = await this.kuzuClient.executeQuery(query, { repository, branch });
      return results.map((row: any) => ({
        id: row.id,
        repository: row.repository,
        branch: row.branch,
        description: row.description,
        created: row.created,
        entitiesCount: row.entitiesCount || 0,
        relationshipsCount: row.relationshipsCount || 0,
        size: row.size || 0,
      }));
    } catch (error) {
      this.snapshotLogger.error('Failed to list snapshots:', error);
      throw new Error(`Failed to list snapshots: ${error}`);
    }
  }

  /**
   * Validate snapshot integrity
   */
  async validateSnapshot(snapshotId: string): Promise<ValidationResult> {
    try {
      // Ensure snapshot schema exists before querying
      await this.ensureSnapshotSchema();

      const snapshot = await this.getSnapshot(snapshotId);
      if (!snapshot) {
        return {
          valid: false,
          snapshotId,
          entityCount: 0,
          relationshipCount: 0,
          issues: [],
          reason: 'Snapshot not found',
        };
      }

      const issues: string[] = [];

      // Validate entity integrity
      const entityValidation = await this.validateEntityIntegrity(snapshot.entities);
      if (!entityValidation.valid) {
        issues.push(...entityValidation.issues);
      }

      // Validate relationship integrity
      const relationshipValidation = await this.validateRelationshipIntegrity(
        snapshot.relationships,
      );
      if (!relationshipValidation.valid) {
        issues.push(...relationshipValidation.issues);
      }

      return {
        valid: issues.length === 0,
        snapshotId,
        entityCount: snapshot.entities.length,
        relationshipCount: snapshot.relationships.length,
        issues,
      };
    } catch (error) {
      this.snapshotLogger.error('Failed to validate snapshot:', error);
      return {
        valid: false,
        snapshotId,
        entityCount: 0,
        relationshipCount: 0,
        issues: [`Validation error: ${error}`],
      };
    }
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    try {
      // Ensure snapshot schema exists before querying
      await this.ensureSnapshotSchema();

      const query = `
        MATCH (s:Snapshot {id: $snapshotId})
        DELETE s
        RETURN COUNT(s) AS deletedCount
      `;

      const result = await this.kuzuClient.executeQuery(query, { snapshotId });
      const deletedCount = result[0]?.deletedCount || 0;

      this.snapshotLogger.info('Snapshot deleted', { snapshotId, deletedCount });
      return deletedCount > 0;
    } catch (error) {
      this.snapshotLogger.error('Failed to delete snapshot:', error);
      throw new Error(`Failed to delete snapshot: ${error}`);
    }
  }

  /**
   * Get snapshot size and statistics
   */
  async getSnapshotStats(snapshotId: string): Promise<{
    snapshotId: string;
    entityCount: number;
    relationshipCount: number;
    entityTypes: Record<string, number>;
    relationshipTypes: Record<string, number>;
    created: string;
    size: number;
  } | null> {
    try {
      // Ensure snapshot schema exists before querying
      await this.ensureSnapshotSchema();

      const snapshot = await this.getSnapshot(snapshotId);
      if (!snapshot) {
        return null;
      }

      // Count entity types
      const entityTypes: Record<string, number> = {};
      for (const entity of snapshot.entities) {
        const type = entity.nodeLabels?.[0] || 'Unknown';
        entityTypes[type] = (entityTypes[type] || 0) + 1;
      }

      // Count relationship types
      const relationshipTypes: Record<string, number> = {};
      for (const rel of snapshot.relationships) {
        const type = rel.relationshipType || 'Unknown';
        relationshipTypes[type] = (relationshipTypes[type] || 0) + 1;
      }

      // Calculate approximate size
      const size = JSON.stringify(snapshot).length;

      return {
        snapshotId,
        entityCount: snapshot.entities.length,
        relationshipCount: snapshot.relationships.length,
        entityTypes,
        relationshipTypes,
        created: snapshot.created,
        size,
      };
    } catch (error) {
      this.snapshotLogger.error('Failed to get snapshot stats:', error);
      return null;
    }
  }

  /**
   * Ensure snapshot schema exists in the database
   */
  private async ensureSnapshotSchema(): Promise<void> {
    try {
      // Create Snapshot node table if it doesn't exist
      await this.kuzuClient.executeQuery(`
        CREATE NODE TABLE IF NOT EXISTS Snapshot (
          id STRING,
          repository STRING,
          branch STRING,
          description STRING,
          created STRING,
          entitiesCount INT64,
          relationshipsCount INT64,
          size INT64,
          data STRING,
          PRIMARY KEY (id)
        )
      `);
      this.snapshotLogger.debug('Snapshot schema ensured successfully');
    } catch (error) {
      // Table might already exist, which is fine
      this.snapshotLogger.debug('Snapshot schema creation result:', error);
    }
  }

  /**
   * Export all entities for a repository/branch
   */
  private async exportAllEntities(repository: string, branch: string): Promise<any[]> {
    const query = `
      MATCH (n)
      WHERE n.repository = $repository AND n.branch = $branch
      RETURN n, labels(n) AS nodeLabels
    `;

    const results = await this.kuzuClient.executeQuery(query, { repository, branch });
    return results.map((row: any) => {
      const { _id, _label, ...properties } = row.n;
      return {
        properties,
        nodeLabels: Array.isArray(row.nodeLabels) ? row.nodeLabels : [row.nodeLabels],
      };
    });
  }

  /**
   * Export all relationships for a repository/branch
   */
  private async exportAllRelationships(repository: string, branch: string): Promise<any[]> {
    const query = `
      MATCH (a)-[r]->(b)
      WHERE a.repository = $repository AND a.branch = $branch
        AND b.repository = $repository AND b.branch = $branch
      RETURN a.id AS fromId, b.id AS toId, label(r) AS relationshipType, r AS properties
    `;

    const results = await this.kuzuClient.executeQuery(query, { repository, branch });
    return results.map((row: any) => {
      const { from, to, label, ...properties } = row.properties;
      return {
        fromId: row.fromId,
        toId: row.toId,
        relationshipType: row.relationshipType,
        properties,
      };
    });
  }

  /**
   * Get repository metadata
   */
  private async getRepositoryMetadata(repository: string, branch: string): Promise<any> {
    try {
      const query = `
        MATCH (m:Metadata)
        WHERE m.name = $repository AND m.branch = $branch
        RETURN m
        LIMIT 1
      `;

      const result = await this.kuzuClient.executeQuery(query, { repository, branch });
      if (result.length > 0) {
        const { _id, _label, ...metadata } = result[0].m;
        return metadata;
      }
      return {};
    } catch (error) {
      this.snapshotLogger.warn('Failed to get repository metadata:', error);
      return {};
    }
  }

  /**
   * Store snapshot data in the database
   */
  private async storeSnapshot(snapshotData: SnapshotData): Promise<void> {
    const dataString = JSON.stringify({
      entities: snapshotData.entities,
      relationships: snapshotData.relationships,
      metadata: snapshotData.metadata,
    });

    const size = dataString.length;

    const query = `
      CREATE (s:Snapshot {
        id: $id,
        repository: $repository,
        branch: $branch,
        description: $description,
        created: $created,
        entitiesCount: $entitiesCount,
        relationshipsCount: $relationshipsCount,
        size: $size,
        data: $data
      })
    `;

    await this.kuzuClient.executeQuery(query, {
      id: snapshotData.snapshotId,
      repository: snapshotData.repository,
      branch: snapshotData.branch,
      description: snapshotData.description,
      created: snapshotData.created,
      entitiesCount: snapshotData.entities.length,
      relationshipsCount: snapshotData.relationships.length,
      size,
      data: dataString,
    });
  }

  /**
   * Get snapshot data from the database
   */
  private async getSnapshot(snapshotId: string): Promise<SnapshotData | null> {
    try {
      const query = `
        MATCH (s:Snapshot {id: $snapshotId})
        RETURN s.id AS id, s.repository AS repository, s.branch AS branch,
               s.description AS description, s.created AS created, s.data AS data
      `;

      const result = await this.kuzuClient.executeQuery(query, { snapshotId });
      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      const parsedData = JSON.parse(row.data);

      return {
        snapshotId: row.id,
        repository: row.repository,
        branch: row.branch,
        description: row.description,
        created: row.created,
        entities: parsedData.entities || [],
        relationships: parsedData.relationships || [],
        metadata: parsedData.metadata || {},
      };
    } catch (error) {
      this.snapshotLogger.error('Failed to get snapshot:', error);
      return null;
    }
  }

  /**
   * Clear all entities and relationships for a repository/branch
   */
  private async clearRepositoryState(
    repository: string,
    branch: string,
    tx?: { executeQuery: (query: string, params?: Record<string, any>) => Promise<any> },
  ): Promise<void> {
    const executor = tx || this.kuzuClient;

    // Delete all relationships first (to avoid constraint violations)
    await executor.executeQuery(
      `
      MATCH (a)-[r]->(b)
      WHERE a.repository = $repository AND a.branch = $branch
        AND b.repository = $repository AND b.branch = $branch
      DELETE r
    `,
      { repository, branch },
    );

    // Delete all entities
    await executor.executeQuery(
      `
      MATCH (n)
      WHERE n.repository = $repository AND n.branch = $branch
        AND label(n) <> 'Snapshot' AND label(n) <> 'Metadata'
      DELETE n
    `,
      { repository, branch },
    );
  }

  /**
   * Restore a single entity
   */
  private async restoreEntity(
    entity: any,
    tx?: { executeQuery: (query: string, params?: Record<string, any>) => Promise<any> },
  ): Promise<void> {
    const executor = tx || this.kuzuClient;
    const nodeLabel = entity.nodeLabels?.[0] || 'Entity';

    // Build property assignments
    const rawProperties = entity.properties || {};
    const properties: any = {};
    Object.entries(rawProperties).forEach(([k, v]) => {
      if (v !== null && v !== undefined) {
        properties[k] = v;
      }
    });
    const propertyAssignments = Object.keys(properties)
      .map((key) => `${key}: $${key}`)
      .join(', ');

    const query = `
      CREATE (n:${nodeLabel} {${propertyAssignments}})
    `;

    await executor.executeQuery(query, properties);
  }

  /**
   * Restore multiple entities efficiently using UNWIND
   */
  private async restoreEntitiesBatch(
    entities: any[],
    tx?: { executeQuery: (query: string, params?: Record<string, any>) => Promise<any> },
  ): Promise<void> {
    const executor = tx || this.kuzuClient;
    const grouped = new Map<string, any[]>();

    // Group entities by label
    for (const entity of entities) {
      const labels = Array.isArray(entity.nodeLabels) ? entity.nodeLabels : [entity.nodeLabels];
      const label = labels[0] || 'Entity';
      if (!grouped.has(label)) {
        grouped.set(label, []);
      }
      grouped.get(label)!.push(entity);
    }

    // Process each group
    for (const [label, group] of grouped) {
      // Collect valid keys (non-null in at least one entity)
      const validKeys = new Set<string>();
      for (const entity of group) {
        const props = entity.properties || {};
        for (const [key, value] of Object.entries(props)) {
          if (value !== null && value !== undefined) {
            validKeys.add(key);
          }
        }
      }

      if (validKeys.size === 0) {
        // Just create nodes without properties
        const query = `
          UNWIND $batch AS item
          CREATE (n:${label})
        `;
        // Pass dummy batch for count
        await executor.executeQuery(query, { batch: group.map(() => ({})) });
        continue;
      }

      // Prepare batch data
      const batch = group.map((entity) => {
        const props: any = {};
        const rawProps = entity.properties || {};
        for (const key of validKeys) {
          props[key] = rawProps[key] ?? null;
        }
        return props;
      });

      // Construct UNWIND query
      const assignments = Array.from(validKeys)
        .map((key) => `${key}: item.${key}`)
        .join(', ');

      const query = `
        UNWIND $batch AS item
        CREATE (n:${label} {${assignments}})
      `;

      await executor.executeQuery(query, { batch });
    }
  }

  /**
   * Restore a single relationship
   */
  private async restoreRelationship(
    relationship: any,
    tx?: { executeQuery: (query: string, params?: Record<string, any>) => Promise<any> },
  ): Promise<void> {
    const executor = tx || this.kuzuClient;
    const relType = relationship.relationshipType || 'RELATED_TO';
    const properties = relationship.properties || {};

    // Build property assignments for relationship
    const propertyAssignments =
      Object.keys(properties).length > 0
        ? `{${Object.keys(properties)
            .map((key) => `${key}: $${key}`)
            .join(', ')}}`
        : '';

    const query = `
      MATCH (a {id: $fromId}), (b {id: $toId})
      CREATE (a)-[r:${relType} ${propertyAssignments}]->(b)
    `;

    await executor.executeQuery(query, {
      fromId: relationship.fromId,
      toId: relationship.toId,
      ...properties,
    });
  }

  /**
   * Validate entity integrity
   */
  private async validateEntityIntegrity(
    entities: any[],
  ): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check for required fields
    for (const entity of entities) {
      const entityId = entity.id || entity.properties?.id;
      if (!entityId) {
        issues.push(`Entity missing required 'id' field`);
      }
      if (!entity.nodeLabels || entity.nodeLabels.length === 0) {
        issues.push(`Entity ${entityId} missing node labels`);
      }
    }

    // Check for duplicate IDs
    const ids = entities.map((e) => e.id || e.properties?.id).filter(Boolean);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      issues.push(`Duplicate entity IDs found: ${duplicateIds.join(', ')}`);
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Validate relationship integrity
   */
  private async validateRelationshipIntegrity(
    relationships: any[],
  ): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check for required fields
    for (const rel of relationships) {
      if (!rel.fromId) {
        issues.push(`Relationship missing required 'fromId' field`);
      }
      if (!rel.toId) {
        issues.push(`Relationship missing required 'toId' field`);
      }
      if (!rel.relationshipType) {
        issues.push(`Relationship missing 'relationshipType' field`);
      }
    }

    return { valid: issues.length === 0, issues };
  }
}
