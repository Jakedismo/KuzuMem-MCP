import { KuzuDBClient } from '../db/kuzu';
import { Component, ComponentInput, ComponentStatus, Context, Decision } from '../types';
import { RepositoryRepository } from './repository.repository';
import { loggers } from '../utils/logger';
import { ComponentCrudRepository } from './component/component-crud.repository';
import { ComponentGraphRepository } from './component/component-graph.repository';
import { ComponentAlgorithmRepository } from './component/component-algorithm.repository';
import { ComponentComplexRepository } from './component/component-complex.repository';

/**
 * Main Component Repository that orchestrates specialized component repositories
 * Delegates operations to focused repositories for better maintainability
 */
export class ComponentRepository {
  private kuzuClient: KuzuDBClient;
  private repositoryRepo: RepositoryRepository;
  private logger = loggers.repository();

  // Specialized repositories
  private crudRepo: ComponentCrudRepository;
  private graphRepo: ComponentGraphRepository;
  private algorithmRepo: ComponentAlgorithmRepository;
  private complexRepo: ComponentComplexRepository;

  /**
   * Constructor that initializes all specialized repositories
   */
  public constructor(kuzuClient: KuzuDBClient, repositoryRepo: RepositoryRepository) {
    if (!kuzuClient) {
      throw new Error('ComponentRepository requires an initialized KuzuDBClient instance.');
    }
    if (!repositoryRepo) {
      throw new Error('ComponentRepository requires an initialized RepositoryRepository instance.');
    }
    this.kuzuClient = kuzuClient;
    this.repositoryRepo = repositoryRepo;

    // Initialize specialized repositories
    this.crudRepo = new ComponentCrudRepository(kuzuClient, repositoryRepo);
    this.graphRepo = new ComponentGraphRepository(kuzuClient, repositoryRepo);
    this.algorithmRepo = new ComponentAlgorithmRepository(kuzuClient, repositoryRepo);
    this.complexRepo = new ComponentComplexRepository(kuzuClient, repositoryRepo);
  }

  // === CRUD Operations - Delegated to ComponentCrudRepository ===

  /**
   * Get all active components for a specific repository and branch
   */
  async getActiveComponents(
    repositoryNodeId: string,
    componentBranch: string,
  ): Promise<Component[]> {
    return this.crudRepo.getActiveComponents(repositoryNodeId, componentBranch);
  }

  /**
   * Find a component by its logical ID and branch
   */
  async findByIdAndBranch(
    repositoryName: string,
    itemId: string,
    itemBranch: string,
  ): Promise<Component | null> {
    return this.crudRepo.findByIdAndBranch(repositoryName, itemId, itemBranch);
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
    return this.crudRepo.updateComponentStatus(repositoryName, itemId, branch, status);
  }

  /**
   * Upsert a component
   */
  async upsertComponent(
    repositoryNodeId: string,
    component: ComponentInput,
  ): Promise<Component | null> {
    return this.crudRepo.upsertComponent(repositoryNodeId, component);
  }

  /**
   * Bulk upsert components
   */
  async bulkUpsertComponents(
    repositoryNodeId: string,
    components: ComponentInput[],
    overwrite: boolean = true,
  ): Promise<{ upserted: number; skipped: number }> {
    return this.crudRepo.bulkUpsertComponents(repositoryNodeId, components, overwrite);
  }

  // === Graph Traversal Operations - Delegated to ComponentGraphRepository ===

  /**
   * Find shortest path between two components
   */
  async findShortestPath(
    repositoryName: string,
    startNodeId: string,
    startNodeBranch: string,
    endNodeId: string,
    params?: {
      relationshipTypes?: string[];
      direction?: 'OUTGOING' | 'INCOMING' | 'BOTH';
      algorithm?: string;
      projectedGraphName?: string;
      nodeTableNames?: string[];
      relationshipTableNames?: string[];
    },
  ): Promise<{ path: Component[]; length: number; error?: string | null }> {
    return this.graphRepo.findShortestPath(
      repositoryName,
      startNodeId,
      startNodeBranch,
      endNodeId,
      params,
    );
  }

  /**
   * Get all upstream dependencies for a component
   */
  async getComponentDependencies(
    repositoryName: string,
    componentId: string,
    componentBranch: string,
  ): Promise<Component[]> {
    return this.graphRepo.getComponentDependencies(repositoryName, componentId, componentBranch);
  }

  /**
   * Get all downstream dependents for a component
   */
  async getComponentDependents(
    repositoryName: string,
    componentId: string,
    componentBranch: string,
  ): Promise<Component[]> {
    return this.graphRepo.getComponentDependents(repositoryName, componentId, componentBranch);
  }

  /**
   * Get related items for a component
   */
  async getRelatedItems(
    repositoryName: string,
    componentId: string,
    componentBranch: string,
    relationshipTypes?: string[],
    depth?: number,
    direction?: 'INCOMING' | 'OUTGOING' | 'BOTH',
  ): Promise<Component[]> {
    return this.graphRepo.getRelatedItems(
      repositoryName,
      componentId,
      componentBranch,
      relationshipTypes,
      depth,
      direction,
    );
  }

  /**
   * Get contextual history for a component
   */
  async getItemContextualHistory(
    repositoryName: string,
    itemId: string,
    itemBranch: string,
    itemType: 'Component' | 'Decision' | 'Rule',
  ): Promise<Context[]> {
    return this.graphRepo.getItemContextualHistory(repositoryName, itemId, itemBranch, itemType);
  }

  /**
   * Get governing decisions for a component
   */
  async getGoverningItemsForComponent(
    repositoryName: string,
    componentId: string,
    componentBranch: string,
  ): Promise<Decision[]> {
    return this.graphRepo.getGoverningItemsForComponent(
      repositoryName,
      componentId,
      componentBranch,
    );
  }

  // === Algorithm Operations - Delegated to ComponentAlgorithmRepository ===

  /**
   * K-core decomposition algorithm
   */
  async kCoreDecomposition(repositoryNodeId: string, k: number): Promise<any> {
    return this.algorithmRepo.kCoreDecomposition(repositoryNodeId, k);
  }

  /**
   * Louvain community detection algorithm
   */
  async louvainCommunityDetection(repositoryNodeId: string): Promise<any> {
    return this.algorithmRepo.louvainCommunityDetection(repositoryNodeId);
  }

  /**
   * PageRank algorithm
   */
  async pageRank(
    repositoryNodeId: string,
    dampingFactor?: number,
    iterations?: number,
    tolerance?: number,
    normalizeInitial?: boolean,
  ): Promise<any> {
    return this.algorithmRepo.pageRank(
      repositoryNodeId,
      dampingFactor,
      iterations,
      tolerance,
      normalizeInitial,
    );
  }

  /**
   * Get strongly connected components
   */
  async getStronglyConnectedComponents(repositoryNodeId: string): Promise<any> {
    return this.algorithmRepo.getStronglyConnectedComponents(repositoryNodeId);
  }

  /**
   * Get weakly connected components
   */
  async getWeaklyConnectedComponents(repositoryNodeId: string): Promise<any> {
    return this.algorithmRepo.getWeaklyConnectedComponents(repositoryNodeId);
  }

  // === Complex Operations - Delegated to ComponentComplexRepository ===

  /**
   * Upsert component with relationships using direct Cypher queries
   */
  async upsertComponentWithRelationships(component: {
    repository: string;
    branch?: string;
    id: string;
    name: string;
    kind: string;
    status: ComponentStatus;
    depends_on?: string[] | null;
  }): Promise<Component | null> {
    return this.complexRepo.upsertComponentWithRelationships(component);
  }
}
