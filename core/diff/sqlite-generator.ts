/**
 * SQLite DDL Script Generator
 * Compiles schema differences into SQLite-compliant DDL. Implements robust table-rebuild procedures for complex operations.
 */

import { SchemaDiff, Table, Column } from '../types.js';

/**
 * Translates structural database differences into standard SQLite commands.
 *
 * @param diffs Array of database difference descriptions
 * @param currentSchema Full current database schema baseline (used for mapping rebuild data copies)
 * @param targetSchema Full target database schema state (used for compiling temporary targets)
 * @returns Executable SQLite transaction script
 */
export function generateSqliteSql(
  diffs: SchemaDiff[],
  currentSchema: any,
  targetSchema: any
): string {
  if (diffs.length === 0) {
    return '-- No changes detected. Database schema is up to date.\n';
  }

  // 1. Identify which tables require a full rebuild
  // A table requires a rebuild in SQLite if we are:
  // - Altering a column (type, nullable, default)
  // - Dropping a column
  // - Adding a column that is NOT NULL without default, or has unique/primary key constraints
  // - Adding or dropping foreign keys (since FKs are inline in SQLite CREATE TABLE)
  const rebuildTables = new Set<string>();
  const addColumns: SchemaDiff[] = [];
  const dropTables: SchemaDiff[] = [];
  const createTables: SchemaDiff[] = [];
  const dropIndexes: SchemaDiff[] = [];
  const addIndexes: SchemaDiff[] = [];

  for (const diff of diffs) {
    if (
      diff.action === 'ALTER_COLUMN' ||
      diff.action === 'DROP_COLUMN' ||
      diff.action === 'ADD_FK' ||
      diff.action === 'DROP_FK'
    ) {
      rebuildTables.add(diff.tableName);
    } else if (diff.action === 'ADD_COLUMN') {
      const col = diff.column!;
      if (!col.nullable && col.defaultValue === undefined) {
        // Can't add NOT NULL without default using standard ALTER TABLE
        rebuildTables.add(diff.tableName);
      } else if (col.primaryKey || col.unique) {
        // Can't add PK or Unique column via standard ALTER TABLE in SQLite
        rebuildTables.add(diff.tableName);
      } else {
        addColumns.push(diff);
      }
    } else if (diff.action === 'DROP_TABLE') {
      dropTables.push(diff);
    } else if (diff.action === 'CREATE_TABLE') {
      createTables.push(diff);
    } else if (diff.action === 'DROP_INDEX') {
      dropIndexes.push(diff);
    } else if (diff.action === 'ADD_INDEX') {
      addIndexes.push(diff);
    }
  }

  // If a table needs to be rebuilt, any separate column additions, index updates etc.
  // for that table should be ignored because the rebuild will handle it.
  const filteredAddColumns = addColumns.filter((diff) => !rebuildTables.has(diff.tableName));
  const filteredDropIndexes = dropIndexes.filter((diff) => !rebuildTables.has(diff.tableName));
  const filteredAddIndexes = addIndexes.filter((diff) => !rebuildTables.has(diff.tableName));

  const sqlBlocks: string[] = [];

  // Drop tables
  if (dropTables.length > 0) {
    sqlBlocks.push(
      '-- Drop Tables\n' +
        dropTables.map((d) => `DROP TABLE IF EXISTS "${d.tableName}";`).join('\n')
    );
  }

  // Create tables
  if (createTables.length > 0) {
    sqlBlocks.push(
      '-- Create Tables\n' + createTables.map((d) => generateCreateTableSql(d.table!)).join('\n\n')
    );
  }

  // Add columns (for tables not being rebuilt)
  if (filteredAddColumns.length > 0) {
    sqlBlocks.push(
      '-- Add Columns\n' +
        filteredAddColumns.map((d) => generateAddColumnSql(d.tableName, d.column!)).join('\n')
    );
  }

  // Rebuild tables
  if (rebuildTables.size > 0) {
    const rebuildSqls: string[] = [];
    for (const tableName of rebuildTables) {
      const currentTable = currentSchema.tables.find((t: any) => t.name === tableName);
      const targetTable = targetSchema.tables.find((t: any) => t.name === tableName);
      if (currentTable && targetTable) {
        rebuildSqls.push(generateRebuildTableSql(currentTable, targetTable));
      }
    }
    sqlBlocks.push('-- Rebuild Tables\n' + rebuildSqls.join('\n\n'));
  }

  // Drop indexes (for tables not rebuilt)
  if (filteredDropIndexes.length > 0) {
    sqlBlocks.push(
      '-- Drop Indexes\n' +
        filteredDropIndexes.map((d) => `DROP INDEX IF EXISTS "${d.index!.name}";`).join('\n')
    );
  }

  // Add indexes (for tables not rebuilt)
  if (filteredAddIndexes.length > 0) {
    sqlBlocks.push(
      '-- Create Indexes\n' +
        filteredAddIndexes
          .map((d) => {
            const uniqueStr = d.index!.unique ? 'UNIQUE ' : '';
            const colsStr = d.index!.columns.map((c) => `"${c}"`).join(', ');
            return `CREATE ${uniqueStr}INDEX "${d.index!.name}" ON "${d.tableName}" (${colsStr});`;
          })
          .join('\n')
    );
  }

  // Combine into single transaction block
  const fullSql = [
    'PRAGMA foreign_keys = OFF;',
    'BEGIN TRANSACTION;',
    '',
    sqlBlocks.join('\n\n'),
    '',
    'COMMIT;',
    'PRAGMA foreign_keys = ON;',
  ].join('\n');

  return fullSql;
}

function generateCreateTableSql(table: Table): string {
  const parts: string[] = [];

  for (const col of table.columns) {
    let colStr = `  "${col.name}" ${col.type}`;
    if (col.primaryKey && (!table.primaryKey || table.primaryKey.length === 1)) {
      colStr += ' PRIMARY KEY';
      if (col.autoIncrement) {
        colStr += ' AUTOINCREMENT';
      }
    }
    if (!col.nullable) colStr += ' NOT NULL';
    if (col.unique && !col.primaryKey) colStr += ' UNIQUE';
    if (col.defaultValue !== undefined) colStr += ` DEFAULT ${col.defaultValue}`;

    parts.push(colStr);
  }

  if (table.primaryKey && table.primaryKey.length > 1) {
    parts.push(`  PRIMARY KEY (${table.primaryKey.map((c) => `"${c}"`).join(', ')})`);
  }

  for (const fk of table.foreignKeys) {
    let fkStr = `  FOREIGN KEY ("${fk.column}") REFERENCES "${fk.referencedTable}" ("${fk.referencedColumn}")`;
    if (fk.onDelete) fkStr += ` ON DELETE ${fk.onDelete}`;
    if (fk.onUpdate) fkStr += ` ON UPDATE ${fk.onUpdate}`;
    parts.push(fkStr);
  }

  return `CREATE TABLE "${table.name}" (\n${parts.join(',\n')}\n);`;
}

function generateAddColumnSql(tableName: string, col: Column): string {
  let sql = `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${col.type}`;
  if (!col.nullable) sql += ' NOT NULL';
  if (col.unique) sql += ' UNIQUE';
  if (col.defaultValue !== undefined) sql += ` DEFAULT ${col.defaultValue}`;
  sql += ';';
  return sql;
}

function generateRebuildTableSql(currentTable: Table, targetTable: Table): string {
  const name = targetTable.name;
  const tempName = `_dbslate_temp_${name}`;

  // 1. Generate temp table CREATE definition
  const tempCreateSql = generateCreateTableSql({
    ...targetTable,
    name: tempName,
  });

  // 2. Identify common columns
  const currentCols = currentTable.columns.map((c) => c.name);
  const targetCols = targetTable.columns.map((c) => c.name);
  const matchingCols = targetCols.filter((c) => currentCols.includes(c));
  const colsStr = matchingCols.map((c) => `"${c}"`).join(', ');

  const sqlLines = [
    `  -- Create temp table`,
    `  ${tempCreateSql.split('\n').join('\n  ')}`,
    `  -- Copy matching column data`,
  ];

  if (matchingCols.length > 0) {
    sqlLines.push(`  INSERT INTO "${tempName}" (${colsStr}) SELECT ${colsStr} FROM "${name}";`);
  }

  sqlLines.push(
    `  -- Drop old table`,
    `  DROP TABLE "${name}";`,
    `  -- Rename temp table`,
    `  ALTER TABLE "${tempName}" RENAME TO "${name}";`
  );

  // 3. Recreate target table indexes since dropping the table dropped them
  if (targetTable.indexes.length > 0) {
    sqlLines.push(`  -- Recreate indexes`);
    for (const idx of targetTable.indexes) {
      const uniqueStr = idx.unique ? 'UNIQUE ' : '';
      const colsStr = idx.columns.map((c) => `"${c}"`).join(', ');
      sqlLines.push(`  CREATE ${uniqueStr}INDEX "${idx.name}" ON "${name}" (${colsStr});`);
    }
  }

  return sqlLines.join('\n');
}
