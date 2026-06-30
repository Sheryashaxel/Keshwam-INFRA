import React, { useMemo } from 'react';

const METRICS_CONFIG: Record<string, { key: string; multiplier: number }> = {
  power: { key: 'active_power', multiplier: 0.001 },
  voltage: { key: 'voltage', multiplier: 1 },
  current: { key: 'current', multiplier: 1 },
  pf: { key: 'power_factor', multiplier: 1 },
  freq: { key: 'frequency', multiplier: 1 }
};

export function HeatmapGrid({ 
  historicalData, monthOffset, onDateSelect, selectedDate, selectedMetric = 'power', visualType = 'bars' 
}: { 
  historicalData: any[], monthOffset: number, onDateSelect: (date: Date) => void, selectedDate: Date | null, selectedMetric?: string, visualType?: string 
}) {
  
  const { blocks } = useMemo(() => {
    const config = METRICS_CONFIG[selectedMetric] || METRICS_CONFIG['power'];
    const targetDate = new Date(); 
    targetDate.setMonth(targetDate.getMonth() + monthOffset);
    const targetMonth = targetDate.getMonth(); 
    const targetYear = targetDate.getFullYear();
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    
    const dailyData: Record<number, number[]> = {}; 
    let maxHourlyVal = 0.0001; // 🚀 FIX: Failsafe to prevent Divide by Zero errors
    let maxDailyVal = 0.0001;  // 🚀 FIX: Failsafe
    
    historicalData.forEach(d => {
      if (!d || !d.recorded_at) return;
      
      const date = new Date(d.recorded_at);
      if (isNaN(date.getTime())) return; // 🚀 FIX: Ignore corrupted timestamps
      
      if (date.getMonth() === targetMonth && date.getFullYear() === targetYear) {
        const day = date.getDate();
        // If the data is a daily rollup, it defaults to hour 0.
        const hour = date.getHours(); 
        
        if (!dailyData[day]) dailyData[day] = Array(24).fill(0);
        
        // 🚀 FIX: Safely parse floats and prevent NaN injection
        const rawVal = parseFloat(d[config.key]);
        const val = isNaN(rawVal) ? 0 : (rawVal * config.multiplier);
        
        dailyData[day][hour] += val;
        
        if (dailyData[day][hour] > maxHourlyVal) maxHourlyVal = dailyData[day][hour];
      }
    });

    for (let i = 1; i <= daysInMonth; i++) {
        if (dailyData[i]) {
            const sum = dailyData[i].reduce((a,b) => a + b, 0);
            if (sum > maxDailyVal) maxDailyVal = sum;
        }
    }

    const generatedBlocks = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const hours = dailyData[i] || Array(24).fill(0);
      const totalVal = hours.reduce((a, b) => a + b, 0);
      const isSelected = selectedDate?.getDate() === i && selectedDate?.getMonth() === targetMonth;
      const hasData = totalVal > 0;

      // Dynamic Color Mapping Engine
      const hexColor = selectedMetric === 'voltage' ? '99, 102, 241' : selectedMetric === 'current' ? '245, 158, 11' : '20, 184, 166';
      const baseClass = selectedMetric === 'voltage' ? 'bg-indigo-500' : selectedMetric === 'current' ? 'bg-amber-500' : 'bg-teal-500';
      const strokeClass = selectedMetric === 'voltage' ? 'stroke-indigo-500' : selectedMetric === 'current' ? 'stroke-amber-500' : 'stroke-teal-500';
      const ringColor = selectedMetric === 'voltage' ? 'ring-indigo-500 border-indigo-500' : selectedMetric === 'current' ? 'ring-amber-500 border-amber-500' : 'ring-teal-500 border-teal-500';
      
      const emptyBg = '#f8fafc';
      const hasDataBg = selectedMetric === 'voltage' ? '#eef2ff' : selectedMetric === 'current' ? '#fffbeb' : '#f0fdfa';

      // Thermal "Solid" Logic
      let blockBg = hasData ? hasDataBg : emptyBg;
      if (visualType === 'solid' && hasData) {
          const intensity = Math.max(0.1, totalVal / maxDailyVal);
          blockBg = `rgba(${hexColor}, ${intensity * 0.9})`;
      }

      generatedBlocks.push(
        <div 
          key={i} 
          onClick={() => hasData && onDateSelect(new Date(targetYear, targetMonth, i))}
          className={`relative w-full pt-[100%] rounded-sm border transition-all overflow-hidden ${hasData ? 'cursor-pointer hover:border-slate-400' : 'cursor-not-allowed opacity-40'} ${isSelected ? `${ringColor} ring-1 shadow-sm z-10` : 'border-slate-200/60'}`} 
          style={{ backgroundColor: blockBg }}
        >
          {/* Day Number Label */}
          <div className={`absolute top-1 left-1.5 text-[10px] font-black z-10 ${isSelected || (visualType === 'solid' && totalVal/maxDailyVal > 0.6) ? 'text-slate-900' : 'text-slate-400'}`}>{i}</div>
          
          {/* THE SHAPE-SHIFTING VISUALIZATION LAYER */}
          {hasData && (
             <div className="absolute inset-0 pt-4 pb-1 px-1 flex flex-col justify-end">
                
                {visualType === 'bars' && (
                  <div className="w-full h-[70%] flex items-end justify-between gap-[1px] opacity-70">
                    {hours.map((val, hIdx) => (
                      <div key={hIdx} className={`flex-1 ${baseClass} rounded-t-[1px] transition-all duration-300`} style={{ height: `${val > 0 ? Math.max(10, (val / maxHourlyVal) * 100) : 0}%` }}></div>
                    ))}
                  </div>
                )}

                {visualType === 'line' && (
                  <div className="w-full h-[75%] opacity-80 flex items-end px-0.5">
                      <svg viewBox="0 0 230 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                         <polyline 
                            fill="none" 
                            className={strokeClass} 
                            strokeWidth="10" 
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={hours.map((v, i) => `${i * 10},${100 - (v > 0 ? Math.max(5, (v / maxHourlyVal) * 95) : 0)}`).join(' ')} 
                         />
                      </svg>
                  </div>
                )}

                {visualType === 'dots' && (
                  <div className="w-full h-full grid grid-cols-6 grid-rows-4 gap-[2px] items-center justify-center p-0.5">
                    {hours.map((val, hIdx) => {
                      const opacity = val > 0 ? Math.max(0.2, val / maxHourlyVal) : 0.05;
                      return <div key={hIdx} className={`w-full h-full rounded-full ${baseClass}`} style={{ opacity }}></div>
                    })}
                  </div>
                )}
             </div>
          )}

          {/* 🚀 FIX: Bulletproof Hover Overlay Format */}
          {hasData && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-white/90 transition-opacity backdrop-blur-[1px] z-20">
               <span className="text-[11px] font-black text-slate-800 tracking-tight">
                 {selectedMetric === 'power' ? `${totalVal.toFixed(1)} kW` : 
                  selectedMetric === 'voltage' ? `${totalVal.toFixed(1)} V` :
                  selectedMetric === 'current' ? `${totalVal.toFixed(1)} A` :
                  totalVal.toFixed(2)}
               </span>
            </div>
          )}
        </div>
      )
    }
    return { blocks: generatedBlocks };
  }, [historicalData, monthOffset, selectedDate, selectedMetric, visualType]);

  return <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-12 gap-1.5 w-full h-full content-start">{blocks}</div>
}