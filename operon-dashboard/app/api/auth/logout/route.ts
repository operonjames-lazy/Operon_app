import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('operon_session');
  response.cookies.delete('operon_auth');
  return response;
}
