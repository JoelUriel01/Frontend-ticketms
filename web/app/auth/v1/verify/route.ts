import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const type = searchParams.get('type');
  const redirectTo = searchParams.get('redirect_to') ?? '/';

  // Redirigir a accept-invite con los params para que Supabase los procese
  const url = new URL(redirectTo);
  url.searchParams.set('token', token ?? '');
  url.searchParams.set('type', type ?? '');

  return NextResponse.redirect(url.toString());
}