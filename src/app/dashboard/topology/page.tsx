'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { 
  Server, Zap, CalendarDays, Activity, Play, Pause, FastForward,
  AlertTriangle, CheckCircle2, ShieldCheck, Download, Settings2, SkipBack,
  PlayCircle, PauseCircle, Minimize2, Maximize2, RefreshCw, ChevronLeft, ChevronRight, Clock
} from 'lucide-react'

import { HeatmapGrid } from '../../../components/dashboard/HeatmapGrid'
import { DailyDetailModal } from '../../../components/dashboard/DailyDetailModal'

const ReactECharts = dynamic(() => import('echarts-for-react'), { 
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-400 font-mono text-[10px] tracking-widest uppercase">Initializing VCR Engine...</div>
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
  energy: { label: 'Units Consumed', unit: 'kWh', key: 'total_energy', multiplier: 1 }, 
  voltage: { label: 'Line Voltage', unit: 'V', key: 'voltage', multiplier: 1 },
  current: { label: 'Current Load', unit: 'A', key: 'current', multiplier: 1 },
  pf: { label: 'Power Factor', unit: 'PF', key: 'power_factor', multiplier: 1 },
  freq: { label: 'Utility Freq', unit: 'Hz', key: 'frequency', multiplier: 1 }
};

export default function TopologyPage() {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'VCR' | 'HEATMAP' | 'OUTAGE'>('VCR')
  const [selectedNode, setSelectedNode] = useState(NODE_MAP[0].uuid)
  const [timeRange, setTimeRange] = useState('1D') 
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  
  const [selectedMetric, setSelectedMetric] = useState('power')
  const [graphType, setGraphType] = useState('smooth')
  const [isGraphExpanded, setIsGraphExpanded] = useState(false)
  const chartRef = useRef<any>(null)
  
  const [heatmapView, setHeatmapView] = useState<'MONTH' | 'YEAR'>('MONTH')
  const [heatmapMetric, setHeatmapMetric] = useState('power') 
  const [heatmapVisual, setHeatmapVisual] = useState('bars') 
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0)
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null) 

  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isLiveFeedPaused, setIsLiveFeedPaused] = useState(false)

  const [liveNodes, setLiveNodes] = useState<any[]>([])
  const [nodeData, setNodeData] = useState<any[]>([])
  const [heatmapData, setHeatmapData] = useState<any[]>([])
  const [yearHeatmapData, setYearHeatmapData] = useState<any[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [debugLog, setDebugLog] = useState<{serverTime: number, espTime: number, diff: number, status: string} | null>(null)

  useEffect(() => setMounted(true), [])

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
    const handleVisibility = () => { if (!document.hidden && !isLiveFeedPaused) fetchLiveState(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", handleVisibility); }
  }, [isLiveFeedPaused, refreshTrigger])

  const isNodeOnline = (activeData: any, logDebug = false) => {
    if (!activeData) return false;
    const rawTs = activeData.recorded_at || activeData.ts || activeData.timestamp;
    if (!rawTs) return false;

    let parsedTime = 0;
    if (typeof rawTs === 'string' && rawTs.includes('-')) {
      parsedTime = new Date(rawTs.endsWith('Z') ? rawTs.slice(0, -1) : rawTs).getTime();
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
    if (logDebug) setDebugLog({ serverTime: serverNow, espTime: parsedTime, diff: diff, status: isAlive ? 'NOMINAL' : 'DEAD' });
    return isAlive;
  }

  useEffect(() => {
    const fetchData = async () => {
      setIsFetching(true)
      setIsPlaying(false)
      try {
        const fetchRange = (customStart && customEnd) ? '30D' : timeRange;
        const res = await fetch(`/api/v1/telemetry?range=${fetchRange}&t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (json.success) {
            const formatted = json.data
                .filter((item: any) => String(item.node_id).toLowerCase() === selectedNode.toLowerCase())
                .map((item: any) => ({ ...item, recorded_at: new Date(item.recorded_at) }));
            setNodeData(formatted)
          }
        }
      } catch (err) {} finally { setIsFetching(false) }
    }
    fetchData()
  }, [selectedNode, timeRange, customStart, customEnd, refreshTrigger])

  useEffect(() => {
    const fetchHeatmapData = async () => {
      if (activeTab !== 'HEATMAP' || heatmapView !== 'MONTH') return;
      try {
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + calendarMonthOffset);
        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');

        const res = await fetch(`/api/v1/telemetry?calendar_month=${yyyy}-${mm}&t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (json.success) {
            const formatted = json.data
                .filter((item: any) => String(item.node_id).toLowerCase() === selectedNode.toLowerCase())
                .map((item: any) => ({ ...item, recorded_at: new Date(item.recorded_at) }));
            setHeatmapData(formatted)
          }
        }
      } catch (err) {}
    }
    fetchHeatmapData()
  }, [selectedNode, activeTab, heatmapView, calendarMonthOffset, refreshTrigger])

  useEffect(() => {
    const fetchYearlyData = async () => {
      if (activeTab !== 'HEATMAP' || heatmapView !== 'YEAR') return;
      try {
        const res = await fetch(`/api/v1/telemetry?calendar_year=${calendarYear}&t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (json.success) {
            const formatted = json.data
                .filter((item: any) => String(item.node_id).toLowerCase() === selectedNode.toLowerCase())
                .map((item: any) => ({ ...item, recorded_at: new Date(item.recorded_at) }));
            setYearHeatmapData(formatted)
          }
        }
      } catch (err) {}
    }
    fetchYearlyData()
  }, [selectedNode, activeTab, heatmapView, calendarYear, refreshTrigger])

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && chartRef.current && activeTab === 'VCR') {
      timer = setInterval(() => {
        const echartInstance = chartRef.current.getEchartsInstance();
        const currentOption = echartInstance.getOption();
        if (currentOption.dataZoom && currentOption.dataZoom.length > 0) {
          const start = currentOption.dataZoom[0].start;
          const end = currentOption.dataZoom[0].end;
          const windowSize = end - start;
          let newStart = start + (0.5 * playbackSpeed);
          let newEnd = end + (0.5 * playbackSpeed);

          if (newEnd >= 100) {
            newStart = 100 - windowSize;
            newEnd = 100;
            setIsPlaying(false);
          }
          echartInstance.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: newStart, end: newEnd });
          echartInstance.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: newStart, end: newEnd });
        }
      }, 100);
    }
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, activeTab]);

  const handleResetScrubber = () => {
    setIsPlaying(false);
    if (chartRef.current) {
      chartRef.current.getEchartsInstance().dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
      chartRef.current.getEchartsInstance().dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
    }
  };

  // ==========================================
  // ECHARTS GENERATORS
  // ==========================================

  // 🚀 EXACT GITHUB-STYLE YEAR MATRIX
  const yearlyChartOptions = useMemo(() => {
    if (heatmapView !== 'YEAR' || yearHeatmapData.length === 0) return {};
    const config = METRICS_CONFIG[heatmapMetric];

    const calendarData = yearHeatmapData.map(d => {
      const localDate = new Date(d.recorded_at.getTime() - (d.recorded_at.getTimezoneOffset() * 60000));
      return [
        localDate.toISOString().split('T')[0],
        parseFloat(d[config.key] || 0) * config.multiplier
      ];
    });

    const values = calendarData.map(d => Number(d[1]));
    const max = Math.max(...values) || 100;

    return {
      tooltip: {
        backgroundColor: '#1e293b', borderColor: '#334155', 
        textStyle: { color: '#f8fafc', fontSize: 10, fontFamily: 'monospace' },
        formatter: function (p: any) {
           return `${p.data[0]}<br/><b>${p.data[1].toFixed(2)} ${config.unit}</b>`;
        }
      },
      visualMap: {
        type: 'piecewise',
        show: false, // Hidden exactly like GitHub
        pieces: [
          { value: 0, color: '#ebedf0' }, // Empty state
          { min: 0.0001, max: max * 0.25, color: '#9be9a8' }, // Light green
          { min: max * 0.25, max: max * 0.5, color: '#40c463' }, // Med green
          { min: max * 0.5, max: max * 0.75, color: '#30a14e' }, // Dark green
          { min: max * 0.75, color: '#216e39' } // Max green
        ]
      },
      calendar: {
        top: 25, bottom: 20, left: 40, right: 20,
        cellSize: [14, 14], // Perfect square cells exactly like GitHub
        range: calendarYear.toString(),
        itemStyle: { borderWidth: 3, borderColor: '#ffffff', color: '#ebedf0' }, // Clean white borders
        splitLine: { show: false }, // Strip out the ugly month dividers
        yearLabel: { show: false },
        monthLabel: { color: '#64748b', fontSize: 11, fontFamily: 'sans-serif', margin: 10 },
        dayLabel: { color: '#94a3b8', fontSize: 10, fontFamily: 'sans-serif', firstDay: 1, margin: 10 }
      },
      series: {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: calendarData
      }
    };
  }, [yearHeatmapData, heatmapView, heatmapMetric, calendarYear]);

  const onYearCalendarClick = {
    'click': (params: any) => {
       if (params.componentType === 'series') {
          const [y, m, d] = params.data[0].split('-');
          setSelectedDate(new Date(parseInt(y), parseInt(m)-1, parseInt(d)));
       }
    }
  };

  const vcrChartOptions = useMemo(() => {
    if (activeTab !== 'VCR') return {};
    
    const uniqueDataMap = new Map();
    nodeData.forEach(d => {
      const key = `${d.node_id}_${d.recorded_at.getTime()}`;
      if (!uniqueDataMap.has(key) || !d.is_gap) uniqueDataMap.set(key, d);
    });
    
    const combinedData = Array.from(uniqueDataMap.values());
    combinedData.sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime());

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

    const config = METRICS_CONFIG[selectedMetric];
    const targetNode = NODE_MAP.find(n => n.uuid === selectedNode);
    const targetNodeColor = targetNode?.color || '#14b8a6';

    const type = graphType === 'bar' || graphType === 'scatter' ? graphType : 'line';
    const isSmooth = graphType === 'smooth' ? 0.2 : false;
    const isStep = graphType === 'step' ? 'middle' : false;

    return {
      animation: false, 
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'cross', snap: false, animation: false },
        backgroundColor: '#0f172a', borderColor: '#1e293b', 
        textStyle: { color: '#f8fafc', fontSize: 10, fontFamily: 'monospace' },
        valueFormatter: (val: number) => val !== null && val !== undefined ? `${val.toFixed(2)} ${config.unit}` : 'Offline'
      },
      grid: { left: 55, right: 35, top: 40, bottom: 45 },
      toolbox: {
        show: true,
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: 'Brush Zoom', back: 'Reset Zoom' } },
          magicType: { type: ['line', 'bar', 'stack'], title: { line: 'Switch to Line', bar: 'Switch to Bar', stack: 'Stack Mode' } },
          restore: { title: 'Reset View' },
          saveAsImage: { name: `Keshwam_VCR_${targetNode?.short}`, pixelRatio: 2 }
        },
        iconStyle: { borderColor: '#64748b' }
      },
      dataZoom: [
        { id: 'dzInside', type: 'inside', zoomOnMouseWheel: true, moveOnMouseMove: true },
        { id: 'dzSlider', type: 'slider', height: 14, bottom: 5, borderColor: '#e2e8f0', handleSize: '100%' }
      ],
      xAxis: { 
        type: 'time', 
        axisLine: { lineStyle: { color: '#cbd5e1' } }, 
        axisLabel: { 
          color: '#94a3b8', fontSize: 9,
          formatter: (value: number) => {
            const date = new Date(value);
            const isCustom = customStart && customEnd;
            if (timeRange === '1D' && !isCustom) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            else if (['7D', '30D'].includes(timeRange) && !isCustom) return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}\n${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            else return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
          }
        } 
      },
      yAxis: { 
        type: 'value', name: `${config.label} (${config.unit})`, 
        nameTextStyle: { color: '#64748b', fontSize: 9, fontStyle: 'bold', align: 'left' }, 
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        axisLabel: { color: '#94a3b8', fontSize: 9 }
      },
      series: [{
        name: targetNode?.short,
        type: type, smooth: isSmooth, step: isStep,
        showSymbol: true, symbolSize: 4, connectNulls: false,
        itemStyle: { color: targetNodeColor }, lineStyle: { width: 2 },
        areaStyle: type === 'line' ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${targetNodeColor}66` }, { offset: 1, color: `${targetNodeColor}00` }] } } : undefined,
        data: displayData.map(d => [d.recorded_at.getTime(), d.is_gap ? null : (parseFloat(d[config.key] || 0) * config.multiplier)])
      }]
    };
  }, [nodeData, activeTab, selectedMetric, graphType, selectedNode, timeRange, customStart, customEnd]);

  // 🚀 PERMANENT BLACKOUT DATABASE FETCH
  const [blackoutLogs, setBlackoutLogs] = useState<any[]>([]);
  const [isFetchingOutages, setIsFetchingOutages] = useState(false);

  useEffect(() => {
    if (activeTab !== 'OUTAGE') return;
    
    const fetchOutages = async () => {
      setIsFetchingOutages(true);
      try {
        const res = await fetch(`/api/v1/outages?node_id=${selectedNode}&t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            // Map the database rows to exactly match what the UI expects
            const formattedLogs = json.data.map((log: any) => ({
              id: log.id,
              start: new Date(log.dropout_time),
              end: new Date(log.restored_time),
              durationMins: log.duration_mins,
              severity: log.severity_code
            }));
            setBlackoutLogs(formattedLogs);
          }
        }
      } catch (err) {
        console.error("Failed to fetch blackout logs", err);
      } finally {
        setIsFetchingOutages(false);
      }
    };

    fetchOutages();
  }, [selectedNode, activeTab, refreshTrigger]);

  const outageChartOptions = useMemo(() => {
    if (activeTab !== 'OUTAGE' || nodeData.length === 0) return {};
    
    const targetNode = NODE_MAP.find(n => n.uuid === selectedNode);
    const outageTimeline = nodeData.map(d => [d.recorded_at.getTime(), d.is_gap ? 0 : 1]);

    return {
      animation: false,
      tooltip: { 
        trigger: 'axis',
        formatter: (params: any) => {
           const time = new Date(params[0].value[0]).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium'});
           const status = params[0].value[1] === 1 ? '🟢 ONLINE' : '🔴 OFFLINE';
           return `<div class="font-mono text-[10px]">${time}<br/><b>${status}</b></div>`;
        }
      },
      grid: { left: 55, right: 35, top: 20, bottom: 45 },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 14, bottom: 5 }],
      xAxis: { type: 'time', axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: { color: '#94a3b8', fontSize: 9 } },
      yAxis: { 
        type: 'value', min: 0, max: 1.2, splitNumber: 1,
        axisLabel: { formatter: (val: number) => val === 1 ? 'ONLINE' : val === 0 ? 'OFFLINE' : '', color: '#64748b', fontSize: 9, fontStyle: 'bold' },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }
      },
      series: [{
        name: 'Node State', type: 'line', step: 'end', symbol: 'none',
        itemStyle: { color: targetNode?.color }, lineStyle: { width: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${targetNode?.color}66` }, { offset: 1, color: `${targetNode?.color}00` }] } },
        data: outageTimeline
      }]
    };
  }, [nodeData, activeTab, selectedNode]);

  const vcrKPIs = useMemo(() => {
    if (activeTab !== 'VCR' || !nodeData.length) return { peak: 0, low: 0, avgVal: 0 };
    const validData = nodeData.filter((d:any) => !d.is_gap);
    if (!validData.length) return { peak: 0, low: 0, avgVal: 0 };
    const config = METRICS_CONFIG[selectedMetric];
    
    let peak = -Infinity, low = Infinity, sum = 0;
    validData.forEach(d => {
       const val = parseFloat(d[config.key]) || 0;
       if (val > peak) peak = val;
       if (val < low) low = val;
       sum += val;
    });
    
    return { peak: peak === -Infinity ? 0 : peak * config.multiplier, low: low === Infinity ? 0 : low * config.multiplier, avgVal: (sum / validData.length) * config.multiplier };
  }, [nodeData, activeTab, selectedMetric]);

  const avgVoltage = liveNodes.length ? (liveNodes.reduce((acc, node) => acc + (parseFloat(node.voltage) || 0), 0) / liveNodes.length) : 0;
  const totalEnergyKwh = liveNodes.reduce((acc, node) => acc + (parseFloat(node.total_energy) || 0), 0);
  const avgPF = liveNodes.length ? (liveNodes.reduce((acc, node) => acc + (parseFloat(node.power_factor) || 0), 0) / liveNodes.length) : 0;
  const onlineLiveNodes = liveNodes.filter(d => isNodeOnline(d, false));

  useEffect(() => { 
    const targetNodeData = liveNodes.find(n => String(n.node_id).toLowerCase() === selectedNode.toLowerCase());
    if (targetNodeData) isNodeOnline(targetNodeData, true); 
  }, [liveNodes, selectedNode]);

  // 🚀 REFACTORED TICKER CONTENT
  const tickerContent = (
    <div className="flex gap-8 items-center pr-8 shrink-0">
      {NODE_MAP.map((node) => {
        const activeData = liveNodes.find(n => n.node_id === node.uuid);
        if (!isNodeOnline(activeData, false)) return <div key={node.modbusId} className="text-slate-400 border-r border-slate-200 pr-4 shrink-0 font-mono text-[10px]"><span className="font-bold text-slate-700">{node.short}:</span> OFFLINE</div>;
        return (
          <div key={node.modbusId} className="flex items-center gap-2 border-r border-slate-200 pr-4 shrink-0 font-mono text-[10px]">
            <span className="font-bold text-slate-700">{node.short}</span>
            <span className="text-emerald-600 font-bold">{(parseFloat(activeData.active_power)/1000).toFixed(2)}kW</span>
            <span className="text-slate-500">{parseFloat(activeData.voltage).toFixed(1)}V</span>
            <span className="text-slate-500">{parseFloat(activeData.current).toFixed(1)}A</span>
          </div>
        )
      })}
    </div>
  );

  if (!mounted) return null;

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden w-full relative">
      {/* 🚀 PERFECTED STOCK TICKER CSS */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes ticker {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        .animate-ticker { animation: ticker 25s linear infinite; }
        .ticker-container:hover .animate-ticker { animation-play-state: paused; }
        .ticker-fade { -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent); mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent); }
        .industrial-scroll::-webkit-scrollbar { height: 4px; width: 4px; }
        .industrial-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}} />
      
      {/* MODAL RENDER */}
      {selectedDate && <DailyDetailModal date={selectedDate} onClose={() => setSelectedDate(null)} selectedMetric={heatmapMetric} />}

      <header className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <h1 className="text-xs font-black text-slate-800 flex items-center gap-2 tracking-tight uppercase">
            <Settings2 size={14} className="text-slate-500"/> Diagnostics Topology
          </h1>
          <div className="w-px h-4 bg-slate-200"></div>
          
          {/* 🚀 TIMEFRAME BUTTONS RESTORED TO HEADER */}
          <div className="flex bg-slate-100 p-0.5 rounded-sm border border-slate-200">
            {['1D', '7D', '30D', '6M', '1Y', 'MAX'].map(r => (
              <button key={r} onClick={() => { setTimeRange(r); setCustomStart(''); setCustomEnd(''); }} className={`px-2 py-0.5 text-[9px] font-bold rounded-sm uppercase tracking-wider transition-all duration-200 ${timeRange === r && !customStart ? 'bg-white shadow-sm text-slate-900 border border-slate-200 scale-105' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && <span className="text-[9px] font-bold text-teal-600 uppercase tracking-widest flex items-center gap-1 animate-pulse"><Activity size={10}/> Fetching Matrix...</span>}
        </div>
      </header>

      <div className="bg-white border-b border-slate-200 shadow-sm flex flex-col w-full shrink-0 z-10">
        <div className="px-4 py-2 border-b border-slate-50 flex flex-wrap items-center justify-between gap-4 text-xs bg-slate-50/50 w-full">
          <div className="flex items-center gap-2 font-mono text-slate-700 font-bold shrink-0">
            <Zap size={14} className="text-teal-600"/> FACILITY LOAD
            <button onClick={() => setIsLiveFeedPaused(!isLiveFeedPaused)} className="ml-3 flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-slate-200 hover:bg-slate-300 text-slate-600 text-[9px] uppercase tracking-wider transition-colors active:scale-95">
              {isLiveFeedPaused ? <><PlayCircle size={10} className="text-blue-600"/> Paused</> : <><PauseCircle size={10} /> Live</>}
            </button>
            <button onClick={() => setRefreshTrigger(prev => prev + 1)} className="p-1 border border-slate-200 rounded-sm text-slate-600 hover:bg-slate-50 bg-white shadow-sm hover:text-blue-600 transition-all active:scale-95 ml-2">
              <RefreshCw size={12} className={isFetching ? "animate-spin text-blue-600" : ""} />
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
        
        {/* 🚀 SMOOTH STOCK TICKER */}
        <div className="px-4 py-1.5 flex items-center overflow-hidden bg-white w-full border-t border-slate-50 ticker-container">
          <div className="font-mono font-bold text-[10px] text-slate-400 pr-4 border-r border-slate-200 shrink-0 z-10 bg-white">LIVE FEED:</div>
          <div className="flex-1 overflow-hidden relative flex items-center ticker-fade h-5 shrink">
            <div className="flex animate-ticker w-max">
              {tickerContent}
              {tickerContent}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden">
          <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Server size={14} className="text-slate-400"/>
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Asset Hierarchy</span>
          </div>
          <div className="flex-1 overflow-y-auto industrial-scroll p-2 space-y-2">
            {NODE_MAP.map(node => {
              const isActive = selectedNode === node.uuid;
              const activeData = liveNodes.find(n => n.node_id === node.uuid) || {};
              const online = isNodeOnline(activeData, false);
              
              return (
                <button 
                  key={node.modbusId} 
                  onClick={() => setSelectedNode(node.uuid)}
                  className={`w-full flex flex-col p-3 rounded-sm transition-all duration-300 border ${isActive ? 'bg-slate-900 border-slate-800 shadow-md translate-x-1' : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full shadow-sm ${online ? 'bg-emerald-400' : 'bg-red-500'} ${isActive && online ? 'animate-pulse' : ''}`}></div>
                      <span className={`text-[11px] font-bold transition-colors ${isActive ? 'text-white' : 'text-slate-700'}`}>{node.label}</span>
                    </div>
                    <span className={`text-[9px] font-mono transition-colors ${isActive ? 'text-teal-400' : 'text-slate-400'}`}>{node.short}</span>
                  </div>

                  {/* 🚀 MASSIVE LIVE UNITS DISPLAY */}
                  <div className={`w-full mt-3 p-2 rounded flex flex-col text-left border ${isActive ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                     <span className={`text-[8px] font-black uppercase tracking-widest ${isActive ? 'text-slate-400' : 'text-slate-400'}`}>Total Units</span>
                     <span className={`font-mono text-lg font-black ${isActive ? 'text-teal-400' : 'text-blue-600'}`}>
                        {online ? parseFloat(activeData.total_energy || 0).toLocaleString(undefined, {maximumFractionDigits:0}) : '---'} 
                        <span className={`text-[10px] ml-1 ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>kWh</span>
                     </span>
                  </div>

                  {/* Micro Metrics */}
                  <div className="grid grid-cols-4 gap-1 w-full mt-2">
                     <div className="flex flex-col text-left">
                       <span className={`text-[7px] font-black uppercase tracking-widest ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>Load</span>
                       <span className={`text-[9px] font-mono font-bold ${online ? (isActive ? 'text-white' : 'text-slate-800') : 'text-slate-400'}`}>{online ? (activeData.active_power/1000).toFixed(1) : '0.0'}</span>
                     </div>
                     <div className="flex flex-col text-left">
                       <span className={`text-[7px] font-black uppercase tracking-widest ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>Volts</span>
                       <span className={`text-[9px] font-mono font-bold ${online ? (isActive ? 'text-white' : 'text-slate-600') : 'text-slate-400'}`}>{online ? parseFloat(activeData.voltage).toFixed(0) : '0'}</span>
                     </div>
                     <div className="flex flex-col text-left">
                       <span className={`text-[7px] font-black uppercase tracking-widest ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>Amps</span>
                       <span className={`text-[9px] font-mono font-bold ${online ? (isActive ? 'text-white' : 'text-slate-600') : 'text-slate-400'}`}>{online ? parseFloat(activeData.current).toFixed(1) : '0.0'}</span>
                     </div>
                     <div className="flex flex-col text-left">
                       <span className={`text-[7px] font-black uppercase tracking-widest ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>PF</span>
                       <span className={`text-[9px] font-mono font-bold ${online ? (isActive ? 'text-white' : 'text-slate-600') : 'text-slate-400'}`}>{online ? parseFloat(activeData.power_factor).toFixed(2) : '0.00'}</span>
                     </div>
                  </div>
                </button>
              )
            })}
          </div>

          {debugLog && (
             <div className="bg-slate-900 border-t border-slate-800 p-3 shadow-sm font-mono text-[8px] text-slate-300 shrink-0">
               <h3 className="text-teal-400 font-bold mb-2">CLOCK DRIFT DEBUG</h3>
               <div className="flex justify-between mb-1"><span>Vercel UTC:</span><span>{debugLog.serverTime}</span></div>
               <div className="flex justify-between mb-1"><span>ESP32 Time:</span><span>{debugLog.espTime}</span></div>
               <div className="flex justify-between"><span>Math Diff:</span><span className={Math.abs(debugLog.diff) > 300000 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>{debugLog.diff} ms</span></div>
             </div>
          )}
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
          
          {isGraphExpanded && <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm"></div>}

          {/* ANIMATED TAB SYSTEM */}
          <div className="flex bg-white border-b border-slate-200 px-4 pt-3 gap-6 shrink-0 relative">
            <button onClick={() => setActiveTab('VCR')} className={`pb-2.5 text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 ${activeTab === 'VCR' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
              <PlayCircle size={12} className={activeTab === 'VCR' ? 'text-teal-500' : ''}/> VCR Playback
            </button>
            <button onClick={() => setActiveTab('HEATMAP')} className={`pb-2.5 text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 ${activeTab === 'HEATMAP' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
              <CalendarDays size={12} className={activeTab === 'HEATMAP' ? 'text-blue-500' : ''}/> Unit Density
            </button>
            <button onClick={() => setActiveTab('OUTAGE')} className={`pb-2.5 text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 ${activeTab === 'OUTAGE' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
              <AlertTriangle size={12} className={activeTab === 'OUTAGE' ? 'text-red-500' : ''}/> Blackout Logs
            </button>
            
            <div className="absolute bottom-0 h-0.5 bg-slate-900 transition-all duration-300 ease-out" style={{ 
                width: activeTab === 'VCR' ? '90px' : activeTab === 'HEATMAP' ? '95px' : '105px', 
                left: activeTab === 'VCR' ? '16px' : activeTab === 'HEATMAP' ? '130px' : '249px' 
            }} />
          </div>

          <div className="flex-1 overflow-y-auto p-4 industrial-scroll relative">
            
            {/* TAB 1: VCR MASTER GRAPH */}
            {activeTab === 'VCR' && (
              <div className={`flex flex-col gap-4 transition-all duration-300 ${isGraphExpanded ? 'fixed inset-6 z-[110]' : 'h-full'}`}>
                
                <div className="bg-white border border-slate-200 shadow-sm flex flex-col rounded-sm h-full w-full">
                  <div className="p-4 border-b border-slate-100 flex flex-col gap-4 shrink-0">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 w-full">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-3">Enterprise Telemetry Engine</h2>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <div className="text-[10px] px-2 py-0.5 rounded-sm font-bold bg-slate-900 text-white flex items-center gap-2 shadow-sm">
                            <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse"></span>
                            {NODE_MAP.find(n => n.uuid === selectedNode)?.short} - ISOLATED VECTOR
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3">
                        <select value={graphType} onChange={(e) => setGraphType(e.target.value)} className="text-[11px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-sm px-2 py-1 outline-none shadow-sm cursor-pointer hover:bg-slate-200 transition-colors">
                          <option value="smooth">Smooth Wave</option>
                          <option value="line">Sharp Line</option>
                          <option value="step">Ladder (Step)</option>
                          <option value="bar">Sticks (Bar)</option>
                          <option value="scatter">Scatter Plot</option>
                        </select>

                        <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)} className="text-[11px] font-mono font-bold bg-slate-900 text-teal-400 border border-slate-800 rounded-sm px-2 py-1 outline-none shadow-sm cursor-pointer hover:bg-slate-800 transition-colors">
                          <option value="power">Active Power (kW)</option>
                          <option value="voltage">Line Voltage (V)</option>
                          <option value="current">Amperage Current (A)</option>
                          <option value="pf">Power Factor (PF)</option>
                          <option value="freq">Utility Frequency (Hz)</option>
                        </select>
                        <button onClick={() => setIsGraphExpanded(!isGraphExpanded)} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-sm transition-colors border border-slate-200 shadow-sm active:scale-95">
                          {isGraphExpanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 w-full">
                      <div className="flex items-center gap-1 text-[10px] font-mono">
                        <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border border-slate-200 rounded-sm px-1.5 py-1" />
                        <span className="text-slate-400 font-bold">TO</span>
                        <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border border-slate-200 rounded-sm px-1.5 py-1" />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 w-full p-2 relative pb-4 min-h-[300px]">
                    {nodeData.length > 0 ? (
                      // @ts-ignore
                      <ReactECharts ref={chartRef} option={vcrChartOptions} style={{ height: '100%', width: '100%' }} notMerge={true} lazyUpdate={true} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-mono text-[10px] uppercase">Awaiting Timeseries Vector</div>
                    )}
                  </div>
                  
                  <div className="p-3 border-t border-slate-100 bg-slate-50 flex flex-wrap justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-white p-1 rounded-sm border border-slate-200 shadow-sm">
                        <button onClick={handleResetScrubber} className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-sm active:scale-95 transition-transform"><SkipBack size={16}/></button>
                        <button onClick={() => setIsPlaying(!isPlaying)} className={`p-1 rounded-sm shadow-sm border transition-all active:scale-95 ${isPlaying ? 'bg-teal-50 text-teal-600 border-teal-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                          {isPlaying ? <Pause size={16}/> : <Play size={16}/>}
                        </button>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white border border-slate-200 px-2 py-1.5 rounded-sm">
                        <FastForward size={14}/>
                        <select value={playbackSpeed} onChange={(e)=>setPlaybackSpeed(Number(e.target.value))} className="bg-transparent outline-none cursor-pointer text-slate-900 border-b border-slate-300 ml-1">
                          <option value={0.5}>0.5x</option>
                          <option value={1}>1.0x</option>
                          <option value={2}>2.0x</option>
                          <option value={5}>5.0x</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="flex gap-6">
                      <div className="flex flex-col text-right">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Peak Extrema</span>
                        <span className="font-mono text-sm font-black text-slate-800">{vcrKPIs.peak.toFixed(2)} <span className="text-[9px] text-slate-400">{METRICS_CONFIG[selectedMetric].unit}</span></span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Low Extrema</span>
                        <span className="font-mono text-sm font-black text-slate-800">{vcrKPIs.low.toFixed(2)} <span className="text-[9px] text-slate-400">{METRICS_CONFIG[selectedMetric].unit}</span></span>
                      </div>
                    </div>
                  </div>
                  
                </div>
              </div>
            )}

            {/* TAB 2: UNIT DENSITY (HEATMAP) */}
            {activeTab === 'HEATMAP' && (
              <div className="flex flex-col lg:flex-row gap-4 h-full animate-in fade-in zoom-in-95 duration-300">
                <div className="flex-[7] bg-white border border-slate-200 rounded-sm shadow-sm p-4 flex flex-col min-h-[450px]">
                  <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><CalendarDays size={14} className="text-blue-500"/> Aggregation Matrix</h3>
                    <div className="flex flex-wrap items-center gap-2">
                       <div className="flex bg-slate-100 p-0.5 rounded-sm border border-slate-200 mr-2">
                         <button onClick={() => setHeatmapView('MONTH')} className={`px-3 py-1.5 text-[9px] font-bold rounded-sm uppercase tracking-wider transition-all duration-200 ${heatmapView === 'MONTH' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}>MONTH</button>
                         <button onClick={() => setHeatmapView('YEAR')} className={`px-3 py-1.5 text-[9px] font-bold rounded-sm uppercase tracking-wider transition-all duration-200 ${heatmapView === 'YEAR' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}>YEAR</button>
                       </div>

                       {heatmapView === 'MONTH' && (
                         <select value={heatmapVisual} onChange={(e) => setHeatmapVisual(e.target.value)} className="text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-sm px-1.5 py-1.5 outline-none shadow-sm cursor-pointer hover:bg-slate-200 transition-colors">
                           <option value="bars">Micro Bars</option>
                           <option value="solid">Thermal (Solid)</option>
                           <option value="line">Sparklines</option>
                           <option value="dots">Matrix Dots</option>
                         </select>
                       )}
                       
                       <select value={heatmapMetric} onChange={(e) => setHeatmapMetric(e.target.value)} className="text-[9px] font-mono font-bold bg-slate-900 text-teal-400 border border-slate-800 rounded-sm px-1.5 py-1.5 outline-none shadow-sm cursor-pointer hover:bg-slate-800 transition-colors">
                         <option value="energy">Units Consumed (kWh)</option>
                         <option value="power">Active Power (kW)</option>
                         <option value="voltage">Line Voltage (V)</option>
                         <option value="current">Amperage Current (A)</option>
                         <option value="pf">Power Factor (PF)</option>
                         <option value="freq">Utility Freq (Hz)</option>
                       </select>

                       {heatmapView === 'MONTH' ? (
                         <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                           <button onClick={() => setCalendarMonthOffset(prev => prev - 1)} className="p-1 hover:bg-slate-100 rounded-sm text-slate-500 border border-slate-200 transition-colors active:scale-95"><ChevronLeft size={12}/></button>
                           <span className="text-[9px] font-bold text-slate-700 w-16 text-center uppercase tracking-widest bg-slate-50 rounded-sm border border-slate-100 py-1">
                             {new Date(new Date().setMonth(new Date().getMonth() + calendarMonthOffset)).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                           </span>
                           <button onClick={() => setCalendarMonthOffset(prev => prev + 1)} disabled={calendarMonthOffset >= 0} className="p-1 hover:bg-slate-100 rounded-sm text-slate-500 disabled:opacity-30 border border-slate-200 transition-colors active:scale-95"><ChevronRight size={12}/></button>
                         </div>
                       ) : (
                         <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                           <button onClick={() => setCalendarYear(prev => prev - 1)} className="p-1 hover:bg-slate-100 rounded-sm text-slate-500 border border-slate-200 transition-colors active:scale-95"><ChevronLeft size={12}/></button>
                           <span className="text-[10px] font-mono font-bold text-slate-700 w-16 text-center tracking-widest bg-slate-50 rounded-sm border border-slate-100 py-1">{calendarYear}</span>
                           <button onClick={() => setCalendarYear(prev => prev + 1)} disabled={calendarYear >= new Date().getFullYear()} className="p-1 hover:bg-slate-100 rounded-sm text-slate-500 disabled:opacity-30 border border-slate-200 transition-colors active:scale-95"><ChevronRight size={12}/></button>
                         </div>
                       )}
                    </div>
                  </div>
                  <div className="flex-1 relative w-full flex items-center justify-center">
                    {heatmapView === 'MONTH' ? (
                      <HeatmapGrid historicalData={heatmapData} monthOffset={calendarMonthOffset} onDateSelect={setSelectedDate} selectedDate={selectedDate} selectedMetric={heatmapMetric} visualType={heatmapVisual} />
                    ) : (
                      // 🚀 EXACT GITHUB CALENDAR WIDGET
                      <div className="w-full h-full relative flex flex-col justify-center">
                         <div className="absolute top-2 right-4 text-[9px] font-mono text-slate-400">Click block to view archive</div>
                         {/* @ts-ignore */}
                         <ReactECharts option={yearlyChartOptions} onEvents={onYearCalendarClick} style={{ height: '220px', width: '100%' }} notMerge={true} lazyUpdate={true} />
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex-[3] flex flex-col gap-4">
                  <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Zap size={100}/></div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">
                      {heatmapMetric === 'energy' ? 'Maximum Daily kWh' : 'Maximum Daily Peak'}
                    </div>
                    <div className="font-mono text-4xl font-black text-slate-800 relative z-10">
                      {(heatmapView === 'MONTH' ? heatmapData : yearHeatmapData).length 
                        ? Math.max(...(heatmapView === 'MONTH' ? heatmapData : yearHeatmapData).map((d:any)=>parseFloat(d[METRICS_CONFIG[heatmapMetric].key])||0)).toFixed(1) 
                        : 0} 
                      <span className="text-sm text-slate-400 ml-1">{METRICS_CONFIG[heatmapMetric].unit}</span>
                    </div>
                  </div>
                  <div className="bg-teal-50 border border-teal-200 p-4 rounded-sm flex items-start gap-3 shadow-sm">
                    <ShieldCheck size={18} className="text-teal-600 shrink-0 mt-0.5"/>
                    <p className="text-[11px] font-bold text-teal-800 leading-relaxed">Click any block in the matrix to drill-down into the raw 24-hour telemetry archive.</p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: OUTAGE LOGS & TIMELINE */}
            {activeTab === 'OUTAGE' && (
              <div className="flex flex-col gap-4 h-full animate-in fade-in zoom-in-95 duration-300">
                <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm flex flex-col sm:flex-row items-center justify-between shrink-0 gap-4">
                  <div>
                    <h3 className="text-slate-800 text-lg font-black tracking-tight">SLA UPTIME & BLACKOUT VECTOR</h3>
                    <p className="text-slate-400 text-[10px] font-mono uppercase tracking-widest mt-1">Floor Isolated Diagnostics (&gt; 2 Min Drops)</p>
                  </div>
                  <div className="text-right flex items-center gap-4 border-l border-slate-200 pl-6">
                    <div className="flex flex-col pl-4">
                       <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Detected Drops</span>
                       <div className="text-amber-500 font-black text-3xl font-mono">{blackoutLogs.length}</div>
                    </div>
                  </div>
                </div>
                
                <div className="h-48 bg-white border border-slate-200 rounded-sm shadow-sm p-2 shrink-0">
                   {nodeData.length > 0 ? (
                      // @ts-ignore
                      <ReactECharts option={outageChartOptions} style={{ height: '100%', width: '100%' }} notMerge={true} lazyUpdate={true} />
                   ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-mono text-slate-400 uppercase tracking-widest">Awaiting Outage Data</div>
                   )}
                </div>
                
                <div className="flex-1 bg-white border border-slate-200 rounded-sm shadow-sm flex flex-col min-h-[200px] overflow-hidden relative">
                  <div className="grid grid-cols-4 gap-4 p-3 bg-slate-50 border-b border-slate-200 shrink-0">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-4">System Dropout</div>
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Uplink Restored</div>
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Duration Gap</div>
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Severity Code</div>
                  </div>
                

                  <div className="flex-1 overflow-y-auto industrial-scroll p-0 relative">
    {blackoutLogs.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 py-10">
        <CheckCircle2 size={32} className="text-emerald-400 mb-3 opacity-80"/>
        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-slate-500">Zero Prolonged Blackouts Detected</p>
        <p className="text-[9px] mt-2 opacity-60 text-blue-500 font-bold tracking-widest uppercase">Permanent Database Ledger</p>
      </div>
    ) : (
                      <div className="divide-y divide-slate-100">
                        {blackoutLogs.map(log => (
                          <div key={log.id} className="grid grid-cols-4 gap-4 p-3 hover:bg-slate-50 transition-colors items-center">
                            <div className="text-[11px] font-mono font-bold text-slate-800 pl-4 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                              {log.start.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })}
                            </div>
                            <div className="text-[11px] font-mono text-slate-600">
                              {log.end.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })}
                            </div>
                            <div className="text-[11px] font-mono font-bold text-slate-800 text-right">
                              {log.durationMins} Mins
                            </div>
                            <div className="text-center">
                              <span className={`text-[9px] font-black px-2 py-1 rounded-sm ${
                                log.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                                log.severity === 'MAJOR' ? 'bg-orange-100 text-orange-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>{log.severity}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  )
}