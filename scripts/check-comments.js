import fs from 'fs';
import path from 'path';

const IGNORED_PATHS = ['node_modules', 'dist', '.next', 'test', 'next-env.d.ts'];

function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!IGNORED_PATHS.some((p) => filePath.includes(p))) {
        getFiles(filePath, fileList);
      }
    } else if (filePath.endsWith('.ts') && !filePath.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function checkFileComments(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const errors = [];

  // Rule 1: Every source file must contain a header comment in the first 5 lines
  const hasHeader = lines.slice(0, 5).some((line) => line.includes('//') || line.includes('/*'));
  if (!hasHeader) {
    errors.push('File must start with a descriptive header comment explaining its purpose.');
  }

  // Rule 2: Every exported function or class should have a docstring block comment (/** ... */)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      line.startsWith('export class') ||
      line.startsWith('export function') ||
      line.startsWith('export async function') ||
      line.startsWith('export const')
    ) {
      // Look back for a doc comment block ending on the line before
      let hasDoc = false;
      let checkIndex = i - 1;

      // Move up past whitespace
      while (checkIndex >= 0 && lines[checkIndex].trim() === '') {
        checkIndex--;
      }

      if (checkIndex >= 0) {
        const prevLine = lines[checkIndex].trim();
        // Check if block comment ends
        if (prevLine.endsWith('*/')) {
          // Verify it's a docstring comment by looking back for /**
          let foundDocStart = false;
          while (checkIndex >= 0) {
            if (lines[checkIndex].trim().startsWith('/**')) {
              foundDocStart = true;
              break;
            }
            if (lines[checkIndex].trim().startsWith('/*')) {
              // Standard comment block, not a TSDoc block
              break;
            }
            checkIndex--;
          }
          if (foundDocStart) {
            hasDoc = true;
          }
        }
      }

      if (!hasDoc) {
        const match = line.match(/(class|function|const)\s+([a-zA-Z0-9_]+)/);
        const name = match ? match[2] : 'member';
        errors.push(
          `Line ${i + 1}: Exported member "${name}" must be documented with a JSDoc/TSDoc comment block (/** ... */).`
        );
      }
    }
  }

  return errors;
}

function main() {
  console.log('🔍 Running Comment Enforcement Check...');
  const coreFiles = getFiles(path.resolve('./core'));
  const cliFiles = getFiles(path.resolve('./cli'));
  const allFiles = [...coreFiles, ...cliFiles];

  let totalErrors = 0;

  for (const file of allFiles) {
    const relativePath = path.relative(process.cwd(), file);
    const fileErrors = checkFileComments(file);

    if (fileErrors.length > 0) {
      console.log(`\n❌ Comment rules violation in: ${relativePath}`);
      for (const err of fileErrors) {
        console.log(`   - ${err}`);
      }
      totalErrors += fileErrors.length;
    }
  }

  if (totalErrors > 0) {
    console.log(`\n🚨 Comment Check Failed: Found ${totalErrors} issues across your codebase.`);
    process.exit(1);
  } else {
    console.log('\n✅ Comment Check Passed: All files and exports are documented correctly.');
    process.exit(0);
  }
}

main();
