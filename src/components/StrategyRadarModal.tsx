import React, { useState, useEffect, useMemo } from 'react';
import {
  Radar,
  Search,
  Zap,
  TrendingUp,
  TrendingDown,
  Clock,
  Shield,
  CheckCircle2,
  X,
  Target,
  ArrowRight,
  Flame,
  Sparkles,
  Layers,
  Activity,
  ChevronRight,
} from 'lucide-react';
import type { OtcAsset, StrategyRadarAlert } from '@/types';
import { playClickSound, playPreAnalysisSound, playSignalTriggerSound } from '@/lib/sound';

interface StrategyRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: OtcAsset[];
  onSelectAndTradeAsset: (asset: OtcAsset, alert?: StrategyRadarAlert) => void;
}

export function StrategyRadarModal({
  isOpen,
  onClose,
  assets,
  onSelectAndTradeAsset,
}: StrategyRadarModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'forex' | 'crypto' | 'stock' | 'commodity'>('all');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResults, setScanResults] = useState<StrategyRadarAlert[]>([]);
  const [scanStatus, setScanStatus] = useState<string>('');
  const [lastScanTime, setLastScanTime] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const categories = [
    { id: 'all', label: 'Todos os Ativos', icon: '🌐' },
    { id: 'forex', label: 'Forex OTC', icon: '💱' },
    { id: 'crypto', label: 'Cripto OTC', icon: '⚡' },
    { id: 'stock', label: 'Ações & Índices', icon: '📈' },
    { id: 'commodity', label: 'Commodities', icon: '🛢️' },
  ] as const;

  // Realiza a varredura na API de estratégia
  const handleScan = async (cat = selectedCategory) => {
    playClickSound();
    playPreAnalysisSound();
    setIsScanning(true);
    setScanStatus('ANALISANDO TODOS OS ATIVOS NO MODO VECTOR OTC (LTA & LTB)...');

    try {
      const res = await fetch('/api/scan-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: cat,
          minPayout: 80,
        }),
      });

      if (res.ok) {
        const data: StrategyRadarAlert[] = await res.json();
        setScanResults(data);
        const nowStr = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        setLastScanTime(nowStr);

        const readyCount = data.filter((d) => d.status === 'ENTRAR_AGORA').length;
        const upcomingCount = data.filter((d) => d.status === 'GATILHO_PROXIMO').length;

        if (readyCount > 0) {
          playSignalTriggerSound('call');
          setScanStatus(`🔥 ${readyCount} ATIVOS COM SINAL ATIVO "ENTRAR AGORA" + ${upcomingCount} PRÓXIMOS DE ROMPER/REVERTER!`);
        } else if (upcomingCount > 0) {
          setScanStatus(`⚡ ${upcomingCount} ATIVOS TESTANDO OU PRÓXIMOS DAS LINHAS LTA / LTB!`);
        } else {
          setScanStatus(`Radar concluído: ${data.length} canais de LTA/LTB monitorados.`);
        }
      } else {
        setScanStatus('Erro ao consultar scanner de ativos.');
      }
    } catch {
      setScanStatus('Falha de conexão com o servidor de análise.');
    } finally {
      setIsScanning(false);
    }
  };

  // Executa varredura automática ao abrir
  useEffect(() => {
    if (isOpen && scanResults.length === 0) {
      handleScan('all');
    }
  }, [isOpen]);

  const filteredResults = useMemo(() => {
    return scanResults.filter((alert) => {
      const matchSearch =
        alert.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alert.label.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });
  }, [scanResults, searchTerm]);

  const stats = useMemo(() => {
    const ready = scanResults.filter((r) => r.status === 'ENTRAR_AGORA').length;
    const upcoming = scanResults.filter((r) => r.status === 'GATILHO_PROXIMO').length;
    const armed = scanResults.filter((r) => r.status === 'COMANDO_ARMADO').length;
    return { ready, upcoming, armed, total: scanResults.length };
  }, [scanResults]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-[#050a14] border border-sky-500/30 rounded-3xl w-full max-w-4xl shadow-2xl shadow-sky-950/40 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header do Radar */}
        <div className="p-5 border-b border-sky-500/20 bg-gradient-to-r from-black via-sky-950/20 to-black flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-sky-500/10 border-2 border-sky-400/50 flex items-center justify-center text-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.3)]">
              <Radar className="w-6 h-6 animate-spin" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-white font-mono tracking-tight flex items-center gap-2">
                  <span>RADAR DE ATIVOS PRÓXIMOS</span>
                  <span className="text-sky-400 text-xs px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/40">
                    PRISMA IA MODO VECTOR OTC
                  </span>
                </h2>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Varredura instantânea dos 148 ativos OTC. Clique no par para abrir no gráfico e operar o sinal!
              </p>
            </div>
          </div>

          <button
            id="btn-close-radar-modal"
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Barra de Filtro de Categorias */}
        <div className="p-4 border-b border-sky-500/15 bg-black/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    handleScan(cat.id);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20 font-black'
                      : 'bg-slate-900/80 text-slate-300 border-white/10 hover:border-sky-500/40 hover:text-white'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Botão de Re-Scan */}
          <button
            id="btn-radar-escanear-agora"
            type="button"
            onClick={() => handleScan(selectedCategory)}
            disabled={isScanning}
            className="px-4 py-2 rounded-xl text-xs font-black font-mono bg-gradient-to-r from-sky-400 to-indigo-400 text-slate-950 hover:brightness-110 shadow-lg shadow-sky-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 flex-shrink-0"
          >
            {isScanning ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>VARRENDO ATIVOS...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-slate-950 animate-pulse" />
                <span>BUSCAR ATIVOS PRÓXIMOS</span>
              </>
            )}
          </button>
        </div>

        {/* Barra de Status & Estatísticas */}
        <div className="px-5 py-3 bg-[#03060c] border-b border-sky-500/10 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/30">
              <Flame className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
              <span>ENTRAR AGORA: {stats.ready}</span>
            </div>

            <div className="flex items-center gap-1.5 text-amber-300 font-bold bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-500/30">
              <Target className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>PRÓXIMO DE CONECTAR: {stats.upcoming}</span>
            </div>

            <div className="flex items-center gap-1.5 text-sky-300 font-bold bg-sky-950/40 px-2.5 py-1 rounded-lg border border-sky-500/30">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>VETORES ATIVOS: {stats.armed}</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>Última Varredura: <strong className="text-white">{lastScanTime || '--:--:--'}</strong></span>
          </div>
        </div>

        {/* Campo de Busca Rápida de Ativo */}
        <div className="px-5 py-2.5 bg-black/40 border-b border-white/5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por moeda ou ação (ex: EUR/USD, Apple, Bitcoin)..."
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400/60 font-mono"
            />
          </div>
        </div>

        {/* Lista de Resultados */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[300px]">
          {isScanning && scanResults.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3 font-mono">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border-2 border-sky-400/50 flex items-center justify-center text-sky-400 animate-spin">
                <Radar className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-white">Varrendo paridades OTC no Modo Vector OTC...</p>
              <p className="text-xs text-slate-400">Mapeando canais de LTA e LTB para rompimentos e reversões</p>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3 font-mono">
              <Shield className="w-12 h-12 text-slate-600" />
              <p className="text-sm font-bold text-white">Nenhum ativo com aproximação na categoria selecionada</p>
              <p className="text-xs text-slate-400">Clique em 'Todos os Ativos' ou aguarde a formação de novas linhas de tendência.</p>
              <button
                type="button"
                onClick={() => handleScan('all')}
                className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30 cursor-pointer"
              >
                Escanear Todos os 148 Ativos
              </button>
            </div>
          ) : (
            filteredResults.map((alert) => {
              const isReady = alert.status === 'ENTRAR_AGORA';
              const isUpcoming = alert.status === 'GATILHO_PROXIMO';
              const isCall = alert.direction === 'call';

              const assetObj = assets.find((a) => a.id === alert.activeId) || {
                id: alert.activeId,
                symbol: alert.symbol,
                label: alert.label,
                category: alert.category,
                payout: alert.payout,
                precision: 5,
              };

              return (
                <div
                  key={alert.activeId}
                  onClick={() => {
                    playClickSound();
                    onSelectAndTradeAsset(assetObj as OtcAsset, alert);
                    onClose();
                  }}
                  className={`p-3.5 md:p-4 rounded-2xl border transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono ${
                    isReady
                      ? isCall
                        ? 'bg-emerald-950/40 border-emerald-500/80 hover:bg-emerald-950/60 shadow-lg shadow-emerald-950/40 hover:scale-[1.01]'
                        : 'bg-rose-950/40 border-rose-500/80 hover:bg-rose-950/60 shadow-lg shadow-rose-950/40 hover:scale-[1.01]'
                      : isUpcoming
                      ? 'bg-amber-950/30 border-amber-500/50 hover:bg-amber-950/50 hover:border-amber-400'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/90'
                  }`}
                >
                  {/* Informações do Ativo e Status */}
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold border ${
                        isReady
                          ? isCall
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 animate-bounce'
                            : 'bg-rose-500/20 border-rose-400 text-rose-300 animate-bounce'
                          : isCall
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                      }`}
                    >
                      {isCall ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-white group-hover:text-amber-400 transition-colors">
                          {alert.label}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          Payout {alert.payout}%
                        </span>
                        <span className="text-[10px] uppercase font-bold text-slate-400 bg-black/40 px-1.5 py-0.5 rounded">
                          {alert.category}
                        </span>

                        {/* Badge de Status */}
                        {isReady ? (
                          <span
                            className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border shadow-md animate-pulse ${
                              isCall
                                ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-extrabold'
                                : 'bg-rose-500 text-white border-rose-300 font-extrabold'
                            }`}
                          >
                            {alert.statusBadge}
                          </span>
                        ) : isUpcoming ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50">
                            {alert.statusBadge}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                            {alert.statusBadge}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-300 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-amber-300 font-semibold">
                          Linha Vetor: <strong>{alert.defensePrice.toFixed(5)}</strong>
                        </span>
                        <span>•</span>
                        <span className="text-slate-400">
                          Preço Atual: <strong>{alert.currentPrice.toFixed(5)}</strong>
                        </span>
                        {alert.distancePips > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-sky-300">
                              Distância: {alert.distancePips.toFixed(5)}
                            </span>
                          </>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                        {alert.reason}
                      </p>
                    </div>
                  </div>

                  {/* Botão de Abertura Imediata do Gráfico */}
                  <div className="flex items-center gap-2.5 self-end sm:self-center flex-shrink-0">
                    <button
                      type="button"
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                        isReady
                          ? 'bg-gradient-to-r from-emerald-400 to-amber-400 text-slate-950 shadow-lg shadow-emerald-500/30 group-hover:scale-105'
                          : 'bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-white border border-slate-700'
                      }`}
                    >
                      <span>{isReady ? 'ABRIR & ENTRAR AGORA' : 'ABRIR NO GRÁFICO'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer do Modal */}
        <div className="p-4 border-t border-amber-500/20 bg-black/60 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>
            {scanStatus || 'Selecione um ativo para carregar a estratégia e o gráfico.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
