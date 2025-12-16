import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const TEMP_DIR = process.env.TEMP_DIR || './temp';

export async function ensureTempDir(): Promise<void> {
  await fs.ensureDir(TEMP_DIR);
}

export function getTempFilePath(extension: string): string {
  const filename = `${uuidv4()}.${extension}`;
  return path.join(TEMP_DIR, filename);
}

export async function cleanupFile(filePath: string): Promise<void> {
  try {
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }
  } catch (error) {
    console.error(`Error cleaning up file ${filePath}:`, error);
  }
}

export async function cleanupFiles(filePaths: string[]): Promise<void> {
  await Promise.all(filePaths.map(cleanupFile));
}




