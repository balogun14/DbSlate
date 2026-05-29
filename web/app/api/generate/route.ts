import { NextRequest, NextResponse } from 'next/server';
import { generateModels } from '@dbslate/core';

export async function POST(req: NextRequest) {
  try {
    const { schema, lang } = await req.json();

    if (!schema || !lang) {
      return NextResponse.json(
        { error: 'Schema and target language are required' },
        { status: 400 }
      );
    }

    const code = generateModels(schema, lang);
    return NextResponse.json({ code });
  } catch (error: any) {
    console.error('Model Generation API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Model generation failed' },
      { status: 500 }
    );
  }
}
