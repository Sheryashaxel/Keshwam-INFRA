'use server'

import { createClient } from '../../utils/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // Redirect back to the login page with an error parameter
    return redirect('/login?error=Invalid Credentials or Unauthorized Request')
  }

  // If successful, the middleware will now allow them into the vault
  return redirect('/')
}