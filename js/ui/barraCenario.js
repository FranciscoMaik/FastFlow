// Barra compartilhada de cenário ativo (F5) — páginas 1/2/3.
import {
  criarESalvar,
  definirCenarioAtivo,
  duplicarCenarioSalvo,
  exportarCenarioJson,
  garantirCenarioAtivoParaRegiao,
  importarCenariosJson,
  listarCenarios,
  obterCenarioAtivo,
  avaliarCenarioPersistido,
} from "../adaptador/cenarios.js";
import { rotuloResumoCenario } from "../motor/cenario.js";
import { confirmar } from "./confirmacao.js";

const DEBOUNCE_AVALIAR_MS = 180;

function $(sel, raiz = document) {
  return raiz.querySelector(sel);
}

function baixarTexto(nomeArquivo, texto) {
  const blob = new Blob([texto], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

function markupBarra() {
  return `
    <div class="barra-cenario-resumo" data-cenario="resumo" aria-live="polite">
      Nenhum cenário ativo
    </div>
    <label class="barra-cenario-campo">
      <span class="visually-hidden">Cenário ativo</span>
      <select data-cenario="select" aria-label="Cenário ativo"></select>
    </label>
    <div class="barra-cenario-acoes" role="group" aria-label="Ações do cenário">
      <button type="button" class="barra-cenario-btn" data-cenario="novo" title="Novo cenário">Novo</button>
      <button type="button" class="barra-cenario-btn" data-cenario="duplicar" title="Duplicar cenário ativo">Duplicar</button>
      <button type="button" class="barra-cenario-btn" data-cenario="exportar" title="Exportar JSON">Exportar</button>
      <button type="button" class="barra-cenario-btn" data-cenario="importar" title="Importar JSON">Importar</button>
      <input type="file" data-cenario="arquivo" accept="application/json,.json" hidden>
    </div>
  `;
}

/**
 * Monta a barra de cenário abaixo do topbar (ou no container informado).
 * @returns {{
 *   el: HTMLElement,
 *   atualizar: () => void,
 *   aoTrocarLocal: (local: {id:string,nome?:string}, grafoBase?: object|null) => void,
 *   definirAoTrocarCenario: (fn: null | ((info: {cenario: object|null, motivo: string}) => void)) => void,
 *   notificarMudanca: () => void,
 *   obterAtivo: () => object|null,
 *   desmontar: () => void,
 * }}
 */
export function iniciarBarraCenario({
  container = null,
  aposTopbar = true,
} = {}) {
  let el = container;
  if (!el) {
    el = document.getElementById("barraCenario");
  }
  if (!el) {
    el = document.createElement("div");
    el.id = "barraCenario";
    el.className = "barra-cenario";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Cenário salvo");
    if (aposTopbar) {
      const topbar = document.querySelector(".layout > .topbar") || document.querySelector(".topbar");
      const layout = document.querySelector(".layout");
      if (topbar?.parentNode) {
        topbar.insertAdjacentElement("afterend", el);
      } else if (layout) {
        layout.prepend(el);
      } else {
        document.body.prepend(el);
      }
    }
  }

  el.classList.add("barra-cenario");
  el.innerHTML = markupBarra();
  document.querySelector(".layout")?.classList.add("com-barra-cenario");

  const resumoEl = $("[data-cenario=resumo]", el);
  const selectEl = $("[data-cenario=select]", el);
  const btnNovo = $("[data-cenario=novo]", el);
  const btnDuplicar = $("[data-cenario=duplicar]", el);
  const btnExportar = $("[data-cenario=exportar]", el);
  const btnImportar = $("[data-cenario=importar]", el);
  const inputArquivo = $("[data-cenario=arquivo]", el);

  let localAtual = null;
  let grafoBase = null;
  let deltaTempoMedio = null;
  let avaliacaoTimer = null;
  let avaliacaoGeracao = 0;
  /** @type {null | ((info: {cenario: object|null, motivo: string}) => void)} */
  let aoTrocarCenarioCb = null;
  const abort = new AbortController();
  const { signal } = abort;

  function emitirTrocaCenario(motivo) {
    const cb = aoTrocarCenarioCb;
    if (!cb) return;
    try {
      cb({ cenario: obterCenarioAtivo(), motivo });
    } catch {
      /* UI remount é best-effort */
    }
  }

  function popularSelect() {
    const regiaoId = localAtual?.id;
    const lista = listarCenarios(regiaoId ? { regiaoId } : {});
    const ativo = obterCenarioAtivo();
    selectEl.replaceChildren();
    if (lista.length === 0) {
      selectEl.append(new Option("Nenhum cenário", ""));
      selectEl.disabled = true;
      return;
    }
    selectEl.disabled = false;
    for (const c of lista) {
      selectEl.append(new Option(c.nome, c.id));
    }
    if (ativo && lista.some((c) => c.id === ativo.id)) {
      selectEl.value = ativo.id;
    } else {
      selectEl.value = lista[0].id;
    }
  }

  function pintarResumo() {
    const ativo = obterCenarioAtivo();
    if (!ativo) {
      resumoEl.textContent = "Nenhum cenário ativo";
      return;
    }
    const foraDaRegiao =
      localAtual?.id && ativo.regiaoId !== localAtual.id
        ? ` (região ${ativo.regiaoId})`
        : "";
    resumoEl.textContent =
      rotuloResumoCenario({
        nome: ativo.nome,
        mudancas: ativo.mudancas,
        deltaTempoMedio:
          !localAtual || ativo.regiaoId === localAtual.id ? deltaTempoMedio : null,
      }) + foraDaRegiao;
  }

  function agendarAvaliacao() {
    if (avaliacaoTimer != null) clearTimeout(avaliacaoTimer);
    avaliacaoTimer = setTimeout(() => {
      avaliacaoTimer = null;
      avaliarAgora();
    }, DEBOUNCE_AVALIAR_MS);
  }

  function avaliarAgora() {
    const ativo = obterCenarioAtivo();
    // Sem grafoBase não há Δ F2 (ex.: página3 contingência — só rotas, sem malha simulável).
    if (!ativo || !grafoBase || (localAtual && ativo.regiaoId !== localAtual.id)) {
      deltaTempoMedio = ativo?.mudancas?.length ? null : 0;
      pintarResumo();
      return;
    }
    if (ativo.mudancas.length === 0) {
      deltaTempoMedio = 0;
      pintarResumo();
      return;
    }
    const geracao = ++avaliacaoGeracao;
    try {
      const r = avaliarCenarioPersistido(grafoBase, ativo);
      if (geracao !== avaliacaoGeracao) return;
      deltaTempoMedio = r.delta?.tempoMedioViagem?.absoluto ?? null;
    } catch {
      if (geracao !== avaliacaoGeracao) return;
      deltaTempoMedio = null;
    }
    pintarResumo();
  }

  function atualizar() {
    popularSelect();
    pintarResumo();
    agendarAvaliacao();
  }

  function aoTrocarLocal(local, grafo = null) {
    localAtual = local;
    grafoBase = grafo;
    if (local?.id) {
      garantirCenarioAtivoParaRegiao(local.id, { nomeRegiao: local.nome });
    }
    deltaTempoMedio = null;
    atualizar();
  }

  function notificarMudanca() {
    atualizar();
  }

  selectEl.addEventListener(
    "change",
    async () => {
      if (!selectEl.value) return;
      const anteriorId = obterCenarioAtivo()?.id ?? "";
      // Páginas 1/2 remountam a sessão — confirma antes de trocar o ativo.
      if (aoTrocarCenarioCb && anteriorId && selectEl.value !== anteriorId) {
        const ok = await confirmar({
          titulo: "Trocar cenário?",
          mensagem:
            "A simulação será reiniciada e as mudanças do cenário escolhido serão reaplicadas.",
          confirmarTexto: "Trocar cenário",
          cancelarTexto: "Manter atual",
        });
        if (!ok) {
          selectEl.value = anteriorId;
          return;
        }
      }
      definirCenarioAtivo(selectEl.value);
      deltaTempoMedio = null;
      atualizar();
      emitirTrocaCenario("select");
    },
    { signal }
  );

  btnNovo.addEventListener(
    "click",
    () => {
      const regiaoId = localAtual?.id;
      if (!regiaoId) {
        window.alert("Escolha um local antes de criar um cenário.");
        return;
      }
      const sugerido = `Obra · ${localAtual.nome || regiaoId}`;
      const nome = window.prompt("Nome do cenário:", sugerido);
      if (nome == null) return;
      const limpo = nome.trim();
      if (!limpo) return;
      criarESalvar({ nome: limpo, regiaoId });
      deltaTempoMedio = 0;
      atualizar();
      emitirTrocaCenario("novo");
    },
    { signal }
  );

  btnDuplicar.addEventListener(
    "click",
    () => {
      const ativo = obterCenarioAtivo();
      if (!ativo) {
        window.alert("Nenhum cenário ativo para duplicar.");
        return;
      }
      const nome = window.prompt("Nome da cópia:", `${ativo.nome} (cópia)`);
      if (nome == null) return;
      const r = duplicarCenarioSalvo(ativo.id, { nome: nome.trim() || undefined });
      if (!r.ok) {
        window.alert(r.motivo);
        return;
      }
      atualizar();
      emitirTrocaCenario("duplicar");
    },
    { signal }
  );

  btnExportar.addEventListener(
    "click",
    () => {
      try {
        const ativo = obterCenarioAtivo();
        if (!ativo) {
          window.alert("Nenhum cenário ativo para exportar.");
          return;
        }
        const json = exportarCenarioJson(ativo.id);
        const slug = ativo.nome
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "cenario";
        baixarTexto(`fastflow-cenario-${slug}.json`, json);
      } catch (err) {
        window.alert(err?.message || "Falha ao exportar.");
      }
    },
    { signal }
  );

  btnImportar.addEventListener(
    "click",
    () => inputArquivo.click(),
    { signal }
  );

  inputArquivo.addEventListener(
    "change",
    async () => {
      const arquivo = inputArquivo.files?.[0];
      inputArquivo.value = "";
      if (!arquivo) return;
      try {
        const texto = await arquivo.text();
        const r = importarCenariosJson(texto);
        if (!r.ok) {
          window.alert(r.motivo);
          return;
        }
        atualizar();
        emitirTrocaCenario("importar");
      } catch (err) {
        window.alert(err?.message || "Falha ao importar.");
      }
    },
    { signal }
  );

  atualizar();

  return {
    el,
    atualizar,
    aoTrocarLocal,
    /**
     * Páginas 1/2 usam isto para remount + `aplicarCenarioNaSessao`.
     * Página 3 (contingência) não registra — sem malha viva / sem Δ.
     */
    definirAoTrocarCenario(fn) {
      aoTrocarCenarioCb = typeof fn === "function" ? fn : null;
    },
    notificarMudanca,
    obterAtivo: () => obterCenarioAtivo(),
    desmontar() {
      abort.abort();
      aoTrocarCenarioCb = null;
      if (avaliacaoTimer != null) clearTimeout(avaliacaoTimer);
      avaliacaoGeracao += 1;
      el.remove();
      document.querySelector(".layout")?.classList.remove("com-barra-cenario");
    },
  };
}
