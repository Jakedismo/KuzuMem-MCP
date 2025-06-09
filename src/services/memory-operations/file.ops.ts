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
  repositoryId: string, // This is expected to be <repoName>:<branchName>
  branchName: string, // This might seem redundant if repositoryId contains it, but kept for clarity from plan
  fileData: z.infer<typeof toolSchemas.AddFileInputSchema>
): Promise<z.infer<typeof toolSchemas.FileNodeSchema> | null> {
  mcpContext.logger.info(`Attempting to add/update file: ${fileData.path} in repository: ${repositoryId}, branch: ${branchName}`);

  const nodeProperties: FileNodeProperties = {
    id: fileData.id,
    name: fileData.name,
    path: fileData.path,
    language: fileData.language || null,
    metrics_json: fileData.metrics ? JSON.stringify(fileData.metrics) : null,
    content_hash: fileData.content_hash || null,
    mime_type: fileData.mime_type || null,
    size_bytes: fileData.size_bytes === undefined ? null : fileData.size_bytes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), // Will be same as created_at on create
    repository: repositoryId,
    branch: branchName,
  };

  // Parameters for the Cypher query
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
    updated_at: nodeProperties.updated_at, // For ON MATCH, this will be a new timestamp
    repository: nodeProperties.repository,
    branch: nodeProperties.branch,
  };

  const cypherQuery = `
    MERGE (f:File {id: $id})
    ON CREATE SET
        f.name = $name,
        f.path = $path,
        f.language = $language,
        f.metrics_json = $metrics_json,
        f.content_hash = $content_hash,
        f.mime_type = $mime_type,
        f.size_bytes = $size_bytes,
        f.created_at = $created_at,
        f.updated_at = $updated_at,
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
        f.updated_at = $updated_at, // Update updated_at timestamp on match
        f.repository = $repository, // Potentially redundant to set these on match if they define the node's context
        f.branch = $branch       // but good for ensuring data consistency if a file were somehow re-assigned
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


    const queryResult = await kuzuClient.runWriteQuery(cypherQuery, paramsForExecution);
    mcpContext.logger.debug({ queryResult, params: paramsForExecution }, 'Kuzu query executed for addFileOp.');


    if (queryResult && queryResult.length > 0) {
      const dbRecord = queryResult[0] as any;

      let metrics: Record<string, any> | undefined = undefined;
      if (dbRecord.metrics_json) {
        try {
          metrics = JSON.parse(dbRecord.metrics_json);
        } catch (parseError) {
          mcpContext.logger.error({ error: parseError, metrics_json: dbRecord.metrics_json, fileId: dbRecord.id }, 'Failed to parse metrics_json from DB result for file');
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
  repositoryId: string, // Expected to be <repoName>:<branchName>
  branchName: string,   // Explicit branch name
  componentId: string,
  fileId: string
): Promise<boolean> {
  mcpContext.logger.info(
    `Attempting to associate Component {id: ${componentId}} with File {id: ${fileId}} in repository: ${repositoryId}, branch: ${branchName}`
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
    const queryResult = await kuzuClient.runWriteQuery(cypherQuery, queryParams);
    mcpContext.logger.debug({ queryResult, params: queryParams }, 'Kuzu query executed for associateFileWithComponentOp.');

    // If MERGE is successful and the relationship is created or already exists,
    // Kuzu typically returns the properties of the merged relationship or an empty result for MERGE.
    // A non-error response and potentially a result indicates success.
    // If MATCH fails (no component or file found), runWriteQuery might still return an empty array
    // or throw an error depending on Kuzu's behavior for failed matches in MERGE.
    // We'll consider it a success if no error is thrown and the result array is not empty,
    // or if it is empty but this indicates a successful MERGE without return values (common for MERGE).
    // The key is that an error isn't thrown if nodes aren't found for MATCH.
    // Kuzu's MERGE behavior: If the MATCH part fails, MERGE does nothing and returns an empty result.
    // So, we need to check if `queryResult` contains data.
    if (queryResult && queryResult.length > 0) {
      mcpContext.logger.info(
        `Successfully associated Component {id: ${componentId}} with File {id: ${fileId}}. Relationship details: ${JSON.stringify(queryResult[0])}`
      );
      return true;
    } else {
      // This case means MATCH failed or MERGE didn't return 'r' (e.g. if relation already existed and query was just RETURN type(r))
      // For "RETURN r", if the relation is created/matched, it should return the relation.
      // If MATCH fails, it returns empty.
      mcpContext.logger.warn(
        `Failed to associate Component {id: ${componentId}} with File {id: ${fileId}}. Component or File not found, or relationship already existed and MERGE did not return it (check query if this is unexpected). Assuming nodes not found if result is empty.`,
        { queryParams }
      );
      return false; // Indicates nodes not found or relationship not actively formed by this call
    }
  } catch (error) {
    mcpContext.logger.error(
      { error, query: cypherQuery, params: queryParams },
      'Error executing associateFileWithComponentOp Cypher query'
    );
    // Rethrowing allows the service layer to decide on the exact output schema
    // Alternatively, could return false here. For now, let's rethrow.
    throw error;
  }
}
