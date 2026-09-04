import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Bot,
  Sparkles,
  Send,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Square,
  Play,
  HelpCircle,
} from 'lucide-react';
import type { Candle, OtcAsset } from '@/types';
import type { ZonasCenariosSignal } from '@/lib/zonas-cenarios-fibo-engine';
import { speakVoiceNotification, stopSpeaking, playClickSound } from '@/lib/sound';

interface MarketVoiceAssistantProps {
  selectedAsset: OtcAsset;
  candles: Candle[];
  metrics: ZonasCenariosSignal;
  secondsToNextCandle: number;
  autoVoiceAlerts: boolean;
  onToggleAutoVoice: () => void;
}

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  time: string;
}

export const MarketVoiceAssistant: React.FC<MarketVoiceAssistantProps> = ({
  selectedAsset,
  candles,
  metrics,
  secondsToNextCandle,
  autoVoiceAlerts,
  onToggleAutoVoice,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const [inputText, setInputText] = useState<string>('');
  const [transcript, setTranscript] = useState<string>('');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg-welcome',
      sender: 'bot',
      text: `Olá! Sou o Assistente de Inteligência do Robô Prisma IA. Agora opero com a tecnologia Gocharting Power Tick: Active & Inactive Value diretamente nas velas! Analiso desbalanceamento de ordens em tempo real e aplico filtros anti-loss rigorosos (filtrando velas mortas e armadilhas de absorção). Pressione "FALAR NO MICROFONE" para tirar dúvidas!`,
      time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
        new Date()
      ),
    },
  ]);

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Rolagem suave do chat para a última mensagem
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Inicializa o Web Speech API (Reconhecimento de Voz no navegador)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceError(null);
        setTranscript('');
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error !== 'no-speech') {
          setVoiceError(`Erro no microfone: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        if (transcript && transcript.trim().length > 0) {
          handleUserQuery(transcript);
        }
      };

      recognitionRef.current = recognition;
    } catch {
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [transcript]);

  // Inteligência de Resposta do Robô baseada no PRISMA IA MODO VECTOR OTC (LTA / LTB)
  const generateBotAnswer = useCallback(
    (question: string): string => {
      const q = question.toLowerCase().trim();
      const lastCandle = candles[candles.length - 1];
      const isGreen = lastCandle ? lastCandle.close >= lastCandle.open : true;

      // Pergunta sobre LTA / LTB / Tendência
      if (
        q.includes('lta') ||
        q.includes('ltb') ||
        q.includes('tendencia') ||
        q.includes('tendência') ||
        q.includes('linha') ||
        q.includes('vetor') ||
        q.includes('vector')
      ) {
        return `No Modo Vector OTC, o robô traça automaticamente a LTA (Linha de Tendência de Alta - suporte verde) e a LTB (Linha de Tendência de Baixa - resistência vermelha). Os sinais ocorrem no rompimento dessas linhas com vela de fluxo ou na rejeição/reversão após teste na linha.`;
      }

      // Pergunta sobre Rompimento e Fluxo
      if (
        q.includes('rompe') ||
        q.includes('rompimento') ||
        q.includes('fluxo') ||
        q.includes('continuidade')
      ) {
        return `Regras de Rompimento no Modo Vector OTC:
1) Rompimento de LTB: Quando uma vela verde fecha rompendo a LTB para cima, confirma fluxo comprador para COMPRA (CALL).
2) Rompimento de LTA: Quando uma vela vermelha fecha rompendo a LTA para baixo, confirma fluxo vendedor para VENDA (PUT).
A entrada é disparada no nascimento da próxima vela aos 00 segundos!`;
      }

      // Pergunta sobre Reversão / Retração
      if (
        q.includes('revers') ||
        q.includes('reversão') ||
        q.includes('retra') ||
        q.includes('retração') ||
        q.includes('suporte') ||
        q.includes('resistencia') ||
        q.includes('resistência')
      ) {
        return `Regras de Reversão no Modo Vector OTC:
1) Reversão na LTA (Compra): O preço cai com vela vermelha, testa a LTA mas NÃO rompe, retraindo e fechando acima da linha. O robô emite sinal de COMPRA (CALL) para a próxima vela aos 00 segundos.
2) Reversão na LTB (Venda): O preço sobe com vela verde, testa a LTB mas NÃO rompe, retraindo e fechando abaixo da linha. O robô emite sinal de VENDA (PUT) para a próxima vela aos 00 segundos.`;
      }

      // Pergunta sobre Ciclo, Maturação, Anti-spam
      if (
        q.includes('ciclo') ||
        q.includes('consecutiv') ||
        q.includes('spam') ||
        q.includes('bloqueio') ||
        q.includes('vela atras') ||
        q.includes('vela atrás')
      ) {
        return `Temos um ciclo de proteção anti-spam de 5 velas (5 minutos) após cada sinal executado. Isso protege sua banca contra entradas consecutivas e garante que novas linhas de tendência se formem antes do próximo trade.`;
      }

      // Pergunta sobre Comprar, Vender ou Sinal Atual
      if (
        q.includes('compr') ||
        q.includes('vend') ||
        q.includes('sinal') ||
        q.includes('entr') ||
        q.includes('devo') ||
        q.includes('call') ||
        q.includes('put') ||
        q.includes('gatilho')
      ) {
        if (metrics.scenarioType === 'CICLO_EM_MATURACAO') {
          return `Atenção: O ativo ${selectedAsset.label} está no ciclo de maturação da operação anterior (${metrics.cycleStatus?.candlesSinceLastSignal || 0}/5 velas). O robô bloqueia novas entradas para proteger sua banca.`;
        } else if (metrics.verdict === 'CALL') {
          return `Atenção! Sinal ativo de COMPRA (CALL) em ${selectedAsset.label}! ${metrics.reason}. Entrada aos 00 segundos!`;
        } else if (metrics.verdict === 'PUT') {
          return `Atenção! Sinal ativo de VENDA (PUT) em ${selectedAsset.label}! ${metrics.reason}. Entrada aos 00 segundos!`;
        } else {
          return `Neste momento o mercado está em monitoramento em ${selectedAsset.label}. Aguardando o teste de LTA/LTB para rompimento de fluxo ou reversão.`;
        }
      }

      // Pergunta sobre Vela Atual / Tempo
      if (
        q.includes('vela') ||
        q.includes('candle') ||
        q.includes('cor') ||
        q.includes('nascimento') ||
        q.includes('tempo') ||
        q.includes('segundo') ||
        q.includes('fechamento')
      ) {
        const seg = secondsToNextCandle;
        const color = isGreen ? 'verde de alta' : 'vermelha de baixa';
        return `A vela atual M1 em ${selectedAsset.label} é ${color}. Faltam ${seg} segundos para o término. A confirmação ocorre no fechamento da vela e o gatilho é disparado aos 00 segundos.`;
      }

      // Pergunta sobre a Estratégia / Como funciona / Gocharting
      if (
        q.includes('estratégia') ||
        q.includes('estrategia') ||
        q.includes('como funciona') ||
        q.includes('gocharting') ||
        q.includes('active') ||
        q.includes('inactive') ||
        q.includes('cluster') ||
        q.includes('footprint') ||
        q.includes('filtro') ||
        q.includes('regras') ||
        q.includes('robô') ||
        q.includes('robo')
      ) {
        return `Estratégia Gocharting Active & Inactive Value (Skytex Trading):
1) Números nas Velas (Footprint Clusters): Números verdes representam compradores ativos e números vermelhos representam vendedores ativos em cada nível de preço.
2) Desbalanceamento (Imbalance): Quando o volume ativo supera o lado oposto em mais de 1.4x, arma o sinal na direção do fluxo.
3) Gatilho aos 00s: O robô executa a entrada na exata abertura da próxima vela.
4) Filtros Anti-Loss (Proteção de Banca):
   - Filtro de Vela Morta: Bloqueia entradas em velas sem liquidez ativa.
   - Filtro de Absorção Oculta: Evita armadilhas de reversão (ex: rejeição forte com venda oculta no topo).
   - Filtro de Imbalance Mínimo: Só permite disparo com dominância comprovada.`;
      }

      // Saudações e Ajuda
      if (
        q.includes('olá') ||
        q.includes('ola') ||
        q.includes('oi') ||
        q.includes('bom dia') ||
        q.includes('boa tarde') ||
        q.includes('boa noite') ||
        q.includes('ajuda') ||
        q.includes('quem é você')
      ) {
        return `Olá! Sou a inteligência de voz do Robô Prisma IA. Monitoro o fluxo Gocharting Active & Inactive Value em tempo real com filtros anti-loss para você pegar as melhores entradas aos 00 segundos!`;
      }

      // Pergunta geral / Análise da vela atual
      return `Análise de ${selectedAsset.label}: Gráfico M1 com tecnologia Gocharting Footprint Cluster. Monitorando fluxo ativo de compra e venda com filtros de proteção ativados.`;
    },
    [candles, metrics, selectedAsset, secondsToNextCandle]
  );

  // Manipula envio da pergunta do usuário
  const handleUserQuery = (queryText: string) => {
    if (!queryText.trim()) return;

    const nowStr = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: queryText,
      time: nowStr,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setTranscript('');

    setTimeout(() => {
      const answer = generateBotAnswer(queryText);
      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: answer,
        time: new Intl.DateTimeFormat('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date()),
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsSpeaking(true);
      speakVoiceNotification(answer, {
        onEnd: () => {
          setIsSpeaking(false);
        },
      });
    }, 450);
  };

  const handleStartListening = () => {
    if (!speechSupported) {
      setVoiceError('Reconhecimento de voz não suportado neste navegador.');
      return;
    }

    if (recognitionRef.current) {
      try {
        stopSpeaking();
        setIsSpeaking(false);
        recognitionRef.current.start();
      } catch (err) {
        try {
          recognitionRef.current.abort();
          setTimeout(() => recognitionRef.current.start(), 200);
        } catch {
          // ignore
        }
      }
    }
  };

  const handleStopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleStopAudio = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  return (
    <div className="bg-[#040810]/95 border border-amber-500/25 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
      {/* Top Header do Assistente de Voz */}
      <div className="p-4 bg-gradient-to-r from-amber-950/40 via-sky-950/30 to-slate-900/60 border-b border-amber-500/20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-300 shadow-md shadow-amber-500/20">
              <Bot className="w-5 h-5 animate-pulse" />
            </div>
            {isListening && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
            )}
            {isSpeaking && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-white font-mono tracking-tight flex items-center gap-1.5">
                <span>ASSISTENTE DE VOZ PRISMA IA</span>
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              </h3>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold uppercase">
                MODO VECTOR OTC
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Converse em tempo real sobre LTA, LTB, Rompimentos e Reversões no Modo Vector OTC
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de Alertas Automáticos por Voz */}
          <button
            type="button"
            onClick={onToggleAutoVoice}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${
              autoVoiceAlerts
                ? 'bg-sky-500/20 border-sky-400 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                : 'bg-slate-900/80 border-slate-700 text-slate-400'
            }`}
            title="Ativa ou silencia avisos em voz alta no Modo Vector OTC"
          >
            {autoVoiceAlerts ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-sky-400 animate-bounce" />
                <span>VOZ AUTOMÁTICA: ATIVA</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                <span>VOZ SILENCIADA</span>
              </>
            )}
          </button>

          {/* Botão de recolher/expandir */}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-3">
          {/* Histórico do Chat Interativo */}
          <div className="h-48 overflow-y-auto space-y-2.5 p-3 rounded-xl bg-black/50 border border-slate-800/80 font-mono text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5 px-1">
                  <span>{msg.sender === 'user' ? 'Você' : 'Robô Prisma IA'}</span>
                  <span>•</span>
                  <span>{msg.time}</span>
                </div>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2 leading-relaxed shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-100'
                      : 'bg-slate-900/90 border border-slate-700/80 text-slate-200'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Status do Microfone e Transcrição em Tempo Real */}
          {isListening && (
            <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 flex items-center justify-between gap-3 animate-pulse font-mono text-xs">
              <div className="flex items-center gap-2 text-amber-300">
                <Mic className="w-4 h-4 text-red-400 animate-ping" />
                <span>Ouvindo sua voz... {transcript ? `"${transcript}"` : 'Fale agora!'}</span>
              </div>
              <button
                type="button"
                onClick={handleStopListening}
                className="px-2.5 py-1 rounded bg-red-500/20 border border-red-500 text-red-300 text-[11px] font-bold cursor-pointer"
              >
                Parar
              </button>
            </div>
          )}

          {isSpeaking && (
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between gap-3 font-mono text-xs">
              <div className="flex items-center gap-2 text-emerald-300">
                <Volume2 className="w-4 h-4 text-emerald-400 animate-bounce" />
                <span>Robô falando...</span>
              </div>
              <button
                type="button"
                onClick={handleStopAudio}
                className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-bold cursor-pointer hover:bg-slate-700"
              >
                Silenciar Áudio
              </button>
            </div>
          )}

          {voiceError && (
            <div className="p-2 rounded bg-rose-950/40 border border-rose-500/40 text-rose-300 font-mono text-[11px]">
              {voiceError}
            </div>
          )}

          {/* Barra de Entrada de Texto e Microfone */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleUserQuery(inputText);
            }}
            className="flex items-center gap-2"
          >
            {/* Botão de Gravar Voz */}
            <button
              type="button"
              id="btn-voice-mic"
              onClick={isListening ? handleStopListening : handleStartListening}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                isListening
                  ? 'bg-red-500/20 border-red-400 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse'
                  : 'bg-amber-500/20 border-amber-400 text-amber-300 hover:bg-amber-500/30'
              }`}
              title="Fale no microfone para perguntar sobre a Vela de Comando e 1º Pullback"
            >
              {isListening ? (
                <>
                  <Square className="w-4 h-4 text-red-400" />
                  <span>OUVINDO...</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 text-sky-400" />
                  <span>FALAR NO MICROFONE</span>
                </>
              )}
            </button>

            {/* Input de Texto */}
            <input
              type="text"
              id="input-voice-assistant"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Digite ou fale: 'como funciona o rompimento?', 'como funciona a reversão?', 'tem sinal agora?'..."
              className="flex-1 bg-black/60 border border-slate-700 focus:border-sky-400 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-slate-500 outline-none transition-all"
            />

            {/* Botão de Envio de Texto */}
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 disabled:opacity-40 text-slate-950 transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Sugestões Rápidas de Perguntas */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px] font-mono text-slate-400">
            <span className="text-slate-500">Perguntas rápidas:</span>
            {[
              'Como funciona o rompimento de LTB?',
              'Como funciona a reversão na LTA?',
              'O que são as linhas LTA e LTB?',
              'Como funciona a regra dos 00s?',
              'Tem sinal agora?',
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  playClickSound();
                  handleUserQuery(chip);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-sky-500/40 text-slate-300 hover:text-sky-300 transition-colors cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
