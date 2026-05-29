export interface Column {
  name: string;
  type: string; // e.g., 'INTEGER', 'VARCHAR(255)', 'TEXT', 'BOOLEAN', 'TIMESTAMP'
  nullable: boolean;
  defaultValue?: string;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement?: boolean;
}

export interface ForeignKey {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete?: 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';
  onUpdate?: 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';
}

export interface Index {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface Table {
  name: string;
  columns: Column[];
  primaryKey?: string[]; // Composite primary keys support
  foreignKeys: ForeignKey[];
  indexes: Index[];
}

export interface Schema {
  tables: Table[];
}

// Representing changes between two schemas
export type DiffAction =
  | 'CREATE_TABLE'
  | 'DROP_TABLE'
  | 'ADD_COLUMN'
  | 'DROP_COLUMN'
  | 'ALTER_COLUMN'
  | 'ADD_FK'
  | 'DROP_FK'
  | 'ADD_INDEX'
  | 'DROP_INDEX';

export interface ColumnAlteration {
  columnName: string;
  typeChanged?: { from: string; to: string };
  nullableChanged?: { from: boolean; to: boolean };
  defaultChanged?: { from?: string; to?: string };
}

export interface SchemaDiff {
  action: DiffAction;
  tableName: string;
  isDestructive: boolean;
  warning?: string;
  // Detail payloads depending on action
  table?: Table; // For CREATE_TABLE
  column?: Column; // For ADD_COLUMN, DROP_COLUMN
  columnAlteration?: ColumnAlteration; // For ALTER_COLUMN
  foreignKey?: ForeignKey; // For ADD_FK, DROP_FK
  index?: Index; // For ADD_INDEX, DROP_INDEX
}
