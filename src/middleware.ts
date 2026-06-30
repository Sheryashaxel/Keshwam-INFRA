import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // This refreshes the session cookie so you don't get stuck in a login loop
  const { data: { user } } = await supabase.auth.getUser()

  // 🛡️ THE BOUNCER: Protect all routes inside /dashboard
  if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
    // If they aren't logged in, redirect them to the login page
    return NextResponse.redirect(new URL('/login', request.url)) 
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Ignore static files, images, and API routes (let the API routes handle their own security)
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}