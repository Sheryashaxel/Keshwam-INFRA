'use client'

import { useState } from 'react'
import { Mail, Key, ShieldCheck, Lock, Loader2, CheckCircle2 } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [email, setEmail] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Initialize Supabase Client for the browser
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMsg('')

    // 1. ACTUALLY talk to Supabase to verify credentials
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: passphrase,
    })

    if (error) {
      setErrorMsg(error.message)
      setIsLoading(false)
      return
    }

    setIsSuccess(true)
    
    // 2. HARD REDIRECT: Bypass Next.js router cache to force middleware to read the new cookie
    setTimeout(() => {
      window.location.href = '/dashboard'
    }, 800)
  }

  return (
    <main className="flex min-h-screen w-full bg-slate-50">
      {/* Left Side: Marketing/Brand */}
      <section className="relative hidden md:flex w-1/2 bg-slate-950 p-12 flex-col justify-between overflow-hidden">
        {/* Subtle CSS Grid Pattern Overlay */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
        </div>

        {/* Logo Section */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-blue-500 h-8 w-8" />
            <span className="text-2xl font-semibold text-white tracking-tight">
              Keshwam INFRA
            </span>
          </div>
        </div>

        {/* Content Section */}
        <div className="relative z-10 max-w-lg mb-12">
          <h1 className="text-5xl font-bold text-white mb-6 tracking-tight leading-tight">
            Sovereign Control Plane.
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed">
            Secure telemetry and global fleet management for critical infrastructure. Orchestrate edge nodes with institutional-grade precision.
          </p>
        </div>

        {/* Bottom Accents */}
        <div className="relative z-10 flex gap-8">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-sm text-blue-500 font-medium">SECURE_TUNNEL</span>
            <div className="h-1 w-12 bg-blue-500 rounded-full"></div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-mono text-sm text-slate-600 font-medium">ENCRYPTION_AES256</span>
            <div className="h-1 w-12 bg-slate-800 rounded-full"></div>
          </div>
        </div>
      </section>

      {/* Right Side: Auth Form */}
      <section className="flex-1 bg-white flex items-center justify-center p-6 relative">
        {/* Login Card */}
        <div className="w-full max-w-[440px] bg-white p-10 rounded-2xl shadow-[0_24px_48px_-12px_rgba(7,13,31,0.08)] border border-slate-100 relative z-10">
          
          {/* System Status Badge */}
          <div className="mb-8 flex items-center justify-between px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-full w-fit">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-[11px] font-bold text-emerald-700 uppercase tracking-widest">
                System Status: Operational
              </span>
            </div>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-slate-900 text-3xl font-bold mb-2 tracking-tight">Sign in to Vault</h2>
            <p className="text-slate-500 text-sm font-medium">Enter your enterprise credentials to access infrastructure.</p>
          </div>

          {/* Error Display */}
          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-lg">
              {errorMsg}
            </div>
          )}

          {/* Form Fields */}
          <form className="flex flex-col gap-6" onSubmit={handleAuth}>
            {/* Email Field */}
            <div className="flex flex-col gap-2">
              <label className="text-slate-500 text-xs uppercase tracking-widest font-bold" htmlFor="email">
                Work Email
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5 group-focus-within:text-blue-600 transition-colors" />
                <input 
                  className="w-full pl-12 pr-4 py-3 rounded-lg border-slate-200 border-2 focus:border-blue-600 focus:ring-0 outline-none transition-all text-slate-900 font-medium placeholder:text-slate-300 placeholder:font-normal" 
                  id="email" 
                  type="email" 
                  placeholder="admin@keshwam.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Passphrase Field */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-slate-500 text-xs uppercase tracking-widest font-bold" htmlFor="passphrase">
                  Master Passphrase
                </label>
              </div>
              <div className="relative group">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5 group-focus-within:text-blue-600 transition-colors" />
                <input 
                  className="w-full pl-12 pr-4 py-3 rounded-lg border-slate-200 border-2 focus:border-blue-600 focus:ring-0 outline-none transition-all text-slate-900 font-medium placeholder:text-slate-300 placeholder:font-normal tracking-widest" 
                  id="passphrase" 
                  type="password" 
                  placeholder="••••••••••••"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Action Button */}
            <button 
              className={`mt-4 w-full font-bold py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg ${
                isSuccess 
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
              }`} 
              type="submit"
              disabled={isLoading || isSuccess}
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5" />
                  Authenticating...
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  Perimeter Breached
                </>
              ) : (
                <>
                  Authenticate
                  <ShieldCheck className="h-5 w-5 ml-1" />
                </>
              )}
            </button>
          </form>

          {/* Status / Footer */}
          <div className="mt-10 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-slate-400 bg-slate-50 px-4 py-2 rounded-md">
              <Lock className="h-3 w-3" />
              <span className="font-mono text-[10px] uppercase tracking-widest font-semibold">
                AES-256 Encrypted Session
              </span>
            </div>
          </div>
        </div>
        
        {/* Mobile Footer */}
        <div className="absolute bottom-6 w-full text-center md:hidden">
          <p className="font-mono text-[10px] text-slate-400">© 2026 KESHWAM INFRA</p>
        </div>
      </section>

      {/* Desktop Footer */}
      <footer className="fixed bottom-0 left-0 w-1/2 p-12 hidden md:block z-20 pointer-events-none">
        <p className="font-mono text-[10px] text-slate-500 tracking-widest">
          © 2026 KESHWAM INFRASTRUCTURE. ALL TELEMETRY LOGGED.
        </p>
      </footer>
    </main>
  )
}