// Ponte do comparador → F5 (cenários salvos).
// Prefere `js/adaptador/cenarios.js`; se indisponível, usa stub localStorage.
import { desserializarLista, serializarLista } from "../motor/mudanca.js";
import { carregarListaMudancas } from "../motor/comparadorCenarios.js";

export const CHAVE_STUB = "fastflow.comparador.cenarios";

function armazenamentoPadrao() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function idNovo(prefixo = "cmp") {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function lerStub(storage = armazenamentoPadrao()) {
  if (!storage) return { ativoId: null, itens: [] };
  try {
    const bruto = storage.getItem(CHAVE_STUB);
    if (!bruto) return { ativoId: null, itens: [] };
    const parsed = JSON.parse(bruto);
    const itens = Array.isArray(parsed?.itens) ? parsed.itens : [];
    return { ativoId: parsed?.ativoId ?? null, itens };
  } catch {
    return { ativoId: null, itens: [] };
  }
}

function gravarStub(estado, storage = armazenamentoPadrao()) {
  if (!storage) return;
  try {
    storage.setItem(CHAVE_STUB, JSON.stringify(estado));
  } catch {
    /* best-effort */
  }
}

/**
 * Forma estável para a UI do comparador (F5 ou stub).
 * F5 usa `regiaoId`; aceitamos aliases.
 */
export function normalizarCenario(entrada, origem = "stub") {
  if (!entrada || typeof entrada !== "object") return null;
  const mudancas = Array.isArray(entrada.mudancas)
    ? serializarLista(desserializarLista(entrada.mudancas))
    : [];
  const regiaoId =
    entrada.regiaoId ?? entrada.regiao ?? entrada.localId ?? entrada.local ?? null;
  return {
    id: String(entrada.id ?? idNovo()),
    nome: String(entrada.nome ?? entrada.titulo ?? "Cenário sem nome"),
    regiaoId: regiaoId != null ? String(regiaoId) : null,
    regiao: regiaoId != null ? String(regiaoId) : null,
    semente: entrada.semente ?? entrada.seed ?? 1,
    demandaN: entrada.demandaN ?? null,
    mudancas,
    origem,
    atualizadoEm: entrada.atualizadoEm ?? entrada.updatedAt ?? null,
  };
}

/** API stub: create/load/save/list com listas F3 serializadas. */
export function criarApiStub(storage = armazenamentoPadrao()) {
  return {
    fonte: "stub",
    listar({ regiaoId } = {}) {
      let itens = lerStub(storage).itens.map((c) => normalizarCenario(c, "stub")).filter(Boolean);
      if (regiaoId) itens = itens.filter((c) => c.regiaoId === regiaoId);
      return itens;
    },
    obter(id) {
      const c = lerStub(storage).itens.find((x) => x.id === id);
      return c ? normalizarCenario(c, "stub") : null;
    },
    salvar(cenario) {
      const estado = lerStub(storage);
      const normalizado = normalizarCenario(
        {
          ...cenario,
          regiaoId: cenario.regiaoId ?? cenario.regiao,
          id: cenario.id ?? idNovo(),
          atualizadoEm: new Date().toISOString(),
        },
        "stub"
      );
      const idx = estado.itens.findIndex((x) => x.id === normalizado.id);
      if (idx >= 0) estado.itens[idx] = normalizado;
      else estado.itens.push(normalizado);
      gravarStub(estado, storage);
      return normalizado;
    },
    remover(id) {
      const estado = lerStub(storage);
      estado.itens = estado.itens.filter((x) => x.id !== id);
      if (estado.ativoId === id) estado.ativoId = null;
      gravarStub(estado, storage);
    },
    importarJson(textoOuObj) {
      const parsed = typeof textoOuObj === "string" ? JSON.parse(textoOuObj) : textoOuObj;
      if (Array.isArray(parsed)) {
        return this.salvar({ nome: "Importado", mudancas: parsed, regiaoId: "desconhecida" });
      }
      if (parsed?.mudancas) {
        return this.salvar({
          id: parsed.id,
          nome: parsed.nome ?? parsed.titulo ?? "Importado",
          regiaoId: parsed.regiaoId ?? parsed.regiao ?? parsed.localId ?? "desconhecida",
          semente: parsed.semente,
          mudancas: parsed.mudancas,
        });
      }
      throw new TypeError("JSON de cenário inválido");
    },
    exportarJson(id) {
      const c = this.obter(id);
      if (!c) return null;
      return JSON.stringify(c, null, 2);
    },
  };
}

function adaptarModuloF5(mod) {
  // Adaptador oficial: listarCenarios / obterCenario / salvarCenario
  if (typeof mod.listarCenarios === "function" && typeof mod.obterCenario === "function") {
    return {
      fonte: "f5",
      modulo: mod,
      listar(opcoes = {}) {
        return (mod.listarCenarios(opcoes) ?? [])
          .map((c) => normalizarCenario(c, "f5"))
          .filter(Boolean);
      },
      obter(id) {
        const c = mod.obterCenario(id);
        return c ? normalizarCenario(c, "f5") : null;
      },
      salvar(cenario) {
        const regiaoId = cenario.regiaoId ?? cenario.regiao;
        if (!regiaoId) {
          throw new Error("Cenário F5 exige regiaoId (escolha um local antes de salvar).");
        }
        const entrada = {
          id: cenario.id,
          nome: cenario.nome ?? "Cenário",
          regiaoId,
          semente: cenario.semente,
          demandaN: cenario.demandaN,
          mudancas: cenario.mudancas ?? [],
          criadoEm: cenario.criadoEm,
          atualizadoEm: new Date().toISOString(),
        };
        let salvo;
        if (!cenario.id && typeof mod.criarESalvar === "function") {
          salvo = mod.criarESalvar(entrada);
        } else if (typeof mod.salvarCenario === "function" && typeof mod.criarCenario === "function") {
          salvo = mod.salvarCenario(mod.criarCenario(entrada));
        } else if (typeof mod.salvarCenario === "function") {
          // Fallback se o adaptador não reexportar criarCenario.
          salvo = mod.salvarCenario({
            versao: 1,
            id: cenario.id ?? idNovo("cen"),
            nome: entrada.nome,
            regiaoId,
            semente: cenario.semente ?? 1,
            demandaN: cenario.demandaN ?? 200,
            mudancas: entrada.mudancas,
            criadoEm: entrada.criadoEm ?? new Date().toISOString(),
            atualizadoEm: entrada.atualizadoEm,
          });
        } else {
          throw new Error("API F5 sem salvarCenario/criarESalvar");
        }
        return normalizarCenario(salvo, "f5");
      },
      remover(id) {
        return mod.removerCenario?.(id);
      },
      importarJson(textoOuObj) {
        if (typeof mod.importarCenariosJson === "function") {
          const r = mod.importarCenariosJson(textoOuObj);
          const primeiro = r?.importados?.[0] ?? r?.cenarios?.[0] ?? r;
          return primeiro ? normalizarCenario(primeiro, "f5") : null;
        }
        const parsed = typeof textoOuObj === "string" ? JSON.parse(textoOuObj) : textoOuObj;
        return this.salvar(parsed);
      },
      exportarJson(id) {
        if (typeof mod.exportarCenarioJson === "function") return mod.exportarCenarioJson(id);
        const c = this.obter(id);
        return c ? JSON.stringify(c, null, 2) : null;
      },
    };
  }

  // Fallbacks genéricos (APIs alternativas)
  const listar = mod.listar ?? mod.todos;
  const obter = mod.obter ?? mod.carregar;
  if (typeof listar !== "function") return null;

  return {
    fonte: "f5",
    modulo: mod,
    listar() {
      return (listar() ?? []).map((c) => normalizarCenario(c, "f5")).filter(Boolean);
    },
    obter(id) {
      if (typeof obter === "function") {
        const c = obter(id);
        return c ? normalizarCenario(c, "f5") : null;
      }
      return this.listar().find((c) => c.id === id) ?? null;
    },
    salvar(cenario) {
      if (typeof mod.salvar === "function") return normalizarCenario(mod.salvar(cenario), "f5");
      throw new Error("API F5 sem método de salvar");
    },
    remover(id) {
      return mod.remover?.(id);
    },
    importarJson(textoOuObj) {
      const parsed = typeof textoOuObj === "string" ? JSON.parse(textoOuObj) : textoOuObj;
      return this.salvar(parsed);
    },
    exportarJson(id) {
      const c = this.obter(id);
      return c ? JSON.stringify(c, null, 2) : null;
    },
  };
}

let cacheApi = undefined;

/**
 * Prefere F5 (`adaptador/cenarios.js`); senão stub.
 * Testes: `{ forcarStub: true }` ou `{ api }`.
 */
export async function resolverFonteCenarios({ forcarStub = false, api = null, storage } = {}) {
  if (api) {
    cacheApi = api;
    return api;
  }
  if (forcarStub) {
    cacheApi = criarApiStub(storage);
    return cacheApi;
  }
  if (cacheApi !== undefined && cacheApi?.fonte === "f5") return cacheApi;

  // Adaptador primeiro (tem listar/salvar); motor/cenario.js é só o modelo.
  const candidatos = ["./cenarios.js", "../adaptador/cenarios.js", "../motor/cenario.js"];

  for (const caminho of candidatos) {
    try {
      const mod = await import(caminho);
      const adaptada = adaptarModuloF5(mod);
      if (adaptada) {
        cacheApi = adaptada;
        return cacheApi;
      }
    } catch {
      /* módulo ausente */
    }
  }

  cacheApi = criarApiStub(storage);
  return cacheApi;
}

export function resetarCacheFonteCenarios() {
  cacheApi = undefined;
}

export function mudancasDoCenario(cenario) {
  if (!cenario) return [];
  return carregarListaMudancas(cenario.mudancas ?? []);
}

export { carregarListaMudancas, serializarLista };
