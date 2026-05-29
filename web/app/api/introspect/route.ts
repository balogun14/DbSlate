import { NextRequest, NextResponse } from 'next/server';
import { introspectPostgres, introspectSqlite } from '@dbslate/core';

export async function POST(req: NextRequest) {
  try {
    const { connectionString } = await req.json();

    if (!connectionString) {
      return NextResponse.json({ error: 'Connection string is required' }, { status: 400 });
    }

    let schema;
    let type: 'postgres' | 'sqlite';

    if (
      connectionString.startsWith('postgres://') ||
      connectionString.startsWith('postgresql://')
    ) {
      schema = await introspectPostgres(connectionString);
      type = 'postgres';
    } else {
      // SQLite: remove sqlite:// if present
      const cleanPath = connectionString.replace(/^sqlite:\/\//, '');
      schema = await introspectSqlite(cleanPath);
      type = 'sqlite';
    }

    return NextResponse.json({ schema, type });
  } catch (error: any) {
    console.error('Introspection API Error:', error);
    return NextResponse.json({ error: error.message || 'Introspection failed' }, { status: 500 });
  }
}
