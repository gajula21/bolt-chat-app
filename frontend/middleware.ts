import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Check if the user is requesting a protected route (like the home page)
  if (request.nextUrl.pathname === '/') {
    return NextResponse.next();
    // We cannot reliably check localStorage here because middleware runs on the server.
    // So for the home page, we generally handle redirection in the client-side component 
    // or by checking for cookies if we used them. Since this app uses localStorage, 
    // we'll implement the protection in a client-side layout/wrapper or just use this 
    // as a placeholder if we switch to cookies. 
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/'],
}
