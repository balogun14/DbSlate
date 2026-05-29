import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';
import sqlite3 from 'sqlite3';

async function executePostgres(connectionString: string, sql: string): Promise<void> {
  const client = new pg.Client({ connectionString });
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

async function executeSqlite(dbPath: string, sql: string): Promise<void> {
  const db = new sqlite3.Database(dbPath);
  return new Promise<void>((resolve, reject) => {
    db.exec(sql, (err) => {
      db.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const { connectionString, sql } = await req.json();

    if (!connectionString || !sql) {
      return NextResponse.json(
        { error: 'Connection string and SQL query are required' },
        { status: 400 }
      );
    }

    if (
      connectionString.startsWith('postgres://') ||
      connectionString.startsWith('postgresql://')
    ) {
      await executePostgres(connectionString, sql);
    } else {
      const cleanPath = connectionString.replace(/^sqlite:\/\//, '');
      await executeSqlite(cleanPath, sql);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Apply Migration API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to apply migration' },
      { status: 500 }
    );
  }
}
