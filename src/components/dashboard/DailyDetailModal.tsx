import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Calendar as CalendarIcon, X, Maximize2, Minimize2, Activity, Zap, Server, ActivitySquare } from 'lucide-react';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const NODE_MAP = [
  { modbusId: 1, uuid: "35779cb1-e3bb-4375-a5cd-24ecccda382a", label: 'Ground Floor', short: 'GRND', color: '#14b8a6' },
  { modbusId: 2, uuid: "ca352649-d5f7-40b2-a57d-b4b4f077d010", label: 'Second Floor', short: 'SCND', color: '#3b82f6' },
  { modbusId: 3, uuid: "f2d0b950-61d8-4a68-8cf7-b04ded5efe1a", label: 'Third Floor', short: 'THRD', color: '#8b5cf6' },
  { modbusId: 4, uuid: "635e2bf2-23bc-4566-bb99-35f9b4d0d9e2", label: 'Top Floor', short: 'TOPF', color: '#f59e0b' },
  { modbusId: 5, uuid: "519296c2-c1ca-423c-933a-a4ee39dc3397", label: 'Main Pump', short: 'PUMP', color: '#ef4444' }
];

const METRICS_CONFIG: Record<string, { label: string; unit: string; key: string; multiplier: number }> = {
  power: { label: 'Active Power', unit: 'kW', key: 'active_power', multiplier: 0.001 },
  energy: { label: 'Units Consumed', unit: 'kWh', key: 'total_energy', multiplier: 1 },
  voltage: { label: 'Line Voltage', unit: 'V', key: 'voltage', multiplier: 1 },
  current: { label: 'Current Load', unit: 'A', key: 'current', multiplier: 1 },
  pf: { label: 'Power Factor', unit: 'PF', key: 'power_factor', multiplier: 1 },
  freq: { label: 'Utility Freq', unit: 'Hz', key: 'frequency', multiplier: 1 }
};

export function DailyDetailModal({ date, onClose, selectedMetric: initialMetric }: { date: Date, onClose: () => void, selectedMetric?: string }) {
  const [modalNodeFilter, setModalNodeFilter] = useState('ALL');
  const [modalMetric, setModalMetric] = useState(initialMetric || 'power');
  const [graphType, setGraphType] = useState('smooth'); 
  const [archiveRange, setArchiveRange] = useState('1D'); // 🚀 NEW: Dynamic Range State
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  const [modalData, setModalData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 🚀 FIXED: Fetching strictly using Local Midnight Milliseconds
  useEffect(() => {
    const fetchArchiveData = async () => {
      setIsLoading(true);
      try {
        // Force the date to strictly local midnight, regardless of UTC offsets
        const startOfDayLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const localMs = startOfDayLocal.getTime();
        
        const res = await fetch(`/api/v1/telemetry?target_ms=${localMs}&archive_range=${archiveRange}&t=${Date.now()}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            const formatted = json.data.map((item: any) => ({
              ...item,
              recorded_at: new Date(item.recorded_at)
            }));
            setModalData(formatted);
          }
        }
      } catch (err) {} finally {
        setIsLoading(false);
      }
    };
    fetchArchiveData();
  }, [date, archiveRange]);

  // 🚀 ENTERPRISE DEDUPLICATION (Removed 24h strict filter to allow multi-day zoom)
  const uniqueDayData = useMemo(() => {
    const uniqueDataMap = new Map();
    modalData.forEach(d => {
      const key = `${d.node_id}_${d.recorded_at.getTime()}`;
      if (!uniqueDataMap.has(key) || !d.is_gap) uniqueDataMap.set(key, d);
    });
    return Array.from(uniqueDataMap.values()).sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime());
  }, [modalData]);

  // 🚀 DYNAMIC KPI CALCULATOR
  const kpis = useMemo(() => {
    let targetData = uniqueDayData;
    if (modalNodeFilter !== 'ALL') {
       targetData = uniqueDayData.filter(d => String(d.node_id).toLowerCase() === modalNodeFilter.toLowerCase());
    }

    const validPower = targetData.map(d => parseFloat(d.active_power) || 0).filter(v => v > 0);
    const validVoltage = targetData.map(d => parseFloat(d.voltage) || 0).filter(v => v > 0);
    const validAmps = targetData.map(d => parseFloat(d.current) || 0).filter(v => v > 0);

    // MATHEMATICAL kWh INTEGRATOR (With Hardware Counter Fallback)
    let totalKwh = 0;
    const nodesToIntegrate = modalNodeFilter === 'ALL' ? NODE_MAP.map(n => n.uuid) : [modalNodeFilter];

    nodesToIntegrate.forEach(nodeUuid => {
      const nodePoints = targetData.filter(d => String(d.node_id || '').toLowerCase() === nodeUuid.toLowerCase() && !d.is_gap);
      if (nodePoints.length === 0) return;

      const endEnergy = parseFloat(nodePoints[nodePoints.length-1]?.total_energy || '0');
      const startEnergy = parseFloat(nodePoints[0]?.total_energy || '0');
      
      if (endEnergy > startEnergy) {
          totalKwh += (endEnergy - startEnergy);
      } else {
          // Trapezoidal Integration Fallback
          for (let i = 1; i < nodePoints.length; i++) {
            const t1 = nodePoints[i-1].recorded_at.getTime();
            const t2 = nodePoints[i].recorded_at.getTime();
            const hours = (t2 - t1) / 3600000; 
            
            if (hours > 0 && hours < 4) { // Prevents integrating across massive offline gaps
              const p1 = (parseFloat(nodePoints[i-1].active_power) || 0) / 1000;
              const p2 = (parseFloat(nodePoints[i].active_power) || 0) / 1000;
              totalKwh += ((p1 + p2) / 2) * hours;
            }
          }
      }
    });

    return {
       peakLoad: validPower.length ? (Math.max(...validPower) / 1000).toFixed(2) : '0.00',
       avgVoltage: validVoltage.length ? (validVoltage.reduce((a,b)=>a+b,0) / validVoltage.length).toFixed(1) : '0.0',
       avgAmps: validAmps.length ? (validAmps.reduce((a,b)=>a+b,0) / validAmps.length).toFixed(1) : '0.0',
       packetCount: targetData.length,
       totalKwh: totalKwh.toFixed(1)
    };
  }, [uniqueDayData, modalNodeFilter]);

  const chartOptions = useMemo(() => {
    if (!uniqueDayData || uniqueDayData.length === 0) return {};

    // 🚀 DYNAMIC BOUNDARY CALCULATION
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endBound = startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1;
    
    let startBound = startOfDay.getTime();
    if (archiveRange === '7D') startBound -= 6 * 24 * 60 * 60 * 1000;
    if (archiveRange === '30D') startBound -= 29 * 24 * 60 * 60 * 1000;
    if (archiveRange === '1Y') startBound -= 365 * 24 * 60 * 60 * 1000;

    const config = METRICS_CONFIG[modalMetric] || METRICS_CONFIG['power'];
    const hasNodeData = uniqueDayData.some(d => d.node_id);

    const type = graphType === 'bar' || graphType === 'scatter' ? graphType : 'line';
    const isSmooth = graphType === 'smooth' ? 0.2 : false;
    const isStep = graphType === 'step' ? 'middle' : false;
    const showSymbol = graphType === 'scatter';

    const generateSeries = () => {
      if (!hasNodeData) {
        const timeMap: Record<number, number> = {};
        uniqueDayData.forEach(d => {
          const t = d.recorded_at.getTime();
          timeMap[t] = (timeMap[t] || 0) + (parseFloat(d[config.key] || 0) * config.multiplier);
        });
        return [{
          id: 'agg-series', 
          name: `System Aggregate (${config.unit})`, type: type, smooth: isSmooth, step: isStep, showSymbol: showSymbol, symbolSize: showSymbol ? 4 : 2,
          itemStyle: { color: '#14b8a6' }, lineStyle: { width: 2 },
          connectNulls: false, 
          areaStyle: type === 'line' ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(20, 184, 166, 0.4)' }, { offset: 1, color: 'rgba(20, 184, 166, 0)' }] } } : undefined,
          data: Object.keys(timeMap).map(t => [Number(t), timeMap[Number(t)]]).sort((a,b)=>a[0]-b[0])
        }];
      }

      if (modalNodeFilter === 'ALL') {
        return NODE_MAP.map((node, idx) => ({
          id: `series-${idx}`, 
          name: node.short, type: type, smooth: isSmooth, step: isStep, showSymbol: showSymbol, symbolSize: showSymbol ? 4 : 2,
          itemStyle: { color: node.color }, lineStyle: { width: 1.5 },
          connectNulls: false, 
          data: uniqueDayData.filter(d => String(d.node_id || '').toLowerCase().trim() === node.uuid.toLowerCase().trim())
                        .map(d => [d.recorded_at.getTime(), d.is_gap ? null : parseFloat(d[config.key] || 0) * config.multiplier]) 
        }))
      } else {
        const targetNode = NODE_MAP.find(n => n.uuid === modalNodeFilter)!
        return [{
          id: 'single-series', 
          name: targetNode.short, type: type, smooth: isSmooth, step: isStep, showSymbol: showSymbol, symbolSize: showSymbol ? 4 : 2,
          itemStyle: { color: targetNode.color }, lineStyle: { width: 2 },
          connectNulls: false, 
          areaStyle: type === 'line' ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${targetNode.color}66` }, { offset: 1, color: `${targetNode.color}00` }] } } : undefined,
          data: uniqueDayData.filter(d => String(d.node_id || '').toLowerCase().trim() === modalNodeFilter.toLowerCase().trim())
                        .map(d => [d.recorded_at.getTime(), d.is_gap ? null : parseFloat(d[config.key] || 0) * config.multiplier]) 
        }]
      }
    };

    return {
      animation: false,
      tooltip: { trigger: 'axis', backgroundColor: '#0f172a', borderColor: '#1e293b', textStyle: { color: '#f8fafc', fontSize: 10, fontFamily: 'monospace' }, valueFormatter: (val: number) => `${val?.toFixed(2) || 'Offline'} ${config.unit}` },
      legend: { show: modalNodeFilter === 'ALL', top: 0, icon: 'circle', textStyle: { color: '#475569', fontSize: 10 } },
      grid: { left: 55, right: 35, top: 25, bottom: 45 },
      
      toolbox: {
        show: true,
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: 'Brush Zoom', back: 'Reset Zoom' } },
          magicType: { type: ['line', 'bar', 'stack'], title: { line: 'Switch to Line', bar: 'Switch to Bar', stack: 'Stack Mode' } },
          restore: { title: 'Reset View' },
          saveAsImage: { name: `Keshwam_Archive_${Date.now()}`, title: 'Download Image', pixelRatio: 2 }
        },
        iconStyle: { borderColor: '#64748b' }
      },

      dataZoom: [
        { id: 'dzInside', type: 'inside', zoomOnMouseWheel: true, moveOnMouseMove: true },
        { id: 'dzSlider', type: 'slider', height: 14, bottom: 5, borderColor: '#e2e8f0', handleSize: '100%' }
      ],
      xAxis: { 
        type: 'time', 
        min: startBound, 
        max: endBound,   
        axisLine: { lineStyle: { color: '#cbd5e1' } }, 
        axisLabel: { 
          color: '#94a3b8', fontSize: 9, 
          formatter: (value: number) => {
            const d = new Date(value);
            return archiveRange === '1D' ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
          } 
        } 
      },
      yAxis: { 
        type: 'value', name: `${config.label} (${config.unit})`, 
        nameTextStyle: { color: '#64748b', fontSize: 9, fontStyle: 'bold', align: 'left' },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, 
        axisLabel: { color: '#94a3b8', fontSize: 9 } 
      },
      series: generateSeries()
    };
  }, [uniqueDayData, date, modalNodeFilter, modalMetric, graphType, archiveRange]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm sm:p-4">
      <div className={`bg-white shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${isFullScreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[90vh] rounded-sm relative animate-in fade-in zoom-in-95'}`}>
        
        {/* HEADER */}
        <div className="p-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><CalendarIcon size={18} className="text-teal-600"/> Telemetry Archive Explorer</h2>
            <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mt-1">
              Target Anchor: {date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsFullScreen(!isFullScreen)} className="p-1.5 rounded-sm hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
              {isFullScreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-sm hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><X size={18} /></button>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-white overflow-x-auto shrink-0 z-10">
           <div className="flex gap-2 items-center">
             <button onClick={() => setModalNodeFilter('ALL')} className={`text-[10px] px-3 py-1.5 rounded-sm font-bold shrink-0 transition-colors ${modalNodeFilter === 'ALL' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>AGGREGATE SYSTEM</button>
             {NODE_MAP.map(n => (
               <button key={n.modbusId} onClick={() => setModalNodeFilter(n.uuid)} style={{ backgroundColor: modalNodeFilter === n.uuid ? n.color : '', color: modalNodeFilter === n.uuid ? 'white' : '' }} className={`text-[10px] px-3 py-1.5 rounded-sm font-bold shrink-0 transition-colors ${modalNodeFilter !== n.uuid ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'shadow-sm'}`}>{n.label}</button>
             ))}
             
             {/* 🚀 NEW RANGE SELECTOR */}
             <div className="flex bg-slate-100 p-0.5 rounded-sm border border-slate-200 ml-4 hidden sm:flex">
               {['1D', '7D', '30D', '1Y'].map(r => (
                 <button key={r} onClick={() => setArchiveRange(r)} className={`px-2 py-1 text-[9px] font-bold rounded-sm uppercase tracking-wider transition-all duration-200 ${archiveRange === r ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}>
                   {r}
                 </button>
               ))}
             </div>
           </div>

           <div className="flex items-center gap-3">
             <select value={graphType} onChange={(e) => setGraphType(e.target.value)} className="text-[11px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-sm px-2 py-1 outline-none shadow-sm cursor-pointer hover:bg-slate-200 transition-colors">
               <option value="smooth">Smooth Wave</option>
               <option value="line">Sharp Line</option>
               <option value="step">Ladder (Step)</option>
               <option value="bar">Sticks (Bar)</option>
               <option value="scatter">Scatter Plot</option>
             </select>

             <select value={modalMetric} onChange={(e) => setModalMetric(e.target.value)} className="text-[11px] font-mono font-bold bg-slate-900 text-teal-400 border border-slate-800 rounded-sm px-2 py-1 outline-none shadow-sm focus:border-teal-500 cursor-pointer">
               <option value="energy">Units Consumed (kWh)</option>
               <option value="power">Active Power (kW)</option>
               <option value="voltage">Line Voltage (V)</option>
               <option value="current">Amperage Current (A)</option>
               <option value="pf">Power Factor (PF)</option>
               <option value="freq">Utility Frequency (Hz)</option>
             </select>
           </div>
        </div>

        {/* 5-COLUMN KPI METRICS BAR */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-slate-200 border-b border-slate-200 shrink-0">
          <div className="bg-white p-3 flex flex-col justify-center">
             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Zap size={10} className="text-blue-500"/> Total Consumed</span>
             <span className="text-xl font-mono font-black text-blue-600 mt-1">{kpis.totalKwh} <span className="text-[10px] text-slate-400">kWh</span></span>
          </div>
          <div className="bg-white p-3 flex flex-col justify-center">
             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Zap size={10} className="text-amber-500"/> Peak Load</span>
             <span className="text-xl font-mono font-black text-slate-800 mt-1">{kpis.peakLoad} <span className="text-[10px] text-slate-400">kW</span></span>
          </div>
          <div className="bg-white p-3 flex flex-col justify-center">
             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><ActivitySquare size={10} className="text-indigo-500"/> Avg Voltage</span>
             <span className="text-xl font-mono font-black text-slate-800 mt-1">{kpis.avgVoltage} <span className="text-[10px] text-slate-400">V</span></span>
          </div>
          <div className="bg-white p-3 flex flex-col justify-center">
             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Activity size={10} className="text-emerald-500"/> Avg Current</span>
             <span className="text-xl font-mono font-black text-slate-800 mt-1">{kpis.avgAmps} <span className="text-[10px] text-slate-400">A</span></span>
          </div>
          <div className="bg-white p-3 flex flex-col justify-center">
             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Server size={10} className="text-slate-500"/> Datapoints</span>
             <span className="text-xl font-mono font-black text-slate-800 mt-1">{kpis.packetCount.toLocaleString()} <span className="text-[10px] text-slate-400">PINGS</span></span>
          </div>
        </div>

        {/* CHART AREA */}
        <div className="flex-1 p-4 w-full min-h-[300px] relative pb-8">
          {isLoading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm"><Activity size={18} className="animate-spin text-teal-600 mr-2" /> EXTRACTING ARCHIVE...</div>}
          {!isLoading && uniqueDayData.length === 0 ? (
             <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-mono text-[10px] tracking-widest uppercase">No Telemetry recorded for this window</div>
          ) : (
             <ReactECharts 
                key={modalMetric + modalNodeFilter + graphType + archiveRange} 
                option={chartOptions} 
                style={{ height: '100%', width: '100%' }} 
                notMerge={false} 
                lazyUpdate={true} 
             />
          )}
        </div>
      </div>
    </div>
  )
}