/**
 * PostgreSQL DDL Script Generator
 * Compiles a list of schema differences into standard, transaction-safe PostgreSQL DDL SQL blocks.
 */

import { SchemaDiff, Table, Column } from '../types.js';

/**
 * Translates structural database differences into standard PostgreSQL DDL commands.
 *
 * @param diffs Array of database difference descriptions
 * @returns Executable PostgreSQL SQL script containing transaction blocks
 */
export function generatePostgresSql(diffs: SchemaDiff[]): string {
  if (diffs.length === 0) {
    return '-- No changes detected. Database schema is up to date.\n';
  }

  const dropFks: string[] = [];
  const dropIndexes: string[] = [];
  const dropColumns: string[] = [];
  const dropTables: string[] = [];

  const createTables: string[] = [];
  const addColumns: string[] = [];
  const alterColumns: string[] = [];

  const addIndexes: string[] = [];
  const addFks: string[] = [];

  for (const diff of diffs) {
    const tableQ = `"${diff.tableName}"`;

    switch (diff.action) {
      case 'DROP_FK':
        if (diff.foreignKey) {
          dropFks.push(`ALTER TABLE ${tableQ} DROP CONSTRAINT "${diff.foreignKey.name}";`);
        }
        break;

      case 'DROP_INDEX':
        if (diff.index) {
          dropIndexes.push(`DROP INDEX IF EXISTS "${diff.index.name}";`);
        }
        break;

      case 'DROP_COLUMN':
        if (diff.column) {
          dropColumns.push(`ALTER TABLE ${tableQ} DROP COLUMN "${diff.column.name}" CASCADE;`);
        }
        break;

      case 'DROP_TABLE':
        dropTables.push(`DROP TABLE IF EXISTS ${tableQ} CASCADE;`);
        break;

      case 'CREATE_TABLE':
        if (diff.table) {
          createTables.push(generateCreateTableSql(diff.table));
        }
        break;

      case 'ADD_COLUMN':
        if (diff.column) {
          addColumns.push(generateAddColumnSql(diff.tableName, diff.column));
        }
        break;

      case 'ALTER_COLUMN':
        if (diff.column && diff.columnAlteration) {
          alterColumns.push(
            ...generateAlterColumnSql(diff.tableName, diff.column, diff.columnAlteration)
          );
        }
        break;

      case 'ADD_INDEX':
        if (diff.index) {
          const uniqueStr = diff.index.unique ? 'UNIQUE ' : '';
          const colsStr = diff.index.columns.map((c) => `"${c}"`).join(', ');
          addIndexes.push(
            `CREATE ${uniqueStr}INDEX "${diff.index.name}" ON ${tableQ} (${colsStr});`
          );
        }
        break;

      case 'ADD_FK':
        if (diff.foreignKey) {
          const fk = diff.foreignKey;
          let fkStr = `ALTER TABLE ${tableQ} ADD CONSTRAINT "${fk.name}" FOREIGN KEY ("${fk.column}") REFERENCES "${fk.referencedTable}" ("${fk.referencedColumn}")`;
          if (fk.onDelete) fkStr += ` ON DELETE ${fk.onDelete}`;
          if (fk.onUpdate) fkStr += ` ON UPDATE ${fk.onUpdate}`;
          fkStr += ';';
          addFks.push(fkStr);
        }
        break;
    }
  }

  // Combine statements in order
  const sqlBlocks: string[] = [];

  if (dropFks.length > 0) {
    sqlBlocks.push('-- Drop Foreign Keys\n' + dropFks.join('\n'));
  }
  if (dropIndexes.length > 0) {
    sqlBlocks.push('-- Drop Indexes\n' + dropIndexes.join('\n'));
  }
  if (dropColumns.length > 0) {
    sqlBlocks.push('-- Drop Columns\n' + dropColumns.join('\n'));
  }
  if (dropTables.length > 0) {
    sqlBlocks.push('-- Drop Tables\n' + dropTables.join('\n'));
  }
  if (createTables.length > 0) {
    sqlBlocks.push('-- Create Tables\n' + createTables.join('\n\n'));
  }
  if (addColumns.length > 0) {
    sqlBlocks.push('-- Add Columns\n' + addColumns.join('\n'));
  }
  if (alterColumns.length > 0) {
    sqlBlocks.push('-- Alter Columns\n' + alterColumns.join('\n'));
  }
  if (addIndexes.length > 0) {
    sqlBlocks.push('-- Create Indexes\n' + addIndexes.join('\n'));
  }
  if (addFks.length > 0) {
    sqlBlocks.push('-- Create Foreign Keys\n' + addFks.join('\n'));
  }

  return sqlBlocks.join('\n\n') + '\n';
}

function generateCreateTableSql(table: Table): string {
  const parts: string[] = [];

  for (const col of table.columns) {
    let colType = col.type;

    // Serial/Identity mapping
    if (col.autoIncrement) {
      if (colType.toUpperCase() === 'INTEGER' || colType.toUpperCase() === 'INT') {
        colType = 'SERIAL';
      } else if (colType.toUpperCase() === 'BIGINT') {
        colType = 'BIGSERIAL';
      }
    }

    let colStr = `  "${col.name}" ${colType}`;

    if (col.primaryKey && (!table.primaryKey || table.primaryKey.length === 1)) {
      colStr += ' PRIMARY KEY';
    }

    if (!col.nullable) {
      colStr += ' NOT NULL';
    }

    if (col.defaultValue !== undefined) {
      colStr += ` DEFAULT ${col.defaultValue}`;
    }

    parts.push(colStr);
  }

  // Composite primary keys
  if (table.primaryKey && table.primaryKey.length > 1) {
    parts.push(`  PRIMARY KEY (${table.primaryKey.map((c) => `"${c}"`).join(', ')})`);
  }

  // Inline foreign keys are better written as standalone ADD FK statements to resolve circular references!
  // Same for indexes.

  return `CREATE TABLE "${table.name}" (\n${parts.join(',\n')}\n);`;
}

function generateAddColumnSql(tableName: string, col: Column): string {
  let colType = col.type;
  if (col.autoIncrement) {
    if (colType.toUpperCase() === 'INTEGER' || colType.toUpperCase() === 'INT') {
      colType = 'SERIAL';
    } else if (colType.toUpperCase() === 'BIGINT') {
      colType = 'BIGSERIAL';
    }
  }

  let sql = `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${colType}`;
  if (!col.nullable) {
    sql += ' NOT NULL';
  }
  if (col.defaultValue !== undefined) {
    sql += ` DEFAULT ${col.defaultValue}`;
  }
  sql += ';';
  return sql;
}

function generateAlterColumnSql(tableName: string, col: Column, alt: any): string[] {
  const statements: string[] = [];
  const tableQ = `"${tableName}"`;
  const colQ = `"${col.name}"`;

  // Type change
  if (alt.typeChanged) {
    // Add implicit USING cast for convenience (e.g. USING "column_name"::new_type)
    statements.push(
      `ALTER TABLE ${tableQ} ALTER COLUMN ${colQ} TYPE ${alt.typeChanged.to} USING ${colQ}::${alt.typeChanged.to};`
    );
  }

  // Nullability change
  if (alt.nullableChanged) {
    if (alt.nullableChanged.to === false) {
      statements.push(`ALTER TABLE ${tableQ} ALTER COLUMN ${colQ} SET NOT NULL;`);
    } else {
      statements.push(`ALTER TABLE ${tableQ} ALTER COLUMN ${colQ} DROP NOT NULL;`);
    }
  }

  // Default change
  if (alt.defaultChanged) {
    if (alt.defaultChanged.to === undefined) {
      statements.push(`ALTER TABLE ${tableQ} ALTER COLUMN ${colQ} DROP DEFAULT;`);
    } else {
      statements.push(
        `ALTER TABLE ${tableQ} ALTER COLUMN ${colQ} SET DEFAULT ${alt.defaultChanged.to};`
      );
    }
  }

  return statements;
}
