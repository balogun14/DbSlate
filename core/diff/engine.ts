/**
 * Database Schema Difference Engine
 * Compares two standardized schema definitions (current vs target) and computes a list of difference instructions.
 */

import {
  Schema,
  Table,
  Column,
  ForeignKey,
  Index,
  SchemaDiff,
  ColumnAlteration,
} from '../types.js';

/**
 * Calculates structural differences between the current and target database schemas.
 *
 * @param current Baseline/current database schema state
 * @param target Desired target database schema state
 * @returns Array of difference instructions describing actions and potential warning levels
 */
export function diffSchemas(current: Schema, target: Schema): SchemaDiff[] {
  const diffs: SchemaDiff[] = [];

  const currentTablesMap = new Map<string, Table>(current.tables.map((t) => [t.name, t]));
  const targetTablesMap = new Map<string, Table>(target.tables.map((t) => [t.name, t]));

  // 1. Check for dropped tables
  for (const currentTable of current.tables) {
    if (!targetTablesMap.has(currentTable.name)) {
      diffs.push({
        action: 'DROP_TABLE',
        tableName: currentTable.name,
        isDestructive: true,
        warning: `Dropping table "${currentTable.name}" will permanently delete all of its data.`,
        table: currentTable,
      });
    }
  }

  // 2. Check for created tables
  for (const targetTable of target.tables) {
    if (!currentTablesMap.has(targetTable.name)) {
      diffs.push({
        action: 'CREATE_TABLE',
        tableName: targetTable.name,
        isDestructive: false,
        table: targetTable,
      });
    } else {
      // Table exists in both, check for table-level changes (columns, FKs, indexes)
      const currentTable = currentTablesMap.get(targetTable.name)!;
      diffTableChanges(currentTable, targetTable, diffs);
    }
  }

  return diffs;
}

function diffTableChanges(currentTable: Table, targetTable: Table, diffs: SchemaDiff[]): void {
  const tableName = targetTable.name;

  const currentColsMap = new Map<string, Column>(currentTable.columns.map((c) => [c.name, c]));
  const targetColsMap = new Map<string, Column>(targetTable.columns.map((c) => [c.name, c]));

  // A. Check for dropped columns
  for (const currentCol of currentTable.columns) {
    if (!targetColsMap.has(currentCol.name)) {
      diffs.push({
        action: 'DROP_COLUMN',
        tableName,
        isDestructive: true,
        warning: `Dropping column "${currentCol.name}" from table "${tableName}" will permanently delete all data in this column.`,
        column: currentCol,
      });
    }
  }

  // B. Check for added columns
  for (const targetCol of targetTable.columns) {
    if (!currentColsMap.has(targetCol.name)) {
      const isDestructive = false;
      let warning: string | undefined;

      // Adding a NOT NULL column without a default value is dangerous on existing tables with rows
      if (!targetCol.nullable && targetCol.defaultValue === undefined) {
        warning = `Adding a NOT NULL column "${targetCol.name}" to table "${tableName}" without a DEFAULT value will fail if the table contains data.`;
      }

      diffs.push({
        action: 'ADD_COLUMN',
        tableName,
        isDestructive,
        warning,
        column: targetCol,
      });
    } else {
      // Column exists in both, check for alterations (type, nullability, default)
      const currentCol = currentColsMap.get(targetCol.name)!;
      const alteration: ColumnAlteration = { columnName: targetCol.name };
      let altered = false;
      let isDestructive = false;
      const warnings: string[] = [];

      // Type change
      const currentTypeClean = cleanType(currentCol.type);
      const targetTypeClean = cleanType(targetCol.type);

      if (currentTypeClean !== targetTypeClean) {
        alteration.typeChanged = { from: currentCol.type, to: targetCol.type };
        altered = true;
        isDestructive = true;
        warnings.push(
          `Changing type of column "${targetCol.name}" from "${currentCol.type}" to "${targetCol.type}". This may lead to data loss or cast failures.`
        );
      }

      // Nullability change
      if (currentCol.nullable !== targetCol.nullable) {
        alteration.nullableChanged = { from: currentCol.nullable, to: targetCol.nullable };
        altered = true;
        if (!targetCol.nullable) {
          // Changing from NULL to NOT NULL is dangerous if existing rows contain NULL
          warnings.push(
            `Making column "${targetCol.name}" NOT NULL. This will fail if there are any existing NULL values in this column.`
          );
        }
      }

      // Default value change
      if (currentCol.defaultValue !== targetCol.defaultValue) {
        alteration.defaultChanged = { from: currentCol.defaultValue, to: targetCol.defaultValue };
        altered = true;
      }

      if (altered) {
        diffs.push({
          action: 'ALTER_COLUMN',
          tableName,
          isDestructive,
          warning: warnings.length > 0 ? warnings.join(' ') : undefined,
          column: targetCol,
          columnAlteration: alteration,
        });
      }
    }
  }

  // C. Check for foreign key changes
  const currentFksMap = new Map<string, ForeignKey>(
    currentTable.foreignKeys.map((fk) => [getFkSignature(fk), fk])
  );
  const targetFksMap = new Map<string, ForeignKey>(
    targetTable.foreignKeys.map((fk) => [getFkSignature(fk), fk])
  );

  // Drop FKs
  for (const [sig, fk] of currentFksMap.entries()) {
    if (!targetFksMap.has(sig)) {
      diffs.push({
        action: 'DROP_FK',
        tableName,
        isDestructive: false,
        foreignKey: fk,
      });
    }
  }

  // Add FKs
  for (const [sig, fk] of targetFksMap.entries()) {
    if (!currentFksMap.has(sig)) {
      diffs.push({
        action: 'ADD_FK',
        tableName,
        isDestructive: false,
        foreignKey: fk,
      });
    }
  }

  // D. Check for index changes
  const currentIndexesMap = new Map<string, Index>(
    currentTable.indexes.map((idx) => [getIndexSignature(idx), idx])
  );
  const targetIndexesMap = new Map<string, Index>(
    targetTable.indexes.map((idx) => [getIndexSignature(idx), idx])
  );

  // Drop Indexes
  for (const [sig, idx] of currentIndexesMap.entries()) {
    if (!targetIndexesMap.has(sig)) {
      diffs.push({
        action: 'DROP_INDEX',
        tableName,
        isDestructive: false,
        index: idx,
      });
    }
  }

  // Add Indexes
  for (const [sig, idx] of targetIndexesMap.entries()) {
    if (!currentIndexesMap.has(sig)) {
      diffs.push({
        action: 'ADD_INDEX',
        tableName,
        isDestructive: false,
        index: idx,
      });
    }
  }
}

function cleanType(type: string): string {
  // Normalize types for comparison, e.g., INT4 = INTEGER
  const t = type.toUpperCase().trim();
  if (t === 'INTEGER' || t === 'INT' || t === 'INT4') return 'INT';
  if (t === 'BIGINT' || t === 'INT8') return 'BIGINT';
  if (t === 'CHARACTER VARYING' || t === 'VARCHAR' || t.startsWith('VARCHAR')) return 'VARCHAR';
  if (t === 'TEXT') return 'TEXT';
  if (t === 'BOOLEAN' || t === 'BOOL') return 'BOOLEAN';
  return t;
}

function getFkSignature(fk: ForeignKey): string {
  return `${fk.column}->${fk.referencedTable}.${fk.referencedColumn}`;
}

function getIndexSignature(idx: Index): string {
  // Signature includes column names and uniqueness to detect changes
  return `${idx.columns.join(',')}:${idx.unique}`;
}
