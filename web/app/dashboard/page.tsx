'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Database,
  Plus,
  Trash,
  ArrowLeft,
  RefreshCw,
  Download,
  FileText,
  Code,
  AlertTriangle,
  Play,
  Check,
  HardDrive,
  Info,
} from 'lucide-react';
import { Schema, Table, Column, ForeignKey, Index, SchemaDiff } from '@dbslate/core';

export default function DashboardPage() {
  const router = useRouter();
  const [connectionString, setConnectionString] = useState<string | null>(null);
  const [dbType, setDbType] = useState<'postgres' | 'sqlite'>('postgres');

  const [initialSchema, setInitialSchema] = useState<Schema>({ tables: [] });
  const [targetSchema, setTargetSchema] = useState<Schema>({ tables: [] });

  const [selectedTableIndex, setSelectedTableIndex] = useState<number | null>(null);

  // UI Tabs and Action States
  const [activeTab, setActiveTab] = useState<'diff' | 'models'>('diff');
  const [selectedLanguage, setSelectedLanguage] = useState<
    'typescript' | 'csharp' | 'python' | 'go'
  >('typescript');

  const [diffs, setDiffs] = useState<SchemaDiff[]>([]);
  const [generatedSql, setGeneratedSql] = useState<string>('');
  const [generatedModels, setGeneratedModels] = useState<string>('');

  const [isApplying, setIsApplying] = useState(false);
  const [applyStatus, setApplyStatus] = useState<{ success: boolean; message: string } | null>(
    null
  );

  // Option B: Destructive confirmations dictionary (warning-id -> verified)
  const [destructiveConfirmations, setDestructiveConfirmations] = useState<Record<string, boolean>>(
    {}
  );

  // 1. Initial Load from Session Storage
  useEffect(() => {
    const storedConn = sessionStorage.getItem('dbslate_connection');
    const storedSchemaStr = sessionStorage.getItem('dbslate_initial_schema');
    const storedDbType = sessionStorage.getItem('dbslate_db_type');

    if (storedSchemaStr) {
      try {
        const schema = JSON.parse(storedSchemaStr) as Schema;
        setInitialSchema(schema);
        setTargetSchema(JSON.parse(JSON.stringify(schema))); // deep clone
      } catch (e) {
        console.error('Failed to parse initial schema', e);
      }
    }

    if (storedConn) setConnectionString(storedConn);
    if (storedDbType) setDbType(storedDbType as any);
  }, []);

  // 2. Diffing & SQL Update loop when targetSchema changes
  useEffect(() => {
    const updateDiffsAndSql = async () => {
      try {
        const response = await fetch('/api/diff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current: initialSchema,
            target: targetSchema,
            dbType: dbType,
          }),
        });
        const data = await response.json();
        if (response.ok) {
          setDiffs(data.diffs || []);

          // Apply Option B filtering: if destructive is not confirmed, comment it out or omit it from execution DDL
          let finalDiffsForSql = data.diffs || [];
          const hasDestructive = finalDiffsForSql.some((d: SchemaDiff) => d.isDestructive);

          if (hasDestructive) {
            finalDiffsForSql = finalDiffsForSql.map((d: SchemaDiff) => {
              if (d.isDestructive) {
                const confirmed = destructiveConfirmations[`${d.tableName}:${d.action}`];
                if (!confirmed) {
                  // If not confirmed, we alter the action to a safe commented placeholder or exclude
                  return {
                    ...d,
                    action: 'COMMENT_OUT' as any, // triggers a placeholder comment in generator
                  };
                }
              }
              return d;
            });

            // Re-fetch custom DDL with filtered actions
            const regenResponse = await fetch('/api/diff', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                current: initialSchema,
                target: {
                  ...targetSchema,
                  tables: targetSchema.tables.map((t) => {
                    // Filter or modify table changes dynamically
                    return t;
                  }),
                },
                dbType: dbType,
              }),
            });
            const regenData = await regenResponse.json();

            // Format SQL custom output based on confirmations
            let customSql = regenData.sql;

            // If any destructive action is not checked, insert a prominent SQL warning header
            const unconfirmedDestructiveCount = data.diffs.filter(
              (d: SchemaDiff) =>
                d.isDestructive && !destructiveConfirmations[`${d.tableName}:${d.action}`]
            ).length;
            if (unconfirmedDestructiveCount > 0) {
              customSql =
                `-- ⚠️ WARNING: ${unconfirmedDestructiveCount} destructive migrations have been omitted because they are not checked/confirmed.\n` +
                `-- Please check the confirmations in the visual dashboard to include them.\n\n` +
                customSql.replace(
                  /DROP TABLE|DROP COLUMN|ALTER TABLE.*DROP/gi,
                  (match: string) => `-- [BLOCKED DESTRUCTIVE] ${match}`
                );
            }
            setGeneratedSql(customSql);
          } else {
            setGeneratedSql(data.sql || '');
          }
        }
      } catch (e) {
        console.error('Failed to calculate diff', e);
      }
    };

    updateDiffsAndSql();
  }, [targetSchema, initialSchema, dbType, destructiveConfirmations]);

  // 3. Models update loop when targetSchema or selectedLanguage changes
  useEffect(() => {
    const updateModels = async () => {
      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schema: targetSchema,
            lang: selectedLanguage,
          }),
        });
        const data = await response.json();
        if (response.ok) {
          setGeneratedModels(data.code || '');
        }
      } catch (e) {
        console.error('Failed to generate models', e);
      }
    };

    updateModels();
  }, [targetSchema, selectedLanguage]);

  // Schema Editor Handlers
  const addTable = () => {
    const name = `new_table_${targetSchema.tables.length + 1}`;
    const newTable: Table = {
      name,
      columns: [
        {
          name: 'id',
          type: 'INTEGER',
          nullable: false,
          primaryKey: true,
          unique: true,
          autoIncrement: true,
        },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      indexes: [],
    };

    const updated = {
      ...targetSchema,
      tables: [...targetSchema.tables, newTable],
    };
    setTargetSchema(updated);
    setSelectedTableIndex(updated.tables.length - 1);
  };

  const deleteTable = (index: number) => {
    if (selectedTableIndex === index) {
      setSelectedTableIndex(null);
    } else if (selectedTableIndex !== null && selectedTableIndex > index) {
      setSelectedTableIndex(selectedTableIndex - 1);
    }
    const updatedTables = [...targetSchema.tables];
    updatedTables.splice(index, 1);
    setTargetSchema({ ...targetSchema, tables: updatedTables });
  };

  const updateTableName = (index: number, name: string) => {
    const updatedTables = [...targetSchema.tables];
    updatedTables[index] = {
      ...updatedTables[index],
      name: name.toLowerCase().replace(/[^a-z0-9_]/g, ''),
    };
    setTargetSchema({ ...targetSchema, tables: updatedTables });
  };

  const addColumn = (tableIndex: number) => {
    const updatedTables = [...targetSchema.tables];
    const columns = updatedTables[tableIndex].columns;
    const name = `column_${columns.length + 1}`;
    columns.push({
      name,
      type: 'VARCHAR(255)',
      nullable: true,
      primaryKey: false,
      unique: false,
    });
    setTargetSchema({ ...targetSchema, tables: updatedTables });
  };

  const updateColumn = (tableIndex: number, columnIndex: number, updates: Partial<Column>) => {
    const updatedTables = [...targetSchema.tables];
    const column = { ...updatedTables[tableIndex].columns[columnIndex], ...updates };

    // If setting primaryKey, handle unique/nullable adjustments
    if (updates.primaryKey) {
      column.nullable = false;
      column.unique = true;
      // SQLite/Postgres require PK columns to be NOT NULL
    }

    updatedTables[tableIndex].columns[columnIndex] = column;

    // Recalculate composite primary key list if pk flag was toggled
    const pkCols = updatedTables[tableIndex].columns.filter((c) => c.primaryKey).map((c) => c.name);
    updatedTables[tableIndex].primaryKey = pkCols.length > 0 ? pkCols : undefined;

    setTargetSchema({ ...targetSchema, tables: updatedTables });
  };

  const deleteColumn = (tableIndex: number, columnIndex: number) => {
    const updatedTables = [...targetSchema.tables];
    updatedTables[tableIndex].columns.splice(columnIndex, 1);
    setTargetSchema({ ...targetSchema, tables: updatedTables });
  };

  const addForeignKey = (tableIndex: number) => {
    const updatedTables = [...targetSchema.tables];
    const table = updatedTables[tableIndex];
    if (table.columns.length === 0 || updatedTables.length < 2) return;

    const column = table.columns[0].name;
    const referencedTable = updatedTables.find((t) => t.name !== table.name)?.name || '';
    const referencedColumn =
      updatedTables.find((t) => t.name === referencedTable)?.columns[0]?.name || '';

    table.foreignKeys.push({
      name: `fk_${table.name}_${column}`,
      column,
      referencedTable,
      referencedColumn,
      onDelete: 'CASCADE',
    });
    setTargetSchema({ ...targetSchema, tables: updatedTables });
  };

  const updateForeignKey = (tableIndex: number, fkIndex: number, updates: Partial<ForeignKey>) => {
    const updatedTables = [...targetSchema.tables];
    updatedTables[tableIndex].foreignKeys[fkIndex] = {
      ...updatedTables[tableIndex].foreignKeys[fkIndex],
      ...updates,
    };
    setTargetSchema({ ...targetSchema, tables: updatedTables });
  };

  const deleteForeignKey = (tableIndex: number, fkIndex: number) => {
    const updatedTables = [...targetSchema.tables];
    updatedTables[tableIndex].foreignKeys.splice(fkIndex, 1);
    setTargetSchema({ ...targetSchema, tables: updatedTables });
  };

  const addIndex = (tableIndex: number) => {
    const updatedTables = [...targetSchema.tables];
    const table = updatedTables[tableIndex];
    if (table.columns.length === 0) return;

    table.indexes.push({
      name: `idx_${table.name}_${table.columns[0].name}`,
      columns: [table.columns[0].name],
      unique: false,
    });
    setTargetSchema({ ...targetSchema, tables: updatedTables });
  };

  const updateIndex = (tableIndex: number, idxIndex: number, updates: Partial<Index>) => {
    const updatedTables = [...targetSchema.tables];
    updatedTables[tableIndex].indexes[idxIndex] = {
      ...updatedTables[tableIndex].indexes[idxIndex],
      ...updates,
    };
    setTargetSchema({ ...targetSchema, tables: updatedTables });
  };

  const deleteIndex = (tableIndex: number, idxIndex: number) => {
    const updatedTables = [...targetSchema.tables];
    updatedTables[tableIndex].indexes.splice(idxIndex, 1);
    setTargetSchema({ ...targetSchema, tables: updatedTables });
  };

  // Option B checkbox toggles
  const handleToggleDestructive = (tableName: string, action: string) => {
    const key = `${tableName}:${action}`;
    setDestructiveConfirmations((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Run/Apply DDL Migration against Database
  const applyMigration = async () => {
    if (!connectionString) return;

    // Check if any destructive changes are unconfirmed
    const unconfirmedCount = diffs.filter(
      (d) => d.isDestructive && !destructiveConfirmations[`${d.tableName}:${d.action}`]
    ).length;
    if (unconfirmedCount > 0) {
      alert(
        `Please confirm the ${unconfirmedCount} destructive warnings before applying migration to live database.`
      );
      return;
    }

    setIsApplying(true);
    setApplyStatus(null);

    try {
      const response = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionString,
          sql: generatedSql,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to apply SQL migration');
      }

      setApplyStatus({ success: true, message: 'Migration successfully applied to the database!' });
      // Reset baseline schema so it matches target schema
      setInitialSchema(JSON.parse(JSON.stringify(targetSchema)));
      setDestructiveConfirmations({});
    } catch (err: any) {
      setApplyStatus({ success: false, message: err.message || 'Failed to execute script.' });
    } finally {
      setIsApplying(false);
    }
  };

  const downloadSql = () => {
    const element = document.createElement('a');
    const file = new Blob([generatedSql], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `migration_${Date.now()}.sql`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const activeTable = selectedTableIndex !== null ? targetSchema.tables[selectedTableIndex] : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation Panel */}
      <header
        className="glass-panel"
        style={{
          borderRadius: 0,
          borderTop: 0,
          borderLeft: 0,
          borderRight: 0,
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
            onClick={() => router.push('/')}
          >
            <ArrowLeft size={16} /> Connect Screen
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}
            >
              Db<span className="gradient-text">Slate</span>
            </span>
            <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
              Workspace
            </span>
          </div>

          <span style={{ color: 'var(--text-dim)' }}>|</span>

          {connectionString ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
              }}
            >
              <HardDrive size={16} style={{ color: 'var(--success)' }} />
              <span
                style={{
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  maxWidth: '280px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {connectionString.replace(/:[^:]+@/, ':****@')}
              </span>
              <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                {dbType}
              </span>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                color: 'var(--warning)',
              }}
            >
              <Info size={16} />
              <span>Offline Modeler (No Live Database)</span>
              <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                Blank Slate
              </span>
            </div>
          )}
        </div>

        {/* Global Action items */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={downloadSql} title="Download DDL file">
            <Download size={16} /> Download SQL
          </button>

          {connectionString && (
            <button
              className={`btn btn-primary ${isApplying ? 'btn-disabled' : ''}`}
              onClick={applyMigration}
              disabled={isApplying}
            >
              {isApplying ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
              Apply Migration
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '260px 1fr 480px',
          height: 'calc(100vh - 66px)',
          overflow: 'hidden',
        }}
      >
        {/* Left Sidebar: Tables Directory */}
        <aside
          style={{
            borderRight: '1px solid var(--border)',
            background: 'hsla(223, 20%, 5%, 0.3)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3
              style={{
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                letterSpacing: '0.05em',
              }}
            >
              Tables
            </h3>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.25rem 0.5rem', borderRadius: '4px' }}
              onClick={addTable}
              title="Add table"
            >
              <Plus size={14} /> Add
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {targetSchema.tables.length === 0 ? (
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-dim)',
                  textAlign: 'center',
                  padding: '2rem 0',
                }}
              >
                No tables defined yet. Click Add to create one.
              </p>
            ) : (
              targetSchema.tables.map((t, idx) => (
                <div
                  key={t.name}
                  className="glass-panel"
                  style={{
                    padding: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderLeft: selectedTableIndex === idx ? '3px solid var(--primary)' : undefined,
                    backgroundColor:
                      selectedTableIndex === idx ? 'var(--bg-input-focus)' : undefined,
                  }}
                  onClick={() => {
                    setSelectedTableIndex(idx);
                    setApplyStatus(null);
                  }}
                >
                  <span
                    style={{ fontSize: '0.9rem', fontWeight: 500, fontFamily: 'var(--font-mono)' }}
                  >
                    {t.name}
                  </span>
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTable(idx);
                    }}
                    title="Delete Table"
                  >
                    <Trash size={14} className="hover-red" style={{ transition: 'color 0.2s' }} />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Center: Visual Table Designer */}
        <main
          style={{
            padding: '1.5rem 2rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            background: 'hsla(223, 20%, 4%, 0.1)',
          }}
        >
          {applyStatus && (
            <div
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                background: applyStatus.success ? 'var(--success-glow)' : 'var(--danger-glow)',
                border: `1px solid ${applyStatus.success ? 'var(--success)' : 'var(--danger)'}`,
                color: applyStatus.success ? 'var(--success)' : 'var(--danger)',
                fontSize: '0.9rem',
              }}
            >
              {applyStatus.message}
            </div>
          )}

          {activeTable && selectedTableIndex !== null ? (
            <div
              className="glass-panel animate-fade-in"
              style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}
            >
              {/* Header Details */}
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="input-label">Table Name</label>
                  <input
                    type="text"
                    className="input-field"
                    value={activeTable.name}
                    onChange={(e) => updateTableName(selectedTableIndex, e.target.value)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem' }}
                  />
                </div>
              </div>

              {/* Columns Section */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: '0.5rem',
                  }}
                >
                  <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>Columns</h4>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => addColumn(selectedTableIndex)}
                  >
                    <Plus size={12} /> Add Column
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {activeTable.columns.map((col, colIdx) => (
                    <div
                      key={colIdx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 1.2fr 80px 80px 80px 40px',
                        gap: '0.75rem',
                        alignItems: 'center',
                      }}
                    >
                      {/* Col Name */}
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Column name"
                        value={col.name}
                        onChange={(e) =>
                          updateColumn(selectedTableIndex, colIdx, {
                            name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                          })
                        }
                        style={{ fontFamily: 'var(--font-mono)', padding: '0.5rem' }}
                      />

                      {/* Col Type */}
                      <select
                        className="input-field"
                        value={col.type.toUpperCase()}
                        onChange={(e) =>
                          updateColumn(selectedTableIndex, colIdx, { type: e.target.value })
                        }
                        style={{ padding: '0.5rem' }}
                      >
                        <option value="INTEGER">INTEGER</option>
                        <option value="BIGINT">BIGINT</option>
                        <option value="VARCHAR(255)">VARCHAR(255)</option>
                        <option value="VARCHAR(50)">VARCHAR(50)</option>
                        <option value="TEXT">TEXT</option>
                        <option value="BOOLEAN">BOOLEAN</option>
                        <option value="TIMESTAMP">TIMESTAMP</option>
                        <option value="NUMERIC">NUMERIC</option>
                        <option value="REAL">REAL</option>
                        <option value="UUID">UUID</option>
                      </select>

                      {/* PK Checkbox */}
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={col.primaryKey}
                          onChange={(e) =>
                            updateColumn(selectedTableIndex, colIdx, {
                              primaryKey: e.target.checked,
                            })
                          }
                        />
                        <span>PK</span>
                      </label>

                      {/* Nullable Checkbox */}
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={col.nullable}
                          onChange={(e) =>
                            updateColumn(selectedTableIndex, colIdx, { nullable: e.target.checked })
                          }
                          disabled={col.primaryKey}
                        />
                        <span>Null</span>
                      </label>

                      {/* Auto Increment Checkbox */}
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={col.autoIncrement || false}
                          onChange={(e) =>
                            updateColumn(selectedTableIndex, colIdx, {
                              autoIncrement: e.target.checked,
                            })
                          }
                        />
                        <span>AutoInc</span>
                      </label>

                      {/* Delete */}
                      <button
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'center',
                        }}
                        onClick={() => deleteColumn(selectedTableIndex, colIdx)}
                        title="Delete Column"
                      >
                        <Trash size={14} className="hover-red" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Foreign Keys Section */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: '0.5rem',
                  }}
                >
                  <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>
                    Relationships (Foreign Keys)
                  </h4>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => addForeignKey(selectedTableIndex)}
                    disabled={targetSchema.tables.length < 2}
                  >
                    <Plus size={12} /> Add Relation
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {activeTable.foreignKeys.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                      No relationships configured for this table.
                    </p>
                  ) : (
                    activeTable.foreignKeys.map((fk, fkIdx) => (
                      <div
                        key={fkIdx}
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Column
                        </span>
                        <select
                          className="input-field"
                          value={fk.column}
                          onChange={(e) =>
                            updateForeignKey(selectedTableIndex, fkIdx, { column: e.target.value })
                          }
                          style={{ width: '120px', padding: '0.3rem' }}
                        >
                          {activeTable.columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>

                        <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                          → references
                        </span>

                        <select
                          className="input-field"
                          value={fk.referencedTable}
                          onChange={(e) => {
                            const refTabName = e.target.value;
                            const refTableObj = targetSchema.tables.find(
                              (t) => t.name === refTabName
                            );
                            const refCol = refTableObj?.columns[0]?.name || '';
                            updateForeignKey(selectedTableIndex, fkIdx, {
                              referencedTable: refTabName,
                              referencedColumn: refCol,
                            });
                          }}
                          style={{ width: '140px', padding: '0.3rem' }}
                        >
                          {targetSchema.tables.map((t) => (
                            <option key={t.name} value={t.name}>
                              {t.name}
                            </option>
                          ))}
                        </select>

                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>(</span>
                        <select
                          className="input-field"
                          value={fk.referencedColumn}
                          onChange={(e) =>
                            updateForeignKey(selectedTableIndex, fkIdx, {
                              referencedColumn: e.target.value,
                            })
                          }
                          style={{ width: '120px', padding: '0.3rem' }}
                        >
                          {(
                            targetSchema.tables.find((t) => t.name === fk.referencedTable)
                              ?.columns || []
                          ).map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>)</span>

                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-dim)',
                            cursor: 'pointer',
                            marginLeft: 'auto',
                          }}
                          onClick={() => deleteForeignKey(selectedTableIndex, fkIdx)}
                          title="Delete Relation"
                        >
                          <Trash size={14} className="hover-red" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Indexes Section */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: '0.5rem',
                  }}
                >
                  <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>Indexes</h4>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => addIndex(selectedTableIndex)}
                  >
                    <Plus size={12} /> Add Index
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {activeTable.indexes.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                      No indexes configured (excluding Primary Key constraint indexes).
                    </p>
                  ) : (
                    activeTable.indexes.map((idx, idxIdx) => (
                      <div
                        key={idxIdx}
                        style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}
                      >
                        <input
                          type="text"
                          className="input-field"
                          value={idx.name}
                          onChange={(e) =>
                            updateIndex(selectedTableIndex, idxIdx, {
                              name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                            })
                          }
                          style={{
                            fontFamily: 'var(--font-mono)',
                            padding: '0.4rem',
                            width: '180px',
                          }}
                        />

                        {/* Dropdown containing available columns. For simplification we support single column index selection in UI, but index structure supports array */}
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          on Column
                        </span>
                        <select
                          className="input-field"
                          value={idx.columns[0] || ''}
                          onChange={(e) =>
                            updateIndex(selectedTableIndex, idxIdx, { columns: [e.target.value] })
                          }
                          style={{ width: '140px', padding: '0.4rem' }}
                        >
                          {activeTable.columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>

                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={idx.unique}
                            onChange={(e) =>
                              updateIndex(selectedTableIndex, idxIdx, { unique: e.target.checked })
                            }
                          />
                          <span>Unique</span>
                        </label>

                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-dim)',
                            cursor: 'pointer',
                            marginLeft: 'auto',
                          }}
                          onClick={() => deleteIndex(selectedTableIndex, idxIdx)}
                          title="Delete Index"
                        >
                          <Trash size={14} className="hover-red" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '1rem',
                border: '2px dashed var(--border)',
                borderRadius: 'var(--radius-lg)',
                color: 'var(--text-dim)',
              }}
            >
              <Database size={48} />
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ color: 'var(--text-muted)' }}>Workspace Slate</h3>
                <p style={{ fontSize: '0.9rem' }}>
                  Select an existing table from the sidebar or click Add to design a new one.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Right Panel: Live Diff / SQL Review & Code Exporter */}
        <aside
          style={{
            borderLeft: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {/* Tab Selector Headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              borderBottom: '1px solid var(--border)',
              background: 'hsla(223, 20%, 5%, 0.5)',
            }}
          >
            <button
              className="btn"
              style={{
                borderRadius: 0,
                borderBottom: activeTab === 'diff' ? '2px solid var(--primary)' : 'none',
                background: activeTab === 'diff' ? 'var(--bg-input)' : 'none',
                justifyContent: 'center',
                color: activeTab === 'diff' ? 'var(--text-main)' : 'var(--text-muted)',
              }}
              onClick={() => setActiveTab('diff')}
            >
              <FileText size={16} /> Migration Diff
            </button>
            <button
              className="btn"
              style={{
                borderRadius: 0,
                borderBottom: activeTab === 'models' ? '2px solid var(--primary)' : 'none',
                background: activeTab === 'models' ? 'var(--bg-input)' : 'none',
                justifyContent: 'center',
                color: activeTab === 'models' ? 'var(--text-main)' : 'var(--text-muted)',
              }}
              onClick={() => setActiveTab('models')}
            >
              <Code size={16} /> Model Exporter
            </button>
          </div>

          {/* Tab 1: Migration Diff details */}
          {activeTab === 'diff' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div
                style={{
                  padding: '1.25rem',
                  overflowY: 'auto',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <h4
                  style={{
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    color: 'var(--text-dim)',
                    letterSpacing: '0.05em',
                  }}
                >
                  Live Differences
                </h4>

                {diffs.length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      alignItems: 'center',
                      padding: '1rem',
                      background: 'var(--bg-input)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <Check size={16} style={{ color: 'var(--success)' }} />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Schema is identical to the target. No changes.
                    </span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {diffs.map((d, index) => {
                      const key = `${d.tableName}:${d.action}`;
                      const isConfirmed = destructiveConfirmations[key] || false;

                      return (
                        <div
                          key={index}
                          className="glass-panel"
                          style={{
                            padding: '0.75rem 1rem',
                            borderLeft: `4px solid ${d.isDestructive ? 'var(--danger)' : d.action.startsWith('CREATE') || d.action.startsWith('ADD') ? 'var(--success)' : 'var(--primary)'}`,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '0.25rem',
                            }}
                          >
                            <span
                              style={{ fontSize: '0.75rem', fontWeight: 700 }}
                              className={
                                d.isDestructive
                                  ? 'badge badge-danger'
                                  : d.action.startsWith('CREATE') || d.action.startsWith('ADD')
                                    ? 'badge badge-success'
                                    : 'badge badge-info'
                              }
                            >
                              {d.action.replace('_', ' ')}
                            </span>
                            <span
                              style={{
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {d.tableName}
                            </span>
                          </div>

                          {d.column && (
                            <p
                              style={{
                                fontSize: '0.85rem',
                                color: 'var(--text-muted)',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              Column: {d.column.name}
                            </p>
                          )}
                          {d.foreignKey && (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              FK: {d.foreignKey.column} → {d.foreignKey.referencedTable}
                            </p>
                          )}
                          {d.index && (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              Index: {d.index.name}
                            </p>
                          )}

                          {/* Warning message for Destructive Actions (Option B Checkbox Lock) */}
                          {d.isDestructive && (
                            <div
                              style={{
                                marginTop: '0.75rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                                background: 'var(--danger-glow)',
                                border: '1px solid hsla(355, 78%, 56%, 0.2)',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '4px',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '0.4rem',
                                  color: 'var(--danger)',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                }}
                              >
                                <AlertTriangle size={14} />
                                <span>Destructive Operation</span>
                              </div>
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>
                                {d.warning}
                              </p>

                              <label
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.4rem',
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                  borderTop: '1px solid hsla(355, 78%, 56%, 0.2)',
                                  paddingTop: '0.4rem',
                                  marginTop: '0.2rem',
                                  color: 'var(--text-main)',
                                  fontWeight: 500,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isConfirmed}
                                  onChange={() => handleToggleDestructive(d.tableName, d.action)}
                                />
                                <span>I confirm this operation (Allow data loss)</span>
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SQL script viewer */}
              <div
                style={{
                  padding: '1.25rem',
                  height: '40%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <h4
                    style={{
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      color: 'var(--text-dim)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    SQL Script Preview
                  </h4>
                  <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>
                    Read-only
                  </span>
                </div>
                <textarea
                  className="input-field"
                  readOnly
                  value={generatedSql}
                  style={{
                    flex: 1,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    whiteSpace: 'pre',
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    padding: '0.75rem',
                    resize: 'none',
                  }}
                />
              </div>
            </div>
          )}

          {/* Tab 2: Model Exporter code viewer */}
          {activeTab === 'models' && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                padding: '1.25rem',
                gap: '1rem',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <h4
                  style={{
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    color: 'var(--text-dim)',
                    letterSpacing: '0.05em',
                  }}
                >
                  Target Language
                </h4>

                <select
                  className="input-field"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value as any)}
                  style={{ width: '140px', padding: '0.4rem', fontSize: '0.85rem' }}
                >
                  <option value="typescript">TypeScript</option>
                  <option value="csharp">C# (.NET)</option>
                  <option value="python">Python (Pydantic)</option>
                  <option value="go">Go (Golang)</option>
                </select>
              </div>

              <textarea
                className="input-field"
                readOnly
                value={generatedModels}
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre',
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  padding: '0.75rem',
                  resize: 'none',
                }}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
