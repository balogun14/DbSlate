#!/usr/bin/env node

/**
 * DbSlate CLI Binary Entry Point
 * Implements database introspection, schema difference generation, model exportation, and DDL migrations.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import {
  introspectPostgres,
  introspectSqlite,
  diffSchemas,
  generatePostgresSql,
  generateSqliteSql,
  generateModels,
  Schema,
} from '@dbslate/core';
import pg from 'pg';
import sqlite3 from 'sqlite3';

function showHelp() {
  console.log(`
DbSlate CLI - Safe database introspection, diffing, and migration tool.

Usage:
  dbslate <command> [options]

Commands:
  introspect <connection-url>           Connect to database and generate schema.json
    Options:
      --out <file>                      Output file path (default: schema.json)

  diff                                  Compare two schemas and generate DDL migration
    Options:
      --current <file|url>              Current schema state (JSON file or DB url)
      --target <file|url>               Target schema state (JSON file or DB url)
      --db-type <postgres|sqlite>       DB type for DDL output (optional, defaults to postgres)
      --out <file>                      Output DDL migration SQL file (default: migration.sql)

  apply <connection-url>                Apply a SQL migration to the database
    Options:
      --migration <file>                Path to the migration SQL file

  generate                              Generate model files from schema JSON
    Options:
      --schema <file>                   Path to schema.json
      --lang <typescript|csharp|python|go>  Target programming language
      --out <file>                      Output file path
  `);
}

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function loadSchema(input: string): Promise<{ schema: Schema; type: 'postgres' | 'sqlite' }> {
  if (input.startsWith('postgres://') || input.startsWith('postgresql://')) {
    const schema = await introspectPostgres(input);
    return { schema, type: 'postgres' };
  } else if (input.endsWith('.db') || input.endsWith('.sqlite') || input.startsWith('sqlite://')) {
    const dbPath = input.replace(/^sqlite:\/\//, '');
    const schema = await introspectSqlite(dbPath);
    return { schema, type: 'sqlite' };
  } else {
    // Treat as JSON file path
    const fileContent = fs.readFileSync(path.resolve(input), 'utf-8');
    const schema = JSON.parse(fileContent) as Schema;
    // Simple heuristic to detect db type or default
    const isSqlite = schema.tables.some((t) =>
      t.columns.some((c) => c.type.toUpperCase() === 'INTEGER PRIMARY KEY AUTOINCREMENT')
    );
    return { schema, type: isSqlite ? 'sqlite' : 'postgres' };
  }
}

async function executeSqlPostgres(url: string, sql: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN;');
    await client.query(sql);
    await client.query('COMMIT;');
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  } finally {
    await client.end();
  }
}

async function executeSqlSqlite(dbPath: string, sql: string) {
  const db = new sqlite3.Database(dbPath);
  return new Promise<void>((resolve, reject) => {
    db.exec(sql, (err) => {
      db.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const command = args[0];

  try {
    switch (command) {
      case 'introspect': {
        const url = args[1];
        if (!url) {
          console.error('Error: Connection URL is required.');
          showHelp();
          process.exit(1);
        }

        let outPath = 'schema.json';
        const outIdx = args.indexOf('--out');
        if (outIdx !== -1 && args[outIdx + 1]) {
          outPath = args[outIdx + 1];
        }

        console.log(`Introspecting database at: ${url.replace(/:[^:]+@/, ':****@')} ...`);

        let schema: Schema;
        if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
          schema = await introspectPostgres(url);
        } else {
          // SQLite
          const cleanPath = url.replace(/^sqlite:\/\//, '');
          schema = await introspectSqlite(cleanPath);
        }

        fs.writeFileSync(path.resolve(outPath), JSON.stringify(schema, null, 2), 'utf-8');
        console.log(`Success! Schema JSON written to ${outPath}`);
        break;
      }

      case 'diff': {
        // Find options
        const curIdx = args.indexOf('--current');
        const tarIdx = args.indexOf('--target');
        const typeIdx = args.indexOf('--db-type');
        const outIdx = args.indexOf('--out');

        if (curIdx === -1 || !args[curIdx + 1] || tarIdx === -1 || !args[tarIdx + 1]) {
          console.error('Error: Both --current and --target are required.');
          showHelp();
          process.exit(1);
        }

        const currentSource = args[curIdx + 1];
        const targetSource = args[tarIdx + 1];
        let dbType: 'postgres' | 'sqlite' = 'postgres';
        let outPath = 'migration.sql';

        if (typeIdx !== -1 && args[typeIdx + 1]) {
          dbType = args[typeIdx + 1] as any;
        }
        if (outIdx !== -1 && args[outIdx + 1]) {
          outPath = args[outIdx + 1];
        }

        console.log('Loading current schema...');
        const currentData = await loadSchema(currentSource);
        console.log('Loading target schema...');
        const targetData = await loadSchema(targetSource);

        // Auto-detect dbType if not explicitly passed
        if (typeIdx === -1) {
          dbType = targetData.type;
        }

        console.log(`Analyzing differences (Target DB type: ${dbType})...`);
        const diffs = diffSchemas(currentData.schema, targetData.schema);

        if (diffs.length === 0) {
          console.log('No changes detected. Database is up to date.');
          fs.writeFileSync(path.resolve(outPath), '-- No changes detected.\n', 'utf-8');
          return;
        }

        // Check for destructive actions
        const destructiveDiffs = diffs.filter((d) => d.isDestructive);
        let includeDestructive = true;

        if (destructiveDiffs.length > 0) {
          console.log('\n=========================================');
          console.log('⚠️  WARNING: DESTRUCTIVE CHANGES DETECTED');
          console.log('=========================================');
          for (const d of destructiveDiffs) {
            console.log(` - Table "${d.tableName}": ${d.warning}`);
          }
          console.log('=========================================\n');

          // Option B: Confirm destructive commands
          const answer = await askQuestion(
            'Do you want to include these destructive changes in the generated migration? (y/N): '
          );
          if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
            includeDestructive = false;
            console.log('Excluding destructive operations from the SQL script.');
          }
        }

        // Filter diffs based on user confirmation
        const finalDiffs = includeDestructive ? diffs : diffs.filter((d) => !d.isDestructive);

        let sql = '';
        if (dbType === 'sqlite') {
          sql = generateSqliteSql(finalDiffs, currentData.schema, targetData.schema);
        } else {
          sql = generatePostgresSql(finalDiffs);
        }

        fs.writeFileSync(path.resolve(outPath), sql, 'utf-8');
        console.log(`Success! Migration SQL written to ${outPath}`);
        break;
      }

      case 'apply': {
        const url = args[1];
        if (!url) {
          console.error('Error: Connection URL is required.');
          showHelp();
          process.exit(1);
        }

        const migIdx = args.indexOf('--migration');
        if (migIdx === -1 || !args[migIdx + 1]) {
          console.error('Error: --migration <file> option is required.');
          showHelp();
          process.exit(1);
        }

        const migrationPath = args[migIdx + 1];
        const sql = fs.readFileSync(path.resolve(migrationPath), 'utf-8');

        console.log(`Applying migration ${migrationPath} ...`);
        if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
          await executeSqlPostgres(url, sql);
        } else {
          const cleanPath = url.replace(/^sqlite:\/\//, '');
          await executeSqlSqlite(cleanPath, sql);
        }

        console.log('Success! Migration applied.');
        break;
      }

      case 'generate': {
        const schIdx = args.indexOf('--schema');
        const langIdx = args.indexOf('--lang');
        const outIdx = args.indexOf('--out');

        if (
          schIdx === -1 ||
          !args[schIdx + 1] ||
          langIdx === -1 ||
          !args[langIdx + 1] ||
          outIdx === -1 ||
          !args[outIdx + 1]
        ) {
          console.error('Error: --schema, --lang, and --out options are all required.');
          showHelp();
          process.exit(1);
        }

        const schemaPath = args[schIdx + 1];
        const lang = args[langIdx + 1].toLowerCase() as any;
        const outPath = args[outIdx + 1];

        console.log(`Loading schema file ${schemaPath} ...`);
        const schema = JSON.parse(fs.readFileSync(path.resolve(schemaPath), 'utf-8')) as Schema;

        console.log(`Generating ${lang} models...`);
        const code = generateModels(schema, lang);

        fs.writeFileSync(path.resolve(outPath), code, 'utf-8');
        console.log(`Success! Models written to ${outPath}`);
        break;
      }

      default:
        console.error(`Error: Unknown command "${command}"`);
        showHelp();
        process.exit(1);
    }
  } catch (error: any) {
    console.error('Execution failed:', error.message || error);
    process.exit(1);
  }
}

main();
