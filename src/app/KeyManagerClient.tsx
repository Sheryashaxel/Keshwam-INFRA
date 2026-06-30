'use client'

import { useState } from 'react'
import { generateDeviceKey, revokeDeviceKey } from './actions/keys'

export function KeyManagerClient({ initialDevices }: { initialDevices: any[] }) {
  const [loading, setLoading] = useState(false)
  const [newKey, setNewKey] = useState<{ rawKey: string, deviceId: string } | null>(null)
  const [deviceIdInput, setDeviceIdInput] = useState('')
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deviceIdInput.trim()) return
    
    setLoading(true)
    try {
      const rawKey = await generateDeviceKey(deviceIdInput)
      setNewKey({ rawKey, deviceId: deviceIdInput })
      setDeviceIdInput('')
    } catch (err) {
      alert('Failed to generate key.')
    }
    setLoading(false)
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('CRITICAL ACTION: This will permanently kill this hardware key worldwide. Proceed?')) return;
    
    setRevokingId(id)
    try {
      await revokeDeviceKey(id)
    } catch (err) {
      alert('Failed to revoke hardware key.')
    }
    setRevokingId(null)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* Control Panel */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-[#0a0a0a] border border-zinc-800 p-6 shadow-[0_0_15px_rgba(45,212,191,0.05)]">
          <h2 className="text-teal-400 text-sm font-bold uppercase tracking-widest mb-4">Provision Hardware</h2>
          
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-2 uppercase">Hardware Device ID</label>
              <input 
                type="text" 
                value={deviceIdInput}
                onChange={(e) => setDeviceIdInput(e.target.value)}
                placeholder="e.g., SL-RS1-00042" 
                className="w-full bg-black border border-zinc-700 text-white p-3 text-sm focus:border-teal-400 focus:outline-none transition-colors"
                required
              />
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-teal-500 hover:bg-teal-400 text-black font-black uppercase tracking-wider py-3 px-4 transition-colors disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Burn New Key'}
            </button>
          </form>
        </div>

        {/* Security Notice */}
        {newKey && (
          <div className="bg-teal-950 border border-teal-500 p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="text-teal-400 font-bold uppercase mb-2">Critical Security Notice</h3>
            <p className="text-xs text-teal-200 mb-4">
              Copy this key immediately. It cannot be recovered.
            </p>
            <div className="bg-black p-4 break-all border border-teal-800 mb-4">
              <code className="text-teal-400 text-xs">{newKey.rawKey}</code>
            </div>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(newKey.rawKey)
                alert('Copied to clipboard. Flash this to the ESP32.')
              }}
              className="w-full border border-teal-500 text-teal-400 hover:bg-teal-500 hover:text-black py-2 uppercase text-xs font-bold transition-colors"
            >
              Copy to Clipboard
            </button>
          </div>
        )}
      </div>

      {/* Fleet Overview */}
      <div className="lg:col-span-2">
        <div className="bg-[#0a0a0a] border border-zinc-800 p-6">
          <h2 className="text-zinc-500 text-sm font-bold uppercase tracking-widest mb-6">Active Fleet Overview</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-500 uppercase bg-[#050505] border-y border-zinc-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Device ID</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {initialDevices.map((device) => (
                  <tr key={device.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-4 text-white font-medium">{device.device_id}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider ${
                        device.status === 'active' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' : 
                        'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {device.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-zinc-500">
                      {new Date(device.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4">
                      {device.status === 'active' && (
                        <button 
                          onClick={() => handleRevoke(device.id)}
                          disabled={revokingId === device.id}
                          className="text-red-500 hover:text-red-400 text-xs uppercase font-bold tracking-wider disabled:opacity-50 transition-opacity"
                        >
                          {revokingId === device.id ? 'Killing...' : 'Revoke'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {initialDevices.length === 0 && (
              <div className="text-center text-zinc-600 py-12 text-xs uppercase tracking-widest">
                No hardware provisioned yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}