import { KuzuDBClient } from '@mcp/ai-assistant-lib/kuzu';
import { EnrichedRequestHandlerExtra } from '@mcp/ai-assistant-lib/mcp';
import * as toolSchemas from '@mcp/ai-assistant-lib/tool-schemas';
import { z } from 'zod';

// Based on toolSchemas.FileNodeSchema for database insertion
export interface FileNodeProperties {
  id: string;
  name: string;
  path: string;
  language: string | null;
  metrics_json: string | null;
  content_hash: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
  repository: string;
  branch: string;
}

export async function addFileOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  repositoryId: string, // <repoName>:<branchName>
  branchName: string,
  fileData: {
    id: string;
    name: string;
    path: string;
    language?: string | null;
    metrics?: Record<string, any> | null;
    content_hash?: string | null;
    mime_type?: string | null;
    size_bytes?: number | null;
  },
): Promise<z.infer<typeof toolSchemas.FileNodeSchema> | null> {
  mcpContext.logger.info(
    `Attempting to add/update File: id=${fileData.id}, path=${fileData.path}, repository=${repositoryId}`,
  );

  // Serialize metrics to JSON string if present
  let metricsJson: string | null = null;
  if (fileData.metrics && typeof fileData.metrics === 'object') {
    try {
      metricsJson = JSON.stringify(fileData.metrics);
    } catch (jsonError) {
      mcpContext.logger.warn(
        { error: jsonError, metrics: fileData.metrics, fileId: fileData.id },
        'Failed to serialize metrics to JSON for file, storing as null',
      );
      metricsJson = null;
    }
  }

  const currentTime = new Date().toISOString();

  const nodeProperties: FileNodeProperties = {
    id: fileData.id,
    name: fileData.name,
    path: fileData.path,
    language: fileData.language || null,
    metrics_json: metricsJson,
    content_hash: fileData.content_hash || null,
    mime_type: fileData.mime_type || null,
    size_bytes: fileData.size_bytes || null,
    created_at: currentTime,
    updated_at: currentTime,
    repository: repositoryId,
    branch: branchName,
  };

  // Use MERGE to create or update the File node
  const cypherQuery = `
    MERGE (f:File {id: $id, repository: $repository, branch: $branch})
    ON CREATE SET 
      f.name = $name,
      f.path = $path,
      f.language = $language,
      f.metrics_json = $metrics_json,
      f.content_hash = $content_hash,
      f.mime_type = $mime_type,
      f.size_bytes = $size_bytes,
      f.created_at = timestamp($created_at),
      f.updated_at = timestamp($updated_at),
      f.repository = $repository,
      f.branch = $branch
    ON MATCH SET 
      f.name = $name,
      f.path = $path,
      f.language = $language,
      f.metrics_json = $metrics_json,
      f.content_hash = $content_hash,
      f.mime_type = $mime_type,
      f.size_bytes = $size_bytes,
      f.updated_at = timestamp($updated_at)
    RETURN f.id as id,
           f.name as name,
           f.path as path,
           f.language as language,
           f.metrics_json as metrics_json,
           f.content_hash as content_hash,
           f.mime_type as mime_type,
           f.size_bytes as size_bytes,
           f.created_at as created_at,
           f.updated_at as updated_at,
           f.repository as repository,
           f.branch as branch
  `;

  const queryParams = {
    id: nodeProperties.id,
    name: nodeProperties.name,
    path: nodeProperties.path,
    language: nodeProperties.language,
    metrics_json: nodeProperties.metrics_json,
    content_hash: nodeProperties.content_hash,
    mime_type: nodeProperties.mime_type,
    size_bytes: nodeProperties.size_bytes,
    created_at: nodeProperties.created_at,
    updated_at: nodeProperties.updated_at,
    repository: nodeProperties.repository,
    branch: nodeProperties.branch,
  };

  try {
    // For ON MATCH, we need a different updated_at
    const currentIsoTime = new Date().toISOString();
    const paramsForExecution = { ...queryParams };
    if (/* we knew it was a match */ false) { // This logic is tricky with MERGE alone.
        // MERGE doesn't tell us if it matched or created easily without another query.
        // For simplicity, we'll use the same `updated_at` for both create and match path here,
        // which is fine as it's `new Date().toISOString()` for ON CREATE and we'd want that for ON MATCH too.
        // If we wanted different `updated_at` for create vs match, this would be more complex.
        // The current query structure correctly sets updated_at to the current time for both paths.
    }
    paramsForExecution.updated_at = currentIsoTime; // Ensure updated_at is current for both create and match
    if (paramsForExecution.created_at === nodeProperties.updated_at) { // if created_at was set to currentIsoTime
        paramsForExecution.created_at = currentIsoTime;
    }

    const queryResult = await kuzuClient.executeQuery(cypherQuery, paramsForExecution);
    mcpContext.logger.debug(
      { queryResult, params: paramsForExecution },
      'Kuzu query executed for addFileOp.',
    );

    if (queryResult && queryResult.length > 0) {
      const dbRecord = queryResult[0] as {
        id: string;
        name: string;
        path: string;
        language: string | null;
        metrics_json: string | null;
        content_hash: string | null;
        mime_type: string | null;
        size_bytes: number | null;
        created_at: string;
        updated_at: string;
        repository: string;
        branch: string;
      };

      let metrics: Record<string, any> | undefined = undefined;
      if (dbRecord.metrics_json) {
        try {
          metrics = JSON.parse(dbRecord.metrics_json);
        } catch (parseError) {
          mcpContext.logger.error(
            {
              error: parseError,
              metrics_json: dbRecord.metrics_json,
              fileId: dbRecord.id,
            },
            'Failed to parse metrics_json from DB result for file',
          );
          // Proceed without metrics if parsing fails, or handle as critical error
        }
      }

      const fileNode: z.infer<typeof toolSchemas.FileNodeSchema> = {
        id: dbRecord.id,
        name: dbRecord.name,
        path: dbRecord.path,
        language: dbRecord.language || null, // Ensure null if empty string or undefined from DB
        metrics: metrics,
        content_hash: dbRecord.content_hash || null,
        mime_type: dbRecord.mime_type || null,
        size_bytes: (dbRecord.size_bytes === null || dbRecord.size_bytes === undefined) ? null : Number(dbRecord.size_bytes),
        created_at: dbRecord.created_at,
        updated_at: dbRecord.updated_at,
        repository: dbRecord.repository,
        branch: dbRecord.branch,
      };
      mcpContext.logger.info({ fileId: fileNode.id, filePath: fileNode.path }, `File node ${fileNode.id} processed successfully.`);
      return fileNode;
    } else {
      mcpContext.logger.warn({ queryParamsSent: paramsForExecution, result: queryResult }, 'Kuzu query for addFileOp executed but returned no result or an empty result set.');
      return null;
    }
  } catch (error) {
    mcpContext.logger.error({ error, query: cypherQuery, params: queryParams }, 'Error executing addFileOp Cypher query');
    throw error;
  }
}

export async function associateFileWithComponentOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  repositoryId: string, // <repoName>:<branchName>
  branchName: string,
  componentId: string,
  fileId: string,
): Promise<boolean> {
  mcpContext.logger.info(
    `Attempting to associate Component {id: ${componentId}} with File {id: ${fileId}} in repository: ${repositoryId}, branch: ${branchName}`,
  );

  const cypherQuery = `
    MATCH (c:Component {id: $componentId, repository: $repositoryId, branch: $branchName}),
          (f:File {id: $fileId, repository: $repositoryId, branch: $branchName})
    MERGE (c)-[r:CONTAINS_FILE]->(f)
    RETURN r
  `;

  const queryParams = {
    componentId,
    fileId,
    repositoryId,
    branchName,
  };

  try {
    const queryResult = await kuzuClient.executeQuery(cypherQuery, queryParams);
    mcpContext.logger.debug({ queryResult, params: queryParams }, 'Kuzu query executed for associateFileWithComponentOp.');

    if (queryResult && queryResult.length > 0) {
      mcpContext.logger.info(
        `Successfully associated Component ${componentId} with File ${fileId}. Relationship: ${JSON.stringify(queryResult[0])}`
      );
      return true;
    } else {
      // If MATCH fails (no component or file found), executeQuery might still return an empty array
      mcpContext.logger.warn(
        `Failed to associate Component ${componentId} with File ${fileId}. Component or File not found, or they don't match repository/branch.`,
        { queryParams }
      );
      return false; // Indicates nodes not found or relationship not actively formed by this call
    }
  } catch (error) {
    mcpContext.logger.error(
      { error, query: cypherQuery, params: queryParams },
      'Error executing associateFileWithComponentOp Cypher query'
    );
    throw error; // Rethrow to be handled by the service layer
  }
}
