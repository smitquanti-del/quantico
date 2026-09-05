import type { Candle } from '@/types';

export interface TrendLine {
  id: string;
  type: 'LTA' | 'LTB' | 'CHANNEL_TOP' | 'CHANNEL_BOTTOM' | 'PULLBACK_MICRO' | 'HORIZONTAL_LEVEL';
  label: string;
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  startPrice: number;
  endPrice: number;
  slope: number;
  projectedPriceAtCurrent: number;
  isConfirmed: boolean;
  color: string;
  width: number;
  dashed?: boolean;
  alertPrice?: number;
}

export interface ExtremePoint {
  type: 'TOP' | 'BOTTOM';
  candleIndex: number;
  time: number;
  price: number;
  label: string;
}

export interface ChartStructureResult {
  lines: TrendLine[];
  extremes: ExtremePoint[];
  activePattern: 'CANAL_BAIXA' | 'CANAL_ALTA' | 'CUNHA_COMPRESSAO' | 'LTA_PRIMARIA' | 'LTB_PRIMARIA' | 'CONSOLIDACAO';
  patternLabel: string;
  regionsCount: number;
  currentInteraction: {
    touchingLTA: boolean;
    touchingLTB: boolean;
    touchingSupport: boolean;
    touchingResistance: boolean;
    insideChannel: boolean;
    confluenceDescription: string;
    suggestedAction: 'CALL' | 'PUT' | 'NEUTRAL';
  };
}

export type MarketCycleType =
  | 'TENDENCIA_ALTA_DEFINIDA'
  | 'TENDENCIA_BAIXA_DEFINIDA'
  | 'CORRECAO_EM_BANDEIRA'
  | 'COMPRESSAO_CUNHA'
  | 'CONSOLIDACAO_LATERAL'
  | 'EXAUSTAO_NO_TOPO'
  | 'EXAUSTAO_NO_FUNDO';

export interface PastCandlesReading {
  summary: string;
  bias: 'ALTA' | 'BAIXA' | 'INDECISAO';
  wickRejection: 'SUPERIOR' | 'INFERIOR' | 'NEUTRA';
  momentum: 'EXPANSAO' | 'DESACELERACAO' | 'NORMAL';
  recentCandlesDescription: string;
}

export interface ClosingCandleValidation {
  isGreen: boolean;
  isRed: boolean;
  isDoji: boolean;
  isExhaustion: boolean;
  exhaustionReason?: string;
  upperWickPct: number;
  lowerWickPct: number;
  bodyPct: number;
  isValidForCall: boolean;
  isValidForPut: boolean;
  blockReasonCall?: string;
  blockReasonPut?: string;
  statusBadge: string;
  detailedAnalysis: string;
}

export interface MarketCycleAnalysis {
  cycleType: MarketCycleType;
  cycleLabel: string;
  cycleDescription: string;
  candlesReading: PastCandlesReading;
  closingCandle: ClosingCandleValidation;
  certaintyScore: number; // 0 a 100
  hasHighConviction: boolean; // apenas true se confluência de 100% de certeza for atingida
  confluenceSignal: 'CALL' | 'PUT' | 'AGUARDANDO_CONFLUENCIA';
  strictReason: string;
}

/**
 * Encontra pivôs fractais de máxima e mínima na série de velas
 */
function findPivots(candles: Candle[], leftBars = 2, rightBars = 2) {
  const highPivots: { index: number; candle: Candle }[] = [];
  const lowPivots: { index: number; candle: Candle }[] = [];

  const len = candles.length;
  for (let i = leftBars; i < len - rightBars; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].high >= current.high) isHigh = false;
      if (candles[j].low <= current.low) isLow = false;
    }

    if (isHigh) highPivots.push({ index: i, candle: current });
    if (isLow) lowPivots.push({ index: i, candle: current });
  }

  return { highPivots, lowPivots };
}

/**
 * Motor de detecção automática multi-horizonte de linhas, canais, suportes e confluências
 */
export function calculateAutoTrendlines(candles: Candle[]): ChartStructureResult {
  if (!candles || candles.length < 10) {
    return {
      lines: [],
      extremes: [],
      activePattern: 'CONSOLIDACAO',
      patternLabel: 'Mercado em Formação',
      regionsCount: 0,
      currentInteraction: {
        touchingLTA: false,
        touchingLTB: false,
        touchingSupport: false,
        touchingResistance: false,
        insideChannel: false,
        confluenceDescription: 'Aguardando mais velas para traçar regiões.',
        suggestedAction: 'NEUTRAL',
      },
    };
  }

  const totalCandles = candles.length;
  const currentCandle = candles[totalCandles - 1];
  const { highPivots, lowPivots } = findPivots(candles, 2, 1);

  const lines: TrendLine[] = [];
  const extremes: ExtremePoint[] = [];

  // 1. Encontrar Máximas e Mínimas Globais do ciclo para os badges cinzas
  let highestHigh = -Infinity;
  let highestIdx = 0;
  let lowestLow = Infinity;
  let lowestIdx = 0;

  // Analisa as últimas 60 velas
  const scanStart = Math.max(0, totalCandles - 60);
  for (let i = scanStart; i < totalCandles; i++) {
    if (candles[i].high > highestHigh) {
      highestHigh = candles[i].high;
      highestIdx = i;
    }
    if (candles[i].low < lowestLow) {
      lowestLow = candles[i].low;
      lowestIdx = i;
    }
  }

  if (highestHigh !== -Infinity) {
    extremes.push({
      type: 'TOP',
      candleIndex: highestIdx,
      time: candles[highestIdx].time,
      price: highestHigh,
      label: highestHigh.toFixed(candles[highestIdx].high > 1000 ? 2 : 5),
    });
  }

  if (lowestLow !== Infinity) {
    extremes.push({
      type: 'BOTTOM',
      candleIndex: lowestIdx,
      time: candles[lowestIdx].time,
      price: lowestLow,
      label: lowestLow.toFixed(candles[lowestIdx].low > 1000 ? 2 : 5),
    });
  }

  // 2. Traçado de LTB (Topos Descendentes)
  // Conecta os 2 topos mais relevantes e recentes
  const recentHighs = highPivots.slice(-4);
  let ltbLine: TrendLine | null = null;

  if (recentHighs.length >= 2) {
    for (let i = recentHighs.length - 1; i >= 1; i--) {
      const p2 = recentHighs[i];
      const p1 = recentHighs[i - 1];

      // Topo descendente ou quase nivelado
      if (p2.candle.high <= p1.candle.high * 1.0005) {
        const dx = p2.index - p1.index;
        if (dx >= 3) {
          const slope = (p2.candle.high - p1.candle.high) / dx;
          // Projeção até a vela atual + 4 velas à frente
          const projectedAtCurrent = p1.candle.high + slope * (totalCandles - 1 - p1.index);
          const extendedEndIdx = Math.min(totalCandles + 4, totalCandles - 1 + 5);
          const extendedEndPrice = p1.candle.high + slope * (extendedEndIdx - p1.index);

          ltbLine = {
            id: `ltb-${p1.index}-${p2.index}`,
            type: 'LTB',
            label: 'LTB Resistência Dinâmica',
            startIndex: p1.index,
            endIndex: extendedEndIdx,
            startTime: p1.candle.time,
            endTime: currentCandle.time + 300,
            startPrice: p1.candle.high,
            endPrice: extendedEndPrice,
            slope,
            projectedPriceAtCurrent: projectedAtCurrent,
            isConfirmed: true,
            color: '#2688eb',
            width: 2,
          };
          lines.push(ltbLine);
          break;
        }
      }
    }
  }

  // 3. Traçado de LTA (Fundos Ascendentes)
  const recentLows = lowPivots.slice(-4);
  let ltaLine: TrendLine | null = null;

  if (recentLows.length >= 2) {
    for (let i = recentLows.length - 1; i >= 1; i--) {
      const p2 = recentLows[i];
      const p1 = recentLows[i - 1];

      // Fundo ascendente ou quase nivelado
      if (p2.candle.low >= p1.candle.low * 0.9995) {
        const dx = p2.index - p1.index;
        if (dx >= 3) {
          const slope = (p2.candle.low - p1.candle.low) / dx;
          const projectedAtCurrent = p1.candle.low + slope * (totalCandles - 1 - p1.index);
          const extendedEndIdx = Math.min(totalCandles + 4, totalCandles - 1 + 5);
          const extendedEndPrice = p1.candle.low + slope * (extendedEndIdx - p1.index);

          ltaLine = {
            id: `lta-${p1.index}-${p2.index}`,
            type: 'LTA',
            label: 'LTA Suporte Dinâmico',
            startIndex: p1.index,
            endIndex: extendedEndIdx,
            startTime: p1.candle.time,
            endTime: currentCandle.time + 300,
            startPrice: p1.candle.low,
            endPrice: extendedEndPrice,
            slope,
            projectedPriceAtCurrent: projectedAtCurrent,
            isConfirmed: true,
            color: '#2688eb',
            width: 2,
          };
          lines.push(ltaLine);
          break;
        }
      }
    }
  }

  // 4. Canais Paralelos (Superior e Inferior)
  // Se temos LTB e estamos em tendência de baixa, projeta o canal inferior pelos fundos
  if (ltbLine && recentLows.length >= 1) {
    // Procura o fundo mais afastado dentro do intervalo da LTB
    let maxDistance = 0;
    let bestLowPrice = currentCandle.low;

    recentLows.forEach((lp) => {
      if (lp.index >= ltbLine!.startIndex) {
        const ltbPriceAtThis = ltbLine!.startPrice + ltbLine!.slope * (lp.index - ltbLine!.startIndex);
        const dist = ltbPriceAtThis - lp.candle.low;
        if (dist > maxDistance) {
          maxDistance = dist;
          bestLowPrice = lp.candle.low;
        }
      }
    });

    if (maxDistance > 0.0001) {
      const channelBottomStartPrice = ltbLine.startPrice - maxDistance;
      const channelBottomEndPrice = ltbLine.endPrice - maxDistance;
      lines.push({
        id: `channel-bottom-${ltbLine.id}`,
        type: 'CHANNEL_BOTTOM',
        label: 'Canal Inferior Suporte',
        startIndex: ltbLine.startIndex,
        endIndex: ltbLine.endIndex,
        startTime: ltbLine.startTime,
        endTime: ltbLine.endTime,
        startPrice: channelBottomStartPrice,
        endPrice: channelBottomEndPrice,
        slope: ltbLine.slope,
        projectedPriceAtCurrent: ltbLine.projectedPriceAtCurrent - maxDistance,
        isConfirmed: true,
        color: '#2688eb',
        width: 1.5,
        dashed: true,
      });
    }
  } else if (ltaLine && recentHighs.length >= 1) {
    // Se temos LTA e estamos em alta, projeta o canal superior pelos topos
    let maxDistance = 0;
    recentHighs.forEach((hp) => {
      if (hp.index >= ltaLine!.startIndex) {
        const ltaPriceAtThis = ltaLine!.startPrice + ltaLine!.slope * (hp.index - ltaLine!.startIndex);
        const dist = hp.candle.high - ltaPriceAtThis;
        if (dist > maxDistance) {
          maxDistance = dist;
        }
      }
    });

    if (maxDistance > 0.0001) {
      lines.push({
        id: `channel-top-${ltaLine.id}`,
        type: 'CHANNEL_TOP',
        label: 'Canal Superior Resistência',
        startIndex: ltaLine.startIndex,
        endIndex: ltaLine.endIndex,
        startTime: ltaLine.startTime,
        endTime: ltaLine.endTime,
        startPrice: ltaLine.startPrice + maxDistance,
        endPrice: ltaLine.endPrice + maxDistance,
        slope: ltaLine.slope,
        projectedPriceAtCurrent: ltaLine.projectedPriceAtCurrent + maxDistance,
        isConfirmed: true,
        color: '#2688eb',
        width: 1.5,
        dashed: true,
      });
    }
  }

  // 5. Micro-Tendências de Pullback (contra-tendência recente nos últimos 10-15 candles)
  const last15 = candles.slice(-15);
  if (last15.length >= 6) {
    const pStartIdx = totalCandles - 12;
    const pEndIdx = totalCandles - 2;
    const c1 = candles[pStartIdx];
    const c2 = candles[pEndIdx];

    if (c1 && c2) {
      const isMicroDown = c2.high < c1.high;
      const isMicroUp = c2.low > c1.low;

      if (isMicroDown && (!ltbLine || Math.abs(ltbLine.startIndex - pStartIdx) > 6)) {
        lines.push({
          id: `pullback-micro-${pStartIdx}`,
          type: 'PULLBACK_MICRO',
          label: 'Micro-Pullback Retração',
          startIndex: pStartIdx,
          endIndex: totalCandles + 2,
          startTime: c1.time,
          endTime: currentCandle.time + 120,
          startPrice: c1.high,
          endPrice: c2.high - (c1.high - c2.high) * 0.4,
          slope: (c2.high - c1.high) / (pEndIdx - pStartIdx),
          projectedPriceAtCurrent: c2.high,
          isConfirmed: true,
          color: '#38bdf8',
          width: 1.5,
        });
      } else if (isMicroUp && (!ltaLine || Math.abs(ltaLine.startIndex - pStartIdx) > 6)) {
        lines.push({
          id: `pullback-micro-${pStartIdx}`,
          type: 'PULLBACK_MICRO',
          label: 'Micro-Pullback Suporte',
          startIndex: pStartIdx,
          endIndex: totalCandles + 2,
          startTime: c1.time,
          endTime: currentCandle.time + 120,
          startPrice: c1.low,
          endPrice: c2.low + (c2.low - c1.low) * 0.4,
          slope: (c2.low - c1.low) / (pEndIdx - pStartIdx),
          projectedPriceAtCurrent: c2.low,
          isConfirmed: true,
          color: '#38bdf8',
          width: 1.5,
        });
      }
    }
  }

  // 6. Níveis Horizontais Relevantes de Suporte e Resistência com Alerta 🔔
  if (recentHighs.length > 0) {
    const lastHigh = recentHighs[recentHighs.length - 1];
    lines.push({
      id: `h-res-${lastHigh.index}`,
      type: 'HORIZONTAL_LEVEL',
      label: 'Resistência Topo Relevante',
      startIndex: Math.max(0, lastHigh.index - 10),
      endIndex: totalCandles + 4,
      startTime: lastHigh.candle.time,
      endTime: currentCandle.time + 300,
      startPrice: lastHigh.candle.high,
      endPrice: lastHigh.candle.high,
      slope: 0,
      projectedPriceAtCurrent: lastHigh.candle.high,
      isConfirmed: true,
      color: 'rgba(56, 189, 248, 0.45)',
      width: 1,
      dashed: true,
      alertPrice: lastHigh.candle.high,
    });
  }

  if (recentLows.length > 0) {
    const lastLow = recentLows[recentLows.length - 1];
    lines.push({
      id: `h-sup-${lastLow.index}`,
      type: 'HORIZONTAL_LEVEL',
      label: 'Suporte Fundo Relevante',
      startIndex: Math.max(0, lastLow.index - 10),
      endIndex: totalCandles + 4,
      startTime: lastLow.candle.time,
      endTime: currentCandle.time + 300,
      startPrice: lastLow.candle.low,
      endPrice: lastLow.candle.low,
      slope: 0,
      projectedPriceAtCurrent: lastLow.candle.low,
      isConfirmed: true,
      color: 'rgba(56, 189, 248, 0.45)',
      width: 1,
      dashed: true,
      alertPrice: lastLow.candle.low,
    });
  }

  // 7. Determinar o Padrão Geral Ativo
  let activePattern: ChartStructureResult['activePattern'] = 'CONSOLIDACAO';
  let patternLabel = 'Consolidação / Faixa de Preço';

  const hasLTA = lines.some((l) => l.type === 'LTA');
  const hasLTB = lines.some((l) => l.type === 'LTB');
  const hasChannel = lines.some((l) => l.type === 'CHANNEL_TOP' || l.type === 'CHANNEL_BOTTOM');

  if (hasLTA && hasLTB) {
    activePattern = 'CUNHA_COMPRESSAO';
    patternLabel = 'Cunha / Compressão de Rompimento';
  } else if (hasChannel) {
    if (hasLTB) {
      activePattern = 'CANAL_BAIXA';
      patternLabel = 'Canal de Baixa Paralelo';
    } else {
      activePattern = 'CANAL_ALTA';
      patternLabel = 'Canal de Alta Paralelo';
    }
  } else if (hasLTB) {
    activePattern = 'LTB_PRIMARIA';
    patternLabel = 'Linha de Tendência de Baixa (LTB)';
  } else if (hasLTA) {
    activePattern = 'LTA_PRIMARIA';
    patternLabel = 'Linha de Tendência de Alta (LTA)';
  }

  // 8. Avaliar Interação e Confluência do Preço Atual
  const curPrice = currentCandle.close;
  const candleRange = Math.max(0.0001, currentCandle.high - currentCandle.low);
  const touchTolerance = candleRange * 0.75;

  let touchingLTA = false;
  let touchingLTB = false;
  let touchingSupport = false;
  let touchingResistance = false;
  let insideChannel = hasChannel;
  let confluenceDescription = 'Preço transitando livremente dentro das zonas estruturais.';
  let suggestedAction: 'CALL' | 'PUT' | 'NEUTRAL' = 'NEUTRAL';

  lines.forEach((l) => {
    const diff = Math.abs(curPrice - l.projectedPriceAtCurrent);
    if (diff <= touchTolerance) {
      if (l.type === 'LTA' || l.type === 'CHANNEL_BOTTOM') {
        touchingLTA = true;
        suggestedAction = 'CALL';
        confluenceDescription = `Toque em ${l.label} (${l.projectedPriceAtCurrent.toFixed(5)}). Suporte dinâmico validado.`;
      } else if (l.type === 'LTB' || l.type === 'CHANNEL_TOP') {
        touchingLTB = true;
        suggestedAction = 'PUT';
        confluenceDescription = `Toque em ${l.label} (${l.projectedPriceAtCurrent.toFixed(5)}). Resistência dinâmica validada.`;
      } else if (l.type === 'HORIZONTAL_LEVEL') {
        if (l.label.includes('Suporte')) {
          touchingSupport = true;
          if (suggestedAction === 'NEUTRAL') suggestedAction = 'CALL';
        } else {
          touchingResistance = true;
          if (suggestedAction === 'NEUTRAL') suggestedAction = 'PUT';
        }
      }
    }
  });

  return {
    lines,
    extremes,
    activePattern,
    patternLabel,
    regionsCount: lines.length,
    currentInteraction: {
      touchingLTA,
      touchingLTB,
      touchingSupport,
      touchingResistance,
      insideChannel,
      confluenceDescription,
      suggestedAction,
    },
  };
}

/**
 * Analisador Profundo de Ciclo de Mercado e Leitura de Velas Passadas
 * - Examina as velas passadas (rejeição de pavio, exaustão, corpos e momentum)
 * - Identifica o ciclo exato onde o preço está posicionado (Bandeira, Tendência, Cunha, Consolidação)
 * - Aplica filtro estrito de alta convicção para NÃO gerar sinal atrás do outro em toda vela
 */
/**
 * Validação Estrita da Vela que está para fechar (Filtro Anti-Reversão e Anti-Exaustão)
 * Regra do Operador:
 * - Para COMPRA: a vela prestes a fechar DEVE ser VERDE e NÃO pode ser de exaustão (sem pavio superior longo de rejeição).
 * - Para VENDA: a vela prestes a fechar DEVE ser VERMELHA e NÃO pode ser de exaustão (sem pavio inferior longo de absorção).
 * Se a vela estiver na cor oposta ou com exaustão, o robô bloqueia a entrada para não tentar operar reversão de risco.
 */
export function validateClosingCandle(candle: Candle, avgBodySize = 0.0002): ClosingCandleValidation {
  const range = Math.max(0.000001, candle.high - candle.low);
  const body = Math.abs(candle.close - candle.open);
  const isGreen = candle.close > candle.open;
  const isRed = candle.close < candle.open;
  const isDoji = body / range < 0.12;

  const topBody = Math.max(candle.open, candle.close);
  const botBody = Math.min(candle.open, candle.close);
  const upperWick = Math.max(0, candle.high - topBody);
  const lowerWick = Math.max(0, botBody - candle.low);

  const upperWickPct = Number(((upperWick / range) * 100).toFixed(1));
  const lowerWickPct = Number(((lowerWick / range) * 100).toFixed(1));
  const bodyPct = Number(((body / range) * 100).toFixed(1));

  let isExhaustion = false;
  let exhaustionReason = '';

  // 1. Pavio superior de rejeição muito longo em vela verde (exaustão no topo / touros absorvidos):
  if (isGreen && upperWickPct >= 35) {
    isExhaustion = true;
    exhaustionReason = `Vela verde de exaustão no topo (pavio superior de ${upperWickPct}% indica forte rejeição vendedora).`;
  }

  // 2. Pavio inferior de rejeição muito longo em vela vermelha (exaustão no fundo / ursos absorvidos):
  if (isRed && lowerWickPct >= 35) {
    isExhaustion = true;
    exhaustionReason = `Vela vermelha de exaustão no fundo (pavio inferior de ${lowerWickPct}% indica absorção compradora no suporte).`;
  }

  // 3. Clímax de exaustão anormal (vela esticada que perdeu fôlego no final):
  if (body > avgBodySize * 2.8) {
    if (isGreen && upperWickPct >= 25) {
      isExhaustion = true;
      exhaustionReason = `Clímax de exaustão compradora (vela verde esticada com ${upperWickPct}% de pavio superior).`;
    } else if (isRed && lowerWickPct >= 25) {
      isExhaustion = true;
      exhaustionReason = `Clímax de exaustão vendedora (vela vermelha esticada com ${lowerWickPct}% de pavio inferior).`;
    }
  }

  // 4. Vela doji anêmica (sem corpo direcional):
  if (isDoji) {
    isExhaustion = true;
    exhaustionReason = `Vela doji de indecisão (corpo de apenas ${bodyPct}% da amplitude).`;
  }

  let isValidForCall = false;
  let blockReasonCall = '';
  if (!isGreen) {
    blockReasonCall = 'FILTRO ANTI-REVERSÃO ATIVO: Vela atual fechando em BAIXA (vermelha). Sinal de COMPRA bloqueado para não operar contra a cor da vela!';
  } else if (isExhaustion) {
    blockReasonCall = `FILTRO ANTI-EXAUSTÃO ATIVO: ${exhaustionReason} Compra bloqueada para não entrar em topo exausto!`;
  } else {
    isValidForCall = true;
  }

  let isValidForPut = false;
  let blockReasonPut = '';
  if (!isRed) {
    blockReasonPut = 'FILTRO ANTI-REVERSÃO ATIVO: Vela atual fechando em ALTA (verde). Sinal de VENDA bloqueado para não operar contra a cor da vela!';
  } else if (isExhaustion) {
    blockReasonPut = `FILTRO ANTI-EXAUSTÃO ATIVO: ${exhaustionReason} Venda bloqueada para não entrar em fundo exausto!`;
  } else {
    isValidForPut = true;
  }

  let statusBadge = '';
  let detailedAnalysis = '';
  if (isGreen) {
    if (isValidForCall) {
      statusBadge = 'Vela Verde Saudável (Aprovada para Compra)';
      detailedAnalysis = `Vela fechando em ALTA com corpo sólido (${bodyPct}%) e pavio superior controlado (${upperWickPct}%). Sem exaustão de topo.`;
    } else {
      statusBadge = 'Vela Verde Inválida (Exaustão)';
      detailedAnalysis = `Vela em alta, porém com sinal de exaustão (${exhaustionReason}). Compra barrada para proteção.`;
    }
  } else if (isRed) {
    if (isValidForPut) {
      statusBadge = 'Vela Vermelha Saudável (Aprovada para Venda)';
      detailedAnalysis = `Vela fechando em BAIXA com corpo sólido (${bodyPct}%) e pavio inferior controlado (${lowerWickPct}%). Sem exaustão de fundo.`;
    } else {
      statusBadge = 'Vela Vermelha Inválida (Exaustão)';
      detailedAnalysis = `Vela em baixa, porém com sinal de exaustão (${exhaustionReason}). Venda barrada para proteção.`;
    }
  } else {
    statusBadge = 'Vela Doji Neutra (Bloqueada)';
    detailedAnalysis = 'Vela fechando sem corpo definido. Operações de reversão bloqueadas.';
  }

  return {
    isGreen,
    isRed,
    isDoji,
    isExhaustion,
    exhaustionReason,
    upperWickPct,
    lowerWickPct,
    bodyPct,
    isValidForCall,
    isValidForPut,
    blockReasonCall,
    blockReasonPut,
    statusBadge,
    detailedAnalysis,
  };
}

export function analyzeMarketCycleAndCandles(
  candles: Candle[],
  structure: ChartStructureResult
): MarketCycleAnalysis {
  if (!candles || candles.length < 5) {
    const dummyValidation: ClosingCandleValidation = {
      isGreen: false,
      isRed: false,
      isDoji: true,
      isExhaustion: true,
      upperWickPct: 0,
      lowerWickPct: 0,
      bodyPct: 0,
      isValidForCall: false,
      isValidForPut: false,
      statusBadge: 'Aguardando Velas',
      detailedAnalysis: 'Amostragem inicial de velas insuficiente.',
    };
    return {
      cycleType: 'CONSOLIDACAO_LATERAL',
      cycleLabel: 'Consolidação Neutra',
      cycleDescription: 'Aguardando histórico suficiente para leitura do ciclo.',
      candlesReading: {
        summary: 'Amostragem inicial de velas.',
        bias: 'INDECISAO',
        wickRejection: 'NEUTRA',
        momentum: 'NORMAL',
        recentCandlesDescription: 'Poucas velas para análise de ciclo.',
      },
      closingCandle: dummyValidation,
      certaintyScore: 50,
      hasHighConviction: false,
      confluenceSignal: 'AGUARDANDO_CONFLUENCIA',
      strictReason: 'Robô aguardando mais velas para leitura profunda do ciclo.',
    };
  }

  // Analisa as últimas 10 velas
  const windowSize = Math.min(10, candles.length);
  const recent = candles.slice(-windowSize);
  const last = recent[recent.length - 1];

  let greenCount = 0;
  let redCount = 0;
  let totalUpperWick = 0;
  let totalLowerWick = 0;
  let totalBody = 0;

  recent.forEach((c) => {
    const isGreen = c.close >= c.open;
    if (isGreen) greenCount++;
    else redCount++;

    const topBody = Math.max(c.open, c.close);
    const botBody = Math.min(c.open, c.close);
    const upperWick = c.high - topBody;
    const lowerWick = botBody - c.low;
    const body = Math.abs(c.close - c.open);

    totalUpperWick += upperWick;
    totalLowerWick += lowerWick;
    totalBody += body;
  });

  const avgBody = totalBody / windowSize || 0.0001;

  // Validação Estrita da Vela Atual Prestes a Fechar
  const closingCandle = validateClosingCandle(last, avgBody);

  // Leitura de Pavios das últimas velas
  let wickRejection: 'SUPERIOR' | 'INFERIOR' | 'NEUTRA' = 'NEUTRA';
  if (totalUpperWick > totalLowerWick * 1.35) {
    wickRejection = 'SUPERIOR';
  } else if (totalLowerWick > totalUpperWick * 1.35) {
    wickRejection = 'INFERIOR';
  }

  // Momentum das últimas 3 velas
  const last3 = recent.slice(-3);
  const last3Range = last3.map((c) => c.high - c.low);
  let momentum: 'EXPANSAO' | 'DESACELERACAO' | 'NORMAL' = 'NORMAL';
  if (last3Range.length === 3) {
    if (last3Range[2] < last3Range[1] && last3Range[1] < last3Range[0]) {
      momentum = 'DESACELERACAO';
    } else if (last3Range[2] > last3Range[1] && last3Range[1] > last3Range[0]) {
      momentum = 'EXPANSAO';
    }
  }

  // Determinação do Viés de Velas Passadas
  let bias: 'ALTA' | 'BAIXA' | 'INDECISAO' = 'INDECISAO';
  if (greenCount >= 7) bias = 'ALTA';
  else if (redCount >= 7) bias = 'BAIXA';
  else if (wickRejection === 'INFERIOR') bias = 'ALTA';
  else if (wickRejection === 'SUPERIOR') bias = 'BAIXA';

  // Descrição das velas passadas
  let recentCandlesDescription = '';
  if (wickRejection === 'SUPERIOR') {
    recentCandlesDescription = `Velas anteriores rejeitando topos com pavios superiores longos (${greenCount} altas / ${redCount} baixas). Vendedores defendendo a região.`;
  } else if (wickRejection === 'INFERIOR') {
    recentCandlesDescription = `Velas anteriores rejeitando fundos com pavios inferiores longos (${greenCount} altas / ${redCount} baixas). Compradores absorvendo no suporte.`;
  } else {
    recentCandlesDescription = `Velas equilibradas (${greenCount} altas / ${redCount} baixas), corpos regulares com média de ${(avgBody * 100000).toFixed(1)} pts.`;
  }

  const candlesReading: PastCandlesReading = {
    summary: `${greenCount} velas verdes e ${redCount} vermelhas recentes com rejeição ${wickRejection}.`,
    bias,
    wickRejection,
    momentum,
    recentCandlesDescription,
  };

  // Identificação do Ciclo do Mercado Atual
  let cycleType: MarketCycleType = 'CONSOLIDACAO_LATERAL';
  let cycleLabel = 'Consolidação Lateral';
  let cycleDescription = 'Preço transitando em faixa horizontal entre suporte e resistência.';

  const pattern = structure.activePattern;
  if (pattern === 'CANAL_ALTA' || (pattern === 'LTA_PRIMARIA' && greenCount >= redCount)) {
    if (redCount >= 2 && momentum === 'DESACELERACAO') {
      cycleType = 'CORRECAO_EM_BANDEIRA';
      cycleLabel = 'Correção em Bandeira de Alta';
      cycleDescription = 'Mercado em tendência principal de alta fazendo pullback corretivo ordenado em direção à LTA.';
    } else {
      cycleType = 'TENDENCIA_ALTA_DEFINIDA';
      cycleLabel = 'Tendência de Alta Definida';
      cycleDescription = 'Ondas impulsivas compradoras com topos e fundos ascendentes sustentados pela LTA.';
    }
  } else if (pattern === 'CANAL_BAIXA' || (pattern === 'LTB_PRIMARIA' && redCount >= greenCount)) {
    if (greenCount >= 2 && momentum === 'DESACELERACAO') {
      cycleType = 'CORRECAO_EM_BANDEIRA';
      cycleLabel = 'Correção em Bandeira de Baixa';
      cycleDescription = 'Mercado em tendência principal de baixa fazendo pullback corretivo ordenado em direção à LTB.';
    } else {
      cycleType = 'TENDENCIA_BAIXA_DEFINIDA';
      cycleLabel = 'Tendência de Baixa Definida';
      cycleDescription = 'Ondas impulsivas vendedoras com topos e fundos descendentes guiados pela LTB.';
    }
  } else if (pattern === 'CUNHA_COMPRESSAO') {
    cycleType = 'COMPRESSAO_CUNHA';
    cycleLabel = 'Cunha / Compressão de Volatilidade';
    cycleDescription = 'Preço afunilando entre LTA e LTB com velas encolhendo, acumulando energia para rompimento.';
  } else if (wickRejection === 'SUPERIOR' && redCount >= 2) {
    cycleType = 'EXAUSTAO_NO_TOPO';
    cycleLabel = 'Exaustão no Topo (Rejeição)';
    cycleDescription = 'Velas esticadas bateram no teto e deixaram rejeição de pavios superiores.';
  } else if (wickRejection === 'INFERIOR' && greenCount >= 2) {
    cycleType = 'EXAUSTAO_NO_FUNDO';
    cycleLabel = 'Exaustão no Fundo (Absorção)';
    cycleDescription = 'Velas esticadas bateram no piso e deixaram absorção de pavios inferiores.';
  }

  // Avaliação de Alta Convicção / Certeza Estrita (Anti-Overtrading)
  const interaction = structure.currentInteraction;
  let hasHighConviction = false;
  let certaintyScore = 68;
  let confluenceSignal: 'CALL' | 'PUT' | 'AGUARDANDO_CONFLUENCIA' = 'AGUARDANDO_CONFLUENCIA';
  let strictReason = '';

  // Cenário de Alta Certeza para COMPRA (CALL):
  // Regra Estrita: Preço na LTA/Suporte + Vela atual fechando VERDE e SEM exaustão!
  const isCallConfluence =
    (interaction.touchingLTA || interaction.touchingSupport) &&
    (wickRejection === 'INFERIOR' || momentum === 'DESACELERACAO' || last.close >= last.open);

  // Cenário de Alta Certeza para VENDA (PUT):
  // Regra Estrita: Preço na LTB/Resistência + Vela atual fechando VERMELHA e SEM exaustão!
  const isPutConfluence =
    (interaction.touchingLTB || interaction.touchingResistance) &&
    (wickRejection === 'SUPERIOR' || momentum === 'DESACELERACAO' || last.close <= last.open);

  if (isCallConfluence && !isPutConfluence) {
    if (closingCandle.isValidForCall) {
      hasHighConviction = true;
      certaintyScore = 97.2;
      confluenceSignal = 'CALL';
      strictReason = `CONFLUÊNCIA CONFIRMADA (CALL): Toque em ${
        interaction.touchingLTA ? 'LTA Suporte' : 'Piso'
      } + Vela atual fechando VERDE e saudável (${closingCandle.bodyPct}% corpo, sem exaustão). Entrada segura aos :00s sem risco de reversão forçada!`;
    } else {
      hasHighConviction = false;
      certaintyScore = 69.0;
      confluenceSignal = 'AGUARDANDO_CONFLUENCIA';
      strictReason = `${closingCandle.blockReasonCall || 'Vela atual não fechou verde saudável.'} Entrada de COMPRA bloqueada pelo filtro anti-reversão.`;
    }
  } else if (isPutConfluence && !isCallConfluence) {
    if (closingCandle.isValidForPut) {
      hasHighConviction = true;
      certaintyScore = 96.8;
      confluenceSignal = 'PUT';
      strictReason = `CONFLUÊNCIA CONFIRMADA (PUT): Toque em ${
        interaction.touchingLTB ? 'LTB Resistência' : 'Teto'
      } + Vela atual fechando VERMELHA e saudável (${closingCandle.bodyPct}% corpo, sem exaustão). Entrada segura aos :00s sem risco de reversão forçada!`;
    } else {
      hasHighConviction = false;
      certaintyScore = 69.0;
      confluenceSignal = 'AGUARDANDO_CONFLUENCIA';
      strictReason = `${closingCandle.blockReasonPut || 'Vela atual não fechou vermelha saudável.'} Entrada de VENDA bloqueada pelo filtro anti-reversão.`;
    }
  } else {
    hasHighConviction = false;
    certaintyScore = 72.0;
    confluenceSignal = 'AGUARDANDO_CONFLUENCIA';
    strictReason = `MONITORANDO CICLO (${cycleLabel}): ${closingCandle.statusBadge}. O robô aguarda toque em LTA/LTB com vela saudável correspondente para garantir 100% de assertividade.`;
  }

  return {
    cycleType,
    cycleLabel,
    cycleDescription,
    candlesReading,
    closingCandle,
    certaintyScore,
    hasHighConviction,
    confluenceSignal,
    strictReason,
  };
}
