import { NextRequest, NextResponse } from 'next/server';

// Public paths that never require a session.
const PUBLIC_ROUTES = ['/login'];

// Edge guard. This is a UX gate, not a security boundary: it only checks that a
// session cookie is *present* (it can't verify the JWT signature without the
// secret). The API's requireAuth is the real check. Its job is to bounce users
// to the right place before a page renders.
export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  if (!token && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already signed in but sitting on the login page → send to the app.
  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, the favicon, and API routes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)']
};
