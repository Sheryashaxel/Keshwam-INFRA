import { redirect } from 'next/navigation'

export default function RootPage() {
  // Instantly redirects the user from the root URL ('/') to the secure App Shell ('/dashboard')
  // Because this is a Server Component, the redirect happens instantly before the browser even renders a page.
  redirect('/dashboard')
}