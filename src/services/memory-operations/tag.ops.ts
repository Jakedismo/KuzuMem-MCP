import { KuzuDBClient } from '../../db/kuzu';
import { MemoryService } from '../memory.service';
import * as toolSchemas from '../../mcp/schemas/tool-schemas';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import { z } from 'zod';

export async function addTagOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  tagData: {
    id: string;
    name: string;
    color?: string | null;
    description?: string | null;
  }
): Promise<z.infer<typeof toolSchemas.TagNodeSchema> | null> {
  mcpContext.logger.info(`Attempting to add/update Tag: id=${tagData.id}, name=${tagData.name}`);

  const properties = {
    id: tagData.id,
    name: tagData.name,
    color: tagData.color || null,
    description: tagData.description || null,
    created_at: new Date().toISOString(), // Used only for ON CREATE
  };

  const cypherQuery = `
    MERGE (t:Tag {id: $id})
    ON CREATE SET 
      t.name = $name,
      t.color = $color,
      t.description = $description,
      t.created_at = timestamp($created_at)
    ON MATCH SET 
      t.name = $name,
      t.color = $color,
      t.description = $description
    RETURN t.id as id, t.name as name, t.color as color, t.description as description, t.created_at as created_at
  `;

  try {
    const queryResult = await kuzuClient.executeQuery(cypherQuery, properties);
    mcpContext.logger.debug({ queryResult, params: properties }, 'Kuzu query executed for addTagOp.');

    if (queryResult && queryResult.length > 0) {
      const dbRecord = queryResult[0] as {
        id: string;
        name: string;
        color: string | null;
        description: string | null;
        created_at: string;
      };

      const tagNode: z.infer<typeof toolSchemas.TagNodeSchema> = {
        id: dbRecord.id,
        name: dbRecord.name,
        color: dbRecord.color || null,
        description: dbRecord.description || null,
        created_at: dbRecord.created_at,
      };
      mcpContext.logger.info(
        `Tag '${tagNode.name}' (id: ${tagNode.id}) processed successfully.`
      );
      return tagNode;
    } else {
      mcpContext.logger.warn({ queryParamsSent: properties, result: queryResult }, 'Kuzu query for addTagOp executed but returned no result or an empty result set.');
      return null;
    }
  } catch (error) {
    mcpContext.logger.error({ error, query: cypherQuery, params: properties }, 'Error executing addTagOp Cypher query');
    throw error; // Rethrow to be handled by the service layer
  }
}

export async function tagItemOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  repositoryId: string, // <repoName>:<branchName>
  branchName: string,
  itemId: string,
  itemType: 'Component' | 'Decision' | 'Rule' | 'File' | 'Context',
  tagId: string
): Promise<boolean> {
  mcpContext.logger.info(
    `Attempting to tag Item {type: ${itemType}, id: ${itemId}} with Tag {id: ${tagId}} in repository: ${repositoryId}, branch: ${branchName}`
  );

  let itemLabel = '';
  switch (itemType) {
    case 'Component': itemLabel = 'Component'; break;
    case 'Decision': itemLabel = 'Decision'; break;
    case 'Rule': itemLabel = 'Rule'; break;
    case 'File': itemLabel = 'File'; break;
    case 'Context': itemLabel = 'Context'; break;
    default:
      const exhaustiveCheck: never = itemType; // Ensures all cases are handled if itemType is a strict union
      mcpContext.logger.error(`[tagItemOp] Unsupported itemType: ${exhaustiveCheck}`);
      throw new Error(`Unsupported itemType for tagging: ${exhaustiveCheck}`);
  }

  // Assuming Decision, Rule, Context nodes also have repository and branch properties.
  // If not, the MATCH for 'item' would need adjustment for those types.
  // For now, proceeding with the assumption they are scoped like Component and File.
  const cypherQuery = `
    MATCH (item:${itemLabel} {id: $itemId, repository: $repositoryId, branch: $branchName}),
          (tag:Tag {id: $tagId})
    MERGE (item)-[r:IS_TAGGED_WITH]->(tag)
    RETURN r
  `;

  const queryParams = {
    itemId,
    tagId,
    repositoryId,
    branchName,
  };

  try {
    const queryResult = await kuzuClient.executeQuery(cypherQuery, queryParams);
    mcpContext.logger.debug({ queryResult, params: queryParams }, 'Kuzu query executed for tagItemOp.');

    if (queryResult && queryResult.length > 0) {
      mcpContext.logger.info(
        `Successfully tagged Item {type: ${itemType}, id: ${itemId}} with Tag {id: ${tagId}}. Relationship: ${JSON.stringify(queryResult[0])}`
      );
      return true;
    } else {
      // This case means MATCH failed (item or tag not found) or MERGE didn't return 'r'.
      // Kuzu's MERGE on relationships, if the MATCH part for nodes fails, does nothing and returns an empty result.
      mcpContext.logger.warn(
        `Failed to tag Item {type: ${itemType}, id: ${itemId}} with Tag {id: ${tagId}}. Item or Tag not found, or relationship already existed and MERGE did not return it (check query).`,
        { queryParams }
      );
      return false; // Indicates nodes not found or relationship not actively formed by this call
    }
  } catch (error) {
    mcpContext.logger.error(
      { error, query: cypherQuery, params: queryParams },
      'Error executing tagItemOp Cypher query'
    );
    throw error; // Rethrow to be handled by the service layer
  }
}

export async function findItemsByTagOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  repositoryId: string, // <repoName>:<branchName>
  branchName: string,
  tagId: string,
  itemTypeFilter: string // 'All' or a specific node label like 'Component', 'File', etc.
): Promise<Array<Record<string, any>>> {
  mcpContext.logger.info(
    `Attempting to find items tagged with Tag {id: ${tagId}} in repository: ${repositoryId}, branch: ${branchName}, filter: ${itemTypeFilter}`
  );

  let cypherQuery = `
    MATCH (tag:Tag {id: $tagId})<-[:IS_TAGGED_WITH]-(item)
    WHERE item.repository = $repositoryId AND item.branch = $branchName
  `;

  const queryParams: Record<string, any> = {
    tagId,
    repositoryId,
    branchName
  };

  if (itemTypeFilter && itemTypeFilter.toLowerCase() !== 'all') {
    // Ensure itemTypeFilter is a valid label and not arbitrary user input to prevent injection if Kuzu has issues.
    // For now, assuming itemTypeFilter will be one of the known labels.
    cypherQuery += ` AND $itemTypeFilter IN labels(item)`;
    queryParams.itemTypeFilter = itemTypeFilter;
  }

  // item{.*} is Kuzu's syntax to get all properties of the node 'item' as a map/object.
  // labels(item)[0] gets the primary label of the node.
  cypherQuery += ` RETURN item.id AS id, labels(item)[0] AS nodeLabel, item{.*} AS properties`;

  try {
    const queryResult = await kuzuClient.executeQuery(cypherQuery, queryParams);
    mcpContext.logger.debug({ resultsCount: queryResult?.length, params: queryParams }, 'Kuzu query executed for findItemsByTagOp.');

    if (!queryResult) {
        mcpContext.logger.warn('Kuzu query for findItemsByTagOp returned null or undefined, returning empty array.');
        return [];
    }

    const items = queryResult.map((record: any) => {
      // The 'properties' field will contain all properties of the 'item' node.
      // We also explicitly get 'id' and 'nodeLabel' for convenience and consistency.
      return {
        id: record.id,
        nodeLabel: record.nodeLabel,
        properties: record.properties,
      };
    });

    mcpContext.logger.info(
      `Found ${items.length} items tagged with Tag {id: ${tagId}} with filter '${itemTypeFilter}'.`
    );
    return items;
  } catch (error) {
    mcpContext.logger.error(
      { error, query: cypherQuery, params: queryParams },
      'Error executing findItemsByTagOp Cypher query'
    );
    throw error; // Rethrow to be handled by the service layer
  }
}
