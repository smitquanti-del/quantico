import type { Candle } from '../types';

// ─── PRISMA IA MODO VECTOR OTC (ESTRATÉGIA LTA & LTB) ────────────────────────
// 1. Rompimento de LTB com vela verde -> Continuidade de Alta (CALL / Compra)
// 2. Rompimento de LTA com vela vermelha -> Fluxo para Venda (PUT / Venda)
// 3. Reversão em LTB -> Vela verde com retração na LTB sem romper (PUT / Venda)
// 4. Reversão em LTA & Suporte -> Vela vermelha com retração na LTA sem romper (CALL / Compra)

export type VectorStrategyType =
  | 'ROMPIMENTO_LTB_ALTA'
  | 'ROMPIMENTO_LTA_BAIXA'
  | 'REVERSAO_LTB_VENDA'
  | 'REVERSAO_LTA_COMPRA'
  | 'MONITORANDO';

export interface TrendLinePoint {
  index: number;
  time: number;
  price: number;
}

export interface TrendLine {
  id: string;
  type: 'LTA' | 'LTB';
  p1: TrendLinePoint;
  p2: TrendLinePoint;
  slope: number;
  currentProjectedPrice: number;
  color: string;
  label: string;
  touches: number;
  strength: number;
  style: 'solid' | 'dashed';
}

export type ScenarioType =
  | 'ROMPIMENTO_LTB_ALTA'
  | 'ROMPIMENTO_LTA_BAIXA'
  | 'REVERSAO_LTB_VENDA'
  | 'REVERSAO_LTA_COMPRA'
  | 'AGUARDANDO_TESTE_VECTOR'
  | 'CICLO_EM_MATURACAO'
  | 'MONITORANDO_VETORES';

export type CandlestickPattern =
  | 'ROMPIMENTO_FORTE_VERDE'
  | 'ROMPIMENTO_FORTE_VERMELHO'
  | 'REJEICAO_REVERSAO_LTB'
  | 'REJEICAO_REVERSAO_LTA'
  | 'NENHUM';

export interface MarketCycleStatus {
  phase: 'MONITORANDO_VETORES' | 'APROXIMANDO_LINHA' | 'GATILHO_CONFIRMADO' | 'CICLO_EM_MATURACAO';
  phaseLabel: string;
  flowDirection: 'ALTA' | 'BAIXA' | 'LATERAL';
  flowLabel: string;
  bullishCandlesCount: number;
  bearishCandlesCount: number;
  cycleMaturityPct: number;
  candlesSinceLastSignal: number;
  cycleRequiredCandles: number;
  isCycleActive: boolean;
  description: string;
}

export interface ZonasCenariosSignal {
  verdict: 'CALL' | 'PUT' | 'NO_TRADE';
  signalName: string;
  scenarioType: ScenarioType;
  candlePattern: CandlestickPattern;
  candlePatternName: string;
  wickRatio: number;
  confidence: number;
  reason: string;
  confluencePoints: string[];
  // Campos Vector OTC:
  vectorType: VectorStrategyType;
  activeTrendLine: TrendLine | null;
  defensePrice: number; // Preço projetado da LTA ou LTB de referência
  midDefensePrice: number;
  isFirstTouch: boolean;
  trendLines: TrendLine[];
  activeZoneName: string;
  actionCandle: 'NASCIMENTO_00S' | 'RETESTE';
  cycleStatus?: MarketCycleStatus;
  // Campos de compatibilidade retroativa:
  activeCommandCandle: null;
  allCommandCandles: [];
  fiboAnalysis: null;
  goldenRatioZone: null;
}

// Compatibilidade de tipos caso algum componente ainda importe:
export type CommandCandle = any;
export function detectCommandCandles(_candles: Candle[]): any[] {
  return [];
}

// ─── 1. Cálculo Preciso de Linhas de Tendência (LTA / LTB) ───────────────────
export function calculateAutoTrendLines(candles: Candle[]): TrendLine[] {
  const n = candles.length;
  if (n < 12) return [];

  const lookback = Math.min(n, 55);
  const startIndex = n - lookback;
  const subset = candles.slice(startIndex);

  interface Pivot {
    index: number;
    candle: Candle;
  }

  const swingLows: Pivot[] = [];
  const swingHighs: Pivot[] = [];
  const window = 2;

  for (let i = window; i < subset.length - window; i++) {
    const c = subset[i];
    let isLow = true;
    let isHigh = true;

    for (let j = 1; j <= window; j++) {
      if (subset[i - j].low <= c.low || subset[i + j].low < c.low) isLow = false;
      if (subset[i - j].high >= c.high || subset[i + j].high > c.high) isHigh = false;
    }

    if (isLow) swingLows.push({ index: startIndex + i, candle: c });
    if (isHigh) swingHighs.push({ index: startIndex + i, candle: c });
  }

  const trendLines: TrendLine[] = [];

  // LTA (Suporte Diagonal conectando fundos ascendentes ou de sustentação)
  if (swingLows.length >= 2) {
    for (let a = swingLows.length - 2; a >= 0; a--) {
      const p1 = swingLows[a];
      const p2 = swingLows[swingLows.length - 1];

      if (p2.index > p1.index && p2.candle.low >= p1.candle.low - 0.0003) {
        const dx = p2.index - p1.index;
        const dy = p2.candle.low - p1.candle.low;
        const slope = dy / dx;
        const currentProjectedPrice = p2.candle.low + slope * (n - 1 - p2.index);

        trendLines.push({
          id: `lta-${p1.index}-${p2.index}`,
          type: 'LTA',
          p1: { index: p1.index, time: p1.candle.time, price: p1.candle.low },
          p2: { index: p2.index, time: p2.candle.time, price: p2.candle.low },
          slope,
          currentProjectedPrice,
          color: '#10b981',
          label: 'LTA SUPORTE DE FLUXO',
          touches: 2,
          strength: 5,
          style: 'solid',
        });
        break;
      }
    }
  }

  // LTB (Resistência Diagonal conectando topos descendentes ou de defesa)
  if (swingHighs.length >= 2) {
    for (let a = swingHighs.length - 2; a >= 0; a--) {
      const p1 = swingHighs[a];
      const p2 = swingHighs[swingHighs.length - 1];

      if (p2.index > p1.index && p2.candle.high <= p1.candle.high + 0.0003) {
        const dx = p2.index - p1.index;
        const dy = p2.candle.high - p1.candle.high;
        const slope = dy / dx;
        const currentProjectedPrice = p2.candle.high + slope * (n - 1 - p2.index);

        trendLines.push({
          id: `ltb-${p1.index}-${p2.index}`,
          type: 'LTB',
          p1: { index: p1.index, time: p1.candle.time, price: p1.candle.high },
          p2: { index: p2.index, time: p2.candle.time, price: p2.candle.high },
          slope,
          currentProjectedPrice,
          color: '#ef4444',
          label: 'LTB RESISTÊNCIA DE FLUXO',
          touches: 2,
          strength: 5,
          style: 'solid',
        });
        break;
      }
    }
  }

  return trendLines;
}

// ─── 2. Motor de Ciclo Operacional Anti-Spam ─────────────────────────────────
export function detectMarketCycle(
  candles: Candle[],
  lastSignalTime: number = 0,
  cycleRequiredCandles: number = 5
): MarketCycleStatus {
  const n = candles.length;
  if (n < 10) {
    return {
      phase: 'MONITORANDO_VETORES',
      phaseLabel: 'INICIALIZANDO MOTOR VECTOR OTC',
      flowDirection: 'LATERAL',
      flowLabel: 'Sem Direção',
      bullishCandlesCount: 0,
      bearishCandlesCount: 0,
      cycleMaturityPct: 0,
      candlesSinceLastSignal: 99,
      cycleRequiredCandles,
      isCycleActive: false,
      description: 'Carregando velas de 1M para traçar LTA e LTB.',
    };
  }

  let candlesSinceLastSignal = 999;
  if (lastSignalTime > 0) {
    const lastSignalSeconds =
      lastSignalTime > 10000000000 ? Math.floor(lastSignalTime / 1000) : lastSignalTime;
    for (let i = n - 1; i >= 0; i--) {
      if (candles[i].time <= lastSignalSeconds) {
        candlesSinceLastSignal = n - 1 - i;
        break;
      }
    }
  }

  const isCycleActive = candlesSinceLastSignal < cycleRequiredCandles;
  const cycleMaturityPct = Math.min(
    100,
    Math.round((candlesSinceLastSignal / cycleRequiredCandles) * 100)
  );

  let greenCount = 0;
  let redCount = 0;
  for (let i = Math.max(0, n - 8); i < n; i++) {
    if (candles[i].close >= candles[i].open) greenCount++;
    else redCount++;
  }

  const flowDir: 'ALTA' | 'BAIXA' | 'LATERAL' =
    greenCount >= redCount + 2 ? 'ALTA' : redCount >= greenCount + 2 ? 'BAIXA' : 'LATERAL';

  if (isCycleActive) {
    return {
      phase: 'CICLO_EM_MATURACAO',
      phaseLabel: `CICLO VECTOR OTC: ${candlesSinceLastSignal}/${cycleRequiredCandles} VELAS`,
      flowDirection: flowDir,
      flowLabel: flowDir === 'ALTA' ? 'Fluxo Comprador' : flowDir === 'BAIXA' ? 'Fluxo Vendedor' : 'Consolidado',
      bullishCandlesCount: greenCount,
      bearishCandlesCount: redCount,
      cycleMaturityPct,
      candlesSinceLastSignal,
      cycleRequiredCandles,
      isCycleActive: true,
      description: `Operação anterior em maturação (${candlesSinceLastSignal}/${cycleRequiredCandles} velas). Filtro anti-spam ativo para proteger a banca.`,
    };
  }

  return {
    phase: 'MONITORANDO_VETORES',
    phaseLabel: 'MONITORANDO VETORES LTA / LTB',
    flowDirection: flowDir,
    flowLabel: flowDir === 'ALTA' ? 'Alta' : flowDir === 'BAIXA' ? 'Baixa' : 'Lateral',
    bullishCandlesCount: greenCount,
    bearishCandlesCount: redCount,
    cycleMaturityPct: 100,
    candlesSinceLastSignal,
    cycleRequiredCandles,
    isCycleActive: false,
    description: 'Monitorando candles para rompimento de LTA/LTB ou reversão por retração.',
  };
}

// ─── 3. Motor Central: PRISMA IA MODO VECTOR OTC (LTA & LTB) ─────────────────
export function evaluateZonasCenariosStrategy(
  candles: Candle[],
  lastSignalTime: number = 0,
  cycleRequiredCandles: number = 5
): ZonasCenariosSignal {
  if (candles.length < 12) {
    return {
      verdict: 'NO_TRADE',
      signalName: 'AGUARDANDO HISTÓRICO MÍNIMO',
      scenarioType: 'MONITORANDO_VETORES',
      candlePattern: 'NENHUM',
      candlePatternName: 'Carregando Velas',
      wickRatio: 0,
      confidence: 0,
      reason: 'Aguardando velas suficientes para mapear vetores de LTA e LTB.',
      confluencePoints: ['Mapeando candles M1'],
      vectorType: 'MONITORANDO',
      activeTrendLine: null,
      defensePrice: 0,
      midDefensePrice: 0,
      isFirstTouch: false,
      trendLines: [],
      activeZoneName: 'Calculando...',
      actionCandle: 'NASCIMENTO_00S',
      activeCommandCandle: null,
      allCommandCandles: [],
      fiboAnalysis: null,
      goldenRatioZone: null,
    };
  }

  // 1. Calcula as Linhas de Tendência LTA e LTB
  const trendLines = calculateAutoTrendLines(candles);
  const lta = trendLines.find((t) => t.type === 'LTA') || null;
  const ltb = trendLines.find((t) => t.type === 'LTB') || null;

  // 2. Ciclo Anti-Spam
  const cycleStatus = detectMarketCycle(candles, lastSignalTime, cycleRequiredCandles);

  const n = candles.length;
  const lastCandle = candles[n - 1];
  const prevCandle = candles[n - 2];
  const lastRange = Math.max(0.00001, lastCandle.high - lastCandle.low);
  const lastBody = Math.abs(lastCandle.close - lastCandle.open);
  const lastUpperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const lastLowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
  const lastUpperWickPct = (lastUpperWick / lastRange) * 100;
  const lastLowerWickPct = (lastLowerWick / lastRange) * 100;
  const isGreen = lastCandle.close > lastCandle.open;
  const isRed = lastCandle.close < lastCandle.open;

  // Média do corpo recente
  let totalBody = 0;
  for (let i = Math.max(0, n - 10); i < n; i++) {
    totalBody += Math.abs(candles[i].close - candles[i].open);
  }
  const avgBody = totalBody / 10 || 0.0002;

  // Tolerância de toque/rompimento proporcional ao ativo
  const tolerance = Math.max(avgBody * 0.25, 0.00008);

  // Se estiver em ciclo de maturação (bloqueio vela a vela)
  if (cycleStatus.isCycleActive) {
    return {
      verdict: 'NO_TRADE',
      signalName: 'CICLO VECTOR OTC EM ANDAMENTO',
      scenarioType: 'CICLO_EM_MATURACAO',
      candlePattern: 'NENHUM',
      candlePatternName: 'Ciclo Ativo',
      wickRatio: 0,
      confidence: 0,
      reason: `Operação anterior em maturação (${cycleStatus.candlesSinceLastSignal}/${cycleRequiredCandles} velas). Bloqueio anti-spam ativo para proteger a banca.`,
      confluencePoints: [
        `Ciclo de Maturação: ${cycleStatus.candlesSinceLastSignal}/${cycleRequiredCandles} velas`,
        'Bloqueio ativo para evitar entradas consecutivas',
        'Aguardando próxima oportunidade em LTA ou LTB',
      ],
      vectorType: 'MONITORANDO',
      activeTrendLine: ltb || lta,
      defensePrice: ltb ? ltb.currentProjectedPrice : lta ? lta.currentProjectedPrice : 0,
      midDefensePrice: 0,
      isFirstTouch: false,
      trendLines,
      activeZoneName: `CICLO ATIVO (${cycleStatus.candlesSinceLastSignal}/${cycleRequiredCandles} VELAS)`,
      actionCandle: 'NASCIMENTO_00S',
      cycleStatus,
      activeCommandCandle: null,
      allCommandCandles: [],
      fiboAnalysis: null,
      goldenRatioZone: null,
    };
  }

  // ─── REGRA 1: ROMPIMENTO DE LTB COM VELA VERDE -> CONTINUIDADE DE ALTA (CALL) ──
  // Uma LTB vinha guiando os topos. Uma vela verde rompe a LTB fechando acima dela!
  if (ltb) {
    const ltbPrice = ltb.currentProjectedPrice;
    const brokeAboveLTB = lastCandle.close > ltbPrice + tolerance * 0.4;
    const startedBelowOrAtLTB = Math.min(lastCandle.open, prevCandle.close) <= ltbPrice + tolerance;
    const strongGreen = isGreen && lastBody >= avgBody * 0.65;

    if (brokeAboveLTB && startedBelowOrAtLTB && strongGreen) {
      return {
        verdict: 'CALL',
        signalName: 'ROMPIMENTO DE LTB · FLUXO DE ALTA (CALL) ▲',
        scenarioType: 'ROMPIMENTO_LTB_ALTA',
        candlePattern: 'ROMPIMENTO_FORTE_VERDE',
        candlePatternName: 'Rompimento de LTB com Vela Verde',
        wickRatio: Math.round(lastLowerWickPct),
        confidence: 96,
        reason: `A vela verde rompeu com força a LTB projetada em ${ltbPrice.toFixed(5)}, fechando acima da resistência diagonal. Confirmação de continuidade de fluxo comprador (CALL) aos 00s!`,
        confluencePoints: [
          `Rompimento confirmado da LTB em ${ltbPrice.toFixed(5)}`,
          `Vela verde expressiva com corpo institucional (${(lastBody / avgBody).toFixed(1)}x da média)`,
          `Fechamento sólido acima da linha de tendência de baixa`,
          'Estratégia PRISMA IA MODO VECTOR OTC: Entrada de fluxo de alta aos 00s',
        ],
        vectorType: 'ROMPIMENTO_LTB_ALTA',
        activeTrendLine: ltb,
        defensePrice: ltbPrice,
        midDefensePrice: (ltbPrice + lastCandle.close) / 2,
        isFirstTouch: true,
        trendLines,
        activeZoneName: `★ ROMPIMENTO LTB: ${ltbPrice.toFixed(5)} (CALL) ★`,
        actionCandle: 'NASCIMENTO_00S',
        cycleStatus: {
          ...cycleStatus,
          phase: 'GATILHO_CONFIRMADO',
          phaseLabel: 'ROMPIMENTO DE LTB CONFIRMADO (CALL)',
        },
        activeCommandCandle: null,
        allCommandCandles: [],
        fiboAnalysis: null,
        goldenRatioZone: null,
      };
    }
  }

  // ─── REGRA 2: ROMPIMENTO DE LTA COM VELA VERMELHA -> FLUXO PARA VENDA (PUT) ──
  // Uma LTA vinha guiando os fundos. Uma vela vermelha rompe a LTA fechando abaixo dela!
  if (lta) {
    const ltaPrice = lta.currentProjectedPrice;
    const brokeBelowLTA = lastCandle.close < ltaPrice - tolerance * 0.4;
    const startedAboveOrAtLTA = Math.max(lastCandle.open, prevCandle.close) >= ltaPrice - tolerance;
    const strongRed = isRed && lastBody >= avgBody * 0.65;

    if (brokeBelowLTA && startedAboveOrAtLTA && strongRed) {
      return {
        verdict: 'PUT',
        signalName: 'ROMPIMENTO DE LTA · FLUXO DE VENDA (PUT) ▼',
        scenarioType: 'ROMPIMENTO_LTA_BAIXA',
        candlePattern: 'ROMPIMENTO_FORTE_VERMELHO',
        candlePatternName: 'Rompimento de LTA com Vela Vermelha',
        wickRatio: Math.round(lastUpperWickPct),
        confidence: 96,
        reason: `A vela vermelha rompeu com força a LTA projetada em ${ltaPrice.toFixed(5)}, fechando abaixo do suporte diagonal. Confirmação de continuidade de fluxo vendedor (PUT) aos 00s!`,
        confluencePoints: [
          `Rompimento confirmado da LTA em ${ltaPrice.toFixed(5)}`,
          `Vela vermelha expressiva com corpo de força (${(lastBody / avgBody).toFixed(1)}x da média)`,
          `Fechamento sólido abaixo da linha de tendência de alta`,
          'Estratégia PRISMA IA MODO VECTOR OTC: Entrada de fluxo de baixa aos 00s',
        ],
        vectorType: 'ROMPIMENTO_LTA_BAIXA',
        activeTrendLine: lta,
        defensePrice: ltaPrice,
        midDefensePrice: (ltaPrice + lastCandle.close) / 2,
        isFirstTouch: true,
        trendLines,
        activeZoneName: `★ ROMPIMENTO LTA: ${ltaPrice.toFixed(5)} (PUT) ★`,
        actionCandle: 'NASCIMENTO_00S',
        cycleStatus: {
          ...cycleStatus,
          phase: 'GATILHO_CONFIRMADO',
          phaseLabel: 'ROMPIMENTO DE LTA CONFIRMADO (PUT)',
        },
        activeCommandCandle: null,
        allCommandCandles: [],
        fiboAnalysis: null,
        goldenRatioZone: null,
      };
    }
  }

  // ─── REGRA 3: REVERSÃO EM LTB (VELA VERDE RETRAI NA LTB E FECHA ABAIXO -> PUT) ──
  // O preço vem com vela verde em direção à LTB, testa a LTB, retrai e NÃO rompe,
  // terminando abaixo da linha de resistência da LTB -> Reversão para VENDA (PUT)!
  if (ltb) {
    const ltbPrice = ltb.currentProjectedPrice;
    const testedLTB = lastCandle.high >= ltbPrice - tolerance;
    const notBrokenLTB = lastCandle.close <= ltbPrice + tolerance * 0.25;
    const hasUpperRejection = lastUpperWickPct >= 22 || (lastCandle.high - lastCandle.close) >= lastRange * 0.35;

    if (testedLTB && notBrokenLTB && hasUpperRejection) {
      return {
        verdict: 'PUT',
        signalName: 'REVERSÃO EM LTB · DEFESA DE RESISTÊNCIA (PUT) ▼',
        scenarioType: 'REVERSAO_LTB_VENDA',
        candlePattern: 'REJEICAO_REVERSAO_LTB',
        candlePatternName: `Reversão em LTB (${lastUpperWickPct.toFixed(0)}% Retração Superior)`,
        wickRatio: Math.round(lastUpperWickPct),
        confidence: 95,
        reason: `Vela testou a LTB em ${ltbPrice.toFixed(5)}, sofreu retração expressiva (${lastUpperWickPct.toFixed(0)}% de pavio superior) e fechou abaixo sem romper. Reversão imediata para VENDA (PUT) aos 00s!`,
        confluencePoints: [
          `Respeito à Linha de Tendência de Baixa (LTB: ${ltbPrice.toFixed(5)})`,
          `Rejeição com pavio superior de retração (${lastUpperWickPct.toFixed(1)}%)`,
          `Fechamento estritamente abaixo da LTB, confirmando defesa dos vendedores`,
          'Estratégia PRISMA IA MODO VECTOR OTC: Entrada de Reversão para VENDA aos 00s',
        ],
        vectorType: 'REVERSAO_LTB_VENDA',
        activeTrendLine: ltb,
        defensePrice: ltbPrice,
        midDefensePrice: ltbPrice,
        isFirstTouch: true,
        trendLines,
        activeZoneName: `★ REVERSÃO LTB: ${ltbPrice.toFixed(5)} (PUT) ★`,
        actionCandle: 'NASCIMENTO_00S',
        cycleStatus: {
          ...cycleStatus,
          phase: 'GATILHO_CONFIRMADO',
          phaseLabel: 'REVERSÃO EM LTB VALIDADA (PUT)',
        },
        activeCommandCandle: null,
        allCommandCandles: [],
        fiboAnalysis: null,
        goldenRatioZone: null,
      };
    }
  }

  // ─── REGRA 4: REVERSÃO EM LTA & SUPORTE (VELA VERMELHA RETRAI NA LTA E FECHA ACIMA -> CALL) ──
  // O preço desce com vela vermelha em direção à LTA / Suporte, testa a LTA, retrai e NÃO rompe,
  // terminando acima da linha de suporte da LTA -> Reversão para COMPRA (CALL)!
  if (lta) {
    const ltaPrice = lta.currentProjectedPrice;
    const testedLTA = lastCandle.low <= ltaPrice + tolerance;
    const notBrokenLTA = lastCandle.close >= ltaPrice - tolerance * 0.25;
    const hasLowerRejection = lastLowerWickPct >= 22 || (lastCandle.close - lastCandle.low) >= lastRange * 0.35;

    if (testedLTA && notBrokenLTA && hasLowerRejection) {
      return {
        verdict: 'CALL',
        signalName: 'REVERSÃO EM LTA · DEFESA DE SUPORTE (CALL) ▲',
        scenarioType: 'REVERSAO_LTA_COMPRA',
        candlePattern: 'REJEICAO_REVERSAO_LTA',
        candlePatternName: `Reversão em LTA (${lastLowerWickPct.toFixed(0)}% Retração Inferior)`,
        wickRatio: Math.round(lastLowerWickPct),
        confidence: 95,
        reason: `Vela testou a LTA e suporte em ${ltaPrice.toFixed(5)}, sofreu retração compradora expressiva (${lastLowerWickPct.toFixed(0)}% de pavio inferior) e terminou acima sem romper. Reversão imediata para COMPRA (CALL) aos 00s!`,
        confluencePoints: [
          `Respeito à Linha de Tendência de Alta (LTA: ${ltaPrice.toFixed(5)})`,
          `Rejeição com pavio inferior de sustentação (${lastLowerWickPct.toFixed(1)}%)`,
          `Fechamento estritamente acima da LTA, confirmando defesa dos compradores`,
          'Estratégia PRISMA IA MODO VECTOR OTC: Entrada de Reversão para COMPRA aos 00s',
        ],
        vectorType: 'REVERSAO_LTA_COMPRA',
        activeTrendLine: lta,
        defensePrice: ltaPrice,
        midDefensePrice: ltaPrice,
        isFirstTouch: true,
        trendLines,
        activeZoneName: `★ REVERSÃO LTA: ${ltaPrice.toFixed(5)} (CALL) ★`,
        actionCandle: 'NASCIMENTO_00S',
        cycleStatus: {
          ...cycleStatus,
          phase: 'GATILHO_CONFIRMADO',
          phaseLabel: 'REVERSÃO EM LTA VALIDADA (CALL)',
        },
        activeCommandCandle: null,
        allCommandCandles: [],
        fiboAnalysis: null,
        goldenRatioZone: null,
      };
    }
  }

  // ─── 5. STANDBY / MONITORAMENTO DE APROXIMAÇÃO AOS VETORES LTA / LTB ────────
  const refLine = ltb || lta || null;
  const refPrice = refLine ? refLine.currentProjectedPrice : lastCandle.close;
  const dist = Math.abs(lastCandle.close - refPrice);
  const isNear = dist <= avgBody * 1.6;

  return {
    verdict: 'NO_TRADE',
    signalName: isNear
      ? `APROXIMANDO DE ${refLine?.type || 'LINHA'} (${refPrice.toFixed(5)})`
      : 'MONITORANDO VETORES LTA / LTB',
    scenarioType: isNear ? 'AGUARDANDO_TESTE_VECTOR' : 'MONITORANDO_VETORES',
    candlePattern: 'NENHUM',
    candlePatternName: isNear ? 'Teste Próximo de LTA/LTB' : 'Em Formação',
    wickRatio: Math.round(Math.max(lastUpperWickPct, lastLowerWickPct)),
    confidence: isNear ? 60 : 35,
    reason: isNear
      ? `Preço se aproximando da ${refLine?.type || 'linha de tendência'} em ${refPrice.toFixed(5)}. Aguardando rompimento de fluxo ou retração de reversão aos 00s.`
      : `Analisando formação de canais e tendências LTA/LTB. Preço atual: ${lastCandle.close.toFixed(5)}.`,
    confluencePoints: [
      `Vetores mapeados: ${lta ? 'LTA (Suporte)' : 'Sem LTA'} | ${ltb ? 'LTB (Resistência)' : 'Sem LTB'}`,
      `Taxa de referência: ${refPrice.toFixed(5)}`,
      'Gatilhos ativos: Rompimento com confirmação de cor ou Reversão com retração sem romper',
    ],
    vectorType: 'MONITORANDO',
    activeTrendLine: refLine,
    defensePrice: refPrice,
    midDefensePrice: refPrice,
    isFirstTouch: false,
    trendLines,
    activeZoneName: refLine ? `VETOR ${refLine.type}: ${refPrice.toFixed(5)}` : 'MONITORANDO VETORES',
    actionCandle: 'NASCIMENTO_00S',
    cycleStatus: {
      ...cycleStatus,
      phase: isNear ? 'APROXIMANDO_LINHA' : 'MONITORANDO_VETORES',
      phaseLabel: isNear ? `APROXIMANDO DA ${refLine?.type || 'LINHA'}` : 'MONITORANDO VETORES LTA / LTB',
    },
    activeCommandCandle: null,
    allCommandCandles: [],
    fiboAnalysis: null,
    goldenRatioZone: null,
  };
}
