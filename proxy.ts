import { NextResponse, type NextRequest } from 'next/server'
import { localAuthEnabled } from './lib/auth/local-policy'

const SESSION_COOKIE_NAME = 'acoru_session'

const PUBLIC_FILE = /\.(.*)$/

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname === '/login' ||
    pathname === '/login/verify' ||
    pathname === '/logout' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next()
  }

  const localSession = localAuthEnabled(process.env, request.headers.get('host')) && request.cookies.get('acoru_local_session')?.value
  if (!request.cookies.get(SESSION_COOKIE_NAME)?.value && !localSession) {
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
