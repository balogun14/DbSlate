/**
 * SQLite Database Introspector
 * Inspects a SQLite database file using PRAGMA functions to compile a standard schema JSON.
 */

import sqlite3 from 'sqlite3';
import { Schema, Table, Column, ForeignKey, Index } from '../types.js';

function runQuery<T>(db: sqlite3.Database, sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

/**
 * Connects to a SQLite database file and introspects its structural schema.
 *
 * @param dbPath Absolute or relative filesystem path to the SQLite database file
 * @returns Standardized database schema JSON representation
 */
export async function introspectSqlite(dbPath: string): Promise<Schema> {
  const db = new sqlite3.Database(dbPath);

  try {
    // 1. Get all user tables
    const tablesQuery = await runQuery<{ name: string }>(
      db,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    );

    const tables: Table[] = [];

    for (const t of tablesQuery) {
      const tableName = t.name;

      // 2. Introspect columns using PRAGMA table_info
      // Columns: cid (number), name (string), type (string), notnull (0/1), dflt_value (string | null), pk (number/index)
      const columnInfo = await runQuery<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>(db, `PRAGMA table_info("${tableName}")`);

      const columns: Column[] = [];
      const primaryKeyColumns: string[] = [];

      for (const col of columnInfo) {
        const isPk = col.pk > 0;
        if (isPk) {
          primaryKeyColumns.push(col.name);
        }

        // Try to identify auto-increment
        // In SQLite, an INTEGER PRIMARY KEY column auto-increments if it's primary key
        // and its type is specifically INTEGER (case insensitive).
        const isAutoIncrement = isPk && col.type.toUpperCase() === 'INTEGER';

        columns.push({
          name: col.name,
          type: col.type || 'TEXT', // default to TEXT if type is empty (SQLite dynamically typed)
          nullable: col.notnull === 0,
          defaultValue: col.dflt_value !== null ? col.dflt_value : undefined,
          primaryKey: isPk,
          unique: false, // will check indexes to set unique
          autoIncrement: isAutoIncrement,
        });
      }

      // 3. Introspect foreign keys using PRAGMA foreign_key_list
      // Columns: id, seq, table, from, to, on_update, on_delete, match
      const fkInfo = await runQuery<{
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
      }>(db, `PRAGMA foreign_key_list("${tableName}")`);

      const foreignKeys: ForeignKey[] = fkInfo.map((fk) => ({
        name: `fk_${tableName}_${fk.from}_to_${fk.table}`,
        column: fk.from,
        referencedTable: fk.table,
        referencedColumn: fk.to,
        onDelete: fk.on_delete as any,
        onUpdate: fk.on_update as any,
      }));

      // 4. Introspect indexes using PRAGMA index_list
      // Columns: seq, name, unique (0/1), origin, partial
      const indexList = await runQuery<{
        seq: number;
        name: string;
        unique: number;
        origin: string;
        partial: number;
      }>(db, `PRAGMA index_list("${tableName}")`);

      const indexes: Index[] = [];

      for (const idx of indexList) {
        // Skip automatic indexes generated for PRIMARY KEY or UNIQUE constraints
        // SQLite names them sqlite_autoindex_...
        const isAutoIndex = idx.name.startsWith('sqlite_autoindex_');

        const idxInfo = await runQuery<{
          seqno: number;
          cid: number;
          name: string;
        }>(db, `PRAGMA index_info("${idx.name}")`);

        const indexCols = idxInfo.map((c) => c.name).filter(Boolean);

        // If it's a unique auto-index for a single column, mark the column as unique
        if (isAutoIndex && idx.unique === 1 && indexCols.length === 1) {
          const col = columns.find((c) => c.name === indexCols[0]);
          if (col) {
            col.unique = true;
          }
          // Do not list auto-index in visual index list as it's implicit
          continue;
        }

        indexes.push({
          name: idx.name,
          columns: indexCols,
          unique: idx.unique === 1,
        });
      }

      tables.push({
        name: tableName,
        columns,
        primaryKey: primaryKeyColumns.length > 0 ? primaryKeyColumns : undefined,
        foreignKeys,
        indexes,
      });
    }

    return { tables };
  } finally {
    db.close();
  }
}
