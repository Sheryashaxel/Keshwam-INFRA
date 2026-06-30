'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic' 
import { Zap, Server, RefreshCw, Activity, Calendar as CalendarIcon, Minimize2, Maximize2, Download, PauseCircle, PlayCircle, ChevronLeft, ChevronRight } from 'lucide-react'

import { HeatmapGrid } from '../../components/dashboard/HeatmapGrid'
import { StatusBar } from '../../components/dashboard/StatusBar'
import { DailyDetailModal } from '../../components/dashboard/DailyDetailModal'

const ReactECharts = dynamic(() => import('echarts-for-react'), { 
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-400 font-mono text-[10px] tracking-widest">BOOTING ENTERPRISE ENGINE...</div>
})

const NODE_MAP = [
  { modbusId: 1, uuid: "35779cb1-e3bb-4375-a5cd-24ecccda382a", label: 'Ground Floor', short: 'GRND', color: '#14b8a6' },
  { modbusId: 2, uuid: "ca352649-d5f7-40b2-a57d-b4b4f077d010", label: 'Second Floor', short: 'SCND', color: '#3b82f6' },
  { modbusId: 3, uuid: "f2d0b950-61d8-4a68-8cf7-b04ded5efe1a", label: 'Third Floor', short: 'THRD', color: '#8b5cf6' },
  { modbusId: 4, uuid: "635e2bf2-23bc-4566-bb99-35f9b4d0d9e2", label: 'Top Floor', short: 'TOPF', color: '#f59e0b' },
  { modbusId: 5, uuid: "519296c2-c1ca-423c-933a-a4ee39dc3397", label: 'Main Pump', short: 'PUMP', color: '#ef4444' }
];

const METRICS_CONFIG: Record<string, { label: string; unit: string; key: string; multiplier: number }> = {
  power: { label: 'Active Power', unit: 'kW', key: 'active_power', multiplier: 0.001 },
  voltage: { label: 'Line Voltage', unit: 'V', key: 'voltage', multiplier: 1 },
  current: { label: 'Current Load', unit: 'A', key: 'current', multiplier: 1 },
  pf: { label: 'Power Factor', unit: 'PF', key: 'power_factor', multiplier: 1 },
  freq: { label: 'Utility Freq', unit: 'Hz', key: 'frequency', multiplier: 1 }
};

export default function OverviewPage() {
  const [mounted, setMounted] = useState(false)
  const [timeRange, setTimeRange] = useState('1D') 
  const [selectedMetric, setSelectedMetric] = useState('power') 
  const [graphType, setGraphType] = useState('smooth') 
  const [heatmapMetric, setHeatmapMetric] = useState('power') 
  const [heatmapVisual, setHeatmapVisual] = useState('bars') 
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  
  const [lineChartData, setLineChartData] = useState<any[]>([])
  const [heatmapData, setHeatmapData] = useState<any[]>([])
  
  const [liveNodes, setLiveNodes] = useState<any[]>([])
  const [isLoadingChart, setIsLoadingChart] = useState(true)
  const [isLiveFeedPaused, setIsLiveFeedPaused] = useState(false)
  
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [isGraphExpanded, setIsGraphExpanded] = useState(false)
  const [selectedNodeFilter, setSelectedNodeFilter] = useState<string>('ALL')

  const [debugLog, setDebugLog] = useState<{serverTime: number, espTime: number, diff: number, status: string} | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => setMounted(true), [])

  // 1. SMART POLLING ENGINE
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const fetchLiveState = async () => {
      if (document.hidden || isLiveFeedPaused) return;
      try {
        const res = await fetch(`/api/v1/telemetry?range=LIVE&nocache=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (json.success) setLiveNodes(json.data)
        }
      } catch (err) {}
    }
    fetchLiveState()
    interval = setInterval(fetchLiveState, 10000)
    const handleVisibility = () => { if (!document.hidden) fetchLiveState(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", handleVisibility); }
  }, [isLiveFeedPaused, refreshTrigger])

  // 2. LINE CHART FETCH (MICRO VIEW)
  useEffect(() => {
    const fetchLineData = async () => {
      setIsLoadingChart(true)
      try {
        const fetchRange = (customStart && customEnd) ? '30D' : timeRange;
        const res = await fetch(`/api/v1/telemetry?range=${fetchRange}&t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (json.success) {
            const formatted = json.data.map((item: any) => ({
              ...item,
              recorded_at: new Date(item.recorded_at),
            }))
            setLineChartData(formatted)
          }
        }
      } catch (err) {} finally { setIsLoadingChart(false) }
    }
    fetchLineData()
    const interval = setInterval(fetchLineData, 120000) 
    return () => clearInterval(interval)
  }, [timeRange, customStart, customEnd, refreshTrigger])

  // 3. 🚀 FIXED HEATMAP FETCH (HOURLY RESOLUTION)
  useEffect(() => {
    const fetchHeatmapData = async () => {
      try {
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + calendarMonthOffset);
        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');

        const res = await fetch(`/api/v1/telemetry?calendar_month=${yyyy}-${mm}&t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (json.success) {
            const formatted = json.data.map((item: any) => ({
              ...item,
              recorded_at: new Date(item.recorded_at)
            }))
            setHeatmapData(formatted)
          }
        }
      } catch (err) {}
    }
    fetchHeatmapData()
  }, [calendarMonthOffset, refreshTrigger]) 

  const isNodeOnline = (activeData: any, logDebug = false) => {
    if (!activeData) return false;
    const rawTs = activeData.recorded_at || activeData.ts || activeData.timestamp;
    if (!rawTs) return false;

    let parsedTime = 0;
    const isString = typeof rawTs === 'string' && rawTs.includes('-');

    if (isString) {
      const strTs = String(rawTs);
      parsedTime = new Date(strTs.endsWith('Z') ? strTs.slice(0, -1) : strTs).getTime();
    } else {
      let numTs = Number(rawTs);
      if (numTs < 20000000000) numTs *= 1000;
      parsedTime = numTs;
    }

    if (isNaN(parsedTime)) return false;

    const serverNow = Date.now();
    let diff = serverNow - parsedTime;
    
    if (diff < -19000000 && diff > -20000000) diff += 19800000; 
    if (diff > 19000000 && diff < 20000000) diff -= 19800000;

    const isAlive = Math.abs(diff) < 300000; 

    if (logDebug) {
      setDebugLog({ serverTime: serverNow, espTime: parsedTime, diff: diff, status: isAlive ? 'NOMINAL' : 'DEAD' });
    }
    return isAlive;
  }

  // 🚀 STABLE CLOCK DRIFT: Locked to Ground Floor
  useEffect(() => { 
    const groundFloor = liveNodes.find(n => n.node_id === NODE_MAP[0].uuid);
    if (groundFloor) isNodeOnline(groundFloor, true); 
  }, [liveNodes]);

  const onlineLiveNodes = liveNodes.filter(d => isNodeOnline(d, false)); 
  const avgVoltage = onlineLiveNodes.length ? (onlineLiveNodes.reduce((acc, node) => acc + (parseFloat(node.voltage) || 0), 0) / onlineLiveNodes.length) : 0
  const totalEnergyKwh = onlineLiveNodes.reduce((acc, node) => acc + (parseFloat(node.total_energy) || 0), 0)
  const avgPF = onlineLiveNodes.length ? (onlineLiveNodes.reduce((acc, node) => acc + (parseFloat(node.power_factor) || 0), 0) / onlineLiveNodes.length) : 0

  const tickerItems = NODE_MAP.map((node) => {
    const activeData = liveNodes.find(n => n.node_id === node.uuid)
    if (!isNodeOnline(activeData, false)) return <div key={node.modbusId} className="text-slate-400 border-r border-slate-200 pr-4 shrink-0">{node.short}: OFFLINE</div>;
    return (
      <div key={node.modbusId} className="flex items-center gap-2 border-r border-slate-200 pr-4 shrink-0">
        <span className="font-bold text-slate-700">{node.short}</span>
        <span className="text-emerald-600 font-bold">{(parseFloat(activeData.active_power)/1000).toFixed(2)}kW</span>
        <span className="text-slate-500">{parseFloat(activeData.voltage).toFixed(1)}V</span>
        <span className="text-blue-600 font-bold">{(parseFloat(activeData.total_energy)).toLocaleString(undefined, {maximumFractionDigits:1})}kWh</span>
      </div>
    )
  })

  const chartOptions = useMemo(() => {
    let rawCombinedData = [...lineChartData];
    if (liveNodes.length > 0 && !isLiveFeedPaused) {
      liveNodes.forEach(node => {
        if (isNodeOnline(node, false)) {
          const rawTs = node.recorded_at || node.ts || node.timestamp;
          const exactTime = typeof rawTs === 'string' ? new Date(rawTs.endsWith('Z') ? rawTs.slice(0, -1) : rawTs).getTime() : Number(rawTs) * (Number(rawTs) < 20000000000 ? 1000 : 1);
          if (!isNaN(exactTime)) rawCombinedData.push({ recorded_at: new Date(exactTime), node_id: node.node_id || node.device_id, [METRICS_CONFIG[selectedMetric].key]: node[METRICS_CONFIG[selectedMetric].key] || 0, is_gap: false });
        }
      });
    }
    
    if (rawCombinedData.length === 0) return {};

    const uniqueDataMap = new Map();
    rawCombinedData.forEach(d => {
      const key = `${d.node_id}_${d.recorded_at.getTime()}`;
      if (!uniqueDataMap.has(key) || !d.is_gap) {
        uniqueDataMap.set(key, d);
      }
    });
    
    const combinedData = Array.from(uniqueDataMap.values());
    combinedData.sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime());
    
    const config = METRICS_CONFIG[selectedMetric];
    
    let cutoff: Date | undefined = undefined;
    if (combinedData.length > 0) {
        const latestDate = combinedData[combinedData.length - 1].recorded_at;
        if (timeRange !== 'MAX') {
          cutoff = new Date(latestDate.getTime());
          if (timeRange === '1D') cutoff.setHours(cutoff.getHours() - 24);
          else if (timeRange === '7D') cutoff.setDate(cutoff.getDate() - 7);
          else if (timeRange === '30D') cutoff.setDate(cutoff.getDate() - 30);
          else if (timeRange === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
          else if (timeRange === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
          else if (timeRange === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
        }
    }

    const displayData = combinedData.filter(d => {
      if (customStart && customEnd) return d.recorded_at >= new Date(customStart) && d.recorded_at <= new Date(customEnd);
      if (!cutoff) return true;
      return d.recorded_at >= cutoff;
    });

    const hasNodeData = displayData.some(d => d.node_id);
    const type = graphType === 'bar' || graphType === 'scatter' ? graphType : 'line';
    
    const generateSeries = () => {
      if (!hasNodeData) {
        const timeMap: Record<number, number> = {};
        displayData.forEach(d => {
          const t = d.recorded_at.getTime();
          timeMap[t] = (timeMap[t] || 0) + (parseFloat(d[config.key] || 0) * config.multiplier);
        });
        return [{
          id: 'agg-series', name: `System Aggregate (${config.unit})`, 
          type: type, smooth: graphType === 'smooth' ? 0.2 : false, step: graphType === 'step' ? 'middle' : false, 
          showSymbol: true, symbolSize: 4, connectNulls: false,
          itemStyle: { color: '#14b8a6' }, lineStyle: { width: 2 },
          areaStyle: type === 'line' ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(20, 184, 166, 0.4)' }, { offset: 1, color: 'rgba(20, 184, 166, 0)' }] } } : undefined,
          data: Object.keys(timeMap).map(t => [Number(t), timeMap[Number(t)]]).sort((a,b)=>a[0]-b[0])
        }];
      }

      return NODE_MAP.map((node, idx) => {
        const nodeData = displayData.filter(d => String(d.node_id || '').toLowerCase().trim() === node.uuid.toLowerCase().trim());
        if (selectedNodeFilter !== 'ALL' && node.uuid !== selectedNodeFilter) return null;
        return {
          id: `series-${idx}`, name: node.short, 
          type: type, smooth: graphType === 'smooth' ? 0.2 : false, step: graphType === 'step' ? 'middle' : false, 
          showSymbol: true, symbolSize: 4, connectNulls: false,
          itemStyle: { color: node.color }, lineStyle: { width: 1.5 },
          data: nodeData.map(d => [d.recorded_at.getTime(), d.is_gap ? null : parseFloat(d[config.key] || 0) * config.multiplier])
        }
      }).filter(Boolean);
    };

    return {
      animation: false,
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'cross', snap: false, animation: false },
        backgroundColor: '#0f172a', borderColor: '#1e293b', 
        textStyle: { color: '#f8fafc', fontSize: 10, fontFamily: 'monospace' }, 
        valueFormatter: (val: number) => val !== null && val !== undefined ? `${val.toFixed(2)} ${config.unit}` : 'Offline' 
      },
      legend: { show: selectedNodeFilter === 'ALL', top: 0, icon: 'circle', textStyle: { color: '#475569', fontSize: 10 } },
      grid: { left: 40, right: 20, top: 40, bottom: 25 },
      toolbox: { 
        show: true,
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: 'Brush Zoom', back: 'Reset Zoom' } },
          magicType: { type: ['line', 'bar', 'stack'], title: { line: 'Switch to Line', bar: 'Switch to Bar', stack: 'Stack Mode' } },
          restore: { title: 'Reset View' }, 
          saveAsImage: { name: `Keshwam_Telem_${Date.now()}`, title: 'Download Image', pixelRatio: 2 }
        },
        iconStyle: { borderColor: '#64748b' }
      }, 
      dataZoom: [
        { id: 'dzInside', type: 'inside', zoomOnMouseWheel: true, moveOnMouseMove: true },
        { id: 'dzSlider', type: 'slider', height: 10, bottom: 5, borderColor: '#e2e8f0', handleSize: '100%' }
      ],
      xAxis: { 
        type: 'time', 
        axisLine: { lineStyle: { color: '#cbd5e1' } }, 
        axisLabel: { 
          color: '#94a3b8', 
          fontSize: 9,
          formatter: (value: number) => {
            const date = new Date(value);
            const isCustom = customStart && customEnd;
            if (timeRange === '1D' && !isCustom) {
              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (['7D', '30D'].includes(timeRange) && !isCustom) {
              return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}\n${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } else {
              return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
            }
          }
        } 
      },
      yAxis: { type: 'value', name: `${config.unit}`, nameTextStyle: { color: '#64748b', fontSize: 9, fontStyle: 'bold', align: 'left' }, splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, axisLabel: { color: '#94a3b8', fontSize: 9 } },
      series: generateSeries()
    };
  }, [lineChartData, liveNodes, timeRange, customStart, customEnd, selectedNodeFilter, selectedMetric, graphType, isLiveFeedPaused, refreshTrigger]);

  if (!mounted) return null

  const mainGraphPanel = (
    <div className={`bg-white border border-slate-200 shadow-sm flex flex-col transition-all duration-300 rounded-sm ${isGraphExpanded ? 'fixed inset-4 z-[110] shadow-2xl' : 'w-full h-[450px] shrink-0'}`}>
      <div className="p-3 border-b border-slate-100 flex flex-col gap-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-3">Enterprise Telemetry Engine</h2>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <button onClick={() => setSelectedNodeFilter('ALL')} className={`text-[9px] px-2 py-0.5 rounded-sm font-bold ${selectedNodeFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>AGGREGATE</button>
              {NODE_MAP.map(n => (
                <button key={n.modbusId} onClick={() => setSelectedNodeFilter(n.uuid)} style={{ backgroundColor: selectedNodeFilter === n.uuid ? n.color : '', color: selectedNodeFilter === n.uuid ? 'white' : '' }} className={`text-[9px] px-2 py-0.5 rounded-sm font-bold ${selectedNodeFilter !== n.uuid ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : ''}`}>{n.short}</button>
              ))}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <select value={graphType} onChange={(e) => setGraphType(e.target.value)} className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-sm px-2 py-1 outline-none shadow-sm cursor-pointer hover:bg-slate-200 transition-colors">
              <option value="smooth">Smooth Wave</option>
              <option value="line">Sharp Line</option>
              <option value="step">Ladder</option>
              <option value="bar">Sticks</option>
              <option value="scatter">Scatter</option>
            </select>

            <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)} className="text-[10px] font-mono font-bold bg-slate-900 text-teal-400 border border-slate-800 rounded-sm px-2 py-1 outline-none shadow-sm cursor-pointer hover:bg-slate-800 transition-colors">
              <option value="power">Active Power (kW)</option>
              <option value="voltage">Line Voltage (V)</option>
              <option value="current">Amperage Current (A)</option>
              <option value="pf">Power Factor (PF)</option>
              <option value="freq">Utility Freq (Hz)</option>
            </select>
            <button onClick={() => setIsGraphExpanded(!isGraphExpanded)} className="p-1 text-slate-400 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-sm transition-colors border border-slate-200">
              {isGraphExpanded ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <div className="flex items-center gap-1 text-[9px] font-mono">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border border-slate-200 rounded-sm px-1 py-0.5" />
            <span className="text-slate-400 font-bold">TO</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border border-slate-200 rounded-sm px-1 py-0.5" />
          </div>
          <div className="flex flex-wrap bg-slate-100 p-0.5 rounded-sm border border-slate-200">
            {['1D', '7D', '30D', '3M', '6M', '1Y', 'MAX'].map(r => (
              <button key={r} onClick={() => { setTimeRange(r); setCustomStart(''); setCustomEnd(''); }} className={`px-2 py-0.5 text-[9px] font-bold rounded-sm ${timeRange===r && !customStart ? 'bg-white shadow-sm text-teal-700':'text-slate-500 hover:bg-slate-200'}`}>{r}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 w-full p-2 relative min-h-0">
        {isLoadingChart && <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm"><Activity size={18} className="animate-spin text-blue-600 mr-2" /> RE-INDEXING ENGINE...</div>}
        {lineChartData.length > 0 || liveNodes.length > 0 ? (
          <ReactECharts key={selectedMetric + selectedNodeFilter + graphType} option={chartOptions} style={{ height: '100%', width: '100%' }} notMerge={false} lazyUpdate={true} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-mono text-[10px] tracking-widest">AWAITING TELEMETRY STREAM...</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden w-full">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-ticker { animation: ticker 40s linear infinite; display: flex; width: max-content; }
        .ticker-fade { -webkit-mask-image: linear-gradient(to right, transparent, black 15px, black calc(100% - 15px), transparent); mask-image: linear-gradient(to right, transparent, black 15px, black calc(100% - 15px), transparent); }
        .industrial-scroll::-webkit-scrollbar { height: 4px; width: 4px; }
        .industrial-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}} />

      {selectedDate && <DailyDetailModal date={selectedDate} onClose={() => setSelectedDate(null)} selectedMetric={heatmapMetric} />}

      {isGraphExpanded && <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm"></div>}
      {isGraphExpanded && mainGraphPanel}

      <div className="bg-white border-b border-slate-200 shadow-sm flex flex-col w-full shrink-0">
        <div className="px-4 py-2 border-b border-slate-50 flex flex-wrap items-center justify-between gap-4 text-xs bg-slate-50/50 w-full">
          <div className="flex items-center gap-2 font-mono text-slate-700 font-bold shrink-0">
            <Zap size={14} className="text-teal-600"/> FACILITY LOAD
            <button onClick={() => setIsLiveFeedPaused(!isLiveFeedPaused)} className="ml-3 flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-slate-200 hover:bg-slate-300 text-slate-600 text-[9px] uppercase tracking-wider transition-colors">
              {isLiveFeedPaused ? <><PlayCircle size={10} className="text-blue-600"/> Paused</> : <><PauseCircle size={10} /> Live</>}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-end flex-1 gap-6 font-mono text-[10px]">
            <div className="hidden sm:block"><span className="text-slate-400 block uppercase tracking-wider leading-none">Sys Voltage</span><span className="font-bold text-slate-800 text-[11px]">{avgVoltage.toFixed(1)} V</span></div>
            <div className="hidden sm:block"><span className="text-slate-400 block uppercase tracking-wider leading-none">Pwr Factor</span><span className="font-bold text-slate-800 text-[11px]">{avgPF.toFixed(2)}</span></div>
            <div><span className="text-slate-400 block uppercase tracking-wider leading-none">Active Nodes</span><span className="font-bold text-teal-600 text-[11px]">{onlineLiveNodes.length} / 5</span></div>
            
            <div className="flex items-center gap-4 border-l border-slate-200 pl-4">
               <div className="flex flex-col text-right">
                  <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-0.5">Total Combined Energy</span>
                  <span className="font-bold text-blue-600 text-[13px]">{totalEnergyKwh.toLocaleString(undefined, {maximumFractionDigits: 0})} <span className="text-[10px] text-blue-500">kWh</span></span>
               </div>
               <div className="bg-teal-50 border border-teal-200 text-teal-700 px-3 py-1 rounded-sm flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px]">
                 <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse"></span> Secure
               </div>
            </div>
          </div>
        </div>
        <div className="px-4 py-1.5 flex items-center text-[10px] overflow-hidden bg-white w-full">
          <div className="font-mono font-bold text-slate-400 pr-4 border-r border-slate-200 shrink-0">LIVE FEED:</div>
          <div className="flex-1 overflow-hidden relative flex items-center ticker-fade h-4 shrink">
            <div className="animate-ticker items-center gap-6 font-mono whitespace-nowrap pl-4">{tickerItems} {tickerItems}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-2 flex gap-2 w-full min-h-0 overflow-hidden">
        
        <div className="w-40 flex-shrink-0 flex flex-col gap-2 overflow-y-auto industrial-scroll">
          <div className="bg-white border border-slate-200 rounded-sm p-3 shadow-sm shrink-0">
            <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex justify-between">Facility Status <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span></h3>
            <div className="space-y-3">
              {NODE_MAP.map(node => {
                const activeData = liveNodes.find(n => n.node_id === node.uuid)
                const isActive = isNodeOnline(activeData, false)
                return <StatusBar key={node.modbusId} label={node.short} status={isActive ? "NOMINAL" : "OFFLINE"} color={isActive ? "bg-emerald-500" : "bg-red-500"} textClass={isActive ? "text-emerald-600" : "text-red-600"} width="w-[100%]" />
              })}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-sm p-3 shadow-sm shrink-0">
            <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex justify-between">Modbus RTU <Server size={10}/></h3>
            <div className="space-y-2 font-mono text-[9px]">
              {NODE_MAP.map((node) => {
                const activeData = liveNodes.find(n => n.node_id === node.uuid)
                const isOnline = isNodeOnline(activeData, false)
                return <div key={node.modbusId} className="flex justify-between items-center border-b border-slate-50 pb-1.5"><span className="text-slate-600 font-bold">MB-00{node.modbusId}</span><span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}></span></div>
              })}
            </div>
          </div>
          
          {/* 🚀 THE STABLE CLOCK DRIFT PANEL */}
          {debugLog && (
             <div className="bg-slate-900 border border-slate-800 rounded-sm p-2 shadow-sm font-mono text-[7px] text-slate-300 shrink-0">
               <h3 className="text-teal-400 font-bold mb-1.5">CLOCK DRIFT DEBUG</h3>
               <div className="flex justify-between"><span>Vercel UTC:</span><span>{debugLog.serverTime}</span></div>
               <div className="flex justify-between"><span>ESP32 Time:</span><span>{debugLog.espTime}</span></div>
               <div className="flex justify-between"><span>Math Diff:</span><span className={Math.abs(debugLog.diff) > 300000 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>{debugLog.diff} ms</span></div>
             </div>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0 overflow-y-auto industrial-scroll pr-1">
          
          <div className="flex flex-col lg:flex-row gap-2 shrink-0">
            <div className="flex-[7] min-w-0 flex flex-col">
               {!isGraphExpanded && mainGraphPanel}
            </div>

            <div className="flex-[4] bg-white border border-slate-200 rounded-sm shadow-sm flex flex-col min-w-0 h-[450px]">
              <div className="p-2 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 shrink-0">
                <div><h2 className="text-xs font-bold text-slate-900">Fleet Ledger</h2><p className="text-[7px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">REDIS CACHE</p></div>
                <button onClick={() => setRefreshTrigger(prev => prev + 1)} className="p-1 border border-slate-200 rounded-sm text-slate-600 hover:bg-slate-50 bg-white shadow-sm hover:text-blue-600 transition-colors active:scale-95"><RefreshCw size={10} className={isLoadingChart ? "animate-spin text-blue-600" : ""} /></button>
              </div>
              <div className="flex-1 overflow-auto p-0 industrial-scroll">
                <table className="w-full text-left whitespace-nowrap table-auto">
                  <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-sm z-10">
                    <tr className="border-b border-slate-200">
                      <th className="px-2 py-1.5 text-[8px] font-bold text-slate-500 uppercase tracking-wider">Node</th>
                      <th className="px-2 py-1.5 text-[8px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-100">kW</th>
                      <th className="px-2 py-1.5 text-[8px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-100">V</th>
                      <th className="px-2 py-1.5 text-[8px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-100">A</th>
                      <th className="px-2 py-1.5 text-[8px] font-bold text-blue-600 uppercase tracking-wider text-right bg-blue-50/30 border-l border-slate-200">kWh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {NODE_MAP.map((node) => {
                      const d = liveNodes.find(n => n.node_id === node.uuid)
                      const online = isNodeOnline(d, false)
                      return (
                        <tr key={node.modbusId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-2 py-2"><div className={`text-[10px] font-mono font-bold ${!online ? 'text-slate-400' : 'text-slate-800'}`}>{node.short}</div></td>
                          <td className={`px-2 py-2 text-[10px] font-mono font-bold text-right border-l border-slate-50 ${!online ? 'text-slate-400' : 'text-teal-700'}`}>{!online ? '---' : (parseFloat(d.active_power)/1000).toFixed(2)}</td>
                          <td className={`px-2 py-2 text-[10px] font-mono text-right border-l border-slate-50 text-slate-600`}>{!online ? '---' : parseFloat(d.voltage).toFixed(1)}</td>
                          <td className={`px-2 py-2 text-[10px] font-mono text-right border-l border-slate-50 text-slate-600`}>{!online ? '---' : parseFloat(d.current).toFixed(1)}</td>
                          <td className={`px-2 py-2 text-[10px] font-mono text-right font-black text-blue-600 bg-blue-50/10 border-l border-slate-100`}>{!online ? '---' : parseFloat(d.total_energy).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-3 flex flex-col min-h-[250px] shrink-0 mb-4">
            <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-2 shrink-0">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2"><CalendarIcon size={14} className="text-teal-600"/> Monthly Heatmap</h3>
              <div className="flex flex-wrap items-center gap-2">
                 <select value={heatmapVisual} onChange={(e) => setHeatmapVisual(e.target.value)} className="text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-sm px-1.5 py-0.5 outline-none shadow-sm cursor-pointer hover:bg-slate-200">
                   <option value="bars">Micro Bars</option>
                   <option value="solid">Thermal (Solid)</option>
                   <option value="line">Sparklines</option>
                   <option value="dots">Matrix Dots</option>
                 </select>

                 <select value={heatmapMetric} onChange={(e) => setHeatmapMetric(e.target.value)} className="text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-sm px-1.5 py-0.5 outline-none shadow-sm cursor-pointer hover:bg-slate-800">
                   <option value="power">Active Power (kW)</option>
                   <option value="voltage">Line Voltage (V)</option>
                   <option value="current">Amperage Current (A)</option>
                   <option value="pf">Power Factor (PF)</option>
                   <option value="freq">Utility Freq (Hz)</option>
                 </select>

                 <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                   <button onClick={() => setCalendarMonthOffset(prev => prev - 1)} className="p-0.5 hover:bg-slate-100 rounded-sm text-slate-500 border border-slate-200"><ChevronLeft size={12}/></button>
                   <span className="text-[9px] font-bold text-slate-700 w-16 text-center uppercase tracking-widest bg-slate-50 rounded-sm border border-slate-100">
                     {new Date(new Date().setMonth(new Date().getMonth() + calendarMonthOffset)).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                   </span>
                   <button onClick={() => setCalendarMonthOffset(prev => prev + 1)} disabled={calendarMonthOffset >= 0} className="p-0.5 hover:bg-slate-100 rounded-sm text-slate-500 disabled:opacity-30 border border-slate-200"><ChevronRight size={12}/></button>
                 </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 w-full relative">
              <HeatmapGrid historicalData={heatmapData} monthOffset={calendarMonthOffset} onDateSelect={setSelectedDate} selectedDate={selectedDate} selectedMetric={heatmapMetric} visualType={heatmapVisual} />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}