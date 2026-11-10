// Gerador de métricas analíticas da simulação.
// Mistura estatísticas reais do motor com projeções estocásticas
// (vias congestionadas e tempo médio de locomoção). Sem dependência de UI.

/** Limites de plausibilidade física / proporcional à malha. */
export const FAIXAS_METRICAS = Object.freeze({
  congestaoMin: 0.08,
  congestaoMax: 0.35,
  tempoMinMinutos: 4,
  tempoMaxMinutos: 22,
  /** Passo máximo de variação entre ciclos (suaviza o painel ao vivo). */
  passoCongestao: 0.035,
  passoTempoMinutos: 0.9,
});

function aleatorio(min, max) {
  return min + Math.random() * (max - min);
}

function limitar(valor, min, max) {
  return Math.min(max, Math.max(min, valor));
}

function pressaoFluxo(estatisticas) {
  const ativos = Math.max(1, Number(estatisticas?.ativos) || 0);
  const retidos = Number(estatisticas?.retidos) || 0;
  const desviados = Number(estatisticas?.desviados) || 0;
  return limitar((retidos + desviados) / ativos, 0, 1);
}

/**
 * Calcula a fração-alvo de vias congestionadas a partir da pressão real
 * e de ruído controlado, sempre dentro de FAIXAS_METRICAS.
 */
function razaoCongestaoAlvo(estatisticas, totalTrechos) {
  if (totalTrechos <= 0) return 0;
  const pressao = pressaoFluxo(estatisticas);
  const { congestaoMin, congestaoMax } = FAIXAS_METRICAS;
  const base = congestaoMin + (congestaoMax - congestaoMin) * (0.35 + 0.55 * pressao);
  const ruido = aleatorio(-0.04, 0.05);
  return limitar(base + ruido, congestaoMin, congestaoMax);
}

/**
 * Tempo médio de locomoção em minutos (projeção).
 * Se o motor já tiver tempoMedioViagem (segundos), usa como âncora.
 */
function tempoMedioAlvoMinutos(estatisticas, razaoCongestao) {
  const { tempoMinMinutos, tempoMaxMinutos } = FAIXAS_METRICAS;
  const realSegundos = estatisticas?.tempoMedioViagem;
  let ancora = aleatorio(tempoMinMinutos + 2, tempoMaxMinutos - 3);

  if (realSegundos != null && Number.isFinite(realSegundos) && realSegundos > 0) {
    // Âncora: tempo real (s → min) com leve compressão para a faixa demonstrativa.
    ancora = limitar(realSegundos / 60, tempoMinMinutos, tempoMaxMinutos);
  }

  const impacto = (razaoCongestao - FAIXAS_METRICAS.congestaoMin)
    / (FAIXAS_METRICAS.congestaoMax - FAIXAS_METRICAS.congestaoMin);
  const ajuste = 1.5 + impacto * 4.5 + aleatorio(-0.6, 0.8);
  return limitar(ancora + ajuste, tempoMinMinutos, tempoMaxMinutos);
}

function montarSnapshot({ estatisticas = {}, totalTrechos = 0, razao, tempoMinutos }) {
  const totalVias = Math.max(0, Math.floor(totalTrechos));
  const viasCongestionadas = totalVias === 0
    ? 0
    : limitar(Math.round(totalVias * razao), 0, totalVias);

  return {
    totalVias,
    viasCongestionadas,
    percentualCongestionamento: totalVias
      ? Math.round((viasCongestionadas / totalVias) * 1000) / 10
      : 0,
    tempoMedioLocomocaoMinutos: Math.round(tempoMinutos * 10) / 10,
    // Espelho das métricas reais para agregação no painel.
    ativos: Number(estatisticas.ativos) || 0,
    retidos: Number(estatisticas.retidos) || 0,
    desviados: Number(estatisticas.desviados) || 0,
    rotasRecalculadas: Number(estatisticas.rotasRecalculadas) || 0,
    viagensConcluidas: Number(estatisticas.viagensConcluidas) || 0,
    inversoes: Number(estatisticas.inversoes) || 0,
    tempoSimulado: Number(estatisticas.tempoSimulado) || 0,
    tempoMedioViagemSegundos: estatisticas.tempoMedioViagem ?? null,
  };
}

/**
 * Gera um snapshot pontual (sem estado) — útil para testes e captura final.
 */
export function gerarMetricasAnaliticas({ estatisticas = {}, totalTrechos = 0 } = {}) {
  const razao = razaoCongestaoAlvo(estatisticas, totalTrechos);
  const tempo = tempoMedioAlvoMinutos(estatisticas, razao);
  return montarSnapshot({ estatisticas, totalTrechos, razao, tempoMinutos: tempo });
}

/**
 * Projetor com caminhada aleatória suave entre ciclos de atualização.
 * Mantém a UI estável e ainda reage à pressão do fluxo.
 */
export function criarProjetorMetricas() {
  let razaoAtual = null;
  let tempoAtual = null;

  return {
    atualizar({ estatisticas = {}, totalTrechos = 0 } = {}) {
      const alvoRazao = razaoCongestaoAlvo(estatisticas, totalTrechos);
      const alvoTempo = tempoMedioAlvoMinutos(estatisticas, alvoRazao);

      if (razaoAtual == null) {
        razaoAtual = alvoRazao;
        tempoAtual = alvoTempo;
      } else {
        const { passoCongestao, passoTempoMinutos, congestaoMin, congestaoMax, tempoMinMinutos, tempoMaxMinutos } =
          FAIXAS_METRICAS;
        razaoAtual = limitar(
          razaoAtual + limitar(alvoRazao - razaoAtual, -passoCongestao, passoCongestao),
          congestaoMin,
          congestaoMax
        );
        tempoAtual = limitar(
          tempoAtual + limitar(alvoTempo - tempoAtual, -passoTempoMinutos, passoTempoMinutos),
          tempoMinMinutos,
          tempoMaxMinutos
        );
      }

      return montarSnapshot({
        estatisticas,
        totalTrechos,
        razao: razaoAtual,
        tempoMinutos: tempoAtual,
      });
    },

    reiniciar() {
      razaoAtual = null;
      tempoAtual = null;
    },
  };
}

/**
 * Histórico em memória de rodadas encerradas, para comparação no drawer.
 */
export function criarHistoricoRodadas({ limite = 8 } = {}) {
  const rodadas = [];
  let sequencia = 0;

  return {
    adicionar(metricas, meta = {}) {
      sequencia += 1;
      const entrada = {
        id: sequencia,
        rotulo: meta.rotulo ?? `Rodada ${sequencia}`,
        local: meta.local ?? null,
        modo: meta.modo ?? null,
        horario: meta.horario ?? new Date(),
        metricas: { ...metricas },
      };
      rodadas.push(entrada);
      while (rodadas.length > limite) rodadas.shift();
      return entrada;
    },

    listar() {
      return rodadas.slice();
    },

    ultima() {
      return rodadas.length ? rodadas[rodadas.length - 1] : null;
    },

    /**
     * Diferenças da última rodada em relação à anterior (null se < 2).
     */
    compararUltimas() {
      if (rodadas.length < 2) return null;
      const atual = rodadas[rodadas.length - 1].metricas;
      const anterior = rodadas[rodadas.length - 2].metricas;
      return {
        viasCongestionadas: atual.viasCongestionadas - anterior.viasCongestionadas,
        percentualCongestionamento:
          Math.round((atual.percentualCongestionamento - anterior.percentualCongestionamento) * 10) / 10,
        tempoMedioLocomocaoMinutos:
          Math.round((atual.tempoMedioLocomocaoMinutos - anterior.tempoMedioLocomocaoMinutos) * 10) / 10,
        ativos: atual.ativos - anterior.ativos,
        desviados: atual.desviados - anterior.desviados,
        retidos: atual.retidos - anterior.retidos,
        rotasRecalculadas: atual.rotasRecalculadas - anterior.rotasRecalculadas,
        viagensConcluidas: atual.viagensConcluidas - anterior.viagensConcluidas,
      };
    },

    limpar() {
      rodadas.length = 0;
      sequencia = 0;
    },
  };
}
