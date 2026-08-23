import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Create a Supabase client configured for middleware
  const supabase = createMiddlewareClient({ req: request, res: response });
  // getUser() validates the token against Supabase's auth server rather than
  // just decoding whatever's in the request cookies — getSession() trusted
  // the local cookie state, which raced with token-refresh rotation and
  // intermittently bounced authenticated users to /login in prod.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes (no auth/profile check)
  const publicRoutes = [
    '/login',
    '/signup',
    '/signup/profile'
  ];
  const isPublic = publicRoutes.some(route => pathname.startsWith(route));

  // If not authenticated and not on a public route, redirect to login
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If authenticated and on login or signup (but not profile setup), redirect to dashboard
  if (user && ['/login', '/signup'].includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If authenticated and trying to access protected routes
  if (user && !isPublic) {
    // Check if user has a profile record
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('userId', user.id)
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
    // match everything except /api, /_next/static, /_next/image, favicon.ico, the PWA
    // manifest/service-worker/workbox assets, or image files
    '/((?!api|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|workbox-.*\\.js|fallback-.*\\.js|.*\\.(?:png|jpg|jpeg|svg)).*)',
  ],
};
