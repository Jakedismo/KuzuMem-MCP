// src/tests/utils/test-db-setup.ts
import fs from 'fs/promises';
import path from 'path';

// No longer use a global testDbPath or default filename here, it will be provided.

export async function setupTestDB(testDbFilename: string): Promise<string> {
  if (!testDbFilename) {
    throw new Error('testDbFilename must be provided to setupTestDB.');
  }

  // Construct path relative to project root for test databases
  const projectRoot = path.resolve(process.cwd()); // Or use a fixed relative path like __dirname, ../../..
  const specificTestDbPath = path.join(projectRoot, testDbFilename);

  // THIS IS THE KEY FIX: Set only the filename, not the full path.
  // The KuzuDBClient will construct the full path by joining clientProjectRoot + DB_RELATIVE_DIR + DB_FILENAME
  process.env.DB_FILENAME = testDbFilename;

  try {
    const stats = await fs.stat(specificTestDbPath).catch(() => null);
    if (stats) {
      if (stats.isDirectory()) {
        console.log(
          `E2E Test DB: Path ${specificTestDbPath} is a directory. Removing recursively...`,
        );
        await fs.rm(specificTestDbPath, { recursive: true, force: true });
        console.log(`E2E Test DB: Directory ${specificTestDbPath} removed.`);
      } else {
        console.log(`E2E Test DB: Path ${specificTestDbPath} is a file. Deleting...`);
        await fs.unlink(specificTestDbPath);
        console.log(`E2E Test DB: File ${specificTestDbPath} deleted.`);
      }
    }
    console.log(`E2E Test DB: Ensured path ${specificTestDbPath} is clear for KuzuDB.`);
  } catch (error: any) {
    console.warn(`E2E Test DB: Error during pre-cleanup of ${specificTestDbPath}:`, error.message);
  }

  console.log(`E2E Test DB: Server will be configured to use KuzuDB at ${specificTestDbPath}`);
  return specificTestDbPath; // Return the path that was set and cleared
}

export async function cleanupTestDB(specificTestDbPath: string): Promise<void> {
  // No longer uses a global testDbPath, expects the path to be passed in.
  if (!specificTestDbPath) {
    console.warn('E2E Test DB Cleanup: No DB path provided, skipping cleanup.');
    return;
  }
  try {
    await fs.rm(specificTestDbPath, { recursive: true, force: true });
    console.log(`E2E Test DB: Cleaned up path ${specificTestDbPath}.`);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn(`E2E Test DB: Could not clean up ${specificTestDbPath}:`, error.message);
    } else {
      console.log(`E2E Test DB: Path ${specificTestDbPath} did not exist, no cleanup needed.`);
    }
  }
}
