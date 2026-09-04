import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Candle } from '@/types';
import {
  ChevronsRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Activity,
  Layers,
  Zap,
} from 'lucide-react';
import { generateCandleClusters, type CandleClusterData } from '@/lib/gochartingCluster';

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
  const [visibleCount, setVisibleCount] = useState<number>(26); // Velas com espaço ideal para clusters
  const [panOffset, setPanOffset] = useState<number>(0);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);

  // Toggles de visualização dos indicadores Gocharting
  const [showFootprintClusters, setShowFootprintClusters] = useState<boolean>(true);
  const [showStrategySignals, setShowStrategySignals] = useState<boolean>(true);

  // Cotação e dados em tempo real
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);

  // Geração determinística dos clusters Gocharting Active & Inactive Value
  const candleClusters = useMemo(() => {
    return generateCandleClusters(candles);
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
    const visibleClusters = candleClusters.slice(startIdx, endIdx);

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

    // ─── 3. VELAS CANDLESTICK COM FOOTPRINT CLUSTERS (GOCHARTING) ─────────────
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
      const cluster = visibleClusters[i];

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

      // ─── 3.1 DESENHO DO INDICADOR DE CLUSTER FOOTPRINT (IDÊNTICO À IMAGEM) ───
      if (showFootprintClusters && cluster) {
        const fontSize = visibleCount > 38 ? 8 : 9.5;
        ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;

        // A. Valores no topo do pavio superior (Bullish verde / Bearish vermelho)
        ctx.fillStyle = '#22c55e';
        ctx.textAlign = 'right';
        ctx.fillText(`${cluster.topBullishValue}`, x - 2, highY - 14);

        ctx.fillStyle = '#f43f5e';
        ctx.textAlign = 'left';
        ctx.fillText(`${cluster.topBearishValue}`, x + 3, highY - 14);

        // B. Números verticais ao longo do corpo/pavio (Delta / Volume de cada tick)
        // Posicionados à esquerda (compradores em verde) e à direita (vendedores em vermelho)
        const halfW = Math.round(candleWidth / 2);
        cluster.levels.forEach((lvl) => {
          const lvlY = getY(lvl.price);

          // Volume/Delta Comprador (Verde)
          ctx.fillStyle = '#22c55e';
          ctx.textAlign = 'right';
          ctx.fillText(`${lvl.buyVolume}`, x - halfW - 2, lvlY + 3.5);

          // Volume/Delta Vendedor (Vermelho/Coral)
          ctx.fillStyle = '#f43f5e';
          ctx.textAlign = 'left';
          ctx.fillText(`${lvl.sellVolume}`, x + halfW + 2, lvlY + 3.5);
        });

        // C. Valores na base do pavio inferior (Bullish verde / Bearish vermelho)
        ctx.fillStyle = '#22c55e';
        ctx.textAlign = 'right';
        ctx.fillText(`${cluster.bottomBullishValue}`, x - 2, lowY + 14);

        ctx.fillStyle = '#f43f5e';
        ctx.textAlign = 'left';
        ctx.fillText(`${cluster.bottomBearishValue}`, x + 3, lowY + 14);
      }

      // ─── 3.2 SINAIS DA ESTRATÉGIA E FILTROS ANTI-LOSS ──────────────────────
      if (showStrategySignals && cluster) {
        // Marcador de SINAL (CALL ou PUT aos 00s)
        if (cluster.verdict === 'CALL') {
          ctx.save();
          // Pill verde neon
          const badgeY = lowY + (showFootprintClusters ? 28 : 12);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.95)';
          ctx.roundRect(x - 22, badgeY, 44, 16, 4);
          ctx.fill();
          ctx.fillStyle = '#051b11';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('▲ CALL', x, badgeY + 11.5);
          ctx.restore();
        } else if (cluster.verdict === 'PUT') {
          ctx.save();
          // Pill vermelho neon
          const badgeY = highY - (showFootprintClusters ? 32 : 16);
          ctx.fillStyle = 'rgba(244, 63, 94, 0.95)';
          ctx.roundRect(x - 20, badgeY, 40, 16, 4);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('▼ PUT', x, badgeY + 11.5);
          ctx.restore();
        } else if (cluster.verdict === 'BLOCKED_LOSS_FILTER') {
          // Escudo de FILTRO ANTI-LOSS (Mostra que o robô protegeu a banca e não entrou!)
          ctx.save();
          const badgeY = isGreen
            ? highY - (showFootprintClusters ? 30 : 14)
            : lowY + (showFootprintClusters ? 26 : 12);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
          ctx.roundRect(x - 26, badgeY, 52, 15, 4);
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('🛡️ ANTI-LOSS', x, badgeY + 11);
          ctx.restore();
        }

        // Histórico de WIN / LOSS nas velas completas
        if (cluster.result === 'WIN') {
          ctx.save();
          const winY = isGreen ? lowY + (showFootprintClusters ? 46 : 24) : highY - (showFootprintClusters ? 46 : 24);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1;
          ctx.roundRect(x - 18, winY, 36, 14, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('WIN ✓', x, winY + 10.5);
          ctx.restore();
        }
      }
    });

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
    candleClusters,
    visibleCount,
    panOffset,
    mousePos,
    currentPrice,
    precision,
    showFootprintClusters,
    showStrategySignals,
  ]);

  return (
    <div className="bg-[#0a0d14] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Header do Gráfico com Toggles do Indicador Gocharting */}
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
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
              <span className="text-sky-300 font-semibold">Gocharting Power Tick</span>
              <span>•</span>
              <span className="text-emerald-400">Footprint Clusters</span>
            </div>
          </div>
        </div>

        {/* Toggles do Indicador Gocharting & Controles */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle Footprint Clusters (Números das Velas) */}
          <button
            type="button"
            onClick={() => setShowFootprintClusters((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${
              showFootprintClusters
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-sm'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
            title="Ligar ou desligar números de Footprint Cluster nas velas"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>FOOTPRINT CLUSTERS: {showFootprintClusters ? 'LIGADO' : 'DESLIGADO'}</span>
          </button>

          {/* Toggle Sinais & Filtros Anti-Loss */}
          <button
            type="button"
            onClick={() => setShowStrategySignals((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${
              showStrategySignals
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-300 shadow-sm'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
            title="Ligar ou desligar sinais e marcadores de filtro anti-loss"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>SINAIS &amp; FILTROS: {showStrategySignals ? 'LIGADO' : 'DESLIGADO'}</span>
          </button>

          {/* Botão de Forçar Análise no Topo do Gráfico */}
          {onForceAnalysis && (
            <button
              type="button"
              id="btn-chart-force-analysis"
              onClick={onForceAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-amber-400/80 bg-gradient-to-r from-amber-500/25 via-amber-400/20 to-sky-500/25 hover:from-amber-500/35 hover:to-sky-500/35 text-amber-300 text-xs font-mono font-black transition-all cursor-pointer shadow-md shadow-amber-500/10 active:scale-95 disabled:opacity-50"
              title="Forçar o robô a escanear o contexto e gerar sinal imediato com a estratégia"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-400 ${isAnalyzing ? 'animate-spin' : 'animate-pulse'}`} />
              <span>{isAnalyzing ? 'ESCANEANDO CONTEXTO...' : 'FORÇAR ANÁLISE'}</span>
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

      {/* Footer Informativo Gocharting */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#070a10] border-t border-slate-800 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-slate-300 font-semibold">{symbol}</span>
          <span>•</span>
          <span className="text-emerald-400 font-semibold">Números Verdes: Bullish Active</span>
          <span>•</span>
          <span className="text-rose-400 font-semibold">Números Vermelhos: Bearish Active</span>
          <span>•</span>
          <span className="text-amber-400 font-semibold">Filtros Anti-Loss Ativos</span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>Scroll: Zoom</span>
          <span>•</span>
          <span>Arrastar: Histórico</span>
        </div>
      </div>
    </div>
  );
}

