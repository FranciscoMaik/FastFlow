// F4 — Fuga de rota (sinal pragmático por dispositivo).
// Prefere deslocamento de volume BPR: queda nas arestas do dispositivo +
// alta nas vizinhas após o baseline (colocação). Complementa com contagem
// de veículos `desviado` já nos vizinhos e recalculos BPR recentes.
import { contarVeiculosPorAresta } from "./congestionamento.js";

/**
 * @param {import("./grafo.js").Grafo} grafo
 * @param {string} trechoId
 * @returns {string[]}
 */
export function arestasDoTrecho(grafo, trechoId) {
  const trecho = grafo?.trechos?.get(trechoId);
  return trecho?.arestas ? [...trecho.arestas] : [];
}

/**
 * Arestas que compartilham nós com o trecho do dispositivo, excluindo o próprio trecho.
 * @param {import("./grafo.js").Grafo} grafo
 * @param {string} trechoId
 * @returns {string[]}
 */
export function arestasVizinhasDoTrecho(grafo, trechoId) {
  const proprias = new Set(arestasDoTrecho(grafo, trechoId));
  if (proprias.size === 0) return [];

  const nos = new Set();
  for (const id of proprias) {
    const a = grafo.arestas.get(id);
    if (!a) continue;
    nos.add(a.de);
    nos.add(a.para);
  }

  const vizinhas = new Set();
  for (const noId of nos) {
    for (const id of grafo.saidas.get(noId) ?? []) {
      if (!proprias.has(id)) vizinhas.add(id);
    }
    for (const id of grafo.entradas.get(noId) ?? []) {
      if (!proprias.has(id)) vizinhas.add(id);
    }
  }
  return [...vizinhas];
}

/**
 * @param {Map<string, number> | Record<string, number> | null | undefined} volumes
 * @param {Iterable<string>} arestaIds
 * @returns {number}
 */
export function somarVolumes(volumes, arestaIds) {
  if (!volumes) return 0;
  const get =
    volumes instanceof Map
      ? (id) => volumes.get(id) ?? 0
      : (id) => Number(volumes[id]) || 0;
  let soma = 0;
  for (const id of arestaIds ?? []) soma += get(id);
  return soma;
}

/**
 * @param {Map<string, number> | Record<string, number> | null | undefined} volumes
 * @returns {Map<string, number>}
 */
export function clonarVolumes(volumes) {
  if (!volumes) return new Map();
  if (volumes instanceof Map) return new Map(volumes);
  return new Map(Object.entries(volumes));
}

/**
 * Veículos desviados cuja aresta atual é vizinha e cuja rota futura não inclui o dispositivo.
 * @param {Iterable<object>} veiculos
 * @param {Iterable<string>} arestasDispositivo
 * @param {Iterable<string>} arestasVizinhas
 * @returns {number}
 */
export function contarDesviadosEmVizinhos(veiculos, arestasDispositivo, arestasVizinhas) {
  const setDisp = new Set(arestasDispositivo ?? []);
  const setViz = new Set(arestasVizinhas ?? []);
  if (setDisp.size === 0 || setViz.size === 0) return 0;

  let n = 0;
  for (const v of veiculos ?? []) {
    if (!v || v.status !== "desviado") continue;
    const arestaId = v.rota?.[v.indice ?? 0];
    if (!arestaId || !setViz.has(arestaId)) continue;
    const futuras = v.rota.slice(v.indice ?? 0);
    if (futuras.some((id) => setDisp.has(id))) continue;
    n += 1;
  }
  return n;
}

/**
 * Estima fuga de rota a partir do deslocamento de volume (e sinais auxiliares).
 *
 * @param {{
 *   volumesAtual: Map<string, number> | Record<string, number>,
 *   volumesBaseline: Map<string, number> | Record<string, number> | null,
 *   arestasDispositivo: string[],
 *   arestasVizinhas: string[],
 *   desviadosVizinhos?: number,
 *   recalculadasBpr?: number,
 * }} entrada
 */
export function estimarFugaDeRota({
  volumesAtual,
  volumesBaseline,
  arestasDispositivo,
  arestasVizinhas,
  desviadosVizinhos = 0,
  recalculadasBpr = 0,
}) {
  const atualDisp = somarVolumes(volumesAtual, arestasDispositivo);
  const atualViz = somarVolumes(volumesAtual, arestasVizinhas);

  if (!volumesBaseline) {
    return {
      disponivel: false,
      sinal: "aguardando",
      fonte: null,
      fugaEstimada: 0,
      volumeDispositivo: { base: null, atual: atualDisp, delta: null },
      volumeVizinhos: { base: null, atual: atualViz, delta: null },
      desviadosVizinhos,
      recalculadasBpr,
    };
  }

  const baseDisp = somarVolumes(volumesBaseline, arestasDispositivo);
  const baseViz = somarVolumes(volumesBaseline, arestasVizinhas);
  const deltaDisp = atualDisp - baseDisp;
  const deltaViz = atualViz - baseViz;

  // Queda no dispositivo + alta (ou estabilidade) nos vizinhos ⇒ fuga.
  const queda = Math.max(0, -deltaDisp);
  const altaViz = Math.max(0, deltaViz);
  let fugaEstimada = 0;
  let fonte = "deslocamento-volume";
  let sinal = "neutro";

  if (queda > 0 && altaViz > 0) {
    // Conservador: o mínimo entre o que saiu e o que entrou nos vizinhos.
    fugaEstimada = Math.min(queda, altaViz);
    sinal = "fuga";
  } else if (queda > 0 && desviadosVizinhos > 0) {
    fugaEstimada = Math.max(queda, desviadosVizinhos);
    sinal = "fuga";
    fonte = "deslocamento+desviados";
  } else if (desviadosVizinhos > 0 && recalculadasBpr > 0) {
    fugaEstimada = desviadosVizinhos;
    sinal = "fuga";
    fonte = "recalculos-bpr";
  } else if (desviadosVizinhos > 0) {
    fugaEstimada = desviadosVizinhos;
    sinal = "fuga";
    fonte = "desviados-vizinhos";
  } else if (queda > 0 && altaViz === 0) {
    // Volume caiu sem alta clara nos vizinhos — sinal fraco / ambíguo.
    fugaEstimada = 0;
    sinal = "insuficiente";
    fonte = "deslocamento-volume";
  }

  return {
    disponivel: true,
    sinal,
    fonte,
    fugaEstimada,
    volumeDispositivo: { base: baseDisp, atual: atualDisp, delta: deltaDisp },
    volumeVizinhos: { base: baseViz, atual: atualViz, delta: deltaViz },
    desviadosVizinhos,
    recalculadasBpr,
  };
}

/**
 * Mantém baseline de volumes por dispositivo (no momento da colocação / reposicionamento).
 */
export function criarRastreadorFugaRota() {
  /** @type {Map<string, { trechoId: string, volumes: Map<string, number>, arestasDisp: string[], arestasViz: string[] }>} */
  const baselines = new Map();

  function volumesAtuais(grafo, veiculos) {
    return contarVeiculosPorAresta(veiculos ?? []);
  }

  function registrar(dispositivo, grafo, volumes) {
    if (!dispositivo?.id || !dispositivo.trechoId) return;
    const arestasDisp = arestasDoTrecho(grafo, dispositivo.trechoId);
    const arestasViz = arestasVizinhasDoTrecho(grafo, dispositivo.trechoId);
    baselines.set(dispositivo.id, {
      trechoId: dispositivo.trechoId,
      volumes: clonarVolumes(volumes),
      arestasDisp,
      arestasViz,
    });
  }

  function remover(id) {
    baselines.delete(id);
  }

  function limpar() {
    baselines.clear();
  }

  /**
   * Garante baseline para cada dispositivo presente; remove órfãos.
   * Novos dispositivos usam o volume atual como baseline (fuga = 0 no instante).
   */
  function sincronizar(dispositivos, grafo, veiculos) {
    const volumes = volumesAtuais(grafo, veiculos);
    const vivos = new Set();
    for (const d of dispositivos ?? []) {
      if (!d?.id) continue;
      vivos.add(d.id);
      const atual = baselines.get(d.id);
      if (!atual || atual.trechoId !== d.trechoId) {
        registrar(d, grafo, volumes);
      }
    }
    for (const id of [...baselines.keys()]) {
      if (!vivos.has(id)) baselines.delete(id);
    }
    return volumes;
  }

  function avaliar(dispositivo, grafo, veiculos, { recalculadasBpr = 0 } = {}) {
    if (!dispositivo?.id) {
      return estimarFugaDeRota({
        volumesAtual: new Map(),
        volumesBaseline: null,
        arestasDispositivo: [],
        arestasVizinhas: [],
      });
    }

    const volumes = volumesAtuais(grafo, veiculos);
    let base = baselines.get(dispositivo.id);
    if (!base || base.trechoId !== dispositivo.trechoId) {
      registrar(dispositivo, grafo, volumes);
      base = baselines.get(dispositivo.id);
    }

    const desviadosVizinhos = contarDesviadosEmVizinhos(
      veiculos,
      base.arestasDisp,
      base.arestasViz
    );

    return estimarFugaDeRota({
      volumesAtual: volumes,
      volumesBaseline: base.volumes,
      arestasDispositivo: base.arestasDisp,
      arestasVizinhas: base.arestasViz,
      desviadosVizinhos,
      recalculadasBpr,
    });
  }

  return { registrar, remover, limpar, sincronizar, avaliar, volumesAtuais };
}
