// Demanda fixa (F1): amostra de pares origem→destino com semente determinística.
// Permite comparar cenários com a mesma demanda dos dois lados.
// Perfis de período (pico / fora de pico) variam N, semente e concentração OD.

const MODULO_LCG = 2147483647;
const MULTIPLICADOR_LCG = 16807;

/**
 * Perfis de horário para prévias (F1).
 * - `concentracao` > 1 favorece nós de maior grau (polos / vias arteriais).
 * - `escalaVolumeBpr` escala volumes OD na passagem BPR analítica (F2+F4).
 * @type {Readonly<Record<string, Readonly<{
 *   id: string,
 *   rotulo: string,
 *   n: number,
 *   semente: number,
 *   concentracao: number,
 *   escalaVolumeBpr: number,
 * }>>>}
 */
export const PERFIS_PERIODO = Object.freeze({
  pico: Object.freeze({
    id: "pico",
    rotulo: "Horário de pico",
    n: 280,
    semente: 11,
    concentracao: 2.2,
    escalaVolumeBpr: 1.5,
  }),
  foraPico: Object.freeze({
    id: "foraPico",
    rotulo: "Fora de pico",
    n: 120,
    semente: 7,
    concentracao: 1,
    escalaVolumeBpr: 0.55,
  }),
});

/** @returns {ReadonlyArray<typeof PERFIS_PERIODO[keyof typeof PERFIS_PERIODO]>} */
export function listarPerfisPeriodo() {
  return Object.values(PERFIS_PERIODO);
}

/**
 * @param {string} [id]
 * @returns {typeof PERFIS_PERIODO[keyof typeof PERFIS_PERIODO] | null}
 */
export function obterPerfilPeriodo(id) {
  if (id == null) return null;
  return PERFIS_PERIODO[id] ?? null;
}

/** Gerador Park–Miller (0, 1), alinhado ao usado nos testes do motor. */
export function criarAleatorio(semente = 1) {
  let estado = Math.abs(Math.trunc(semente)) % MODULO_LCG || 1;
  return () => {
    estado = (estado * MULTIPLICADOR_LCG) % MODULO_LCG;
    return estado / MODULO_LCG;
  };
}

/**
 * Pesos de amostragem por nó. Sem grafo (ou concentração ≤ 1) → uniforme.
 * Com grafo: grau(saídas+entradas)^concentracao — pico concentra OD nos polos.
 *
 * @param {Iterable<string>} nos
 * @param {{ grafo?: { saidas?: Map<string, unknown[]>, entradas?: Map<string, unknown[]> }, concentracao?: number }} [opcoes]
 * @returns {number[]}
 */
export function pesosNosDemanda(nos, { grafo, concentracao = 1 } = {}) {
  const lista = [...nos];
  const expoente = Number.isFinite(concentracao) ? Math.max(0, concentracao) : 1;
  if (!grafo || expoente <= 1) return lista.map(() => 1);

  return lista.map((id) => {
    const grau =
      (grafo.saidas?.get(id)?.length ?? 0) + (grafo.entradas?.get(id)?.length ?? 0);
    return Math.max(1, grau) ** expoente;
  });
}

function sortearIndicePonderado(pesos, rng) {
  let total = 0;
  for (const p of pesos) total += p;
  if (!(total > 0)) return Math.floor(rng() * pesos.length);
  let alvo = rng() * total;
  for (let i = 0; i < pesos.length; i++) {
    alvo -= pesos[i];
    if (alvo < 0) return i;
  }
  return pesos.length - 1;
}

/**
 * Gera N pares origem→destino a partir dos nós da região.
 * Mesma semente (ou mesmo `aleatorio`) + mesmos nós (+ mesmos pesos) ⇒ mesma matriz.
 *
 * @param {{
 *   nos: Iterable<string>,
 *   n: number,
 *   semente?: number,
 *   aleatorio?: () => number,
 *   pesosNos?: number[],
 *   grafo?: object,
 *   concentracao?: number,
 * }} opcoes
 * @returns {{ origem: string, destino: string }[]}
 */
export function gerarMatrizDemanda({
  nos,
  n,
  semente = 1,
  aleatorio,
  pesosNos,
  grafo,
  concentracao = 1,
}) {
  const lista = [...nos];
  if (lista.length < 2) {
    throw new RangeError("A demanda fixa precisa de pelo menos 2 nós.");
  }
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError("A quantidade de pares (n) deve ser um inteiro positivo.");
  }

  const rng = aleatorio ?? criarAleatorio(semente);
  const pesos =
    Array.isArray(pesosNos) && pesosNos.length === lista.length
      ? pesosNos
      : pesosNosDemanda(lista, { grafo, concentracao });
  const sortearNo = () => lista[sortearIndicePonderado(pesos, rng)];
  const pares = [];

  for (let i = 0; i < n; i++) {
    const origem = sortearNo();
    let destino = sortearNo();
    // Garante origem ≠ destino sem enviesar o gerador além do necessário.
    let tentativas = 0;
    while (destino === origem && tentativas < lista.length * 4) {
      destino = sortearNo();
      tentativas += 1;
    }
    if (destino === origem) {
      destino = lista[(lista.indexOf(origem) + 1) % lista.length];
    }
    pares.push({ origem, destino });
  }

  return pares;
}

/**
 * Resolve `{ n, semente, … }` (ou matriz) a partir de um perfil de período.
 * Aceita id (`"pico"` / `"foraPico"`) ou objeto de perfil.
 *
 * @param {string | { id?: string, n?: number, semente?: number, concentracao?: number }} periodo
 * @param {Iterable<string>} nos
 * @param {{ grafo?: object }} [opcoes]
 * @returns {{ origem: string, destino: string }[] | null}
 */
export function demandaDoPeriodo(periodo, nos, { grafo } = {}) {
  const perfil =
    typeof periodo === "string" ? obterPerfilPeriodo(periodo) : periodo;
  if (!perfil) return null;
  return gerarMatrizDemanda({
    nos,
    n: perfil.n ?? PERFIS_PERIODO.foraPico.n,
    semente: perfil.semente ?? 1,
    concentracao: perfil.concentracao ?? 1,
    grafo,
  });
}

/** Sorteia um par da matriz com o RNG injetável da simulação. */
export function sortearParDemanda(matriz, aleatorio) {
  if (!matriz?.length) return null;
  return matriz[Math.floor(aleatorio() * matriz.length)];
}

/**
 * Normaliza a opção `demanda` da Simulacao.
 * - `false` / `null`: sem demanda fixa (destinos livres)
 * - array: usa a matriz fornecida
 * - objeto `{ n, semente, nos?, concentracao?, grafo?, periodo? }` ou `undefined`: gera a partir dos nós
 * - com `periodo`: usa o perfil F1 (pico / foraPico)
 */
export function resolverDemanda(demanda, nosDaRegiao) {
  if (demanda === false || demanda === null) return null;
  if (Array.isArray(demanda)) {
    if (demanda.length === 0) {
      throw new RangeError("A matriz de demanda não pode ser vazia.");
    }
    return demanda.map((par) => {
      if (!par || par.origem == null || par.destino == null) {
        throw new TypeError("Cada par da demanda precisa de origem e destino.");
      }
      return { origem: par.origem, destino: par.destino };
    });
  }

  if (demanda?.periodo) {
    const porPeriodo = demandaDoPeriodo(demanda.periodo, demanda?.nos ?? nosDaRegiao, {
      grafo: demanda.grafo,
    });
    if (porPeriodo) return porPeriodo;
  }

  const nos = demanda?.nos ?? nosDaRegiao;
  const n = demanda?.n ?? Math.min(200, Math.max(1, [...nos].length * 10));
  const semente = demanda?.semente ?? 1;
  return gerarMatrizDemanda({
    nos,
    n,
    semente,
    aleatorio: demanda?.aleatorio,
    concentracao: demanda?.concentracao,
    grafo: demanda?.grafo,
    pesosNos: demanda?.pesosNos,
  });
}
