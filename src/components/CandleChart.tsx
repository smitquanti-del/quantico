import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Candle } from '@/types';
import {
  ChevronsRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Activity,
  Zap,
  TrendingUp,
  Layers,
  Clock,
  Bell,
  SlidersHorizontal,
} from 'lucide-react';
import { calculateAutoTrendlines, type ChartStructureResult } from '@/lib/trendlineEngine';

interface CandleChartProps {
  candles: Candle[];
  activeId?: number;
  symbol: string;
  precision?: number;
  onForceAnalysis?: () => void;
  isAnalyzing?: boolean;
}

export function CandleChart({
  candles,
  activeId = 76,
  symbol,
  precision = 5,
  onForceAnalysis,
  isAnalyzing = false,
}: CandleChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Estados de controle e navegação (Zoom e Pan)
  const [visibleCount, setVisibleCount] = useState<number>(36); // Velas com espaço perfeito e limpo
  const [panOffset, setPanOffset] = useState<number>(0);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);

  // Controles de Marcadores Automáticos de Linhas (LTA/LTB, Canais, Níveis)
  const [showAutoLines, setShowAutoLines] = useState<boolean>(true);
  const [lineFilter, setLineFilter] = useState<'ALL' | 'TREND' | 'CHANNELS' | 'LEVELS'>('ALL');

  // Relógio regressivo de Purchase Time (00:XX) para o fechamento da vela M1
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const sec = 60 - (Math.floor(Date.now() / 1000) % 60);
    return sec === 60 ? 0 : sec;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const sec = 60 - (Math.floor(Date.now() / 1000) % 60);
      setSecondsRemaining(sec === 60 ? 0 : sec);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Cotação e dados em tempo real
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);

  // Cálculo memoizado das estruturas de linhas automáticas
  const structure = useMemo<ChartStructureResult>(() => {
    return calculateAutoTrendlines(candles);
  }, [candles]);

  // Escuta o stream em tempo real SSE
  useEffect(() => {
    const eventSource = new EventSource(`/api/stream?activeId=${activeId}`);

    eventSource.addEventListener('candle', (event) => {
      try {
        const c: Candle = JSON.parse(event.data);
        if (c && !isNaN(c.close)) {
          setCurrentPrice(c.close);
          setPriceChange(c.close - c.open);
        }
      } catch {
        // ignore
      }
    });

    return () => {
      eventSource.close();
    };
  }, [activeId]);

  // Atualiza preço baseado na última vela disponível
  useEffect(() => {
    if (candles.length > 0) {
      const last = candles[candles.length - 1];
      setCurrentPrice(last.close);
      setPriceChange(last.close - last.open);
    }
  }, [candles]);

  // Handlers de interação com o mouse e touch (Zoom com Scroll e Pan com Arrastar)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 2 : -2;
    setVisibleCount((prev) => Math.min(60, Math.max(14, prev + delta)));
  }, []);

  const handleZoomIn = useCallback(() => {
    setVisibleCount((prev) => Math.max(14, prev - 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setVisibleCount((prev) => Math.min(60, prev + 3));
  }, []);

  // Redireciona imediatamente para o preço atual (panOffset = 0)
  const handleRedirectToCurrentPrice = useCallback(() => {
    setPanOffset(0);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }

      if (isDragging) {
        const deltaX = e.clientX - dragStartX;
        if (Math.abs(deltaX) > 6) {
          const candleDelta = Math.round(deltaX / 12);
          setPanOffset((prev) => Math.max(0, Math.min(candles.length - visibleCount, prev + candleDelta)));
          setDragStartX(e.clientX);
        }
      }
    },
    [isDragging, dragStartX, candles.length, visibleCount],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
    setMousePos(null);
  }, []);

  // Suporte a toque no celular / tablet (touch drag)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStartX(e.touches[0].clientX);
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - dragStartX;
        if (Math.abs(deltaX) > 6) {
          const candleDelta = Math.round(deltaX / 12);
          setPanOffset((prev) => Math.max(0, Math.min(candles.length - visibleCount, prev + candleDelta)));
          setDragStartX(e.touches[0].clientX);
        }
      }
    },
    [isDragging, dragStartX, candles.length, visibleCount],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ─── DESENHO CENTRAL NO CANVAS (COM FOOTPRINT CLUSTERS E GOCHARTING) ────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resolução Retina HD
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const chartWidth = rect.width;
    const chartHeight = rect.height;
    const priceBarWidth = 75;
    const timeBarHeight = 24;
    const mainWidth = chartWidth - priceBarWidth;
    const mainHeight = chartHeight - timeBarHeight;

    // Fundo escuro fosco profundo
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, chartWidth, chartHeight);

    if (candles.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Aguardando dados de mercado...', chartWidth / 2, chartHeight / 2);
      return;
    }

    // Janela de velas visíveis
    const totalCandles = candles.length;
    const count = Math.min(visibleCount, totalCandles);
    const maxPan = Math.max(0, totalCandles - count);
    const safePan = Math.min(maxPan, panOffset);
    const startIdx = Math.max(0, totalCandles - count - safePan);
    const endIdx = Math.min(totalCandles, startIdx + count);
    const visibleCandles = candles.slice(startIdx, endIdx);

    if (visibleCandles.length === 0) return;

    // Cálculo da escala de preço (Mínimo e Máximo)
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    visibleCandles.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    });

    // Margem vertical para acomodar os números do topo e do fundo
    const priceMargin = (maxPrice - minPrice) * 0.18 || 0.0006;
    minPrice -= priceMargin;
    maxPrice += priceMargin;
    const priceRange = maxPrice - minPrice;

    // Funções de Projeção X / Y
    const getX = (idx: number) => {
      const slotWidth = mainWidth / visibleCandles.length;
      return idx * slotWidth + slotWidth / 2;
    };

    const getY = (price: number) => {
      return mainHeight - ((price - minPrice) / priceRange) * mainHeight;
    };

    const getPriceFromY = (y: number) => {
      return maxPrice - (y / mainHeight) * priceRange;
    };

    const slotWidth = mainWidth / visibleCandles.length;
    const candleWidth = Math.max(8, Math.min(24, slotWidth * 0.58));

    // ─── 1. GRADE HORIZONTAL (PREÇOS) ─────────────────────────────────────────
    const priceSteps = 6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    for (let i = 0; i <= priceSteps; i++) {
      const p = minPrice + (priceRange / priceSteps) * i;
      const y = getY(p);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(mainWidth, y);
      ctx.stroke();

      // Rótulo de preço à direita
      ctx.fillStyle = '#8492a6';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(p.toFixed(precision), mainWidth + 6, y + 3.5);
    }

    // ─── 2. GRADE VERTICAL (TEMPO) ────────────────────────────────────────────
    const timeStep = Math.max(1, Math.floor(visibleCandles.length / 6));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (let i = 0; i < visibleCandles.length; i += timeStep) {
      const x = getX(i);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mainHeight);
      ctx.stroke();

      const d = new Date(visibleCandles[i].time * 1000);
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(
        d.getMinutes()
      ).padStart(2, '0')}`;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, x, mainHeight - 6);
    }

    // ─── 3. VELAS CANDLESTICK LIMPAS (M1) ───────────────────────────────────
    visibleCandles.forEach((c, i) => {
      const x = getX(i);
      const isGreen = c.close >= c.open;
      const openY = getY(c.open);
      const closeY = getY(c.close);
      const highY = getY(c.high);
      const lowY = getY(c.low);

      const topY = Math.min(openY, closeY);
      const bodyH = Math.max(2, Math.abs(closeY - openY));

      const candleColor = isGreen ? '#0ecb81' : '#e05338';

      // 1. Pavio da vela
      ctx.strokeStyle = candleColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // 2. Corpo retangular da vela
      ctx.fillStyle = candleColor;
      const left = Math.round(x - candleWidth / 2);
      ctx.fillRect(left, Math.round(topY), Math.round(candleWidth), Math.round(bodyH));
    });

    // ─── 3.1. LINHAS DE TENDÊNCIA AUTOMÁTICAS (LTA / LTB / CANAIS / NÍVEIS) ──
    if (showAutoLines && structure.lines.length > 0) {
      structure.lines.forEach((line) => {
        // Filtragem por seletor
        if (lineFilter === 'TREND' && line.type !== 'LTA' && line.type !== 'LTB' && line.type !== 'PULLBACK_MICRO') return;
        if (lineFilter === 'CHANNELS' && line.type !== 'CHANNEL_TOP' && line.type !== 'CHANNEL_BOTTOM') return;
        if (lineFilter === 'LEVELS' && line.type !== 'HORIZONTAL_LEVEL') return;

        // Projeta coordenadas X
        const x1 = (line.startIndex - startIdx) * slotWidth + slotWidth / 2;
        const x2 = (line.endIndex - startIdx) * slotWidth + slotWidth / 2;
        const y1 = getY(line.startPrice);
        const y2 = getY(line.endPrice);

        ctx.save();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.width;
        if (line.dashed) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Nós de ancoragem nos pivôs (círculo azul vibrante com anel branco como nas imagens)
        if (line.type === 'LTA' || line.type === 'LTB' || line.type === 'PULLBACK_MICRO') {
          if (x1 >= 0 && x1 <= mainWidth) {
            ctx.fillStyle = '#2688eb';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x1, y1, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }

        // Rótulo ou badge de alerta para Nível Horizontal na régua lateral
        if (line.type === 'HORIZONTAL_LEVEL' && line.alertPrice !== undefined) {
          const alertY = getY(line.alertPrice);
          if (alertY >= 10 && alertY <= mainHeight - 10) {
            ctx.save();
            ctx.fillStyle = 'rgba(14, 165, 233, 0.9)';
            ctx.beginPath();
            ctx.roundRect(mainWidth - 84, alertY - 8, 80, 16, 3);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`🔔 ${line.alertPrice.toFixed(precision > 2 ? 4 : 2)}`, mainWidth - 44, alertY + 3.5);
            ctx.restore();
          }
        }

        ctx.restore();
      });
    }

    // ─── 3.2. ETIQUETAS DE TOPO E FUNDO EXTREMOS (Pílulas cinzas estilo imagens) ─
    if (showAutoLines && structure.extremes.length > 0) {
      structure.extremes.forEach((ext) => {
        if (ext.candleIndex >= startIdx && ext.candleIndex < endIdx) {
          const x = getX(ext.candleIndex - startIdx);
          const y = getY(ext.price);

          ctx.save();
          const pillW = 68;
          const pillH = 16;
          const pillX = x - pillW / 2;
          const pillY = ext.type === 'TOP' ? y - pillH - 6 : y + 6;

          // Caixa cinza translúcida com borda sutil
          ctx.fillStyle = 'rgba(30, 41, 59, 0.88)';
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillW, pillH, 4);
          ctx.fill();
          ctx.stroke();

          // Texto com a cotação exata
          ctx.fillStyle = '#f1f5f9';
          ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(ext.label, x, pillY + 11.5);
          ctx.restore();
        }
      });
    }

    // ─── 4. LINHA DA COTAÇÃO ATUAL ────────────────────────────────────────────
    if (currentPrice !== null) {
      const curY = getY(currentPrice);
      if (curY >= 0 && curY <= mainHeight) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, curY);
        ctx.lineTo(mainWidth, curY);
        ctx.stroke();
        ctx.restore();

        // Badge de preço na régua lateral
        ctx.save();
        ctx.fillStyle = '#1677ff';
        ctx.roundRect(mainWidth, curY - 10, priceBarWidth, 20, 3);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(currentPrice.toFixed(precision), mainWidth + 6, curY + 4);
        ctx.restore();
      }
    }

    // ─── 4.1. LINHA VERTICAL DE EXPIRAÇÃO & PURCHASE TIME (Fiel às Imagens) ───
    const lastVisibleIdx = visibleCandles.length - 1;
    const lastCandleX = getX(lastVisibleIdx);
    const expirationX = lastCandleX + slotWidth;

    if (expirationX >= 0 && expirationX <= mainWidth + 30) {
      ctx.save();

      // 1. Linha vertical tracejada branca de Purchase Time na vela ativa
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lastCandleX, 18);
      ctx.lineTo(lastCandleX, mainHeight);
      ctx.stroke();

      // Cabeçalho no topo da linha: PURCHASE TIME 00:XX
      const timeRemainingStr = `00:${String(secondsRemaining).padStart(2, '0')}`;
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`PURCHASE TIME ${timeRemainingStr}`, lastCandleX, 14);

      // Ícone / badge de relógio no rodapé da linha
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(lastCandleX - 16, mainHeight - 20, 32, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`⏱`, lastCandleX, mainHeight - 8.5);

      // 2. Linha vertical sólida vermelha de Expiração à frente da vela atual
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(224, 83, 56, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(expirationX, 0);
      ctx.lineTo(expirationX, mainHeight);
      ctx.stroke();

      // Bandeira de expiração no topo da linha vermelha
      ctx.fillStyle = '#e05338';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('🏁', expirationX, 12);

      // 3. Pílula/Cápsula 00:XX sobre a linha na altura da cotação atual
      if (currentPrice !== null) {
        const curY = getY(currentPrice);
        if (curY >= 10 && curY <= mainHeight - 10) {
          const capW = 46;
          const capH = 18;
          const capX = expirationX - capW / 2;
          const capY = curY - capH / 2;

          ctx.fillStyle = secondsRemaining <= 10 ? '#e05338' : '#0ecb81';
          ctx.beginPath();
          ctx.roundRect(capX, capY, capW, capH, 9);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(timeRemainingStr, expirationX, curY + 3.5);
        }
      }

      ctx.restore();
    }

    // ─── 5. RETÍCULA DO MOUSE (CROSSHAIR) ─────────────────────────────────────
    if (mousePos && mousePos.x <= mainWidth && mousePos.y <= mainHeight) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, mainHeight);
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(mainWidth, mousePos.y);
      ctx.stroke();

      const hoverPrice = getPriceFromY(mousePos.y);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
      ctx.fillRect(mainWidth, mousePos.y - 9, priceBarWidth, 18);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(hoverPrice.toFixed(precision), mainWidth + 5, mousePos.y + 3.5);
    }
  }, [
    candles,
    visibleCount,
    panOffset,
    mousePos,
    currentPrice,
    precision,
    showAutoLines,
    lineFilter,
    structure,
    secondsRemaining,
  ]);

  return (
    <div className="bg-[#0a0d14] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Header do Gráfico com Controles de Linhas e Confluência */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#070a10] border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/80 flex items-center justify-center text-sky-400 font-bold font-mono text-sm">
            M1
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black font-mono tracking-wider text-white">
                {symbol}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                VELAS 1M
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-sky-950/60 text-sky-400 border border-sky-800/40">
                OTC
              </span>
              {/* Badge Dinâmico de Sincronização de Linhas / Nova Vela */}
              <div
                className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-950/70 border border-blue-500/40 text-blue-300 font-mono text-[10px] font-bold"
                title="Pivôs e regiões estruturais atualizados dinamicamente a cada nova vela"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span>⚡ {structure.patternLabel}</span>
                <span className="text-slate-400">({structure.regionsCount} regiões)</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
              <span className="text-emerald-400 font-semibold">Gráfico em Tempo Real</span>
              <span>•</span>
              <span className="text-slate-400">Stream Conectado</span>
              {structure.currentInteraction.touchingLTA && (
                <>
                  <span>•</span>
                  <span className="text-emerald-400 font-bold">Toque em LTA (Suporte)</span>
                </>
              )}
              {structure.currentInteraction.touchingLTB && (
                <>
                  <span>•</span>
                  <span className="text-rose-400 font-bold">Toque em LTB (Resistência)</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Controles de Linhas e Ações Rápidas */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botão de Ativação Linhas Auto ON/OFF */}
          <button
            type="button"
            id="btn-toggle-auto-lines"
            onClick={() => setShowAutoLines((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${
              showAutoLines
                ? 'bg-blue-600/25 border-blue-400/80 text-blue-300 shadow-sm shadow-blue-500/20'
                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Ativar/Desativar marcação automática de Linhas LTA/LTB, canais e suportes"
          >
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
            <span>LINHAS AUTO: {showAutoLines ? 'ON' : 'OFF'}</span>
          </button>

          {/* Filtros Rápidos de Linhas */}
          {showAutoLines && (
            <div className="hidden md:flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setLineFilter('ALL')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                  lineFilter === 'ALL'
                    ? 'bg-blue-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setLineFilter('TREND')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                  lineFilter === 'TREND'
                    ? 'bg-blue-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                LTA/LTB
              </button>
              <button
                type="button"
                onClick={() => setLineFilter('CHANNELS')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                  lineFilter === 'CHANNELS'
                    ? 'bg-blue-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Canais
              </button>
              <button
                type="button"
                onClick={() => setLineFilter('LEVELS')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                  lineFilter === 'LEVELS'
                    ? 'bg-blue-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Níveis
              </button>
            </div>
          )}

          {/* Botão de Forçar Análise no Topo do Gráfico */}
          {onForceAnalysis && (
            <button
              type="button"
              id="btn-chart-force-analysis"
              onClick={onForceAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-amber-400/80 bg-gradient-to-r from-amber-500/25 via-amber-400/20 to-sky-500/25 hover:from-amber-500/35 hover:to-sky-500/35 text-amber-300 text-xs font-mono font-black transition-all cursor-pointer shadow-md shadow-amber-500/10 active:scale-95 disabled:opacity-50"
              title="Forçar o robô a analisar confluência de LTA/LTB + Ticks para os 00s"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-400 ${isAnalyzing ? 'animate-spin' : 'animate-pulse'}`} />
              <span>{isAnalyzing ? 'ANALISANDO ESTRATÉGIA...' : 'FORÇAR ANÁLISE COM A ESTRATÉGIA'}</span>
            </button>
          )}

          {/* Botão de Redirecionamento no Header se estiver no passado */}
          {panOffset > 0 && (
            <button
              type="button"
              id="btn-header-redirect-to-current"
              onClick={handleRedirectToCurrentPrice}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-sky-400/80 bg-sky-500/25 text-sky-300 text-xs font-mono font-bold animate-pulse hover:bg-sky-400 hover:text-slate-950 transition-all cursor-pointer shadow-md shadow-sky-500/20"
              title="Redirecionar para a vela e preço atual em tempo real"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
              <span>IR AO PREÇO ATUAL (-{panOffset})</span>
            </button>
          )}

          {/* Cotação Atual */}
          {currentPrice !== null && (
            <div className="flex items-center gap-1.5 ml-1">
              <span
                className={`text-sm font-black font-mono px-2 py-0.5 rounded border ${
                  priceChange >= 0
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                }`}
              >
                {currentPrice.toFixed(precision)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Área do Canvas com o Gráfico */}
      <div
        ref={containerRef}
        className={`relative w-full h-[520px] select-none bg-[#0a0d14] ${
          isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* BOTÃO FLUTUANTE DE REDIRECIONAMENTO AO PREÇO ATUAL */}
        {panOffset > 0 && (
          <div className="absolute bottom-5 right-20 z-30 animate-in fade-in slide-in-from-bottom-3 duration-200">
            <button
              type="button"
              id="btn-floating-redirect-to-current"
              onClick={handleRedirectToCurrentPrice}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-sky-400 via-sky-300 to-indigo-400 hover:brightness-110 text-slate-950 font-mono font-black text-xs shadow-2xl shadow-sky-500/50 border border-white/50 transition-all active:scale-95 cursor-pointer group"
              title="Redirecionar para a vela e preço atual em tempo real"
            >
              <ChevronsRight className="w-4 h-4 text-slate-950 group-hover:translate-x-1 transition-transform" />
              <span>REDIRECIONAR AO PREÇO ATUAL</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-sky-300 font-mono font-bold">
                -{panOffset} velas
              </span>
            </button>
          </div>
        )}

        {/* MINI CONTROLES DE ZOOM E REDIRECIONAMENTO */}
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 bg-[#0e131d]/90 p-1 rounded-xl border border-slate-700/80 shadow-lg backdrop-blur-sm">
          {/* Zoom In (+) */}
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-all active:scale-90 cursor-pointer"
            title="Aproximar Zoom (+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          {/* Zoom Out (-) */}
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-all active:scale-90 cursor-pointer"
            title="Afastar Zoom (-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
          {/* Botão de Redirecionar / Preço Atual */}
          <button
            type="button"
            onClick={handleRedirectToCurrentPrice}
            className={`flex items-center gap-1.5 px-2.5 h-7 rounded-lg font-mono text-[10.5px] font-bold transition-all active:scale-95 cursor-pointer ${
              panOffset > 0
                ? 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-md shadow-sky-500/30 font-black'
                : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
            }`}
            title="Redirecionar para o preço atual (tempo real)"
          >
            <RotateCcw className={`w-3 h-3 ${panOffset > 0 ? 'animate-spin' : ''}`} />
            <span>{panOffset > 0 ? `REDIRECIONAR (-${panOffset})` : 'TEMPO REAL'}</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                panOffset === 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Footer Informativo Limpo */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#070a10] border-t border-slate-800 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-slate-200 font-semibold">{symbol}</span>
          <span>•</span>
          <span className="text-emerald-400 font-semibold">Candlestick M1</span>
          <span>•</span>
          <span className="text-sky-400">Cotação em Tempo Real</span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>Scroll: Zoom</span>
          <span>•</span>
          <span>Arrastar: Histórico</span>
        </div>
      </div>
    </div>
  );
}

