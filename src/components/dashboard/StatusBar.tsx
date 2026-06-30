import React from 'react';

export function StatusBar({ label, status, color, textClass, width }: { label: string, status: string, color: string, textClass: string, width: string }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] font-mono text-slate-600">{label}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${textClass}`}>{status}</span>
      </div>
      <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${width} ${color}`}></div>
      </div>
    </div>
  )
}