import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { Candle, ActiveEntryAlert } from '@/types';
import {
  calculateAutoTrendLines,
  type TrendLine,
  type ZonasCenariosSignal,
} from '@/lib/zonas-cenarios-fibo-engine';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  GitBranch,
  Crosshair,
  Activity,
  CheckCircle2,
  Flame,
  ChevronsRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';

interface CandleChartProps {
  candles: Candle[];
  activeId?: number;
  symbol: string;
  precision?: number;
  isAnalyzing?: boolean;
  scanStatusText?: string;
  enableTrendLines?: boolean;
  onToggleTrendLines?: () => void;
  // Prop de compatibilidade retroativa:
  enableCommandCandles?: boolean;
  onToggleCommandCandles?: () => void;
  activeSignal?: ZonasCenariosSignal | null;
  activeEntryAlert?: ActiveEntryAlert | null;
  secondsToNextCandle?: number;
}

export function CandleChart({
  candles,
  activeId = 76,
  symbol,
  precision = 5,
  isAnalyzing = false,
  scanStatusText = 'ESCANEANDO VETORES LTA / LTB · MODO VECTOR OTC...',
  enableTrendLines = true,
  onToggleTrendLines,
  enableCommandCandles,
  onToggleCommandCandles,
  activeSignal,
  activeEntryAlert,
  secondsToNextCandle,
}: CandleChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Estado das Linhas de Tendência LTA/LTB (Modo Vector OTC)
  const [showTrendLinesInternal, setShowTrendLinesInternal] = useState<boolean>(true);

  const isTrendLinesActive = enableTrendLines !== undefined ? enableTrendLines : showTrendLinesInternal;

  const handleToggleTrendLines = () => {
    if (onToggleTrendLines) onToggleTrendLines();
    else setShowTrendLinesInternal((prev) => !prev);
  };

  // Estados de controle e navegação (Zoom e Pan)
  const [visibleCount, setVisibleCount] = useState<number>(32); // Velas gordinhas e limpas estilo IQ Option
  const [panOffset, setPanOffset] = useState<number>(0);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);

  // Cotação e dados em tempo real
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);

  // Timer para atualização suave de contagem regressiva
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const isEntryActive = Boolean(
    activeEntryAlert &&
    activeEntryAlert.activeId === activeId &&
    currentTime < activeEntryAlert.expiresAt
  );
  const secondsLeft = activeEntryAlert
    ? Math.max(0, Math.ceil((activeEntryAlert.expiresAt - currentTime) / 1000))
    : 0;

  // Linhas de Tendência LTA e LTB automáticas (Modo Vector OTC)
  const trendLines: TrendLine[] = useMemo(() => {
    if (candles.length === 0) return [];
    return calculateAutoTrendLines(candles);
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
    setVisibleCount((prev) => Math.min(70, Math.max(16, prev + delta)));
  }, []);

  const handleZoomIn = useCallback(() => {
    setVisibleCount((prev) => Math.max(16, prev - 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setVisibleCount((prev) => Math.min(70, prev + 4));
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
          // deltaX > 0 arrasta para a direita (vai para o passado, panOffset aumenta)
          // deltaX < 0 arrasta para a esquerda (vai para a frente / preço atual, panOffset diminui)
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

  // ─── DESENHO CENTRAL NO CANVAS ─────────────────────────────────────────────
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

    // Fundo preto puro / dark matte idêntico à IQ Option da imagem
    ctx.fillStyle = '#0b0e14';
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

    // Inclui preços projetados das Linhas LTA/LTB visíveis na escala se ativadas
    if (isTrendLinesActive && trendLines.length > 0) {
      trendLines.forEach((t) => {
        if (t.currentProjectedPrice < minPrice) minPrice = t.currentProjectedPrice;
        if (t.currentProjectedPrice > maxPrice) maxPrice = t.currentProjectedPrice;
      });
    }

    // Margem vertical
    const priceMargin = (maxPrice - minPrice) * 0.12 || 0.0004;
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
    const candleWidth = Math.max(7, Math.min(26, slotWidth * 0.72));

    // ─── 1. GRADE HORIZONTAL (PREÇOS) ─────────────────────────────────────────
    const priceSteps = 6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    for (let i = 0; i <= priceSteps; i++) {
      const p = minPrice + (priceRange / priceSteps) * i;
      const y = getY(p);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(mainWidth, y);
      ctx.stroke();

      // Rótulo de preço à direita (estilo IQ Option: cinza claro e limpo)
      ctx.fillStyle = '#8492a6';
      ctx.font = '10.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(p.toFixed(precision), mainWidth + 6, y + 3.5);
    }

    // ─── 2. GRADE VERTICAL (TEMPO) ────────────────────────────────────────────
    const timeStep = Math.max(1, Math.floor(visibleCandles.length / 6));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
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

    // ─── 3. LINHAS DE TENDÊNCIA AUXILIARES (LTA E LTB) ────────────────────────
    // Apenas se explicitamente ativado pelo usuário
    if (isTrendLinesActive && trendLines.length > 0) {
      trendLines.forEach((line) => {
        const localIdx1 = line.p1.index - startIdx;
        const localIdx2 = line.p2.index - startIdx;

        const x1 = getX(localIdx1);
        const y1 = getY(line.p1.price);
        const x2 = getX(localIdx2);
        const y2 = getY(line.p2.price);

        const lastLocalIdx = visibleCandles.length - 1;
        const xEnd = getX(lastLocalIdx) + slotWidth * 1.5;
        const currentPriceAtEnd = line.p2.price + line.slope * (totalCandles - 1 - line.p2.index);
        const yEnd = getY(currentPriceAtEnd);

        ctx.save();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 1.8;
        ctx.setLineDash(line.style === 'dashed' ? [6, 4] : []);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();

        // Ponto de ancoragem
        [
          { x: x1, y: y1 },
          { x: x2, y: y2 },
        ].forEach((pt) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = line.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });

        // Etiqueta da Linha projetada à direita
        ctx.setLineDash([]);
        ctx.fillStyle = line.type === 'LTA' ? 'rgba(6, 78, 59, 0.9)' : 'rgba(127, 29, 29, 0.9)';
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 1;
        const badgeX = Math.min(chartWidth - 110, xEnd - 90);
        const badgeY = Math.max(10, Math.min(mainHeight - 24, yEnd - 9));
        ctx.roundRect(badgeX, badgeY, 95, 18, 4);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${line.label}`, badgeX + 47.5, badgeY + 12);
        ctx.restore();
      });
    }

    // ─── 4. DESENHO DAS VELAS CANDLESTICK (ESTILO IQ OPTION: NITIDAS, SÓLIDAS, SEM BRILHO) ─────────────
    visibleCandles.forEach((c, i) => {
      const x = getX(i);
      const isGreen = c.close >= c.open;
      const openY = getY(c.open);
      const closeY = getY(c.close);
      const highY = getY(c.high);
      const lowY = getY(c.low);

      const topY = Math.min(openY, closeY);
      const bodyH = Math.max(2, Math.abs(closeY - openY));

      // Cores idênticas da IQ Option da imagem:
      // Verde: #0ecb81 (vibrante, limpo e sólido)
      // Vermelho: #e05338 (quente, limpo e sólido)
      const candleColor = isGreen ? '#0ecb81' : '#e05338';

      // 1. Pavio (Wick) reto, nítido e sem blur / sem brilho
      ctx.strokeStyle = candleColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // 2. Corpo retangular limpo e sólido (sem cantos arredondados, sem glow, sem reflexo de luz)
      ctx.fillStyle = candleColor;
      const left = Math.round(x - candleWidth / 2);
      ctx.fillRect(left, Math.round(topY), Math.round(candleWidth), Math.round(bodyH));
    });

    // ─── 5. SINAL VISUAL NO GRÁFICO (APENAS NA JANELA DE ENTRADA: "ENTRAR AGORA") ─────
    if (isEntryActive && activeEntryAlert) {
      const lastIdx = visibleCandles.length - 1;
      const targetCandle = visibleCandles[lastIdx];
      if (targetCandle) {
        const arrowX = getX(lastIdx);
        const isCall = activeEntryAlert.verdict === 'CALL';
        const arrowColor = isCall ? '#10b981' : '#ef4444';
        const targetY = isCall
          ? getY(targetCandle.low) + 24
          : getY(targetCandle.high) - 24;

        ctx.save();
        ctx.fillStyle = arrowColor;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.shadowColor = arrowColor;
        ctx.shadowBlur = 18;

        ctx.beginPath();
        if (isCall) {
          // Seta pulsante para cima (COMPRA)
          ctx.moveTo(arrowX, targetY);
          ctx.lineTo(arrowX - 14, targetY + 22);
          ctx.lineTo(arrowX + 14, targetY + 22);
        } else {
          // Seta pulsante para baixo (VENDA)
          ctx.moveTo(arrowX, targetY);
          ctx.lineTo(arrowX - 14, targetY - 22);
          ctx.lineTo(arrowX + 14, targetY - 22);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Badge de ENTRAR AGORA · CALL / PUT
        const textY = isCall ? targetY + 40 : targetY - 32;
        const badgeW = 190;
        ctx.fillStyle = isCall ? 'rgba(6, 78, 59, 0.98)' : 'rgba(127, 29, 29, 0.98)';
        ctx.strokeStyle = arrowColor;
        ctx.lineWidth = 2;
        ctx.roundRect(arrowX - badgeW / 2, textY - 11, badgeW, 24, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          isCall ? '⚡ ENTRAR AGORA · CALL ▲' : '⚡ ENTRAR AGORA · PUT ▼',
          arrowX,
          textY + 5
        );
        ctx.restore();
      }
    }

    // ─── 7. LINHA DA COTAÇÃO ATUAL (SEM LINHA VERTICAL E SEM CAIXA EXTRA) ──────
    if (currentPrice !== null) {
      const curY = getY(currentPrice);
      if (curY >= 0 && curY <= mainHeight) {
        // Linha horizontal pontilhada de preço
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, curY);
        ctx.lineTo(mainWidth, curY);
        ctx.stroke();
        ctx.restore();

        // Badge limpo com o preço apenas na régua lateral de preços (sem caixa extra flutuando no gráfico)
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

    // Retícula do Mouse (Crosshair)
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
    isTrendLinesActive,
    trendLines,
    activeSignal,
    currentPrice,
    precision,
    secondsToNextCandle,
    isEntryActive,
    activeEntryAlert,
  ]);

  return (
    <div className="bg-[#0b0e14] border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Header do Gráfico estilo IQ Option */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#080b10] border-b border-slate-800/80">
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
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                VECTOR OTC
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
              <span className="text-sky-300 font-bold">PRISMA IA MODO VECTOR OTC</span>
              <span>•</span>
              <span className="text-slate-300">Velas Estilo IQ Option</span>
            </div>
          </div>
        </div>

        {/* Controles do Gráfico */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botão: Ativar/Desativar Linhas LTA / LTB */}
          <button
            type="button"
            id="btn-toggle-trendlines"
            onClick={handleToggleTrendLines}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${
              isTrendLinesActive
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Exibir/Ocultar Linhas de Tendência LTA e LTB (Modo Vector OTC)"
          >
            <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
            <span>VETORES LTA / LTB: {isTrendLinesActive ? 'LIGADO' : 'DESLIGADO'}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                isTrendLinesActive ? 'bg-emerald-400' : 'bg-slate-600'
              }`}
            />
          </button>

          {/* Botão de Redirecionamento no Header se estiver no passado */}
          {panOffset > 0 && (
            <button
              type="button"
              id="btn-header-redirect-to-current"
              onClick={handleRedirectToCurrentPrice}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-400/80 bg-sky-500/25 text-sky-300 text-xs font-mono font-bold animate-pulse hover:bg-sky-400 hover:text-slate-950 transition-all cursor-pointer shadow-md shadow-sky-500/20"
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
        className={`relative w-full h-[470px] select-none bg-[#0b0e14] ${
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

        {/* BOTÃO FLUTUANTE DE REDIRECIONAMENTO AO PREÇO ATUAL (ESTILO IQ OPTION) */}
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

        {/* MINI CONTROLES DE ZOOM E REDIRECIONAMENTO ESTILO IQ OPTION */}
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

        {/* HUD Flutuante da Estratégia Vela de Comando & 1º Pullback */}
        <div className="absolute top-3 left-3 z-10 pointer-events-none max-w-sm">
          {isEntryActive && activeEntryAlert ? (
            <div
              className={`rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md flex items-center gap-3 border-2 animate-pulse ${
                activeEntryAlert.verdict === 'CALL'
                  ? 'bg-emerald-950/95 border-emerald-400 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.35)]'
                  : 'bg-rose-950/95 border-rose-400 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.35)]'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  activeEntryAlert.verdict === 'CALL'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-rose-500/20 border-rose-400 text-rose-300'
                }`}
              >
                {activeEntryAlert.verdict === 'CALL' ? (
                  <TrendingUp className="w-5 h-5 animate-bounce" />
                ) : (
                  <TrendingDown className="w-5 h-5 animate-bounce" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider font-mono">
                    ⚡ ENTRAR AGORA · {activeEntryAlert.verdict === 'CALL' ? 'COMPRA (CALL) ▲' : 'VENDA (PUT) ▼'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/60 text-amber-300 font-mono font-bold border border-amber-500/40">
                    {secondsLeft}s
                  </span>
                </div>
                <div className="text-[11px] text-white font-mono font-semibold mt-0.5">
                  {activeEntryAlert.patternName || 'Modo Vector OTC · Sinal Ativo'}
                </div>
                <div className="text-[10px] text-slate-300 font-mono mt-0.5">
                  Preço do Vetor: <strong className="text-amber-300">{activeEntryAlert.defensePrice.toFixed(precision)}</strong> • Entrada na virada aos 00s
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#040812]/90 border border-sky-500/30 rounded-xl px-3.5 py-2 shadow-lg backdrop-blur-md flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/40 flex items-center justify-center text-sky-400 flex-shrink-0">
                <Activity className="w-4 h-4 animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase text-sky-300 font-mono tracking-wide">
                    ROBÔ ANALISANDO VETORES LTA / LTB...
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                    RADAR ATIVO
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {activeSignal
                    ? activeSignal.reason
                    : 'Monitorando LTA e LTB para rompimentos de fluxo e reversões...'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Efeito Visual de Scanner do Modo Vector OTC */}
        {isAnalyzing && (
          <div className="absolute inset-0 pointer-events-none z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[1px] animate-in fade-in duration-150">
            <div className="absolute inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_20px_#38bdf8] animate-pulse top-1/2 -translate-y-1/2" />
            <div className="absolute inset-0 bg-gradient-to-b from-sky-500/5 via-sky-500/15 to-transparent animate-pulse" />

            {/* HUD Central de Diagnóstico */}
            <div className="relative z-30 bg-[#03070d]/95 border-2 border-sky-500/80 rounded-2xl px-6 py-4 shadow-2xl shadow-sky-500/40 flex items-center gap-4 font-mono max-w-md mx-4">
              <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/50 flex items-center justify-center text-sky-300 flex-shrink-0">
                <Crosshair className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <div className="text-xs font-black text-white tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                  <span>{scanStatusText}</span>
                </div>
                <p className="text-[11px] text-sky-400/90 mt-0.5">
                  PRISMA IA MODO VECTOR OTC · LTA &amp; LTB
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer com Legenda da Estratégia PRISMA IA MODO VECTOR OTC */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#020509] border-t border-sky-500/20 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1.5 bg-emerald-500 rounded-sm shadow-[0_0_6px_#10b981]" />
            <span className="text-emerald-400 font-bold">LTA (Suporte / Reversão / Rompimento)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1.5 bg-rose-500 rounded-sm shadow-[0_0_6px_#ef4444]" />
            <span className="text-rose-400 font-bold">LTB (Resistência / Reversão / Rompimento)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300">Rompimento LTB = Fluxo de Alta (CALL)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span className="text-slate-300">Rompimento LTA = Fluxo de Baixa (PUT)</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <button
            type="button"
            onClick={handleRedirectToCurrentPrice}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
              panOffset > 0
                ? 'bg-sky-400 text-slate-950 hover:bg-sky-300 animate-pulse'
                : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }`}
            title="Redirecionar para o preço atual (tempo real)"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>{panOffset > 0 ? `Redirecionar (-${panOffset} velas)` : 'Preço Atual (Tempo Real)'}</span>
          </button>
          <span>•</span>
          <span>Scroll: Zoom</span>
          <span>•</span>
          <span>Arrastar: Navegar</span>
        </div>
      </div>
    </div>
  );
}
