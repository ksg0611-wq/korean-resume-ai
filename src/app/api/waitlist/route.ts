import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/db/client';

// DDL for waitlist_signups to ensure table existence in serverless environments
const DDL_WAITLIST_SIGNUPS = `
  CREATE TABLE IF NOT EXISTS waitlist_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sn INTEGER NOT NULL,
    email VARCHAR(256) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(email, sn)
  )
`;


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, sn, instName, jobTitle } = body;

    // 1. Email validation
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { message: '올바른 이메일 주소를 입력해 주세요.' },
        { status: 400 }
      );
    }

    // 2. SN validation
    const snNum = Number(sn);
    if (!snNum || isNaN(snNum)) {
      return NextResponse.json(
        { message: '유효하지 않은 공고 일련번호(sn)입니다.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // 3. Ensure table exists (idempotent DDL execution)
    await dbQuery(DDL_WAITLIST_SIGNUPS);

    // 4. Save to PostgreSQL waitlist_signups table (Vercel Serverless persistence)
    const result = await dbQuery<{ id: string; created_at: string }>(`
      INSERT INTO waitlist_signups (sn, email)
      VALUES ($1, $2)
      ON CONFLICT (email, sn) DO UPDATE
        SET created_at = waitlist_signups.created_at
      RETURNING id, created_at;
    `, [snNum, cleanEmail]);

    console.log(`[Waitlist] Successfully registered: ${cleanEmail} for sn ${snNum} (${instName || '기관명 미지정'})`);

    return NextResponse.json({
      success: true,
      message: '사전신청이 성공적으로 등록되었습니다. 오픈 즉시 알림을 발송해 드립니다.',
      data: {
        sn: snNum,
        email: cleanEmail,
        registeredAt: result[0]?.created_at || new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[Waitlist] Error:', err);
    return NextResponse.json(
      { message: '사전신청 처리 중 오류가 발생했습니다: ' + err.message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sn = searchParams.get('sn');

    await dbQuery(DDL_WAITLIST_SIGNUPS);

    if (sn) {
      const snNum = Number(sn);
      const rows = await dbQuery<{ count: string }>(
        'SELECT COUNT(*)::text as count FROM waitlist_signups WHERE sn = $1',
        [snNum]
      );
      return NextResponse.json({
        sn: snNum,
        count: parseInt(rows[0]?.count || '0', 10)
      });
    }

    const totalRows = await dbQuery<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM waitlist_signups'
    );
    return NextResponse.json({
      totalCount: parseInt(totalRows[0]?.count || '0', 10)
    });
  } catch (err: any) {
    console.error('[Waitlist GET] Error:', err);
    return NextResponse.json(
      { message: '조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

