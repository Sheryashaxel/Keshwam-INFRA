'use client'

import { useState, useEffect } from 'react'
import { 
  Shield, Key, Lock, Users, EyeOff, Copy, RefreshCw, 
  CheckCircle, AlertTriangle, Terminal, Activity, Wifi, 
  Trash2, Edit, ShieldAlert, CheckSquare, Square
} from 'lucide-react'

// --- MOCK DATA ---
const mockTokens = [
  { id: 'TKN-001', identity: 'svc-elec-grid-01', scopes: ['ELEC', 'RAW'], node: 'Node 0x05', status: 'AUTH' },
  { id: 'TKN-002', identity: 'svc-watr-flow-02', scopes: ['WATR', 'RAW'], node: 'Node 0x12', status: 'AUTH' },
  { id: 'TKN-003', identity: 'svc-roll-hw-03', scopes: ['ROLL'], node: 'Node 0x1A', status: 'RVKD' },
  { id: 'TKN-004', identity: 'svc-elec-meter-04', scopes: ['ELEC'], node: 'Node 0x2B', status: 'AUTH' },
  { id: 'TKN-005', identity: 'svc-watr-pressure', scopes: ['WATR', 'ELEC'], node: 'Node 0x33', status: 'AUTH' },
  { id: 'TKN-006', identity: 'svc-raw-timeseries', scopes: ['RAW'], node: 'Node 0x47', status: 'RVKD' },
  { id: 'TKN-007', identity: 'svc-roll-cfg-07', scopes: ['ROLL', 'RAW'], node: 'Node 0x5C', status: 'AUTH' },
  { id: 'TKN-008', identity: 'svc-elec-hv-bus', scopes: ['ELEC', 'WATR'], node: 'Node 0x61', status: 'AUTH' },
]

const auditLogs = [
  { time: '00:18:47', type: 'ROTATE', color: 'text-blue-400', msg: 'Key rotation triggered for [TKN-002] scope [ROLL]' },
  { time: '00:18:49', type: 'WARN', color: 'text-amber-400', msg: 'WARN: anomalous access pattern on [TKN-005] from IP [10.254.1.3]' },
  { time: '00:18:51', type: 'AUTH', color: 'text-emerald-400', msg: 'Token [TKN-004] authorized for scope [ROLL] from IP [10.10.10.10]' },
  { time: '00:18:53', type: 'WARN', color: 'text-amber-400', msg: 'WARN: anomalous access pattern on [TKN-005] from IP [10.0.0.1]' },
  { time: '00:18:56', type: 'AUTH', color: 'text-emerald-400', msg: 'Token [TKN-001] authorized for scope [WATR] from IP [172.16.8.99]' },
  { time: '00:18:58', type: 'REVOKE', color: 'text-red-400', msg: 'Token [TKN-008] REVOKED - scope [ELEC] from IP [192.168.100.5]' },
  { time: '00:19:00', type: 'ROTATE', color: 'text-blue-400', msg: 'Key rotation triggered for [TKN-001] scope [ELEC]' },
  { time: '00:19:02', type: 'WARN', color: 'text-amber-400', msg: 'WARN: anomalous access pattern on [TKN-004] from IP [192.168.3.201]' },
  { time: '00:19:04', type: 'ROTATE', color: 'text-blue-400', msg: 'Key rotation triggered for [TKN-002] scope [WATR]' },
  { time: '00:19:07', type: 'ROTATE', color: 'text-blue-400', msg: 'Key rotation triggered for [TKN-008] scope [WATR]' },
  { time: '00:19:09', type: 'WARN', color: 'text-amber-400', msg: 'WARN: anomalous access pattern on [TKN-002] from IP [172.16.8.99]' },
  { time: '00:19:11', type: 'AUTH', color: 'text-emerald-400', msg: 'Token [TKN-005] authorized for scope [ELEC] from IP [192.168.100.5]' },
  { time: '00:19:13', type: 'AUTH', color: 'text-emerald-400', msg: 'Token [TKN-008] authorized for scope [ELEC] from IP [172.31.50.22]' },
]

export default function SecurityPage() {
  const [mounted, setMounted] = useState(false)
  const [selectedTokens, setSelectedTokens] = useState<string[]>([])
  
  // Scope Matrix State
  const [scopes, setScopes] = useState({ ELEC: true, WATR: true, ROLL: false, RAW: false })

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const toggleToken = (id: string) => {
    setSelectedTokens(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  const renderScopeBadge = (scope: string) => {
    const styles: any = {
      ELEC: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      WATR: 'bg-blue-100 text-blue-700 border-blue-200',
      ROLL: 'bg-amber-100 text-amber-700 border-amber-200',
      RAW: 'bg-slate-100 text-slate-700 border-slate-200'
    }
    return (
      <span key={scope} className={`px-1.5 py-0.5 text-[9px] font-bold border rounded-sm uppercase tracking-widest ${styles[scope]}`}>
        {scope}
      </span>
    )
  }

  return (
    // STRICT VIEWPORT LOCK: h-[calc(100vh-64px)] assumes top navbar is exactly 64px tall
    <div className="h-[calc(100vh-64px)] bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden">
      
      {/* 1. GLOBAL SECURITY TICKER BAR */}
      <div className="bg-[#0f172a] border-b border-slate-800 px-6 py-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="bg-teal-500/20 p-2 rounded-sm text-teal-400 border border-teal-500/30">
            <Shield size={18} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase text-white mb-0.5">API Security Control Center</h1>
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">KESHWAM INFRA • AES-256-GCM / TLS 1.3</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6 text-[10px] font-mono uppercase tracking-widest divide-x divide-slate-700">
          <div className="flex items-center gap-3">
            <Key size={14} className="text-slate-500" />
            <div className="flex flex-col items-end">
              <span className="text-slate-400">Active Egress</span>
              <span className="font-bold text-teal-400 text-xs">148</span>
            </div>
          </div>
          <div className="flex items-center gap-3 pl-6">
            <ShieldAlert size={14} className="text-slate-500" />
            <div className="flex flex-col items-end">
              <span className="text-slate-400">Revoked Keys</span>
              <span className="font-bold text-red-400 text-xs">12</span>
            </div>
          </div>
          <div className="flex items-center gap-3 pl-6">
            <RefreshCw size={14} className="text-slate-500" />
            <div className="flex flex-col items-end">
              <span className="text-slate-400">Key Rotation</span>
              <span className="font-bold text-amber-400 text-xs">4d 12h</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-teal-400 font-bold pl-6">
            <span className="px-3 py-1 bg-teal-500/10 border border-teal-500/20 rounded-full flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse"></span> VAULT ONLINE
            </span>
          </div>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE GRID */}
      <div className="flex-1 p-4 lg:p-6 grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6 max-w-[1920px] mx-auto w-full min-h-0 overflow-hidden">
        
        {/* LEFT PANEL: TOKEN PROVISIONING & SCOPE MANAGER */}
        <div className="xl:col-span-7 flex flex-col gap-4 lg:gap-6 w-full h-full min-h-0">
          
          {/* Active Key Ledger */}
          <div className="bg-white border border-slate-200 rounded-sm shadow-sm flex flex-col flex-1 min-h-0">
            <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h2 className="text-[11px] font-bold text-slate-900 flex items-center gap-2 uppercase tracking-widest">
                <Lock size={14} className="text-slate-500" /> ACTIVE KEY LEDGER 
                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[9px] font-mono ml-2">8 tokens</span>
              </h2>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 border border-slate-200 text-[10px] font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors rounded-sm flex items-center gap-1.5 uppercase tracking-wider">
                  <CheckCircle size={12} /> Re-Auth
                </button>
                <button className="px-3 py-1.5 border border-red-200 bg-red-50 text-[10px] font-bold text-red-600 hover:bg-red-100 transition-colors rounded-sm flex items-center gap-1.5 uppercase tracking-wider">
                  <Trash2 size={12} /> Revoke
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="sticky top-0 bg-white shadow-sm z-10">
                  <tr className="border-b border-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    <th className="px-5 py-3 w-8"></th>
                    <th className="px-5 py-3">Token ID</th>
                    <th className="px-5 py-3">Identity</th>
                    <th className="px-5 py-3">Scopes</th>
                    <th className="px-5 py-3">Node</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mockTokens.map((token) => (
                    <tr key={token.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3 text-slate-400 cursor-pointer" onClick={() => toggleToken(token.id)}>
                        {selectedTokens.includes(token.id) ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} />}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs font-bold text-slate-900">{token.id}</td>
                      <td className="px-5 py-3 font-mono text-[10px] text-slate-500">{token.identity}</td>
                      <td className="px-5 py-3 flex gap-1 items-center h-full pt-4">{token.scopes.map(renderScopeBadge)}</td>
                      <td className="px-5 py-3 font-mono text-[10px] text-slate-500">{token.node}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold flex items-center gap-1.5 uppercase tracking-widest
                          ${token.status === 'AUTH' ? 'text-emerald-600' : 'text-red-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${token.status === 'AUTH' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                          {token.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2 font-mono text-[9px] font-bold uppercase tracking-widest">
                          <button className="text-blue-600 border border-blue-200 bg-blue-50 px-2 py-0.5 rounded-sm hover:bg-blue-100">Edit</button>
                          <button className="text-red-500 border border-red-200 bg-red-50 px-2 py-0.5 rounded-sm hover:bg-red-100">Rvkd</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Dual Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 shrink-0">
            
            {/* Scope Matrix */}
            <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-5 flex flex-col">
              <h2 className="text-[11px] font-bold text-slate-900 flex items-center gap-2 uppercase tracking-widest mb-4">
                <Users size={14} className="text-slate-500" /> SCOPE MATRIX
              </h2>
              <div className="space-y-3 flex-1 text-[11px] font-mono text-slate-600">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setScopes(s => ({...s, ELEC: !s.ELEC}))}>
                  <div className="flex items-center gap-3">
                    {scopes.ELEC ? <CheckSquare size={14} className="text-[#0f172a]" /> : <Square size={14} className="text-slate-300" />}
                    {renderScopeBadge('ELEC')} <span className="font-sans">Grid Load Data</span>
                  </div>
                  {scopes.ELEC && <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest">Enabled</span>}
                </div>
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setScopes(s => ({...s, WATR: !s.WATR}))}>
                  <div className="flex items-center gap-3">
                    {scopes.WATR ? <CheckSquare size={14} className="text-[#0f172a]" /> : <Square size={14} className="text-slate-300" />}
                    {renderScopeBadge('WATR')} <span className="font-sans">Flow Metrics</span>
                  </div>
                  {scopes.WATR && <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest">Enabled</span>}
                </div>
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setScopes(s => ({...s, ROLL: !s.ROLL}))}>
                  <div className="flex items-center gap-3">
                    {scopes.ROLL ? <CheckSquare size={14} className="text-[#0f172a]" /> : <Square size={14} className="text-slate-300" />}
                    {renderScopeBadge('ROLL')} <span className="font-sans">Hardware Config</span>
                  </div>
                  {scopes.ROLL && <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest">Enabled</span>}
                </div>
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setScopes(s => ({...s, RAW: !s.RAW}))}>
                  <div className="flex items-center gap-3">
                    {scopes.RAW ? <CheckSquare size={14} className="text-[#0f172a]" /> : <Square size={14} className="text-slate-300" />}
                    {renderScopeBadge('RAW')} <span className="font-sans">Time-Series</span>
                  </div>
                  {scopes.RAW && <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest">Enabled</span>}
                </div>
              </div>
              <button className="w-full mt-4 py-2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                <RefreshCw size={12} /> Apply Scope Policy
              </button>
            </div>

            {/* Hardware Assignment */}
            <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-5 flex flex-col">
              <h2 className="text-[11px] font-bold text-slate-900 flex items-center gap-2 uppercase tracking-widest mb-4">
                <Wifi size={14} className="text-slate-500" /> HARDWARE ASSIGNMENT
              </h2>
              <div className="space-y-4 flex-1">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Modbus ID / Hardware Perimeter</label>
                  <input type="text" defaultValue="Node 0x05" className="w-full font-mono text-[11px] font-bold text-slate-900 p-2 border border-slate-200 rounded-sm focus:outline-none focus:border-teal-500 bg-slate-50" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">CIDR Whitelist</label>
                  <input type="text" defaultValue="10.0.0.0/8, 192.168.0.0/16" className="w-full font-mono text-[11px] font-bold text-slate-900 p-2 border border-slate-200 rounded-sm focus:outline-none focus:border-teal-500 bg-slate-50" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Assigned Token IDs</label>
                  <input type="text" defaultValue="TKN-001, TKN-004, TKN-008" className="w-full font-mono text-[11px] font-bold text-slate-900 p-2 border border-slate-200 rounded-sm focus:outline-none focus:border-teal-500 bg-slate-50" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                 <button className="flex-1 py-2 bg-teal-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-teal-700 transition-colors">
                  Bind Node
                 </button>
                 <button className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-slate-50 transition-colors">
                  Clear
                 </button>
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT PANEL: CRYPTOGRAPHIC KEY ENGINE & AUDIT LOG */}
        <div className="xl:col-span-5 flex flex-col gap-4 lg:gap-6 w-full h-full min-h-0">
          
          {/* Key Engine */}
          <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-6 shrink-0">
            <h2 className="text-[11px] font-bold text-slate-900 flex items-center gap-2 uppercase tracking-widest mb-5 pb-3 border-b border-slate-100">
              <Key size={14} className="text-slate-500" /> CRYPTOGRAPHIC KEY ENGINE
            </h2>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">API Master Key</label>
                  <div className="flex gap-3 text-[9px] font-mono text-blue-500 uppercase tracking-widest">
                    <span className="flex items-center gap-1 cursor-pointer hover:text-blue-700"><EyeOff size={10}/> Reveal</span>
                    <span className="flex items-center gap-1 cursor-pointer hover:text-blue-700"><Copy size={10}/> Copy</span>
                  </div>
                </div>
                <div className="w-full font-mono text-sm font-bold text-slate-900 p-3 border border-slate-200 rounded-sm bg-slate-50 tracking-[0.2em] flex justify-between items-center">
                  <span>••••••••••••••••••••••••••••••••••••</span>
                  <span className="text-[9px] text-teal-600 font-bold tracking-widest">AES-256</span>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">TLS Fingerprint</label>
                  <span className="flex items-center gap-1 cursor-pointer text-[9px] font-mono text-blue-500 uppercase tracking-widest hover:text-blue-700"><Copy size={10}/> Copy</span>
                </div>
                <div className="w-full font-mono text-[11px] text-slate-600 p-3 border border-slate-200 rounded-sm bg-slate-50 break-all">
                  SHA-256:3B:44:9A:CE:85:02:AB:D1:F7:C0:44:02:E2:D8:1F:C6
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Service Account JWT</label>
                  <span className="text-[9px] font-mono text-amber-500 uppercase tracking-widest font-bold">RS256 • 4096-bit</span>
                </div>
                <div className="w-full font-mono text-[10px] text-slate-400 p-3 border border-slate-200 rounded-sm bg-slate-50 truncate">
                  eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzd...[truncated]
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button className="flex-1 py-2.5 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-blue-500/20">
                <RefreshCw size={14} /> Rotate Keys
              </button>
              <button className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                <Shield size={14} /> Verify Chain
              </button>
            </div>
          </div>

          {/* Vault Integrity */}
          <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-5 shrink-0">
             <h2 className="text-[11px] font-bold text-slate-900 flex items-center gap-2 uppercase tracking-widest mb-4">
              <Activity size={14} className="text-slate-500" /> VAULT INTEGRITY
            </h2>
            <div className="grid grid-cols-4 divide-x divide-slate-100">
               <div>
                 <span className="text-[8px] font-bold text-slate-400 tracking-widest uppercase mb-1 block">Cipher Suite</span>
                 <span className="text-[10px] font-mono font-bold text-teal-600">AES-256-GCM</span>
               </div>
               <div className="pl-4">
                 <span className="text-[8px] font-bold text-slate-400 tracking-widest uppercase mb-1 block">TLS Version</span>
                 <span className="text-[10px] font-mono font-bold text-blue-600">TLS 1.3</span>
               </div>
               <div className="pl-4">
                 <span className="text-[8px] font-bold text-slate-400 tracking-widest uppercase mb-1 block">HMAC Algo</span>
                 <span className="text-[10px] font-mono font-bold text-teal-600">SHA-384</span>
               </div>
               <div className="pl-4">
                 <span className="text-[8px] font-bold text-slate-400 tracking-widest uppercase mb-1 block">KDF</span>
                 <span className="text-[10px] font-mono font-bold text-blue-600">PBKDF2-SHA512</span>
               </div>
            </div>
          </div>

          {/* Audit Trail Console */}
          <div className="bg-white border border-slate-200 rounded-sm shadow-sm flex flex-col flex-1 min-h-[300px]">
             <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
              <h2 className="text-[11px] font-bold text-slate-900 flex items-center gap-2 uppercase tracking-widest">
                <Terminal size={14} className="text-slate-500" /> AUDIT TRAIL CONSOLE
              </h2>
              <span className="text-[9px] font-mono text-slate-400 flex items-center gap-1.5 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> LIVE • 46 events
              </span>
            </div>
            <div className="flex-1 bg-[#0f172a] p-4 overflow-y-auto font-mono text-[10px] leading-relaxed text-slate-300 space-y-1.5 shadow-inner">
               {auditLogs.map((log, i) => (
                 <div key={i} className="flex gap-2">
                   <span className="text-slate-500 shrink-0">[{log.time}]</span>
                   <span className={`${log.color} font-bold w-12 shrink-0`}>{log.type}:</span>
                   <span className="break-words leading-tight">{log.msg}</span>
                 </div>
               ))}
               <div className="mt-4 w-2 h-3.5 bg-teal-500 animate-pulse"></div>
            </div>
            <div className="bg-[#0b1120] px-4 py-2 border-t border-slate-800 flex justify-between items-center text-[8px] font-mono uppercase tracking-widest shrink-0">
               <div className="flex gap-4">
                 <span className="text-emerald-500">AUTH: 19</span>
                 <span className="text-red-500">REVOKE: 4</span>
                 <span className="text-blue-500">ROTATE: 12</span>
                 <span className="text-amber-500">WARN: 11</span>
               </div>
               <span className="text-slate-600">UTC {new Date().toISOString().slice(0, 16).replace('T', ' ')}Z</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}