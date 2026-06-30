'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Network, HardDriveUpload, ShieldCheck, Search, Bell } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isActive = (path: string) => pathname === path

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* 🚀 VERTICAL STACK SIDEBAR (w-20 / 80px) - Text labels without losing space */}
      <aside className="hidden lg:flex flex-col w-20 flex-shrink-0 bg-white border-r border-slate-200 z-50 items-center py-4">
        
        {/* Navigation: Vertical Icon + Text Layout */}
        <nav className="flex-1 flex flex-col gap-3 w-full px-2 mt-2">
          <Link href="/dashboard" className={`flex flex-col items-center justify-center py-3 rounded-sm transition-colors ${isActive('/dashboard') ? 'text-blue-600 bg-blue-50 border border-blue-200 shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
            <LayoutDashboard size={18} className="mb-1.5" />
            <span className="text-[9px] font-bold text-center leading-none">Overview</span>
          </Link>
          
          <Link href="/dashboard/topology" className={`flex flex-col items-center justify-center py-3 rounded-sm transition-colors ${isActive('/dashboard/topology') ? 'text-blue-600 bg-blue-50 border border-blue-200 shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
            <Network size={18} className="mb-1.5" />
            <span className="text-[9px] font-bold text-center leading-none">Topology</span>
          </Link>
          
          <Link href="/dashboard/ota" className={`flex flex-col items-center justify-center py-3 rounded-sm transition-colors ${isActive('/dashboard/ota') ? 'text-blue-600 bg-blue-50 border border-blue-200 shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
            <HardDriveUpload size={18} className="mb-1.5" />
            <span className="text-[9px] font-bold text-center leading-none">OTA / Diags</span>
          </Link>
          
          <Link href="/dashboard/security" className={`flex flex-col items-center justify-center py-3 rounded-sm transition-colors ${isActive('/dashboard/security') ? 'text-blue-600 bg-blue-50 border border-blue-200 shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
            <ShieldCheck size={18} className="mb-1.5" />
            <span className="text-[9px] font-bold text-center leading-none">API Vault</span>
          </Link>
        </nav>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Command Bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex justify-between items-center px-4 z-40 shrink-0">
          
          <div className="flex items-center gap-6">
            {/* Branding Block */}
            <div className="flex items-center gap-3 cursor-default border-r border-slate-200 pr-6">
              {/* Multi-Color Geometric Matrix Logo */}
              <div className="flex flex-wrap w-[22px] h-[22px] gap-[2px] shrink-0 transform -rotate-12 transition-transform duration-300 hover:rotate-0">
                <div className="w-[10px] h-[10px] bg-blue-600 rounded-[2px] shadow-sm"></div>
                <div className="w-[10px] h-[10px] bg-teal-400 rounded-[2px] shadow-sm"></div>
                <div className="w-[10px] h-[10px] bg-amber-400 rounded-[2px] shadow-sm"></div>
                <div className="w-[10px] h-[10px] bg-indigo-500 rounded-[2px] shadow-sm"></div>
              </div>
              <div className="flex flex-col leading-none">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[14px] font-black text-slate-900 tracking-tight">Keshwam<span className="text-blue-600">INFRA</span></span>
                </div>
                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">By <span className="text-teal-600">Shreyash Labs</span></span>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative hidden lg:flex items-center">
              <Search className="absolute left-2.5 text-slate-400" size={14} />
              <input 
                type="text" placeholder="Search infrastructure nodes..." 
                className="pl-8 pr-4 py-1.5 bg-slate-50 border border-slate-200 text-xs w-72 focus:outline-none focus:border-blue-500 transition-all rounded-sm font-mono text-slate-700"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="text-slate-400 hover:text-blue-600 transition-colors"><Bell size={16} /></button>
            <div className="flex items-center gap-2.5 ml-2 pl-4 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold leading-none text-slate-800">Admin_Sys_01</div>
                <div className="text-[9px] text-blue-600 font-bold uppercase tracking-widest mt-1">Root Access</div>
              </div>
              <div className="w-8 h-8 rounded-sm bg-blue-600 border border-blue-700 flex items-center justify-center text-[11px] text-white font-bold shadow-sm">
                A1
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="w-full min-h-full">
            {children}
          </div>
        </main>
        
      </div>
    </div>
  )
}