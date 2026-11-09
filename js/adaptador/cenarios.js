// Persistência de cenários salvos (F5) em localStorage — padrão de `locais.js`.
import {
  acrescentarMudanca,
  aplicarCenario,
  avaliarCenario,
  criarCenario,
  desserializarCenario,
  duplicarCenario,
  removerMudancas,
  removerUltimaMudanca,
  serializarCenario,
  VERSAO_CENARIO,
} from "../motor/cenario.js";
import { serializarMudanca } from "../motor/mudanca.js";

export const CHAVE_CENARIOS = "fastflow.cenarios";
export const CHAVE_CENARIO_ATIVO = "fastflow.cenarioAtivo";

/** Reexportado para a ponte do comparador (`fonteCenariosComparador`). */
export { criarCenario, VERSAO_CENARIO };

function armazenamentoPadrao() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function lerBruto(storage) {
  if (!storage) return { versao: VERSAO_CENARIO, itens: {} };
  try {
    const raw = storage.getItem(CHAVE_CENARIOS);
    if (!raw) return { versao: VERSAO_CENARIO, itens: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { versao: VERSAO_CENARIO, itens: {} };
    }
    const itens = {};
    const origem = parsed.itens && typeof parsed.itens === "object" ? parsed.itens : parsed;
    for (const [id, valor] of Object.entries(origem)) {
      if (id === "versao" || id === "itens" || id === "ativoId") continue;
      try {
        const c = desserializarCenario(valor);
        itens[c.id] = serializarCenario(c);
      } catch {
        /* ignora entradas corrompidas */
      }
    }
    return { versao: VERSAO_CENARIO, itens };
  } catch {
    return { versao: VERSAO_CENARIO, itens: {} };
  }
}

function gravarBruto(estado, storage) {
  if (!storage) return;
  try {
    storage.setItem(
      CHAVE_CENARIOS,
      JSON.stringify({ versao: VERSAO_CENARIO, itens: estado.itens })
    );
  } catch {
    /* persistência é best-effort */
  }
}

function lerAtivoId(storage) {
  if (!storage) return null;
  try {
    return storage.getItem(CHAVE_CENARIO_ATIVO);
  } catch {
    return null;
  }
}

function gravarAtivoId(id, storage) {
  if (!storage) return;
  try {
    if (id == null || id === "") storage.removeItem(CHAVE_CENARIO_ATIVO);
    else storage.setItem(CHAVE_CENARIO_ATIVO, id);
  } catch {
    /* best-effort */
  }
}

/** Lista cenários (opcionalmente filtrados por região), mais recentes primeiro. */
export function listarCenarios({ regiaoId, storage = armazenamentoPadrao() } = {}) {
  const { itens } = lerBruto(storage);
  let lista = Object.values(itens).map((c) => desserializarCenario(c));
  if (regiaoId) lista = lista.filter((c) => c.regiaoId === regiaoId);
  return lista.sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
}

export function obterCenario(id, storage = armazenamentoPadrao()) {
  if (!id) return null;
  const { itens } = lerBruto(storage);
  const raw = itens[id];
  return raw ? desserializarCenario(raw) : null;
}

export function obterCenarioAtivo(storage = armazenamentoPadrao()) {
  const id = lerAtivoId(storage);
  if (!id) return null;
  return obterCenario(id, storage);
}

export function definirCenarioAtivo(id, storage = armazenamentoPadrao()) {
  if (id != null && id !== "" && !obterCenario(id, storage)) {
    return { ok: false, motivo: "Cenário inexistente." };
  }
  gravarAtivoId(id ?? null, storage);
  return { ok: true, ativo: obterCenarioAtivo(storage) };
}

export function salvarCenario(cenario, storage = armazenamentoPadrao()) {
  const canonico = serializarCenario(cenario);
  const estado = lerBruto(storage);
  estado.itens[canonico.id] = canonico;
  gravarBruto(estado, storage);
  return desserializarCenario(canonico);
}

export function criarESalvar(entrada, storage = armazenamentoPadrao()) {
  const cenario = criarCenario(entrada);
  salvarCenario(cenario, storage);
  definirCenarioAtivo(cenario.id, storage);
  return cenario;
}

export function duplicarCenarioSalvo(id, { nome } = {}, storage = armazenamentoPadrao()) {
  const origem = obterCenario(id, storage);
  if (!origem) return { ok: false, motivo: "Cenário inexistente." };
  const copia = duplicarCenario(origem, { nome });
  salvarCenario(copia, storage);
  definirCenarioAtivo(copia.id, storage);
  return { ok: true, cenario: copia };
}

export function removerCenario(id, storage = armazenamentoPadrao()) {
  const estado = lerBruto(storage);
  if (!estado.itens[id]) return { ok: false, motivo: "Cenário inexistente." };
  delete estado.itens[id];
  gravarBruto(estado, storage);
  if (lerAtivoId(storage) === id) gravarAtivoId(null, storage);
  return { ok: true };
}

/**
 * Garante um cenário ativo para a região (reusa o ativo se bater; senão o mais
 * recente da região; senão cria “Cenário · {nomeRegiao}”).
 */
export function garantirCenarioAtivoParaRegiao(
  regiaoId,
  { nomeRegiao, storage = armazenamentoPadrao() } = {}
) {
  if (!regiaoId) return null;
  const ativo = obterCenarioAtivo(storage);
  if (ativo?.regiaoId === regiaoId) return ativo;

  const daRegiao = listarCenarios({ regiaoId, storage });
  if (daRegiao.length) {
    definirCenarioAtivo(daRegiao[0].id, storage);
    return daRegiao[0];
  }

  const rotulo = nomeRegiao?.trim() || regiaoId;
  return criarESalvar(
    { nome: `Cenário · ${rotulo}`, regiaoId },
    storage
  );
}

/** Acrescenta mudança ao cenário ativo (cria/garante se `regiaoId` for passado). */
export function registrarMudancaNoAtivo(
  mudanca,
  { regiaoId, nomeRegiao, storage = armazenamentoPadrao() } = {}
) {
  let ativo = obterCenarioAtivo(storage);
  if (regiaoId && (!ativo || ativo.regiaoId !== regiaoId)) {
    ativo = garantirCenarioAtivoParaRegiao(regiaoId, { nomeRegiao, storage });
  }
  if (!ativo) return { ok: false, motivo: "Nenhum cenário ativo." };
  const atualizado = acrescentarMudanca(ativo, mudanca);
  salvarCenario(atualizado, storage);
  return { ok: true, cenario: atualizado, mudanca: serializarMudanca(mudanca) };
}

export function desfazerMudancaNoAtivo(filtro, storage = armazenamentoPadrao()) {
  const ativo = obterCenarioAtivo(storage);
  if (!ativo) return { ok: false, motivo: "Nenhum cenário ativo." };
  const atualizado =
    typeof filtro === "function"
      ? removerMudancas(ativo, filtro)
      : removerUltimaMudanca(ativo, filtro ?? {});
  salvarCenario(atualizado, storage);
  return { ok: true, cenario: atualizado };
}

/** Exporta um cenário (ou o ativo) como JSON string. */
export function exportarCenarioJson(id, storage = armazenamentoPadrao()) {
  const cenario = id ? obterCenario(id, storage) : obterCenarioAtivo(storage);
  if (!cenario) throw new Error("Nenhum cenário para exportar.");
  return JSON.stringify(serializarCenario(cenario), null, 2);
}

/** Exporta todos os cenários (pacote). */
export function exportarPacoteJson(storage = armazenamentoPadrao()) {
  const { itens } = lerBruto(storage);
  return JSON.stringify(
    {
      versao: VERSAO_CENARIO,
      tipo: "fastflow.cenarios",
      ativoId: lerAtivoId(storage),
      itens,
    },
    null,
    2
  );
}

/**
 * Importa JSON de um cenário ou pacote.
 * @returns {{ ok: true, importados: object[], ativo: object|null } | { ok: false, motivo: string }}
 */
export function importarCenariosJson(json, storage = armazenamentoPadrao()) {
  let entrada;
  try {
    entrada = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    return { ok: false, motivo: "JSON inválido." };
  }

  const importados = [];
  try {
    if (entrada?.tipo === "fastflow.cenarios" && entrada.itens) {
      for (const valor of Object.values(entrada.itens)) {
        const c = desserializarCenario(valor);
        // Novo id se já existir, para não sobrescrever sem querer.
        const existente = obterCenario(c.id, storage);
        const salvo = existente
          ? salvarCenario(duplicarCenario(c, { nome: c.nome }), storage)
          : salvarCenario(c, storage);
        importados.push(salvo);
      }
      if (entrada.ativoId && obterCenario(entrada.ativoId, storage)) {
        definirCenarioAtivo(entrada.ativoId, storage);
      } else if (importados.length) {
        definirCenarioAtivo(importados[0].id, storage);
      }
    } else {
      const c = desserializarCenario(entrada);
      const existente = obterCenario(c.id, storage);
      const salvo = existente
        ? salvarCenario(duplicarCenario(c, { nome: c.nome }), storage)
        : salvarCenario(c, storage);
      importados.push(salvo);
      definirCenarioAtivo(salvo.id, storage);
    }
  } catch (err) {
    return { ok: false, motivo: err?.message || "Falha ao importar cenário." };
  }

  return { ok: true, importados, ativo: obterCenarioAtivo(storage) };
}

export function aplicarCenarioEmCopia(grafoOuEstado, cenario) {
  return aplicarCenario(grafoOuEstado, cenario);
}

export function avaliarCenarioPersistido(grafo, cenario, opcoes) {
  return avaliarCenario(grafo, cenario, opcoes);
}

/**
 * Reaplica mudanças do cenário na sessão viva, sem regravar no storage.
 * Aceita ControleBloqueio (bloquear/inverter/dispositivos) ou ControleSentido (inverter).
 * Inclui `adicionarLigacao` quando o controle expõe `adicionarLigacao`.
 */
export function aplicarCenarioNaSessao(controle, cenario, { tiposPermitidos } = {}) {
  if (!controle || !cenario) return { ok: true, aplicadas: 0, puladas: [] };
  const c = desserializarCenario(cenario);
  const permitidos = tiposPermitidos ? new Set(tiposPermitidos) : null;
  const puladas = [];
  let aplicadas = 0;

  for (const mudanca of c.mudancas) {
    if (permitidos && !permitidos.has(mudanca.tipo)) {
      puladas.push({ mudanca, motivo: "tipo não permitido nesta tela" });
      continue;
    }
    const r = aplicarMudancaNaSessao(controle, mudanca);
    if (r.ok) aplicadas += 1;
    else puladas.push({ mudanca, motivo: r.motivo });
  }
  return { ok: puladas.length === 0, aplicadas, puladas };
}

function aplicarMudancaNaSessao(controle, mudanca) {
  try {
    switch (mudanca.tipo) {
      case "bloquear": {
        if (typeof controle.forcarBloqueioCenario === "function") {
          const r = controle.forcarBloqueioCenario(mudanca.trechoId);
          return r?.permitido
            ? { ok: true }
            : { ok: false, motivo: r?.motivo || "Bloqueio recusado." };
        }
        if (typeof controle.solicitarBloqueio !== "function") {
          return { ok: false, motivo: "Controle sem bloqueio." };
        }
        const r = controle.solicitarBloqueio(mudanca.trechoId);
        return r?.permitido
          ? { ok: true }
          : { ok: false, motivo: r?.motivo || "Bloqueio recusado." };
      }
      case "inverter": {
        if (typeof controle.aplicarMitigacao === "function") {
          const r = controle.aplicarMitigacao(mudanca);
          return r?.ok ? { ok: true } : { ok: false, motivo: r?.motivo || "Inversão falhou." };
        }
        if (typeof controle.selecionar === "function" && typeof controle.inverterSelecionado === "function") {
          controle.selecionar(mudanca.trechoId);
          // Reaplicação de cenário: pula prévia F2 (semPrevia) para não travar o remount.
          const r = controle.inverterSelecionado({ semPrevia: true });
          return r?.ok ? { ok: true } : { ok: false, motivo: r?.motivo || "Inversão falhou." };
        }
        return { ok: false, motivo: "Controle sem inversão." };
      }
      case "lombada": {
        if (typeof controle.adicionarLombada !== "function") {
          return { ok: false, motivo: "Controle sem lombada." };
        }
        const [lat, lon] = mudanca.coordenadas ?? [];
        if (lat == null || lon == null) {
          return { ok: false, motivo: "Lombada sem coordenadas." };
        }
        const r = controle.adicionarLombada({
          lat,
          lon,
          trechoId: mudanca.trechoId,
          velocidadeMaxKmh: mudanca.velocidadeMaxKmh,
          raioEfeito: mudanca.raioEfeito,
          ...(mudanca.id ? { id: mudanca.id } : {}),
        });
        return r?.permitido
          ? { ok: true, dispositivoId: r.dispositivo?.id }
          : { ok: false, motivo: r?.motivo || "Lombada recusada." };
      }
      case "semaforo": {
        if (typeof controle.adicionarSemaforo !== "function") {
          return { ok: false, motivo: "Controle sem semáforo." };
        }
        const [lat, lon] = mudanca.coordenadas ?? [];
        if (lat == null || lon == null) {
          return { ok: false, motivo: "Semáforo sem coordenadas." };
        }
        const r = controle.adicionarSemaforo({
          lat,
          lon,
          trechoId: mudanca.trechoId,
          tempos: mudanca.tempos,
          estadoInicial: mudanca.estadoInicial,
          sentido: mudanca.sentido,
          ...(mudanca.id ? { id: mudanca.id } : {}),
        });
        return r?.permitido
          ? { ok: true, dispositivoId: r.dispositivo?.id }
          : { ok: false, motivo: r?.motivo || "Semáforo recusado." };
      }
      case "adicionarLigacao": {
        if (typeof controle.adicionarLigacao !== "function") {
          return { ok: false, motivo: "Controle sem suporte a ligação." };
        }
        const r = controle.adicionarLigacao(mudanca);
        return r?.permitido
          ? { ok: true, trechoId: r.trechoId }
          : { ok: false, motivo: r?.motivo || "Ligação recusada." };
      }
      default:
        return { ok: false, motivo: `Tipo não suportado: ${mudanca.tipo}` };
    }
  } catch (err) {
    return { ok: false, motivo: err?.message || "Falha ao aplicar mudança." };
  }
}
