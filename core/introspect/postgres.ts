/**
 * PostgreSQL Database Introspector
 * Queries information_schema and pg_catalog tables to extract schemas, constraints, PKs, FKs, and indexes.
 */

import pg from 'pg';
import { Schema, Table, Column, ForeignKey, Index } from '../types.js';

/**
 * Connects to a PostgreSQL database via connection string and introspects its structural schema.
 *
 * @param connectionString The standard postgres:// or postgresql:// URL connection string
 * @returns Standardized database schema JSON representation
 */
export async function introspectPostgres(connectionString: string): Promise<Schema> {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // 1. Get all public tables
    const tablesRes = await client.query<{ table_name: string }>(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name;`
    );

    const tables: Table[] = [];

    // 2. Fetch all columns in public schema
    const columnsRes = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      is_nullable: string;
      column_default: string | null;
      is_identity: string;
    }>(
      `SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default, is_identity
       FROM information_schema.columns 
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position;`
    );

    // Group columns by table
    const columnsByTable: Record<string, Column[]> = {};
    for (const row of columnsRes.rows) {
      if (!columnsByTable[row.table_name]) {
        columnsByTable[row.table_name] = [];
      }

      // Convert data_type to a clean uppercase version with length if appropriate
      let typeStr = row.data_type.toUpperCase();
      if (typeStr === 'CHARACTER VARYING' || typeStr === 'VARCHAR') {
        typeStr = row.character_maximum_length
          ? `VARCHAR(${row.character_maximum_length})`
          : 'VARCHAR(255)';
      } else if (typeStr === 'CHARACTER' || typeStr === 'CHAR') {
        typeStr = row.character_maximum_length
          ? `CHAR(${row.character_maximum_length})`
          : 'CHAR(1)';
      } else if (typeStr === 'NUMERIC' || typeStr === 'DECIMAL') {
        typeStr = 'NUMERIC';
      }

      const isIdentity = row.is_identity === 'YES';
      const isSerialDefault =
        row.column_default !== null &&
        (row.column_default.includes('nextval') || row.column_default.includes('identity'));

      columnsByTable[row.table_name].push({
        name: row.column_name,
        type: typeStr,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default !== null ? row.column_default : undefined,
        primaryKey: false, // will update from constraints
        unique: false, // will update from indexes
        autoIncrement: isIdentity || isSerialDefault,
      });
    }

    // 3. Fetch all primary keys
    const pkRes = await client.query<{ table_name: string; column_name: string }>(
      `SELECT kcu.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu 
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
       ORDER BY kcu.table_name, kcu.ordinal_position;`
    );

    const pkByTable: Record<string, string[]> = {};
    for (const row of pkRes.rows) {
      if (!pkByTable[row.table_name]) {
        pkByTable[row.table_name] = [];
      }
      pkByTable[row.table_name].push(row.column_name);
    }

    // 4. Fetch all foreign keys
    const fkRes = await client.query<{
      constraint_name: string;
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
      update_rule: string;
      delete_rule: string;
    }>(
      `SELECT
           tc.constraint_name,
           tc.table_name,
           kcu.column_name,
           ccu.table_name AS foreign_table_name,
           ccu.column_name AS foreign_column_name,
           rc.update_rule,
           rc.delete_rule
       FROM
           information_schema.table_constraints AS tc
           JOIN information_schema.key_column_usage AS kcu
             ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
           JOIN information_schema.referential_constraints AS rc
             ON tc.constraint_name = rc.constraint_name
           JOIN information_schema.constraint_column_usage AS ccu
             ON rc.unique_constraint_name = ccu.constraint_name
             AND rc.unique_constraint_schema = ccu.constraint_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';`
    );

    const fkByTable: Record<string, ForeignKey[]> = {};
    for (const row of fkRes.rows) {
      if (!fkByTable[row.table_name]) {
        fkByTable[row.table_name] = [];
      }
      fkByTable[row.table_name].push({
        name: row.constraint_name,
        column: row.column_name,
        referencedTable: row.foreign_table_name,
        referencedColumn: row.foreign_column_name,
        onDelete: row.delete_rule as any,
        onUpdate: row.update_rule as any,
      });
    }

    // 5. Fetch all indexes (excluding primary keys since they are primaryKey markers)
    const indexRes = await client.query<{
      table_name: string;
      index_name: string;
      is_unique: boolean;
      is_primary: boolean;
      index_columns: string;
    }>(
      `SELECT
           t.relname as table_name,
           i.relname as index_name,
           ix.indisunique as is_unique,
           ix.indisprimary as is_primary,
           ARRAY_TO_STRING(ARRAY(
             SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
             FROM generate_subscripts(ix.indkey, 1) as k
             ORDER BY k
           ), ',') as index_columns
       FROM
           pg_index ix
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE
           n.nspname = 'public'
           AND t.relkind = 'r'
       ORDER BY t.relname, i.relname;`
    );

    const indexesByTable: Record<string, Index[]> = {};
    for (const row of indexRes.rows) {
      if (row.is_primary) continue; // Skip primary key indexes

      if (!indexesByTable[row.table_name]) {
        indexesByTable[row.table_name] = [];
      }

      const columnsList = row.index_columns.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));

      indexesByTable[row.table_name].push({
        name: row.index_name,
        columns: columnsList,
        unique: row.is_unique,
      });
    }

    // 6. Compile everything into tables Schema
    for (const tableRow of tablesRes.rows) {
      const tableName = tableRow.table_name;
      const columns = columnsByTable[tableName] || [];
      const primaryKey = pkByTable[tableName] || [];
      const foreignKeys = fkByTable[tableName] || [];
      const indexes = indexesByTable[tableName] || [];

      // Update Column primaryKey status & unique status
      for (const col of columns) {
        if (primaryKey.includes(col.name)) {
          col.primaryKey = true;
        }

        // If there's a unique index with only this column, mark it as unique
        const singleColUniqueIndex = indexes.find(
          (idx) => idx.unique && idx.columns.length === 1 && idx.columns[0] === col.name
        );
        if (singleColUniqueIndex) {
          col.unique = true;
        }
      }

      tables.push({
        name: tableName,
        columns,
        primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
        foreignKeys,
        indexes,
      });
    }

    return { tables };
  } finally {
    await client.end();
  }
}
