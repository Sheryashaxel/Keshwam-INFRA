'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { 
  Server, UploadCloud, ShieldCheck, Activity, 
  History, Settings2, RefreshCw, PowerOff, 
  Ban, CheckCircle2, ChevronRight, FileText
} from 'lucide-react'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

// --- MOCK ENTERPRISE DATA ---
const versionHistory = [
  { id: 'rel_9a8b', version: 'v4.2.2-stable', date: 'Jun 11, 2026 • 10:42 AM', status: 'ACTIVE', hash: 'a3f2b891c04d', size: '1.8 MB', successRate: '98.2%' },
  { id: 'rel_7c6d', version: 'v4.2.1-hotfix', date: 'Jun 08, 2026 • 02:20 PM', status: 'ARCHIVED', hash: 'c7d8e9f0a1b2', size: '1.8 MB', successRate: '100%' },
  { id: 'rel_5e4f', version: 'v4.1.0-stable', date: 'May 28, 2026 • 09:15 AM', status: 'ARCHIVED', hash: 'b1a2c3d4e5f6', size: '1.7 MB', successRate: '94.5%' },
]

const fleetData = [
  { mac: '24:6F:28:1A:3B:4C', node: 'KV-01-GRND', version: 'v4.2.2-stable', status: 'Online', signal: -68, uptime: '14d 2h' },
  { mac: '24:6F:28:1A:99:FF', node: 'KV-05-PUMP', version: 'v4.1.0-stable', status: 'Blacklisted', signal: 0, uptime: 'Offline' },
  { mac: '24:6F:28:1A:77:88', node: 'KV-04-TOPF', version: 'v4.2.1-hotfix', status: 'Updating', signal: -82, uptime: '2d 14h' },
]

const systemLogs = [
  { time: "10:42:01", source: "KV-01-GRND", msg: "Modbus CRC error recovered via retry loop.", type: "warn" },
  { time: "10:42:05", source: "SYS", msg: "Firmware v4.2.2-stable staged to vault successfully.", type: "info" },
  { time: "10:42:18", source: "KV-04-TOPF", msg: "Requesting OTA chunk index 45/450.", type: "info" },
  { time: "10:42:22", source: "KV-05-PUMP", msg: "Connection rejected. MAC address blacklisted.", type: "error" }
]

export default function EnterpriseOTAPage() {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'DEPLOY' | 'FLEET' | 'VAULT' | 'DIAGNOSTICS'>('DEPLOY')
  
  // OTA Configuration State
  const [chunkSize, setChunkSize] = useState('4096')
  const [otaTimeout, setOtaTimeout] = useState('300')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  // 🚀 Refined Anthropic-style Chart (Muted, elegant)
  const anomalyChartOptions = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e4e4e7', textStyle: { color: '#3f3f46', fontSize: 12 }, padding: 12, borderRadius: 8 },
    grid: { left: 30, right: 20, top: 20, bottom: 20, containLabel: true },
    xAxis: { type: 'time', splitLine: { show: false }, axisLine: { lineStyle: { color: '#e4e4e7' } }, axisLabel: { color: '#71717a', fontSize: 11, fontFamily: 'Inter, sans-serif' } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f4f4f5', type: 'solid' } }, axisLabel: { color: '#71717a', fontSize: 11 } },
    series: [
      {
        name: 'CRC Errors',
        type: 'scatter',
        symbolSize: 8,
        itemStyle: { color: '#e4a38e' }, // Soft, muted clay/red
        data: [[new Date(Date.now() - 3600000).getTime(), 4], [new Date(Date.now() - 1800000).getTime(), 7], [new Date(Date.now() - 300000).getTime(), 2]]
      },
      {
        name: 'Heap Drops',
        type: 'scatter',
        symbolSize: 8,
        itemStyle: { color: '#d4a872' }, // Soft warm sand/amber
        data: [[new Date(Date.now() - 7200000).getTime(), 8]]
      }
    ]
  }

  return (
    <div className="h-[calc(100vh-64px)] bg-[#FDFBF7] flex flex-col font-sans text-zinc-800 overflow-hidden selection:bg-zinc-200">
      
      {/* 🚀 ANTHROPIC STYLE HEADER */}
      <div className="px-8 pt-8 pb-4 shrink-0 max-w-7xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 mb-2">Fleet Operations</h1>
            <p className="text-sm text-zinc-500">Manage edge deployments, monitor firmware stability, and control node access.</p>
          </div>
          
          {/* Subtle Tab Navigation */}
          <div className="flex gap-2 p-1 bg-zinc-100/50 rounded-xl border border-zinc-200/50">
            {[
              { id: 'DEPLOY', label: 'Deploy' },
              { id: 'FLEET', label: 'Nodes' },
              { id: 'VAULT', label: 'Vault' },
              { id: 'DIAGNOSTICS', label: 'Anomalies' }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === tab.id ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/30'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 🚀 MAIN WORKSPACE */}
      <div className="flex-1 overflow-y-auto px-8 pb-12 pt-4">
        <div className="max-w-7xl mx-auto w-full h-full">
          
          {/* =========================================================
              TAB 1: OTA DEPLOYMENT
              ========================================================= */}
          {activeTab === 'DEPLOY' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* LEFT COLUMN: Configuration */}
              <div className="lg:col-span-7 flex flex-col gap-8">
                
                {/* Upload Section */}
                <section className="bg-white rounded-2xl border border-zinc-200/60 p-8 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                  <h2 className="text-lg font-semibold text-zinc-900 mb-1">Firmware Payload</h2>
                  <p className="text-sm text-zinc-500 mb-6">Upload compiled binary for SHA-256 verification and staging.</p>
                  
                  <input type="file" accept=".bin" ref={fileInputRef} className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                  <div 
                    onClick={() => fileInputRef.current?.click()} 
                    className={`border border-dashed ${selectedFile ? 'border-zinc-400 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50'} rounded-xl flex flex-col items-center justify-center py-10 px-4 cursor-pointer transition-all duration-200`}
                  >
                    <FileText size={24} className={`${selectedFile ? 'text-zinc-700' : 'text-zinc-400'} mb-3`} strokeWidth={1.5} />
                    <p className="text-sm font-medium text-zinc-800">{selectedFile ? selectedFile.name : 'Click to select .bin file'}</p>
                    <p className="text-xs text-zinc-400 mt-1">{selectedFile ? `${(selectedFile.size / 1024).toFixed(2)} KB • Ready` : 'Max 8MB limit'}</p>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button className="bg-zinc-900 text-white px-5 py-2.5 text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors shadow-sm">
                      Stage to Vault
                    </button>
                  </div>
                </section>

                {/* Edge Configuration */}
                <section className="bg-white rounded-2xl border border-zinc-200/60 p-8 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-900 mb-1">Edge Network Settings</h2>
                      <p className="text-sm text-zinc-500">Tune HTTP Range Requests for unstable facility connections.</p>
                    </div>
                    <Settings2 size={20} className="text-zinc-400" strokeWidth={1.5}/>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-sm font-medium text-zinc-700">Chunk Size</label>
                        <span className="text-xs font-mono text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md">{chunkSize} B</span>
                      </div>
                      <input type="range" min="1024" max="16384" step="1024" value={chunkSize} onChange={(e) => setChunkSize(e.target.value)} className="w-full accent-zinc-800" />
                    </div>
                    
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-sm font-medium text-zinc-700">Timeout Limit</label>
                        <span className="text-xs font-mono text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md">{otaTimeout} ms</span>
                      </div>
                      <input type="range" min="100" max="5000" step="100" value={otaTimeout} onChange={(e) => setOtaTimeout(e.target.value)} className="w-full accent-zinc-800" />
                    </div>
                  </div>
                </section>
              </div>

              {/* RIGHT COLUMN: Terminal & Deploy */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                <section className="bg-[#fcfaf9] rounded-2xl border border-zinc-200/80 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col h-[500px]">
                  <div className="px-6 py-4 border-b border-zinc-200/80 bg-white flex justify-between items-center shrink-0">
                    <h2 className="text-sm font-semibold text-zinc-900">System Activity</h2>
                    <span className="flex items-center gap-1.5 text-xs text-zinc-500"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Live</span>
                  </div>
                  
                  <div className="p-6 flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-3">
                    {systemLogs.map((log, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span className="text-zinc-400 shrink-0">[{log.time}]</span>
                        <div className="flex-1">
                          <span className="text-zinc-500 mr-2">[{log.source}]</span>
                          <span className={log.type === 'error' ? 'text-red-500' : log.type === 'warn' ? 'text-amber-600' : 'text-zinc-700'}>
                            {log.msg}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-6 bg-white border-t border-zinc-200/80 shrink-0">
                    <button className="w-full py-3 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-all shadow-sm">
                      Execute Fleet Update
                    </button>
                    <p className="text-center text-xs text-zinc-400 mt-3">Requires global admin authorization.</p>
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* =========================================================
              TAB 2: FLEET HUB
              ========================================================= */}
          {activeTab === 'FLEET' && (
            <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] overflow-hidden">
               <div className="px-8 py-6 border-b border-zinc-100 flex justify-between items-center bg-white">
                 <div>
                   <h2 className="text-lg font-semibold text-zinc-900">Hardware Nodes</h2>
                   <p className="text-sm text-zinc-500">Manage individual edge devices and their network access.</p>
                 </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="bg-zinc-50/50 border-b border-zinc-200/60 text-xs font-medium text-zinc-500">
                       <th className="px-8 py-4 font-medium">Identifier</th>
                       <th className="px-8 py-4 font-medium">Firmware</th>
                       <th className="px-8 py-4 font-medium">Uptime</th>
                       <th className="px-8 py-4 font-medium">Status</th>
                       <th className="px-8 py-4 font-medium text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="text-sm">
                     {fleetData.map((device, i) => (
                       <tr key={i} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50 transition-colors">
                         <td className="px-8 py-4">
                           <div className="font-medium text-zinc-900">{device.node}</div>
                           <div className="text-xs font-mono text-zinc-400 mt-0.5">{device.mac}</div>
                         </td>
                         <td className="px-8 py-4 text-zinc-600 font-mono text-xs">{device.version}</td>
                         <td className="px-8 py-4 text-zinc-500 text-xs">{device.uptime}</td>
                         <td className="px-8 py-4">
                           <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${
                             device.status === 'Online' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                             device.status === 'Blacklisted' ? 'bg-red-50 text-red-700 border-red-100' : 
                             'bg-blue-50 text-blue-700 border-blue-100'
                           }`}>
                             {device.status}
                           </span>
                         </td>
                         <td className="px-8 py-4 text-right">
                           <div className="flex justify-end gap-3">
                             <button className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Reboot</button>
                             {device.status === 'Blacklisted' ? (
                                <button className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors">Restore Access</button>
                             ) : (
                                <button className="text-sm text-red-500 hover:text-red-600 font-medium transition-colors">Revoke Access</button>
                             )}
                           </div>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {/* =========================================================
              TAB 3: VERSION VAULT
              ========================================================= */}
          {activeTab === 'VAULT' && (
            <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] overflow-hidden">
               <div className="px-8 py-6 border-b border-zinc-100 bg-white">
                 <h2 className="text-lg font-semibold text-zinc-900">Immutable Ledger</h2>
                 <p className="text-sm text-zinc-500">History of all staged binaries. Rollbacks take effect immediately on next node ping.</p>
               </div>
               <div className="p-8 flex flex-col gap-6">
                 {versionHistory.map(v => (
                   <div key={v.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-100 last:border-0 last:pb-0">
                     <div>
                       <div className="flex items-center gap-3 mb-1">
                         <span className="font-semibold text-zinc-900">{v.version}</span>
                         {v.status === 'ACTIVE' && <span className="bg-zinc-100 text-zinc-700 text-xs px-2 py-0.5 rounded-md font-medium border border-zinc-200">Current Production</span>}
                       </div>
                       <div className="text-xs text-zinc-500 flex items-center gap-3">
                         <span>Deployed {v.date}</span>
                         <span className="w-1 h-1 rounded-full bg-zinc-300"></span>
                         <span className="font-mono">{v.size}</span>
                         <span className="w-1 h-1 rounded-full bg-zinc-300"></span>
                         <span className="font-mono">SHA: {v.hash}</span>
                       </div>
                     </div>
                     <div className="flex items-center gap-4">
                       <div className="text-right hidden sm:block mr-4">
                          <div className="text-xs text-zinc-400">Success Rate</div>
                          <div className="text-sm font-medium text-zinc-800">{v.successRate}</div>
                       </div>
                       {v.status !== 'ACTIVE' && (
                         <button className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 rounded-lg text-sm font-medium transition-colors shadow-sm">
                           Rollback to this version
                         </button>
                       )}
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}

          {/* =========================================================
              TAB 4: DIAGNOSTICS
              ========================================================= */}
          {activeTab === 'DIAGNOSTICS' && (
            <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] p-8 h-full flex flex-col">
               <div className="mb-6">
                 <h2 className="text-lg font-semibold text-zinc-900">Filtered Anomalies</h2>
                 <p className="text-sm text-zinc-500 mt-1">Plotting isolated Modbus drops and memory leaks. Baseline operational data is hidden to reduce noise.</p>
               </div>
               <div className="flex-1 w-full bg-zinc-50/50 rounded-xl border border-zinc-100 overflow-hidden">
                  <ReactECharts option={anomalyChartOptions} style={{ height: '100%', width: '100%' }} />
               </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}