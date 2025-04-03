#!/usr/bin/env bun

import fs from "fs";
import path from "path";

// Command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isVerbose = args.includes("--verbose");
const dirIndex = args.indexOf("--dir");
const rootDir =
  dirIndex !== -1 && args.length > dirIndex + 1 ? args[dirIndex + 1] : "frontend/src";

// Logging utility
const log = {
  info: (message: string) => console.log(`\x1b[34mINFO:\x1b[0m ${message}`),
  success: (message: string) =>
    console.log(`\x1b[32mSUCCESS:\x1b[0m ${message}`),
  warning: (message: string) =>
    console.log(`\x1b[33mWARNING:\x1b[0m ${message}`),
  error: (message: string) => console.error(`\x1b[31mERROR:\x1b[0m ${message}`),
  verbose: (message: string) =>
    isVerbose && console.log(`\x1b[90mDEBUG:\x1b[0m ${message}`),
};

// Stats
const stats = {
  filesScanned: 0,
  filesRenamed: 0,
  importsUpdated: 0,
  errors: 0,
};

// Interface for file rename mapping
interface RenameMapping {
  oldPath: string;
  newPath: string;
  oldBasename: string;
  newBasename: string;
}

/**
 * Check if a filename is in camelCase or PascalCase
 */
function isCamelCase(filename: string): boolean {
  // Remove extension
  const name = path.parse(filename).name;

  // Check if the filename has uppercase letters (camelCase or PascalCase)
  // and doesn't contain hyphens (already kebab-case)
  return (
    (/^[a-z][a-zA-Z0-9]*[A-Z]/.test(name) || /^[A-Z]/.test(name)) &&
    !name.includes("-")
  );
}

/**
 * Convert camelCase to kebab-case
 */
function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Find all TypeScript files in a directory recursively
 */
function findTypeScriptFiles(dir: string): string[] {
  let results: string[] = [];

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      results = results.concat(findTypeScriptFiles(itemPath));
    } else if (stat.isFile() && item.endsWith(".ts")) {
      results.push(itemPath);
    }
  }

  return results;
}

/**
 * Create a mapping of files to rename
 */
function createRenameMapping(files: string[]): RenameMapping[] {
  const mapping: RenameMapping[] = [];

  for (const file of files) {
    const dirname = path.dirname(file);
    const basename = path.basename(file);

    if (isCamelCase(basename)) {
      const newBasename =
        toKebabCase(path.parse(basename).name) + path.extname(basename);
      const newPath = path.join(dirname, newBasename);

      mapping.push({
        oldPath: file,
        newPath,
        oldBasename: basename,
        newBasename,
      });

      log.verbose(`Will rename: ${basename} → ${newBasename}`);
    }
  }

  return mapping;
}

/**
 * Update imports in a file
 */
function updateImportsInFile(
  filePath: string,
  mapping: RenameMapping[],
): number {
  let content = fs.readFileSync(filePath, "utf8");
  let updatedCount = 0;

  for (const { oldBasename, newBasename } of mapping) {
    // Remove extension for import matching
    const oldName = path.parse(oldBasename).name;
    const newName = path.parse(newBasename).name;

    // Match imports with the old filename
    const importRegex = new RegExp(
      `from\\s+['"](\\./|\\.\\./)*(${oldName})['"]`,
      "g",
    );
    const updatedContent = content.replace(
      importRegex,
      (match, prefix, filename) => {
        updatedCount++;
        return match.replace(filename, newName);
      },
    );

    if (content !== updatedContent) {
      content = updatedContent;
      log.verbose(`Updated imports in ${filePath} for ${oldName} → ${newName}`);
    }
  }

  if (updatedCount > 0 && !isDryRun) {
    fs.writeFileSync(filePath, content, "utf8");
  }

  return updatedCount;
}

/**
 * Rename files according to the mapping
 */
function renameFiles(mapping: RenameMapping[]): void {
  for (const { oldPath, newPath } of mapping) {
    log.info(`Renaming: ${oldPath} → ${newPath}`);

    if (!isDryRun) {
      try {
        fs.renameSync(oldPath, newPath);
        stats.filesRenamed++;
      } catch (error) {
        log.error(
          `Failed to rename ${oldPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
        stats.errors++;
      }
    } else {
      stats.filesRenamed++;
    }
  }
}

/**
 * Main function
 */
async function main() {
  log.info(
    `Starting rename operation in ${rootDir} directory${isDryRun ? " (DRY RUN)" : ""}`,
  );

  // Find all TypeScript files
  const allFiles = findTypeScriptFiles(rootDir);
  stats.filesScanned = allFiles.length;
  log.info(`Found ${allFiles.length} TypeScript files`);

  // Create rename mapping
  const mapping = createRenameMapping(allFiles);
  log.info(`Found ${mapping.length} files to rename`);

  if (mapping.length === 0) {
    log.warning("No camelCase files found to rename");
    return;
  }

  // First pass: Update imports in all files
  for (const file of allFiles) {
    const updatedCount = updateImportsInFile(file, mapping);
    stats.importsUpdated += updatedCount;
  }

  // Second pass: Rename the files
  renameFiles(mapping);

  // Print summary
  log.success("\nOperation completed!");
  log.info(`Files scanned: ${stats.filesScanned}`);
  log.info(`Files renamed: ${stats.filesRenamed}`);
  log.info(`Import statements updated: ${stats.importsUpdated}`);

  if (stats.errors > 0) {
    log.error(`Errors encountered: ${stats.errors}`);
  }

  if (isDryRun) {
    log.warning("This was a dry run. No actual changes were made.");
    log.info("Run without --dry-run to apply the changes.");
  }
}

// Run the script
main().catch((error) => {
  log.error(
    `Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
