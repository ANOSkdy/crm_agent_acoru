import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE_NAME = 'acoru_session'

const PUBLIC_FILE = /\.(.*)$/

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname === '/login' ||
    pathname === '/logout' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next()
  }

  if (!request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
