import { KuzuDBClient } from '../db/kuzu';
import { Rule } from '../types';
import { formatGraphUniqueId } from '../utils/id.utils';
import { loggers } from '../utils/logger';
import { RepositoryRepository } from './repository.repository';

/**
 * Repository for Rule, using KuzuDB and Cypher queries.
 * Each instance is now tied to a specific KuzuDBClient.
 */
export class RuleRepository {
  private logger = loggers.repository();
  private kuzuClient: KuzuDBClient;
  private repositoryRepo: RepositoryRepository;

  /**
   * Constructor requires an initialized KuzuDBClient instance.
   * @param kuzuClient An initialized KuzuDBClient.
   */
  public constructor(kuzuClient: KuzuDBClient, repositoryRepo: RepositoryRepository) {
    if (!kuzuClient) {
      throw new Error('RuleRepository requires an initialized KuzuDBClient instance.');
    }
    if (!repositoryRepo) {
      throw new Error('RuleRepository requires an initialized RepositoryRepository instance.');
    }
    this.kuzuClient = kuzuClient;
    this.repositoryRepo = repositoryRepo;
  }

  private formatKuzuRowToRule(kuzuRowData: any, repositoryName: string, branch: string): Rule {
    const rawRule = kuzuRowData.properties || kuzuRowData;
    const logicalId = rawRule.id?.toString();
    const graphUniqueId =
      rawRule.graph_unique_id?.toString() || formatGraphUniqueId(repositoryName, branch, logicalId);

    let createdDate = rawRule.created;
    if (rawRule.created instanceof Date) {
      createdDate = rawRule.created.toISOString().split('T')[0];
    } else if (typeof rawRule.created === 'number') {
      createdDate = new Date(rawRule.created).toISOString().split('T')[0];
    } else if (
      typeof rawRule.created === 'object' &&
      rawRule.created !== null &&
      'year' in rawRule.created
    ) {
      createdDate = `${String(rawRule.created.year).padStart(4, '0')}-${String(rawRule.created.month).padStart(2, '0')}-${String(rawRule.created.day).padStart(2, '0')}`;
    }

    return {
      id: logicalId,
      graph_unique_id: graphUniqueId,
      name: rawRule.title || rawRule.name,
      created: createdDate,
      triggers: Array.isArray(rawRule.triggers) ? rawRule.triggers.map(String) : [],
      content: rawRule.description || rawRule.content,
      status: rawRule.status,
      branch: rawRule.branch,
      repository: `${repositoryName}:${branch}`,
      created_at: rawRule.created_at ? new Date(rawRule.created_at) : new Date(),
      updated_at: rawRule.updated_at ? new Date(rawRule.updated_at) : new Date(),
    } as Rule;
  }

  /**
   * Get all active rules for a repository node and branch.
   */
  async getActiveRules(repositoryNodeId: string, ruleBranch: string): Promise<Rule[]> {
    const query = `
      MATCH (repo:Repository {id: $repositoryNodeId})<-[:PART_OF]-(r:Rule)
      WHERE r.status = $status AND r.branch = $ruleBranch 
      RETURN r ORDER BY r.created DESC
    `;
    const params = { repositoryNodeId, status: 'active', ruleBranch };
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (!result) {
        return [];
      }
      const repoNameFromNodeId = repositoryNodeId.split(':')[0];
      return result.map((row: any) =>
        this.formatKuzuRowToRule(row.r, repoNameFromNodeId, ruleBranch),
      );
    } catch (error: any) {
      this.logger.error(
        `[RuleRepository] Error in getActiveRules for ${repositoryNodeId}, branch ${ruleBranch}: ${error.message}`,
        { error, stack: error.stack },
      );
      return [];
    }
  }

  /**
   * Creates or updates a rule.
   * `rule.repository` is the Repository node PK (e.g., 'my-repo:main').
   * `rule.branch` is the branch of this Rule entity.
   * `rule.id` is the logical ID of this Rule entity.
   */
  async upsertRule(rule: Rule): Promise<Rule | null> {
    const logger = console; // Placeholder logger
    const { repository: repositoryNodeId, branch, id: logicalId, name } = rule;

    const [logicalRepositoryName] = repositoryNodeId.split(':');
    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, branch, logicalId);
    const now = new Date();

    const query = `
      MERGE (repo:Repository {id: $repositoryNodeId})
      ON CREATE SET repo.name = $repositoryNodeId, repo.created_at = $now
      MERGE (r:Rule {id: $id, graph_unique_id: $graphUniqueId})
      ON CREATE SET
        r.title = $name,
        r.description = $description,
        r.scope = $scope,
        r.severity = $severity,
        r.category = $category,
        r.branch = $branch,
        r.status = $status,
        r.created_at = $now,
        r.updated_at = $now
      ON MATCH SET
        r.title = $name,
        r.description = $description,
        r.scope = $scope,
        r.severity = $severity,
        r.category = $category,
        r.branch = $branch,
        r.status = $status,
        r.updated_at = $now
      MERGE (r)-[:PART_OF]->(repo)
      RETURN r
    `;

    const params = {
      repositoryNodeId,
      graphUniqueId,
      id: logicalId,
      name,
      branch,
      status: (rule as any).status || 'active',
      description: (rule as any).description || '',
      scope: (rule as any).scope || 'component',
      severity: (rule as any).severity || 'medium',
      category: (rule as any).category || 'general',
      now: now,
    };

    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (result && result.length > 0) {
        return this.formatKuzuRowToRule(result[0].r, logicalRepositoryName, branch);
      }
      return null;
    } catch (error: any) {
      logger.error(
        `[RuleRepository] Error in upsertRule for GID ${graphUniqueId}: ${error.message}`,
        { stack: error.stack },
      );
      throw error;
    }
  }

  /**
   * Find a rule by its logical ID and branch, within a given repository name.
   */
  async findByIdAndBranch(
    repositoryName: string,
    itemId: string,
    itemBranch: string,
  ): Promise<Rule | null> {
    const graphUniqueId = formatGraphUniqueId(repositoryName, itemBranch, itemId);
    const query = `MATCH (r:Rule {graph_unique_id: $graphUniqueId}) RETURN r LIMIT 1`;
    const params = { graphUniqueId };
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (result && result.length > 0 && result[0].r) {
        return this.formatKuzuRowToRule(result[0].r, repositoryName, itemBranch);
      }
      return null;
    } catch (error: any) {
      this.logger.error(
        `[RuleRepository] Error in findByIdAndBranch for GID ${graphUniqueId}: ${error.message}`,
        { error, stack: error.stack },
      );
      return null;
    }
  }

  /**
   * Get all rules for a repository node and branch.
   */
  async getAllRules(repositoryNodeId: string, ruleBranch: string): Promise<Rule[]> {
    const query = `
      MATCH (repo:Repository {id: $repositoryNodeId})<-[:PART_OF]-(r:Rule)
      WHERE r.branch = $ruleBranch
      RETURN r ORDER BY r.created DESC, r.name ASC
    `;
    const params = { repositoryNodeId, ruleBranch };
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (!result) {
        return [];
      }
      const repoNameFromNodeId = repositoryNodeId.split(':')[0];
      return result.map((row: any) =>
        this.formatKuzuRowToRule(row.r, repoNameFromNodeId, ruleBranch),
      );
    } catch (error: any) {
      this.logger.error(
        `[RuleRepository] Error in getAllRules for ${repositoryNodeId}, branch ${ruleBranch}: ${error.message}`,
        { error, stack: error.stack },
      );
      return [];
    }
  }

  /**
   * Batch upsert rules.
   */
  async upsertRules(rules: Rule[]): Promise<Rule[]> {
    if (rules.length === 0) {
      return [];
    }

    // Assume all rules belong to the same repository and branch
    const repositoryNodeId = rules[0].repository;
    const branch = rules[0].branch;
    const [logicalRepositoryName] = repositoryNodeId.split(':');
    const now = new Date();

    const rulesData = rules.map(rule => {
      const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, branch, rule.id);
      return {
        id: rule.id,
        graphUniqueId: graphUniqueId,
        title: rule.name,
        description: (rule as any).description || '',
        scope: (rule as any).scope || 'component',
        severity: (rule as any).severity || 'medium',
        category: (rule as any).category || 'general',
        branch: branch,
        status: (rule as any).status || 'active',
        created_at: now,
        updated_at: now,
        repositoryNodeId: repositoryNodeId
      };
    });

    const query = `
      UNWIND $rules AS ruleData
      MERGE (repo:Repository {id: ruleData.repositoryNodeId})
      ON CREATE SET repo.name = ruleData.repositoryNodeId, repo.created_at = $now
      MERGE (r:Rule {id: ruleData.id, graph_unique_id: ruleData.graphUniqueId})
      ON CREATE SET
        r.title = ruleData.title,
        r.description = ruleData.description,
        r.scope = ruleData.scope,
        r.severity = ruleData.severity,
        r.category = ruleData.category,
        r.branch = ruleData.branch,
        r.status = ruleData.status,
        r.created_at = $now,
        r.updated_at = $now
      ON MATCH SET
        r.title = ruleData.title,
        r.description = ruleData.description,
        r.scope = ruleData.scope,
        r.severity = ruleData.severity,
        r.category = ruleData.category,
        r.branch = ruleData.branch,
        r.status = ruleData.status,
        r.updated_at = $now
      MERGE (r)-[:PART_OF]->(repo)
      RETURN r
    `;

    const params = {
      rules: rulesData,
      now: now
    };

    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (result && result.length > 0) {
        return result.map((row: any) =>
          this.formatKuzuRowToRule(row.r, logicalRepositoryName, branch),
        );
      }
      return [];
    } catch (error: any) {
      this.logger.error(
        `[RuleRepository] Error in upsertRules for batch of ${rules.length}: ${error.message}`,
        { stack: error.stack },
      );
      throw error;
    }
  }

  /**
   * Get all rule IDs for a repository node and branch.
   */
  async getAllRuleIds(repositoryNodeId: string, ruleBranch: string): Promise<string[]> {
    const query = `
      MATCH (repo:Repository {id: $repositoryNodeId})<-[:PART_OF]-(r:Rule)
      WHERE r.branch = $ruleBranch
      RETURN r.id as id
    `;
    const params = { repositoryNodeId, ruleBranch };
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (!result) {
        return [];
      }
      return result.map((row: any) => row.id);
    } catch (error: any) {
      this.logger.error(
        `[RuleRepository] Error in getAllRuleIds for ${repositoryNodeId}, branch ${ruleBranch}: ${error.message}`,
        { error, stack: error.stack },
      );
      return [];
    }
  }
}
