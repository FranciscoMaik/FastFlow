// Cenário salvo (F5): região + lista de mudanças F3 + semente de demanda.
// Persistência fica no adaptador; aqui só o modelo e a aplicação analítica.
import { avaliar } from "./avaliadorImpacto.js";
import {
  aplicarEmCopia,
  desserializarLista,
  serializarLista,
  serializarMudanca,
} from "./mudanca.js";

export const VERSAO_CENARIO = 1;

/** Demanda padrão para Δ do cenário (alinhada às prévias F2). */
export const DEMANDA_CENARIO_PADRAO = Object.freeze({ n: 200, semente: 1 });

function agoraIso() {
  return new Date().toISOString();
}

function novoId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {{
 *   id?: string,
 *   nome: string,
 *   regiaoId: string,
 *   semente?: number,
 *   demandaN?: number,
 *   mudancas?: object[],
 *   criadoEm?: string,
 *   atualizadoEm?: string,
 * }} entrada
 */
export function criarCenario({
  id,
  nome,
  regiaoId,
  semente = DEMANDA_CENARIO_PADRAO.semente,
  demandaN = DEMANDA_CENARIO_PADRAO.n,
  mudancas = [],
  criadoEm,
  atualizadoEm,
} = {}) {
  if (typeof nome !== "string" || nome.trim() === "") {
    throw new TypeError("criarCenario: `nome` é obrigatório");
  }
  if (typeof regiaoId !== "string" || regiaoId.trim() === "") {
    throw new TypeError("criarCenario: `regiaoId` é obrigatório");
  }
  const sementeNum = Number(semente);
  const nNum = Number(demandaN);
  if (!Number.isFinite(sementeNum)) {
    throw new TypeError("criarCenario: `semente` inválida");
  }
  if (!Number.isInteger(nNum) || nNum < 1) {
    throw new TypeError("criarCenario: `demandaN` deve ser inteiro positivo");
  }

  const instante = agoraIso();
  return {
    versao: VERSAO_CENARIO,
    id: id ?? novoId(),
    nome: nome.trim(),
    regiaoId: regiaoId.trim(),
    semente: Math.trunc(sementeNum),
    demandaN: nNum,
    mudancas: serializarLista(mudancas),
    criadoEm: criadoEm ?? instante,
    atualizadoEm: atualizadoEm ?? instante,
  };
}

/** Clona com novo id (e nome opcional). */
export function duplicarCenario(cenario, { nome, id } = {}) {
  const base = desserializarCenario(cenario);
  return criarCenario({
    id,
    nome: nome?.trim() || `${base.nome} (cópia)`,
    regiaoId: base.regiaoId,
    semente: base.semente,
    demandaN: base.demandaN,
    mudancas: base.mudancas,
  });
}

/** Acrescenta uma mudança canônica; devolve novo objeto (imutável). */
export function acrescentarMudanca(cenario, mudanca) {
  const base = desserializarCenario(cenario);
  const canonica = serializarMudanca(mudanca);
  return {
    ...base,
    mudancas: [...base.mudancas, canonica],
    atualizadoEm: agoraIso(),
  };
}

/**
 * Remove mudanças que satisfazem o predicado (ex.: desfazer bloqueio).
 * @param {(m: object, i: number) => boolean} predicado — true = remover
 */
export function removerMudancas(cenario, predicado) {
  const base = desserializarCenario(cenario);
  const mudancas = base.mudancas.filter((m, i) => !predicado(m, i));
  if (mudancas.length === base.mudancas.length) return base;
  return { ...base, mudancas, atualizadoEm: agoraIso() };
}

/** Remove a última mudança que casa com tipo (+ trechoId/dispositivoId opcional). */
export function removerUltimaMudanca(cenario, { tipo, trechoId, id } = {}) {
  const base = desserializarCenario(cenario);
  for (let i = base.mudancas.length - 1; i >= 0; i--) {
    const m = base.mudancas[i];
    if (tipo != null && m.tipo !== tipo) continue;
    if (trechoId != null && m.trechoId !== trechoId) continue;
    if (id != null && m.id !== id) continue;
    const mudancas = base.mudancas.slice(0, i).concat(base.mudancas.slice(i + 1));
    return { ...base, mudancas, atualizadoEm: agoraIso() };
  }
  return base;
}

export function serializarCenario(cenario) {
  const c = desserializarCenario(cenario);
  return {
    versao: VERSAO_CENARIO,
    id: c.id,
    nome: c.nome,
    regiaoId: c.regiaoId,
    semente: c.semente,
    demandaN: c.demandaN,
    mudancas: serializarLista(c.mudancas),
    criadoEm: c.criadoEm,
    atualizadoEm: c.atualizadoEm,
  };
}

export function desserializarCenario(json) {
  const entrada = typeof json === "string" ? JSON.parse(json) : json;
  if (entrada == null || typeof entrada !== "object" || Array.isArray(entrada)) {
    throw new TypeError("Cenário inválido: objeto esperado");
  }
  if (entrada.versao != null && Number(entrada.versao) !== VERSAO_CENARIO) {
    throw new TypeError(`Versão de cenário não suportada: ${entrada.versao}`);
  }
  return criarCenario({
    id: entrada.id,
    nome: entrada.nome,
    regiaoId: entrada.regiaoId,
    semente: entrada.semente ?? DEMANDA_CENARIO_PADRAO.semente,
    demandaN: entrada.demandaN ?? DEMANDA_CENARIO_PADRAO.n,
    mudancas: desserializarLista(entrada.mudancas ?? []),
    criadoEm: entrada.criadoEm,
    atualizadoEm: entrada.atualizadoEm,
  });
}

/** Aplica as mudanças do cenário numa cópia (F3 `aplicarEmCopia`). Original intacto. */
export function aplicarCenario(grafoOuEstado, cenario) {
  const c = desserializarCenario(cenario);
  return aplicarEmCopia(grafoOuEstado, c.mudancas);
}

/**
 * Avalia Δ analítico do cenário vs base (F2 `avaliar` + F1 demanda com a semente do cenário).
 * @returns {ReturnType<typeof avaliar> & { cenarioId: string }}
 */
export function avaliarCenario(grafo, cenario, { demanda } = {}) {
  if (!grafo) throw new TypeError("avaliarCenario: `grafo` é obrigatório");
  const c = desserializarCenario(cenario);
  const demandaEfetiva =
    demanda ??
    Object.freeze({
      n: c.demandaN,
      semente: c.semente,
    });
  const avaliacao = avaliar({
    grafo,
    demanda: demandaEfetiva,
    mudancas: c.mudancas,
  });
  return { ...avaliacao, cenarioId: c.id };
}

/** Formata Δ de tempo médio para a barra (“+52 s”, “−1,2 min”). */
export function fmtDeltaTempoResumo(segundos) {
  if (segundos == null || Number.isNaN(segundos)) return null;
  if (!Number.isFinite(segundos)) return "∞";
  if (Math.abs(segundos) < 0.05) return "0 s";
  const sinal = segundos > 0 ? "+" : "−";
  const abs = Math.abs(segundos);
  if (abs >= 60) {
    const min = abs / 60;
    const txt = min >= 10 ? min.toFixed(0) : min.toFixed(1).replace(".", ",");
    return `${sinal}${txt} min`;
  }
  const txt = abs >= 10 ? abs.toFixed(0) : abs.toFixed(0);
  return `${sinal}${txt} s`;
}

/**
 * Texto da barra: “Obra Av. Abdalla · 3 mudanças · +52 s”.
 * @param {{ nome?: string, mudancas?: object[], deltaTempoMedio?: number|null }} partes
 */
export function rotuloResumoCenario({
  nome = "Cenário",
  mudancas = [],
  deltaTempoMedio = null,
} = {}) {
  const n = mudancas.length;
  const contagem =
    n === 0 ? "nenhuma mudança" : n === 1 ? "1 mudança" : `${n} mudanças`;
  const partes = [nome, contagem];
  const deltaTxt = fmtDeltaTempoResumo(deltaTempoMedio);
  if (deltaTxt != null) partes.push(deltaTxt);
  return partes.join(" · ");
}
