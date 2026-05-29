import { NextRequest, NextResponse } from 'next/server';
import { diffSchemas, generatePostgresSql, generateSqliteSql } from '@dbslate/core';

export async function POST(req: NextRequest) {
  try {
    const { current, target, dbType } = await req.json();

    if (!current || !target) {
      return NextResponse.json(
        { error: 'Both current and target schemas are required' },
        { status: 400 }
      );
    }

    const type = dbType || 'postgres';
    const diffs = diffSchemas(current, target);

    let sql = '';
    if (type === 'sqlite') {
      sql = generateSqliteSql(diffs, current, target);
    } else {
      sql = generatePostgresSql(diffs);
    }

    return NextResponse.json({ diffs, sql });
  } catch (error: any) {
    console.error('Diff API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Diff calculation failed' },
      { status: 500 }
    );
  }
}
