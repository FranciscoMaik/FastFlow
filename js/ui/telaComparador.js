// Tela do comparador Base × Cenário A × Cenário B.
/* global L */
import { carregarLocais, carregarMalhaDoLocal, lerLocalId, salvarLocalId } from "../adaptador/locais.js";
import { construirGrafo } from "../adaptador/carregarMalha.js";
import {
  resolverFonteCenarios,
  mudancasDoCenario,
  carregarListaMudancas,
} from "../adaptador/fonteCenariosComparador.js";
import {
  compararCenarios,
  cascataContribuicao,
  montarResumo,
  resumoParaHtml,
  resumoParaJson,
  diferencaVariacaoFluxo,
  trechosParaVariacao,
} from "../motor/comparadorCenarios.js";
import { criarCamadaVias } from "./camadaVias.js";
import { criarCamadaVariacaoFluxo } from "./camadaVariacaoFluxo.js";
import { fmtNumero, fmtTempo, fmtDistancia, fmtDelta, rodapeAmostra } from "./previewImpactoFmt.js";

const $ = (id) => document.getElementById(id);

const DEMANDA_PADRAO = { n: 120, semente: 1 };
const CENTRO_CAJAMAR = [-23.355, -46.878];

function baixarArquivo(nome, conteudo, mime) {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtIndicador(chave, valor) {
  if (valor == null || Number.isNaN(valor)) return "—";
  if (chave === "tempoMedioViagem") return fmtTempo(valor);
  if (chave === "distanciaMedia") return fmtDistancia(valor);
  if (chave === "kmRodados") return `${fmtNumero(valor)} km`;
  return fmtNumero(valor, { digitos: chave === "retidos" || chave === "viagensComRota" || chave === "nosComAcesso" ? 0 : 1 });
}

function fmtDeltaLinha(chave, delta) {
  if (delta == null || Number.isNaN(delta)) return "—";
  if (chave === "tempoMedioViagem") return fmtDelta(delta, null, { unidade: " s", digitos: 1 });
  if (chave === "distanciaMedia") return fmtDelta(delta, null, { unidade: " m", digitos: 0 });
  if (chave === "kmRodados") return fmtDelta(delta, null, { unidade: " km", digitos: 2 });
  return fmtDelta(delta, null, { digitos: 0 });
}

function preencherSelectCenarios(select, cenarios, placeholder) {
  const valor = select.value;
  select.replaceChildren(new Option(placeholder, ""));
  for (const c of cenarios) {
    const opt = new Option(`${c.nome} (${c.mudancas?.length ?? 0} mud.)`, c.id);
    select.appendChild(opt);
  }
  if ([...select.options].some((o) => o.value === valor)) select.value = valor;
}

function modoMapaSelecionado() {
  return document.querySelector('input[name="modoMapaDiff"]:checked')?.value ?? "base-a";
}

/**
 * Abre o HTML do resumo e dispara Imprimir (destino PDF do navegador).
 * Sem lib PDF pesada — só CSS de impressão + diálogo nativo.
 */
function abrirResumoParaPdf(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  // Sem "noopener" no 3º arg: senão open() devolve null e o autoPrint do HTML não roda.
  const janela = window.open(url, "_blank");
  if (!janela) {
    URL.revokeObjectURL(url);
    return { ok: false, motivo: "Permita pop-ups para abrir o relatório e gerar o PDF." };
  }
  try {
    janela.opener = null;
  } catch {
    /* ignore */
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { ok: true };
}

async function iniciar() {
  const statusFonte = $("statusFonte");
  const feedback = $("feedbackComparador");
  const selLocal = $("selLocal");
  const infoLocal = $("infoLocal");

  let grafo = null;
  let localAtual = null;
  let ultimaComparacao = null;
  let ultimaCascataA = null;
  let ultimaCascataB = null;
  let api = await resolverFonteCenarios();
  let camadaVias = null;
  let camadaVariacao = null;
  let trechosMapa = [];

  const elMapa = $("mapaComparador");
  const mapa =
    elMapa && typeof L !== "undefined"
      ? L.map(elMapa, { zoomControl: true }).setView(CENTRO_CAJAMAR, 15)
      : null;
  if (mapa) {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(mapa);
    camadaVariacao = criarCamadaVariacaoFluxo(mapa);
  }

  statusFonte.textContent =
    api.fonte === "f5"
      ? "Fonte: cenários F5 (salvos)."
      : "Fonte: stub local (cole JSON ou importe). Quando F5 estiver pronto, a tela passa a usá-lo automaticamente.";

  function enquadrarMalha() {
    if (!mapa) return;
    if (localAtual?.limites?.length === 2) {
      mapa.fitBounds(localAtual.limites, { padding: [24, 24] });
      return;
    }
    const bounds = camadaVias?.limites?.();
    if (bounds?.isValid?.()) mapa.fitBounds(bounds, { padding: [24, 24] });
  }

  function rebuildCamadaVias() {
    if (!mapa || !grafo) return;
    camadaVias?.remover();
    trechosMapa = trechosParaVariacao(grafo);
    camadaVias = criarCamadaVias(mapa, trechosMapa, { aoClicar: () => {} });
    enquadrarMalha();
    requestAnimationFrame(() => mapa.invalidateSize());
  }

  function deltaParaModo(comp, modo) {
    if (!comp?.deltas) return null;
    if (modo === "base-b") return comp.deltas.b;
    if (modo === "a-b") return diferencaVariacaoFluxo(comp.deltas.a, comp.deltas.b);
    return comp.deltas.a;
  }

  function rotuloModo(modo, nomes) {
    if (modo === "base-b") return `Base → ${nomes?.b ?? "B"}`;
    if (modo === "a-b") return `${nomes?.a ?? "A"} → ${nomes?.b ?? "B"}`;
    return `Base → ${nomes?.a ?? "A"}`;
  }

  function pintarMapaDiff() {
    const legenda = $("legendaMapaDiff");
    if (!camadaVariacao) {
      if (legenda) {
        legenda.textContent = "Mapa indisponível (Leaflet não carregou).";
      }
      return;
    }
    if (!ultimaComparacao) {
      camadaVariacao.limpar();
      if (legenda) {
        legenda.textContent =
          "Compare os cenários para ver a variação de fluxo. Vermelho = recebe mais; verde = alivia.";
      }
      return;
    }
    const modo = modoMapaSelecionado();
    const delta = deltaParaModo(ultimaComparacao, modo);
    const ok = camadaVariacao.atualizar(delta, trechosMapa);
    camadaVariacao.definirVisivel(true);
    if (legenda) {
      legenda.textContent = ok
        ? `${rotuloModo(modo, ultimaComparacao.nomes)} · vermelho = recebe mais fluxo; verde = alivia.`
        : `${rotuloModo(modo, ultimaComparacao.nomes)} · sem variação de fluxo perceptível nesta amostra.`;
    }
    requestAnimationFrame(() => mapa?.invalidateSize());
  }

  async function atualizarListasCenarios() {
    api = await resolverFonteCenarios();
    const lista = api.listar(localAtual?.id ? { regiaoId: localAtual.id } : {});
    // Se a região não tem cenários, mostra todos (útil no stub / primeira carga).
    const efetiva = lista.length > 0 || !localAtual?.id ? lista : api.listar();
    preencherSelectCenarios($("selCenarioA"), efetiva, "Escolha o cenário A…");
    preencherSelectCenarios($("selCenarioB"), efetiva, "Escolha o cenário B…");
    $("listaStub").textContent =
      efetiva.length === 0
        ? "Nenhum cenário salvo. Cole uma lista JSON ou salve mudanças pela barra F5 nas outras telas."
        : `Cenários disponíveis (${api.fonte}): ${efetiva.map((c) => c.nome).join(", ")}.`;
  }

  async function carregarLocaisNaUi() {
    const { locais, padrao } = await carregarLocais($("raizComparador").dataset.locais);
    const ids = locais.map((l) => l.id);
    const idInicial = lerLocalId(ids, padrao);
    selLocal.replaceChildren(...locais.map((l) => new Option(l.nome, l.id)));
    selLocal.value = idInicial;
    selLocal.disabled = false;
    await trocarLocal(locais.find((l) => l.id === idInicial) ?? locais[0]);
    selLocal.addEventListener("change", async () => {
      const local = locais.find((l) => l.id === selLocal.value);
      if (local) await trocarLocal(local);
    });
  }

  async function trocarLocal(local) {
    infoLocal.textContent = "Carregando malha…";
    feedback.textContent = "";
    try {
      const geojson = await carregarMalhaDoLocal(local);
      grafo = construirGrafo(geojson);
      localAtual = local;
      salvarLocalId(local.id);
      infoLocal.textContent = `${local.descricao ?? local.nome} · ${grafo.trechos.size} trechos`;
      ultimaComparacao = null;
      ultimaCascataA = null;
      ultimaCascataB = null;
      $("painelResultados").hidden = true;
      rebuildCamadaVias();
      camadaVariacao?.limpar();
      await atualizarListasCenarios();
    } catch (erro) {
      grafo = null;
      infoLocal.textContent = erro.message;
    }
  }

  function resolverMudancas(lado) {
    const modo = document.querySelector(`input[name="modo${lado}"]:checked`)?.value ?? "salvo";
    if (modo === "json") {
      const texto = $(`json${lado}`).value;
      return {
        nome: $(`nomeJson${lado}`).value.trim() || `Cenário ${lado}`,
        mudancas: carregarListaMudancas(texto),
      };
    }
    const id = $(`selCenario${lado}`).value;
    if (!id) throw new Error(`Selecione o cenário ${lado} ou cole a lista JSON.`);
    const c = api.obter(id);
    if (!c) throw new Error(`Cenário ${lado} não encontrado.`);
    return { nome: c.nome, mudancas: mudancasDoCenario(c) };
  }

  function renderTabela(comp) {
    const thead = $("theadComparacao");
    thead.innerHTML = `<tr>
      <th scope="col">Indicador</th>
      <th scope="col">${comp.nomes.base}</th>
      <th scope="col">${comp.nomes.a}</th>
      <th scope="col">${comp.nomes.b}</th>
      <th scope="col">Δ A</th>
      <th scope="col">Δ B</th>
    </tr>`;

    const tbody = $("tbodyComparacao");
    tbody.replaceChildren();
    for (const linha of comp.linhas) {
      const tr = document.createElement("tr");
      const cel = (col, valor) => {
        const td = document.createElement("td");
        td.textContent = fmtIndicador(linha.chave, valor);
        if (linha.melhores.includes(col)) {
          td.classList.add("cel-melhor");
          td.title = "Melhor valor entre Base, A e B";
        }
        return td;
      };
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = linha.rotulo;
      tr.append(
        th,
        cel("base", linha.base),
        cel("a", linha.a),
        cel("b", linha.b)
      );
      const dA = document.createElement("td");
      dA.textContent = fmtDeltaLinha(linha.chave, linha.deltaA);
      const dB = document.createElement("td");
      dB.textContent = fmtDeltaLinha(linha.chave, linha.deltaB);
      tr.append(dA, dB);
      tbody.appendChild(tr);
    }

    $("rodapeTabela").textContent = rodapeAmostra(comp.amostra.tamanho);
    $("painelResultados").hidden = false;
  }

  function renderCascata(el, cascata, titulo) {
    el.hidden = !cascata;
    if (!cascata) return;
    el.querySelector("[data-cascata-titulo]").textContent = titulo;
    el.querySelector("[data-cascata-meta]").textContent =
      `Métrica: tempo médio · total Δ ${fmtDeltaLinha("tempoMedioViagem", cascata.total)}`;
    const ol = el.querySelector("[data-cascata-passos]");
    ol.replaceChildren();
    const maxAbs = Math.max(
      1,
      ...cascata.passos.map((p) => Math.abs(p.contribuicao ?? 0)).filter(Number.isFinite)
    );
    for (const passo of cascata.passos) {
      const li = document.createElement("li");
      li.className = "cascata-passo";
      const contrib = passo.contribuicao ?? 0;
      const pct = Math.round((Math.abs(contrib) / maxAbs) * 100);
      const sinal = contrib > 0 ? "piora" : contrib < 0 ? "melhora" : "neutro";
      li.innerHTML = `
        <div class="cascata-cabeca">
          <strong>${passo.rotulo}</strong>
          <span>${fmtIndicador("tempoMedioViagem", passo.valor)}</span>
          <span class="cascata-delta cascata-${sinal}">${passo.indice === 0 ? "—" : fmtDeltaLinha("tempoMedioViagem", passo.contribuicao)}</span>
        </div>
        <div class="cascata-barra" aria-hidden="true"><span style="width:${passo.indice === 0 ? 0 : pct}%"></span></div>
      `;
      ol.appendChild(li);
    }
  }

  async function comparar() {
    feedback.textContent = "";
    if (!grafo) {
      feedback.textContent = "Carregue um local antes de comparar.";
      return;
    }
    let ladoA;
    let ladoB;
    try {
      ladoA = resolverMudancas("A");
      ladoB = resolverMudancas("B");
    } catch (erro) {
      feedback.textContent = erro.message;
      return;
    }

    const semente = Number($("selSemente").value) || DEMANDA_PADRAO.semente;
    const n = Number($("selAmostra").value) || DEMANDA_PADRAO.n;
    const demanda = { n, semente };

    $("btnComparar").disabled = true;
    feedback.textContent = "Avaliando cenários…";
    try {
      // Yield para a UI atualizar o status.
      await new Promise((r) => setTimeout(r, 0));
      const comp = compararCenarios({
        grafo,
        demanda,
        mudancasA: ladoA.mudancas,
        mudancasB: ladoB.mudancas,
        nomeA: ladoA.nome,
        nomeB: ladoB.nome,
      });
      ultimaComparacao = comp;
      ultimaCascataA = cascataContribuicao({
        grafo,
        demanda,
        mudancas: ladoA.mudancas,
        metrica: "tempoMedioViagem",
      });
      ultimaCascataB = cascataContribuicao({
        grafo,
        demanda,
        mudancas: ladoB.mudancas,
        metrica: "tempoMedioViagem",
      });
      renderTabela(comp);
      renderCascata($("cascataA"), ultimaCascataA, `Cascata de contribuição — ${comp.nomes.a}`);
      renderCascata($("cascataB"), ultimaCascataB, `Cascata de contribuição — ${comp.nomes.b}`);
      if (!trechosMapa.length) rebuildCamadaVias();
      pintarMapaDiff();
      feedback.textContent = `Comparação pronta · ${comp.amostra.tamanho} viagens · semente ${semente}.`;
    } catch (erro) {
      feedback.textContent = erro.message ?? String(erro);
      $("painelResultados").hidden = true;
    } finally {
      $("btnComparar").disabled = false;
    }
  }

  function montarResumoAtual() {
    if (!ultimaComparacao) return null;
    return montarResumo({
      comparacao: ultimaComparacao,
      cascataA: ultimaCascataA,
      cascataB: ultimaCascataB,
      meta: {
        titulo: `Comparação — ${ultimaComparacao.nomes.a} × ${ultimaComparacao.nomes.b}`,
        local: localAtual ? { id: localAtual.id, nome: localAtual.nome } : null,
        semente: Number($("selSemente").value) || 1,
      },
    });
  }

  function gerarResumo(formato) {
    const resumo = montarResumoAtual();
    if (!resumo) {
      feedback.textContent = "Compare os cenários antes de gerar o resumo.";
      return;
    }
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (formato === "json") {
      baixarArquivo(`fastflow-comparacao-${carimbo}.json`, resumoParaJson(resumo), "application/json");
      feedback.textContent = "Resumo JSON baixado.";
      return;
    }
    if (formato === "pdf") {
      const html = resumoParaHtml(resumo, { autoPrint: true });
      const aberto = abrirResumoParaPdf(html);
      feedback.textContent = aberto.ok
        ? "Relatório aberto — escolha “Salvar como PDF” no diálogo de impressão."
        : aberto.motivo;
      return;
    }
    baixarArquivo(`fastflow-comparacao-${carimbo}.html`, resumoParaHtml(resumo), "text/html");
    feedback.textContent =
      "Resumo HTML baixado. Abra o arquivo e use Imprimir → PDF, ou o botão Gerar PDF.";
  }

  function atualizarModo(lado) {
    const modo = document.querySelector(`input[name="modo${lado}"]:checked`)?.value;
    $(`blocoSalvo${lado}`).hidden = modo !== "salvo";
    $(`blocoJson${lado}`).hidden = modo !== "json";
  }

  function ligarModo(lado) {
    for (const input of document.querySelectorAll(`input[name="modo${lado}"]`)) {
      input.addEventListener("change", () => atualizarModo(lado));
    }
    atualizarModo(lado);
  }

  $("btnComparar").addEventListener("click", () => comparar());
  $("btnResumoHtml").addEventListener("click", () => gerarResumo("html"));
  $("btnResumoPdf")?.addEventListener("click", () => gerarResumo("pdf"));
  $("btnResumoJson").addEventListener("click", () => gerarResumo("json"));
  for (const input of document.querySelectorAll('input[name="modoMapaDiff"]')) {
    input.addEventListener("change", () => pintarMapaDiff());
  }
  $("btnSalvarStubA").addEventListener("click", () => {
    try {
      const mudancas = carregarListaMudancas($("jsonA").value);
      const nome = $("nomeJsonA").value.trim() || "Cenário A";
      api.salvar({
        nome,
        mudancas,
        regiaoId: localAtual?.id,
        semente: Number($("selSemente").value) || 1,
      });
      feedback.textContent = `Cenário “${nome}” salvo na fonte (${api.fonte}).`;
      atualizarListasCenarios();
    } catch (erro) {
      feedback.textContent = erro.message;
    }
  });
  $("btnSalvarStubB").addEventListener("click", () => {
    try {
      const mudancas = carregarListaMudancas($("jsonB").value);
      const nome = $("nomeJsonB").value.trim() || "Cenário B";
      api.salvar({
        nome,
        mudancas,
        regiaoId: localAtual?.id,
        semente: Number($("selSemente").value) || 1,
      });
      feedback.textContent = `Cenário “${nome}” salvo na fonte (${api.fonte}).`;
      atualizarListasCenarios();
    } catch (erro) {
      feedback.textContent = erro.message;
    }
  });
  $("btnAtualizarFonte").addEventListener("click", async () => {
    const { resetarCacheFonteCenarios } = await import("../adaptador/fonteCenariosComparador.js");
    resetarCacheFonteCenarios();
    api = await resolverFonteCenarios();
    statusFonte.textContent =
      api.fonte === "f5"
        ? "Fonte: cenários F5 (salvos)."
        : "Fonte: stub local (cole JSON ou importe).";
    await atualizarListasCenarios();
    feedback.textContent = `Fonte atualizada: ${api.fonte}.`;
  });

  for (const lado of ["A", "B"]) {
    ligarModo(lado);
    $(`arquivo${lado}`)?.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const texto = await file.text();
      $(`json${lado}`).value = texto;
      document.querySelector(`input[name="modo${lado}"][value="json"]`).checked = true;
      atualizarModo(lado);
    });
  }

  await atualizarListasCenarios();
  try {
    await carregarLocaisNaUi();
  } catch (erro) {
    infoLocal.textContent = erro.message;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}
