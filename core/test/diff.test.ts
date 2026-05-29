import test from 'node:test';
import assert from 'node:assert';
import { Schema } from '../types.js';
import { diffSchemas } from '../diff/engine.js';
import { generatePostgresSql } from '../diff/postgres-generator.js';
import { generateSqliteSql } from '../diff/sqlite-generator.js';
import { generateModels } from '../generate/models.js';

test('Schema Diff: Create Table and Add Column', () => {
  const current: Schema = { tables: [] };
  const target: Schema = {
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true, unique: true },
          { name: 'name', type: 'VARCHAR(255)', nullable: true, primaryKey: false, unique: false },
        ],
        foreignKeys: [],
        indexes: [],
      },
    ],
  };

  const diffs = diffSchemas(current, target);

  assert.strictEqual(diffs.length, 1);
  assert.strictEqual(diffs[0].action, 'CREATE_TABLE');
  assert.strictEqual(diffs[0].tableName, 'users');
  assert.strictEqual(diffs[0].isDestructive, false);
});

test('Schema Diff: Destructive Column Drop', () => {
  const current: Schema = {
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true, unique: true },
          { name: 'email', type: 'VARCHAR(255)', nullable: true, primaryKey: false, unique: false },
        ],
        foreignKeys: [],
        indexes: [],
      },
    ],
  };
  const target: Schema = {
    tables: [
      {
        name: 'users',
        columns: [{ name: 'id', type: 'INTEGER', nullable: false, primaryKey: true, unique: true }],
        foreignKeys: [],
        indexes: [],
      },
    ],
  };

  const diffs = diffSchemas(current, target);

  assert.strictEqual(diffs.length, 1);
  assert.strictEqual(diffs[0].action, 'DROP_COLUMN');
  assert.strictEqual(diffs[0].tableName, 'users');
  assert.strictEqual(diffs[0].isDestructive, true);
  assert.ok(diffs[0].warning?.includes('permanently delete'));
});

test('SQL Generation: PostgreSQL CREATE TABLE', () => {
  const diffs = [
    {
      action: 'CREATE_TABLE' as const,
      tableName: 'users',
      isDestructive: false,
      table: {
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'INTEGER',
            nullable: false,
            primaryKey: true,
            unique: true,
            autoIncrement: true,
          },
          { name: 'name', type: 'VARCHAR(255)', nullable: true, primaryKey: false, unique: false },
        ],
        foreignKeys: [],
        indexes: [],
      },
    },
  ];

  const sql = generatePostgresSql(diffs);
  assert.ok(sql.includes('CREATE TABLE "users"'));
  assert.ok(sql.includes('"id" SERIAL PRIMARY KEY NOT NULL'));
  assert.ok(sql.includes('"name" VARCHAR(255)'));
});

test('SQL Generation: SQLite Table Rebuild on Alter Column', () => {
  const current: Schema = {
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true, unique: true },
          { name: 'role', type: 'VARCHAR(255)', nullable: true, primaryKey: false, unique: false },
        ],
        foreignKeys: [],
        indexes: [],
      },
    ],
  };
  const target: Schema = {
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true, unique: true },
          { name: 'role', type: 'VARCHAR(50)', nullable: false, primaryKey: false, unique: false }, // type and nullability changed
        ],
        foreignKeys: [],
        indexes: [],
      },
    ],
  };

  const diffs = diffSchemas(current, target);
  const sql = generateSqliteSql(diffs, current, target);

  assert.ok(sql.includes('_dbslate_temp_users'));
  assert.ok(sql.includes('INSERT INTO "_dbslate_temp_users"'));
  assert.ok(sql.includes('DROP TABLE "users"'));
  assert.ok(sql.includes('ALTER TABLE "_dbslate_temp_users" RENAME TO "users"'));
});

test('Model Exporter: Multi-Language Code Generation', () => {
  const schema: Schema = {
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true, unique: true },
          { name: 'name', type: 'VARCHAR(255)', nullable: true, primaryKey: false, unique: false },
        ],
        foreignKeys: [],
        indexes: [],
      },
    ],
  };

  // TypeScript
  const tsCode = generateModels(schema, 'typescript');
  assert.ok(tsCode.includes('export interface Users {'));
  assert.ok(tsCode.includes('id: number;'));
  assert.ok(tsCode.includes('name?: string;'));

  // Go
  const goCode = generateModels(schema, 'go');
  assert.ok(goCode.includes('type Users struct {'));
  assert.ok(goCode.includes('Id int `json:"id" db:"id"`'));
  assert.ok(goCode.includes('Name *string `json:"name" db:"name"`'));

  // Python
  const pyCode = generateModels(schema, 'python');
  assert.ok(pyCode.includes('class Users(BaseModel):'));
  assert.ok(pyCode.includes('id: int'));
  assert.ok(pyCode.includes('name: Optional[str] = None'));

  // C#
  const csCode = generateModels(schema, 'csharp');
  assert.ok(csCode.includes('public class Users'));
  assert.ok(csCode.includes('public int Id { get; set; }'));
  assert.ok(csCode.includes('public string Name { get; set; }'));
});
