import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Create a Supabase client configured for middleware
  const supabase = createMiddlewareClient({ req: request, res: response });
  const { data: { session } } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;

  // Public routes (no auth/profile check)
  const publicRoutes = [
    '/login',
    '/signup',
    '/signup/profile'
  ];
  const isPublic = publicRoutes.some(route => pathname.startsWith(route));

  // If not authenticated and not on a public route, redirect to login
  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // If authenticated and on login or signup (but not profile setup), redirect to dashboard
  if (session && ['/login', '/signup'].includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If authenticated and trying to access protected routes
  if (session && !isPublic) {
    // Check if user has a profile record
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('userId', session.user.id)
      .single();

    // If no profile, redirect to profile setup
    if (error || !profile) {
      return NextResponse.redirect(new URL('/signup/profile', request.url));
    }
  }

  // Otherwise proceed
  return response;
}

// middleware.ts
export const config = {
  matcher: [
    // match everything except /api, /_next/static, /_next/image, favicon.ico, or image files
    '/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg)).*)',
  ],
};
