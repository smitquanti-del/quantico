import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Clock,
  Shield,
  Activity,
  Search,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  Sparkles,
  Bot,
  GitBranch,
  Crosshair,
  Layers,
  Repeat,
  Compass,
  ShieldCheck,
  Target,
  Radar,
} from 'lucide-react';
import type { OtcAsset, Candle, AccountInfo, ActiveEntryAlert, StrategyRadarAlert } from '@/types';
import {
  playClickSound,
  playPreAnalysisSound,
  playSignalTriggerSound,
  speakVoiceNotification,
} from '@/lib/sound';
import { CandleChart } from '@/components/CandleChart';
import { MarketVoiceAssistant } from '@/components/MarketVoiceAssistant';
import { StrategyRadarModal } from '@/components/StrategyRadarModal';
import {
  evaluateZonasCenariosStrategy,
  type ZonasCenariosSignal,
} from '@/lib/zonas-cenarios-fibo-engine';

interface ChineseBotPanelProps {
  assets: OtcAsset[];
  selectedAsset: OtcAsset;
  onSelectAsset: (asset: OtcAsset) => void;
  candles: Candle[];
  account: AccountInfo;
  onOpenSsidModal: () => void;
  onOpenAssetModal: () => void;
}

interface AssetCycleRecord {
  lastSignalTime: number; // timestamp da vela do sinal
  lastSignalType: 'CALL' | 'PUT';
  signal: ZonasCenariosSignal;
  signalFormattedTime: string;
}

const TIMEFRAMES = [
  { id: '5S', label: '5S' },
  { id: '10S', label: '10S' },
  { id: '15S', label: '15S' },
  { id: '30S', label: '30S' },
  { id: '1M', label: '1M' },
  { id: '2M', label: '2M' },
  { id: '3M', label: '3M' },
  { id: '5M', label: '5M' },
  { id: '10M', label: '10M' },
  { id: '15M', label: '15M' },
  { id: '30M', label: '30M' },
];

export function ChineseBotPanel({
  assets,
  selectedAsset,
  onSelectAsset,
  candles,
  account,
  onOpenSsidModal,
  onOpenAssetModal,
}: ChineseBotPanelProps) {
  // Estado de controle de análise
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [scanStatusText, setScanStatusText] = useState<string>('');
  const [analyzedSignal, setAnalyzedSignal] = useState<ZonasCenariosSignal | null>(null);
  const [lastAnalysisTime, setLastAnalysisTime] = useState<string>('');

  // Toggles visuais (Desativados por padrão para gráfico limpo idêntico à IQ Option)
  const [enableCommandCandles, setEnableCommandCandles] = useState<boolean>(false);
  const [enableTrendLines, setEnableTrendLines] = useState<boolean>(false);
  const [autoVoiceAlerts, setAutoVoiceAlerts] = useState<boolean>(true);

  // Timeframe selecionado
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1M');

  // Relógio BRT
  const [brtTimeStr, setBrtTimeStr] = useState<string>('');
  const [secondsToNextCandle, setSecondsToNextCandle] = useState<number>(60);
  const [candleSeconds, setCandleSeconds] = useState<number>(0);

  // Histórico de ciclos operacionais por ativo (5 velas anti-spam)
  const [assetCycles, setAssetCycles] = useState<Record<number, AssetCycleRecord>>({});

  // Modal de Radar Inteligente de Estratégias Próximas
  const [isRadarModalOpen, setIsRadarModalOpen] = useState<boolean>(false);

  // Alerta transitório de "ENTRAR AGORA" (some após os 60s da vela da entrada)
  const [activeEntryAlert, setActiveEntryAlert] = useState<ActiveEntryAlert | null>(null);

  // Expiração estrita: quando a vela de entrada fecha (após 60s), o sinal some e volta para "ANALISANDO"
  useEffect(() => {
    if (!activeEntryAlert) return;

    const timer = setInterval(() => {
      if (Date.now() >= activeEntryAlert.expiresAt) {
        setActiveEntryAlert(null);
        setAnalyzedSignal(null);
      }
    }, 500);

    return () => clearInterval(timer);
  }, [activeEntryAlert]);

  // Manipulador ao selecionar um ativo no Radar
  const handleSelectAndTradeAsset = useCallback((asset: OtcAsset, alert?: StrategyRadarAlert) => {
    playClickSound();
    onSelectAsset(asset);

    if (alert && alert.status === 'ENTRAR_AGORA') {
      const nowStr = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());

      const alertObj: ActiveEntryAlert = {
        activeId: asset.id,
        verdict: alert.verdict === 'CALL' ? 'CALL' : 'PUT',
        entryPrice: alert.defensePrice,
        defensePrice: alert.defensePrice,
        patternName: alert.patternName,
        triggerTime: Date.now(),
        expiresAt: Date.now() + 60000,
        timeFormatted: nowStr,
      };
      setActiveEntryAlert(alertObj);
      playSignalTriggerSound(alert.direction);
      speakVoiceNotification(
        `Ativo ${asset.label} selecionado no Radar! Sinal ativo de ${
          alert.direction === 'call' ? 'Compra CALL' : 'Venda PUT'
        }! ENTRAR AGORA na Linha de Defesa!`
      );
    } else {
      speakVoiceNotification(
        `Ativo ${asset.label} selecionado no Radar. Carregando gráfico e monitorando aproximação da linha de defesa.`
      );
    }

    // Rola suavemente até o gráfico
    setTimeout(() => {
      const chartEl = document.getElementById('prisma-zonas-cenarios-chart');
      if (chartEl) {
        chartEl.scrollIntoView({ behavior: 'smooth' });
      }
    }, 150);
  }, [onSelectAsset]);

  // Atualiza relógio e tempo de vela
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const brt = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(now);
      setBrtTimeStr(brt);

      const sec = now.getSeconds();
      setCandleSeconds(sec);
      setSecondsToNextCandle(60 - sec);
    };

    updateTime();
    const interval = setInterval(updateTime, 500);
    return () => clearInterval(interval);
  }, []);

  // Ciclo atual do ativo selecionado
  const currentAssetCycle = assetCycles[selectedAsset.id] || null;

  // Cálculo de métricas da Estratégia da Vela de Comando em tempo real
  const realtimeMetrics: ZonasCenariosSignal = useMemo(() => {
    return evaluateZonasCenariosStrategy(
      candles,
      currentAssetCycle ? currentAssetCycle.lastSignalTime : 0,
      5
    );
  }, [candles, currentAssetCycle]);

  // Sincroniza o sinal analisado com o ciclo ativo se houver
  useEffect(() => {
    if (currentAssetCycle) {
      setAnalyzedSignal(currentAssetCycle.signal);
      setLastAnalysisTime(currentAssetCycle.signalFormattedTime);
    } else {
      setAnalyzedSignal(null);
      setLastAnalysisTime('');
    }
  }, [selectedAsset.id, currentAssetCycle]);

  // Disparo manual do Botão de Análise: Respeita estritamente o Modo Vector OTC (LTA e LTB)
  const handleRunAnalysis = useCallback(() => {
    if (isAnalyzing) return;
    playClickSound();
    playPreAnalysisSound();
    setIsAnalyzing(true);
    setScanStatusText('TRAÇANDO LINHAS DE TENDÊNCIA LTA E LTB...');

    setTimeout(() => {
      setScanStatusText('ANALISANDO VELAS DE FLUXO & TESTE NAS LINHAS...');
    }, 350);

    setTimeout(() => {
      setScanStatusText('AVALIANDO ROMPIMENTOS OU REVERSÕES NO VECTOR OTC...');
    }, 700);

    setTimeout(() => {
      const computedSignal = evaluateZonasCenariosStrategy(
        candles,
        currentAssetCycle ? currentAssetCycle.lastSignalTime : 0,
        5
      );

      setAnalyzedSignal(computedSignal);
      setIsAnalyzing(false);

      const nowStr = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());

      setLastAnalysisTime(nowStr);

      const lastCandle = candles[candles.length - 1];

      // Se for um novo sinal de COMPRA ou VENDA no Modo Vector OTC
      if (computedSignal.verdict === 'CALL' || computedSignal.verdict === 'PUT') {
        const alertObj: ActiveEntryAlert = {
          activeId: selectedAsset.id,
          verdict: computedSignal.verdict as 'CALL' | 'PUT',
          entryPrice: computedSignal.defensePrice,
          defensePrice: computedSignal.defensePrice,
          patternName: computedSignal.candlePatternName,
          triggerTime: Date.now(),
          expiresAt: Date.now() + 60000,
          timeFormatted: nowStr,
        };
        setActiveEntryAlert(alertObj);

        if (lastCandle) {
          setAssetCycles((prev) => ({
            ...prev,
            [selectedAsset.id]: {
              lastSignalTime: lastCandle.time,
              lastSignalType: computedSignal.verdict as 'CALL' | 'PUT',
              signal: computedSignal,
              signalFormattedTime: nowStr,
            },
          }));
        }

        if (computedSignal.verdict === 'CALL') {
          playSignalTriggerSound('call');
          speakVoiceNotification(
            `Atenção operador! Sinal de COMPRA CALL confirmado no Modo Vector OTC em ${selectedAsset.label}. ${computedSignal.reason}. Entrada aos 00 segundos!`
          );
        } else {
          playSignalTriggerSound('put');
          speakVoiceNotification(
            `Atenção operador! Sinal de VENDA PUT confirmado no Modo Vector OTC em ${selectedAsset.label}. ${computedSignal.reason}. Entrada aos 00 segundos!`
          );
        }
      } else if (computedSignal.scenarioType === 'CICLO_EM_MATURACAO') {
        playClickSound();
        speakVoiceNotification(
          `Ciclo em maturação na paridade ${selectedAsset.label}. O robô aguarda o término da operação para proteger sua banca contra entradas consecutivas vela a vela.`
        );
      } else {
        playClickSound();
        speakVoiceNotification(
          `Monitorando aproximação dos vetores LTA e LTB em ${selectedAsset.label}. Aguardando rompimento com fluxo ou reversão confirmada.`
        );
      }
    }, 1100);
  }, [isAnalyzing, candles, currentAssetCycle, selectedAsset.id, selectedAsset.label]);

  // Alerta automático do robô aos 00s (com estrito bloqueio anti-spam e respeito ao ciclo)
  useEffect(() => {
    if (!autoVoiceAlerts || isAnalyzing) return;
    if (candles.length < 15) return;

    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) return;

    // Dispara no nascimento da vela atual (:00s a :06s)
    if (candleSeconds <= 6 || candleSeconds >= 59) {
      // Se o ciclo estiver ativo ou já houve sinal recente, NÃO DISPARA!
      if (realtimeMetrics.cycleStatus?.isCycleActive) return;

      if (realtimeMetrics.verdict === 'CALL' || realtimeMetrics.verdict === 'PUT') {
        const nowStr = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date());

        // Registra o ciclo deste ativo (5 velas de bloqueio vela a vela)
        setAssetCycles((prev) => ({
          ...prev,
          [selectedAsset.id]: {
            lastSignalTime: lastCandle.time,
            lastSignalType: realtimeMetrics.verdict as 'CALL' | 'PUT',
            signal: realtimeMetrics,
            signalFormattedTime: `${nowStr} (Auto)`,
          },
        }));

        setAnalyzedSignal(realtimeMetrics);
        setLastAnalysisTime(`${nowStr} (Auto)`);

        if (realtimeMetrics.verdict === 'CALL') {
          playSignalTriggerSound('call');
          speakVoiceNotification(
            `Alerta automático! Sinal de COMPRA CALL no Modo Vector OTC em ${selectedAsset.label}. Rompimento de LTB com vela verde ou reversão na LTA confirmada. Entrada aos 00 segundos!`
          );
        } else if (realtimeMetrics.verdict === 'PUT') {
          playSignalTriggerSound('put');
          speakVoiceNotification(
            `Alerta automático! Sinal de VENDA PUT no Modo Vector OTC em ${selectedAsset.label}. Rompimento de LTA com vela vermelha ou reversão na LTB confirmada. Entrada aos 00 segundos!`
          );
        }
      }
    }
  }, [
    candleSeconds,
    autoVoiceAlerts,
    isAnalyzing,
    candles,
    realtimeMetrics,
    selectedAsset.id,
    selectedAsset.label,
  ]);

  const quickPairs = useMemo(() => {
    return assets.slice(0, 10);
  }, [assets]);

  const payoutPct = selectedAsset.payout || 88;
  const precision = selectedAsset.precision || 5;

  const cycleInfo = realtimeMetrics.cycleStatus;
  const isCycleActive = cycleInfo?.isCycleActive || false;
  const candlesElapsed = cycleInfo?.candlesSinceLastSignal || 0;
  const cycleRequired = cycleInfo?.cycleRequiredCandles || 5;

  const activeCmd = (analyzedSignal || realtimeMetrics).activeCommandCandle;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top Hero Banner */}
      <div
        id="prisma-ia-vector-hero-card"
        className="relative overflow-hidden rounded-2xl border border-sky-500/30 p-5 md:p-6 bg-gradient-to-b from-[#060c14]/98 to-[#020509]/98 shadow-2xl shadow-sky-950/40 backdrop-blur-xl"
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-80 h-80 bg-sky-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="relative group flex-shrink-0">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden border-2 border-sky-500/60 shadow-lg shadow-sky-500/30 bg-black flex items-center justify-center">
                <img
                  src="/prisma_ia_logo.jpg"
                  alt="PRISMA IA MODO VECTOR OTC"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-sky-400 border-2 border-black rounded-full animate-ping" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-white font-mono tracking-tight flex items-center gap-2">
                  <span>PRISMA IA</span>
                  <span className="text-sky-400 drop-shadow-[0_0_12px_rgba(56,189,248,0.5)]">
                    MODO VECTOR OTC
                  </span>
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/40">
                  LTA &amp; LTB
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  ROMPIMENTO &amp; REVERSÃO
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  FLUXO DE VELAS
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono flex items-center gap-1.5 flex-wrap">
                <span className="text-white font-semibold">{selectedAsset.label}</span>
                <span>•</span>
                <span className="text-emerald-400">Payout {payoutPct}%</span>
                <span>•</span>
                <span className="text-slate-300">trade.optgobroker.com/traderoom</span>
                <span>•</span>
                <span className="text-sky-300">Brasília: {brtTimeStr}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* NOVO BOTÃO: BUSCAR ATIVOS PRÓXIMOS (RADAR OTC) */}
            <button
              type="button"
              id="btn-radar-buscar-ativos"
              onClick={() => {
                playClickSound();
                setIsRadarModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-mono font-black border border-sky-400/50 transition-all bg-gradient-to-r from-sky-400 via-sky-300 to-indigo-400 text-slate-950 hover:brightness-110 shadow-lg shadow-sky-500/25 active:scale-95 cursor-pointer"
              title="Varre todos os 148 ativos OTC e busca os pares que estão próximos de conectar a estratégia ou com sinal Entrar Agora"
            >
              <Radar className="w-4 h-4 text-slate-950 animate-spin" />
              <span>🎯 BUSCAR ATIVOS PRÓXIMOS (RADAR)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-950 text-sky-300 font-black">
                148 ATIVOS
              </span>
            </button>

            {/* Botão de Análise Modo Vector OTC */}
            <button
              type="button"
              id="btn-analisar-mercado-topo"
              onClick={handleRunAnalysis}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-mono font-black border border-sky-400/50 transition-all bg-gradient-to-r from-sky-400 via-sky-300 to-emerald-400 text-slate-950 hover:brightness-110 shadow-lg shadow-sky-500/30 active:scale-95 cursor-pointer disabled:opacity-70"
              title="Analisa vetores LTA e LTB identificando rompimentos com fluxo e reversões"
            >
              {isAnalyzing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>ANALISANDO VETORES LTA / LTB...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-slate-950 animate-pulse" />
                  <span>ANALISAR VETORES LTA / LTB</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* NOVO: CARD DO ENTENDIMENTO DO CICLO DE MERCADO & FLUXO */}
      <div className="bg-[#040913]/95 border border-sky-500/25 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-500/20 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white font-mono tracking-tight">
                  CICLO OPERACIONAL &amp; PROTEÇÃO ANTI-SPAM
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold uppercase">
                  5 VELAS DE PROTEÇÃO
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                O robô não opera vela atrás de vela. Cada sinal de rompimento ou reversão gera um ciclo de maturação para proteger sua banca e aguardar a consolidação de novas linhas de LTA/LTB.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono">
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                isCycleActive
                  ? 'bg-sky-950/80 border-sky-500/60 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                  : 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
              }`}
            >
              <Compass className="w-4 h-4 animate-spin" />
              <span>{cycleInfo?.phaseLabel || 'MONITORANDO VETORES'}</span>
            </div>
          </div>
        </div>

        {/* Régua de Maturação do Ciclo (1 a 5 velas) */}
        <div className="p-3 rounded-xl bg-black/40 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-bold">Ciclo Operacional:</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((candleStep) => {
                const isCompleted = isCycleActive && candlesElapsed >= candleStep;
                const isCurrent = isCycleActive && candlesElapsed === candleStep - 1;
                return (
                  <div
                    key={candleStep}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-black transition-all flex items-center gap-1 ${
                      isCompleted
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                        : isCurrent
                        ? 'bg-sky-500/30 border-sky-400 text-white shadow-md shadow-sky-500/20 animate-pulse'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    <span>Vela {candleStep}</span>
                    {isCompleted && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-[11px] text-slate-300 flex items-center gap-2">
            {isCycleActive ? (
              <span className="text-sky-300 font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                Maturação em andamento ({candlesElapsed}/{cycleRequired} velas concluídas)
              </span>
            ) : (
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ciclo disponível para novo sinal no Modo Vector OTC
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card Central da Estratégia PRISMA IA MODO VECTOR OTC */}
      <div className="bg-[#050a12]/95 border border-sky-500/30 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-sky-500/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white font-mono tracking-tight">
                  PRISMA IA MODO VECTOR OTC · LTA &amp; LTB
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold uppercase">
                  CANAL VECTOR OTC
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold uppercase">
                  FLUXO &amp; REVERSÃO
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                O robô traça automaticamente Linhas de Tendência de Alta (LTA) e Baixa (LTB), identificando rompimentos com fluxo (vela verde na LTB / vermelha na LTA) e reversões com retração.
              </p>
            </div>
          </div>

          {/* Veredicto do Sinal (Vela Atual) - Transitório: ENTRAR AGORA -> SOME -> ROBÔ ANALISANDO */}
          <div className="flex items-center gap-3">
            {isCycleActive ? (
              <div className="px-4 py-2 rounded-xl border border-sky-500/60 bg-sky-950/80 text-sky-300 shadow-lg flex items-center gap-3 font-mono">
                <Clock className="w-6 h-6 text-sky-400 animate-spin" />
                <div>
                  <div className="text-[10px] text-sky-400 font-bold uppercase">
                    CICLO OPERACIONAL EM MATURAÇÃO
                  </div>
                  <div className="text-base font-black text-white">
                    VELA {candlesElapsed}/{cycleRequired} (BLOQUEIO ATIVO)
                  </div>
                </div>
              </div>
            ) : activeEntryAlert && activeEntryAlert.activeId === selectedAsset.id ? (
              <div
                className={`px-4 py-2.5 rounded-2xl border-2 shadow-2xl flex items-center gap-3 font-mono animate-pulse ${
                  activeEntryAlert.verdict === 'CALL'
                    ? 'border-emerald-400 bg-emerald-950/95 text-emerald-300 shadow-emerald-950/80'
                    : 'border-rose-400 bg-rose-950/95 text-rose-300 shadow-rose-950/80'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    activeEntryAlert.verdict === 'CALL'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/50'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-400/50'
                  }`}
                >
                  {activeEntryAlert.verdict === 'CALL' ? (
                    <TrendingUp className="w-6 h-6 animate-bounce" />
                  ) : (
                    <TrendingDown className="w-6 h-6 animate-bounce" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                      ⚡ ENTRAR AGORA · AOS 00s
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/60 text-white font-mono font-bold">
                      {Math.max(0, Math.ceil((activeEntryAlert.expiresAt - Date.now()) / 1000))}s restantes
                    </span>
                  </div>
                  <div className="text-base font-black text-white">
                    {activeEntryAlert.verdict === 'CALL'
                      ? 'SINAL VECTOR: COMPRA (CALL) ▲'
                      : 'SINAL VECTOR: VENDA (PUT) ▼'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-2 rounded-xl border border-sky-500/30 bg-[#040812]/90 flex items-center gap-3 font-mono">
                <Activity className="w-5 h-5 text-sky-400 animate-spin" />
                <div>
                  <div className="text-[10px] text-sky-400 font-bold uppercase flex items-center gap-1.5">
                    <span>ROBÔ ANALISANDO MERCADO...</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                  </div>
                  <div className="text-xs font-bold text-slate-300">
                    Aguardando rompimento ou reversão aos 00s
                  </div>
                </div>
              </div>
            )}

            {/* Cronômetro da Vela Atual M1 */}
            <div className="bg-black/60 border border-sky-500/30 px-3 py-2 rounded-xl text-center font-mono">
              <div className="text-[10px] text-slate-400">VELA ATUAL M1</div>
              <div className="text-base font-black text-sky-400">:{String(candleSeconds).padStart(2, '0')}s</div>
              <div className="text-[9px] text-slate-400">decorrido de 60s</div>
            </div>
          </div>
        </div>

        {/* 4 Cards da Estratégia PRISMA IA MODO VECTOR OTC */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Linhas LTA e LTB */}
          <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-950/20 font-mono text-sky-300">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-sky-400" />
                1. Vetores LTA &amp; LTB
              </span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                AUTOMÁTICO
              </span>
            </div>
            <div className="text-sm font-black text-white truncate">
              LTA (Suporte) &amp; LTB (Resistência)
            </div>
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              {analyzedSignal ? `Taxa do Vetor: ${analyzedSignal.defensePrice.toFixed(precision)}` : 'Calculando linhas dinâmicas de canais...'}
            </p>
          </div>

          {/* Card 2: Rompimento com Fluxo */}
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 font-mono text-emerald-300">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                2. Rompimento de Fluxo
              </span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                FLUXO
              </span>
            </div>
            <div className="text-sm font-black text-white truncate">
              LTB = Vela Verde | LTA = Vela Vermelha
            </div>
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              Rompimento com vela de impulsão para continuidade do movimento.
            </p>
          </div>

          {/* Card 3: Reversão nos Vetores */}
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 font-mono text-amber-200">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                3. Reversão na Linha
              </span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                RETRAÇÃO
              </span>
            </div>
            <div className="text-xs font-black text-white truncate">
              LTA = Retração Alta | LTB = Retração Baixa
            </div>
            <p className="text-[11px] text-amber-300/80 mt-1 truncate">
              Vela testa a linha sem romper e fecha respeitando o vetor.
            </p>
          </div>

          {/* Card 4: Gatilho no Nascimento dos 00s */}
          <div
            className={`p-3.5 rounded-xl border font-mono transition-all ${
              analyzedSignal && analyzedSignal.verdict !== 'NO_TRADE'
                ? analyzedSignal.verdict === 'CALL'
                  ? 'bg-emerald-950/30 border-emerald-500/60 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-500/60 text-rose-300'
                : 'bg-slate-900/60 border-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                4. Gatilho aos 00s
              </span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                {analyzedSignal ? analyzedSignal.verdict : 'STANDBY'}
              </span>
            </div>
            <div className="text-sm font-black text-white truncate">
              {analyzedSignal ? (
                analyzedSignal.verdict === 'CALL' ? (
                  <span className="text-emerald-400">VECTOR: COMPRA (CALL)</span>
                ) : analyzedSignal.verdict === 'PUT' ? (
                  <span className="text-rose-400">VECTOR: VENDA (PUT)</span>
                ) : (
                  <span className="text-sky-400">STANDBY (MONITORANDO)</span>
                )
              ) : (
                <span className="text-slate-400">PRONTO PARA SCAN</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              {analyzedSignal ? analyzedSignal.candlePatternName : 'Dispara no fechamento da vela para entrada aos 00s.'}
            </p>
          </div>
        </div>

        {/* Motivos Técnicos e Diagnóstico */}
        <div className="mt-3 pt-3 border-t border-sky-500/15 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap text-slate-300">
            <span className="text-sky-400 font-bold">Diagnóstico Modo Vector OTC:</span>
            {analyzedSignal ? (
              <span className="text-slate-200">{analyzedSignal.reason}</span>
            ) : (
              <span className="text-slate-400">
                Clique em 'Analisar Vetores LTA / LTB' para validar os canais e o fluxo das velas.
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>
              Confiança:{' '}
              <strong className="text-white">
                {analyzedSignal ? `${analyzedSignal.confidence}%` : 'Aguardando Análise'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Assistente de Voz Interativo do Robô (Modo Vector OTC · LTA & LTB) */}
      <MarketVoiceAssistant
        selectedAsset={selectedAsset}
        candles={candles}
        metrics={realtimeMetrics}
        secondsToNextCandle={secondsToNextCandle}
        autoVoiceAlerts={autoVoiceAlerts}
        onToggleAutoVoice={() => {
          playClickSound();
          setAutoVoiceAlerts((prev) => !prev);
        }}
      />

      {/* Painel de Seleção de Ativos e Timeframes */}
      <div className="bg-[#050a12]/95 border border-sky-500/20 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-500/20 pb-3">
          <div>
            <span className="text-[10px] font-mono font-bold text-sky-400 uppercase tracking-widest block mb-0.5">
              [ SELEÇÃO DO ATIVO ]
            </span>
            <h2 className="text-lg font-black text-white font-mono tracking-tight">
              Paridades &amp; Tempo Gráfico
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenAssetModal}
              className="text-xs font-bold font-mono text-sky-400 hover:text-sky-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Todos os 148 Ativos</span>
              <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 font-mono font-bold">
                Ctrl + V
              </kbd>
            </button>
          </div>
        </div>

        {/* Seleção Rápida de Ativos */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Ativos Rápidos OTC:</span>
            <span className="text-sky-400 font-bold">{selectedAsset.label} selecionado</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {quickPairs.map((asset) => {
              const isSelected = selectedAsset.id === asset.id;
              const hasCycle = assetCycles[asset.id]?.lastSignalTime;
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => {
                    playClickSound();
                    onSelectAsset(asset);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm font-bold'
                      : 'bg-slate-900/70 text-slate-300 border-white/10 hover:border-amber-500/30 hover:text-white'
                  }`}
                >
                  <span>{asset.label}</span>
                  {hasCycle && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  )}
                  <span
                    className={`text-[10px] px-1 py-0.2 rounded font-mono ${
                      isSelected ? 'bg-slate-950/30 text-slate-950' : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {asset.payout || 88}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Seleção de Timeframe */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Tempo de Vela:</span>
            <span className="text-sky-400 font-bold">{selectedTimeframe} (Gráfico M1 com PRISMA IA MODO VECTOR OTC)</span>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-11 gap-1">
            {TIMEFRAMES.map((tf) => {
              const isSelected = selectedTimeframe === tf.id;
              return (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setSelectedTimeframe(tf.id);
                  }}
                  className={`py-1.5 rounded-md text-xs font-bold transition-all border text-center ${
                    isSelected
                      ? 'bg-sky-400 text-slate-950 border-sky-400 shadow-md shadow-sky-500/20 font-black'
                      : 'bg-slate-900/70 text-slate-300 border-white/10 hover:border-sky-500/30 hover:text-white'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Gráfico Estilo IQ Option com PRISMA IA MODO VECTOR OTC (LTA & LTB + Rompimento & Reversão) */}
      <div id="prisma-zonas-cenarios-chart" className="w-full">
        <CandleChart
          candles={candles}
          activeId={selectedAsset.id}
          symbol={selectedAsset.symbol}
          precision={precision}
          isAnalyzing={isAnalyzing}
          scanStatusText={scanStatusText}
          enableCommandCandles={enableCommandCandles}
          onToggleCommandCandles={() => {
            playClickSound();
            setEnableCommandCandles((prev) => !prev);
          }}
          enableTrendLines={enableTrendLines}
          onToggleTrendLines={() => {
            playClickSound();
            setEnableTrendLines((prev) => !prev);
          }}
          activeSignal={analyzedSignal}
          activeEntryAlert={activeEntryAlert}
          secondsToNextCandle={secondsToNextCandle}
        />
      </div>

      {/* MODAL DO RADAR OTC: VARRE TODOS OS ATIVOS E CONECTA A ESTRATÉGIA */}
      <StrategyRadarModal
        isOpen={isRadarModalOpen}
        onClose={() => setIsRadarModalOpen(false)}
        assets={assets}
        onSelectAndTradeAsset={handleSelectAndTradeAsset}
      />
    </div>
  );
}
