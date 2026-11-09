// Comparador Base × Cenário A × Cenário B (Fase 3).
// Usa o vocabulário comum do F2 (`avaliar` / `avaliarRede`) e cascata sequencial
// de contribuições por mudança (waterfall).
import { avaliar } from "./avaliadorImpacto.js";
import { desserializarLista, serializarLista } from "./mudanca.js";

/** @typedef {{ chave: string, rotulo: string, menorMelhor: boolean, unidade?: string }} DefIndicador */

/** Vocabulário comum exibido na tabela de comparação. */
export const INDICADORES_COMPARACAO = Object.freeze([
  {
    chave: "tempoMedioViagem",
    rotulo: "Tempo médio de viagem",
    menorMelhor: true,
    unidade: "s",
  },
  {
    chave: "distanciaMedia",
    rotulo: "Distância média",
    menorMelhor: true,
    unidade: "m",
  },
  {
    chave: "kmRodados",
    rotulo: "Km rodados (amostra)",
    menorMelhor: true,
    unidade: "km",
  },
  {
    chave: "retidos",
    rotulo: "Viagens retidas",
    menorMelhor: true,
    unidade: "",
  },
  {
    chave: "viagensComRota",
    rotulo: "Viagens com rota",
    menorMelhor: false,
    unidade: "",
  },
  {
    chave: "nosComAcesso",
    rotulo: "Nós com acesso",
    menorMelhor: false,
    unidade: "",
  },
]);

const CHAVES = new Set(INDICADORES_COMPARACAO.map((d) => d.chave));

/**
 * Extrai indicadores do vocabulário comum a partir de um resultado de `avaliarRede`
 * ou do bloco `base`/`cenario` de `avaliar`.
 * @param {object} indicadores
 * @param {{ tamanho: number }} [amostra]
 */
export function extrairIndicadores(indicadores, amostra) {
  if (!indicadores) {
    return {
      tempoMedioViagem: null,
      distanciaMedia: null,
      kmRodados: null,
      retidos: null,
      viagensComRota: null,
      nosComAcesso: null,
    };
  }
  const tamanho = amostra?.tamanho;
  const retidos = indicadores.retidos ?? null;
  return {
    tempoMedioViagem: indicadores.tempoMedioViagem ?? null,
    distanciaMedia: indicadores.distanciaMedia ?? null,
    kmRodados: indicadores.kmRodados ?? null,
    retidos,
    viagensComRota:
      tamanho != null && retidos != null ? tamanho - retidos : null,
    nosComAcesso: Array.isArray(indicadores.nosComAcesso)
      ? indicadores.nosComAcesso.length
      : indicadores.nosComAcesso ?? null,
  };
}

/**
 * Escolhe o(s) melhor(es) entre colunas numéricas.
 * @param {Record<string, number|null|undefined>} valores — ex.: { base, a, b }
 * @param {boolean} menorMelhor
 * @returns {string[]} chaves empatadas no melhor valor
 */
export function escolherMelhores(valores, menorMelhor) {
  const entradas = Object.entries(valores).filter(
    ([, v]) => v != null && Number.isFinite(v)
  );
  if (entradas.length === 0) return [];
  let melhor = entradas[0][1];
  for (const [, v] of entradas) {
    if (menorMelhor ? v < melhor : v > melhor) melhor = v;
  }
  return entradas.filter(([, v]) => v === melhor).map(([k]) => k);
}

function rotuloMudanca(mudanca, indice) {
  if (!mudanca || typeof mudanca !== "object") return `Passo ${indice + 1}`;
  const tipo = mudanca.tipo ?? "mudança";
  const alvo =
    mudanca.trechoId ??
    mudanca.id ??
    (mudanca.de && mudanca.para ? `${mudanca.de}→${mudanca.para}` : null);
  return alvo ? `${tipo} · ${alvo}` : `${tipo} #${indice + 1}`;
}

/**
 * Avalia Base, A e B com a mesma demanda e monta a tabela com “melhor” destacado.
 *
 * @param {{
 *   grafo: import("./grafo.js").Grafo,
 *   paresOD?: Array,
 *   demanda?: object,
 *   mudancasA?: object[],
 *   mudancasB?: object[],
 *   nomeA?: string,
 *   nomeB?: string,
 * }} args
 */
export function compararCenarios({
  grafo,
  paresOD,
  demanda,
  mudancasA = [],
  mudancasB = [],
  nomeA = "Cenário A",
  nomeB = "Cenário B",
} = {}) {
  if (!grafo) throw new TypeError("compararCenarios: `grafo` é obrigatório");

  const listaA = Array.isArray(mudancasA) ? mudancasA : [];
  const listaB = Array.isArray(mudancasB) ? mudancasB : [];

  const avalA = avaliar({
    grafo,
    paresOD,
    demanda,
    mudancas: listaA,
  });
  const avalB = avaliar({
    grafo,
    paresOD,
    demanda,
    mudancas: listaB,
  });

  const amostra = avalA.amostra;
  const indBase = extrairIndicadores(avalA.base, amostra);
  const indA = extrairIndicadores(avalA.cenario, amostra);
  const indB = extrairIndicadores(avalB.cenario, amostra);

  const linhas = INDICADORES_COMPARACAO.map((def) => {
    const valores = {
      base: indBase[def.chave],
      a: indA[def.chave],
      b: indB[def.chave],
    };
    const melhores = escolherMelhores(valores, def.menorMelhor);
    return {
      chave: def.chave,
      rotulo: def.rotulo,
      unidade: def.unidade,
      menorMelhor: def.menorMelhor,
      base: valores.base,
      a: valores.a,
      b: valores.b,
      melhores,
      deltaA:
        valores.base != null && valores.a != null && Number.isFinite(valores.base) && Number.isFinite(valores.a)
          ? valores.a - valores.base
          : null,
      deltaB:
        valores.base != null && valores.b != null && Number.isFinite(valores.base) && Number.isFinite(valores.b)
          ? valores.b - valores.base
          : null,
    };
  });

  return {
    nomes: { base: "Base", a: nomeA, b: nomeB },
    amostra,
    indicadores: { base: indBase, a: indA, b: indB },
    linhas,
    deltas: {
      a: avalA.delta,
      b: avalB.delta,
    },
    mudancas: { a: listaA, b: listaB },
  };
}

/**
 * Cascata de contribuição: Base → +mudança₁ → +mudança₂ → … → cenário.
 * Cada passo reavalia com `avaliar` acumulando a lista (F2 sequencial).
 *
 * @param {{
 *   grafo: import("./grafo.js").Grafo,
 *   paresOD?: Array,
 *   demanda?: object,
 *   mudancas?: object[],
 *   metrica?: string,
 * }} args
 */
export function cascataContribuicao({
  grafo,
  paresOD,
  demanda,
  mudancas = [],
  metrica = "tempoMedioViagem",
} = {}) {
  if (!grafo) throw new TypeError("cascataContribuicao: `grafo` é obrigatório");
  if (!CHAVES.has(metrica)) {
    throw new RangeError(`cascataContribuicao: métrica desconhecida (${metrica})`);
  }

  const lista = Array.isArray(mudancas) ? mudancas : [];

  // Resolve pares uma vez (mesma demanda em todos os passos).
  const r0 = avaliar({ grafo, paresOD, demanda, mudancas: [] });
  const pares = paresOD ?? undefined;
  const amostra = r0.amostra;
  const ind0 = extrairIndicadores(r0.base, amostra);
  let anterior = ind0[metrica];

  const passos = [
    {
      indice: 0,
      rotulo: "Base",
      mudanca: null,
      valor: anterior,
      contribuicao: 0,
    },
  ];

  for (let i = 0; i < lista.length; i++) {
    const parcial = lista.slice(0, i + 1);
    const r = avaliar({ grafo, paresOD: pares, demanda, mudancas: parcial });
    const ind = extrairIndicadores(r.cenario, r.amostra);
    const valor = ind[metrica];
    const contribuicao =
      valor != null && anterior != null && Number.isFinite(valor) && Number.isFinite(anterior)
        ? valor - anterior
        : null;
    passos.push({
      indice: i + 1,
      rotulo: rotuloMudanca(lista[i], i),
      mudanca: lista[i],
      valor,
      contribuicao,
    });
    anterior = valor;
  }

  const ultimo = passos[passos.length - 1]?.valor ?? null;
  const primeiro = passos[0]?.valor ?? null;
  const total =
    ultimo != null && primeiro != null && Number.isFinite(ultimo) && Number.isFinite(primeiro)
      ? ultimo - primeiro
      : null;

  return { metrica, passos, total, amostra };
}

/**
 * Monta o objeto de relatório (JSON / HTML).
 */
export function montarResumo({
  comparacao,
  cascataA = null,
  cascataB = null,
  meta = {},
} = {}) {
  if (!comparacao) throw new TypeError("montarResumo: `comparacao` é obrigatório");
  return {
    tipo: "fastflow.comparador.resumo",
    versao: 1,
    geradoEm: new Date().toISOString(),
    titulo: meta.titulo ?? "Comparação de cenários — FastFlow",
    local: meta.local ?? null,
    semente: meta.semente ?? null,
    nomes: comparacao.nomes,
    amostra: comparacao.amostra,
    tabela: comparacao.linhas.map((l) => ({
      indicador: l.rotulo,
      chave: l.chave,
      base: l.base,
      a: l.a,
      b: l.b,
      deltaA: l.deltaA,
      deltaB: l.deltaB,
      melhores: l.melhores,
    })),
    mudancas: {
      a: serializarLista(comparacao.mudancas?.a ?? []),
      b: serializarLista(comparacao.mudancas?.b ?? []),
    },
    cascataA,
    cascataB,
    observacoes: [
      "Comparação analítica F2: sem BPR dinâmico nesta estimativa (F4 só na simulação ao vivo).",
      "Comparação analítica com demanda fixa (F1) e avaliador F2.",
      ...(meta.observacoes ?? []),
    ],
  };
}

export function resumoParaJson(resumo) {
  return JSON.stringify(resumo, null, 2);
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtCel(v) {
  if (v == null || Number.isNaN(v)) return "—";
  if (!Number.isFinite(v)) return "∞";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/**
 * Δ fluxo “alvo − referência” a partir de dois deltas Base→cenário
 * (fluxo_B − fluxo_A = deltaB − deltaA).
 *
 * @param {{ variacaoFluxoPorTrecho?: Record<string, number>, variacaoFluxoPorAresta?: Record<string, number> } | null} deltaDe
 * @param {{ variacaoFluxoPorTrecho?: Record<string, number>, variacaoFluxoPorAresta?: Record<string, number> } | null} deltaPara
 */
export function diferencaVariacaoFluxo(deltaDe, deltaPara) {
  function subtrair(mapaDe, mapaPara) {
    const out = {};
    const chaves = new Set([
      ...Object.keys(mapaDe ?? {}),
      ...Object.keys(mapaPara ?? {}),
    ]);
    for (const k of chaves) {
      const d = (mapaPara?.[k] ?? 0) - (mapaDe?.[k] ?? 0);
      if (d) out[k] = d;
    }
    return out;
  }
  return {
    variacaoFluxoPorTrecho: subtrair(
      deltaDe?.variacaoFluxoPorTrecho,
      deltaPara?.variacaoFluxoPorTrecho
    ),
    variacaoFluxoPorAresta: subtrair(
      deltaDe?.variacaoFluxoPorAresta,
      deltaPara?.variacaoFluxoPorAresta
    ),
  };
}

/**
 * Geometria viva dos trechos/arestas do grafo para `camadaVariacaoFluxo`
 * (sem ControleSentido — só leitura da malha base).
 * @param {import("./grafo.js").Grafo} grafo
 */
export function trechosParaVariacao(grafo) {
  if (!grafo?.trechos) return [];
  return [...grafo.trechos.values()].map((t) => ({
    id: t.id,
    pontos: t.meta?.pontos,
    direcoesAtivas: (t.arestas ?? [])
      .map((id) => {
        const a = grafo.arestas.get(id);
        if (!a?.geometria?.pontos) return null;
        return { id, de: a.de, para: a.para, geometria: a.geometria };
      })
      .filter(Boolean),
  }));
}

/**
 * Relatório HTML autocontido. Com `autoPrint: true` abre o diálogo Imprimir
 * (destino “Salvar como PDF” no navegador) — sem dependência de lib PDF.
 *
 * @param {object} resumo
 * @param {{ autoPrint?: boolean }} [opcoes]
 */
export function resumoParaHtml(resumo, opcoes = {}) {
  const autoPrint = Boolean(opcoes.autoPrint);
  const nomes = resumo.nomes ?? { base: "Base", a: "A", b: "B" };
  const linhas = (resumo.tabela ?? [])
    .map((l) => {
      const marca = (col) =>
        (l.melhores ?? []).includes(col) ? ' class="melhor"' : "";
      return `<tr>
        <th scope="row">${escHtml(l.indicador)}</th>
        <td${marca("base")}>${escHtml(fmtCel(l.base))}</td>
        <td${marca("a")}>${escHtml(fmtCel(l.a))}</td>
        <td${marca("b")}>${escHtml(fmtCel(l.b))}</td>
        <td>${escHtml(fmtCel(l.deltaA))}</td>
        <td>${escHtml(fmtCel(l.deltaB))}</td>
      </tr>`;
    })
    .join("\n");

  function listaMudancasHtml(lista, titulo) {
    if (!lista?.length) return `<h2>${escHtml(titulo)}</h2><p class="meta">Nenhuma mudança.</p>`;
    const itens = lista
      .map((m) => {
        const tipo = m?.tipo ?? "?";
        const alvo = m?.trechoId ?? m?.arestaId ?? m?.id ?? "";
        const extra = m?.nome ? ` · ${m.nome}` : "";
        return `<li><code>${escHtml(tipo)}</code>${alvo ? ` · ${escHtml(alvo)}` : ""}${escHtml(extra)}</li>`;
      })
      .join("\n");
    return `<h2>${escHtml(titulo)}</h2><ul class="mudancas">${itens}</ul>`;
  }

  function cascataHtml(cascata, titulo) {
    if (!cascata?.passos?.length) return "";
    const rows = cascata.passos
      .map(
        (p) => `<tr>
        <td>${escHtml(p.rotulo)}</td>
        <td>${escHtml(fmtCel(p.valor))}</td>
        <td>${escHtml(fmtCel(p.contribuicao))}</td>
      </tr>`
      )
      .join("\n");
    return `<section class="bloco">
      <h2>${escHtml(titulo)}</h2>
      <p>Métrica: <code>${escHtml(cascata.metrica)}</code> · total Δ ${escHtml(fmtCel(cascata.total))}</p>
      <table>
        <thead><tr><th>Passo</th><th>Valor</th><th>Contribuição</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }

  const scriptPrint = autoPrint
    ? `<script>
document.documentElement.classList.add("auto-print");
window.addEventListener("load", function () {
  setTimeout(function () { window.focus(); window.print(); }, 120);
});
</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(resumo.titulo)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: "Segoe UI", system-ui, sans-serif; margin: 2rem; color: #1f2937; line-height: 1.45; }
  h1 { font-size: 1.45rem; margin: 0 0 0.35rem; color: #0f172a; }
  h2 { font-size: 1.1rem; margin: 1.6rem 0 0.5rem; color: #0f172a; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 0.75rem 0 1.25rem; font-size: 0.92rem; }
  th, td { border: 1px solid #e2e8f0; padding: 0.45rem 0.6rem; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  thead th { background: #f1f5f9; font-weight: 600; }
  td.melhor, th.melhor { background: #dcfce7; font-weight: 600; }
  .meta { color: #64748b; font-size: 0.9rem; }
  ul { color: #475569; margin: 0.4rem 0 1rem; padding-left: 1.2rem; }
  ul.mudancas { font-size: 0.9rem; }
  .bloco { break-inside: avoid; page-break-inside: avoid; }
  .toolbar-print {
    display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0 0 1rem;
  }
  .toolbar-print button {
    font: inherit; padding: 0.45rem 0.85rem; border-radius: 6px;
    border: 1px solid #cbd5e1; background: #0f766e; color: #fff; cursor: pointer;
  }
  .toolbar-print button.sec { background: #f8fafc; color: #0f172a; }
  html.auto-print .toolbar-print { display: none; }
  @page { margin: 12mm 14mm; size: A4; }
  @media print {
    body { margin: 0; color: #000; }
    .toolbar-print { display: none !important; }
    thead { display: table-header-group; }
    tr, .bloco { break-inside: avoid; page-break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
  <div class="toolbar-print" role="region" aria-label="Ações do relatório">
    <button type="button" onclick="window.print()">Gerar PDF / Imprimir</button>
    <button type="button" class="sec" onclick="window.close()">Fechar</button>
  </div>
  <h1>${escHtml(resumo.titulo)}</h1>
  <p class="meta">Gerado em ${escHtml(resumo.geradoEm)}
    ${resumo.local ? ` · Local: ${escHtml(typeof resumo.local === "string" ? resumo.local : resumo.local.nome ?? resumo.local.id)}` : ""}
    ${resumo.amostra ? ` · Amostra: ${escHtml(resumo.amostra.tamanho)} viagens` : ""}
  </p>
  <section class="bloco">
  <table>
    <thead>
      <tr>
        <th>Indicador</th>
        <th>${escHtml(nomes.base)}</th>
        <th>${escHtml(nomes.a)}</th>
        <th>${escHtml(nomes.b)}</th>
        <th>Δ A</th>
        <th>Δ B</th>
      </tr>
    </thead>
    <tbody>
${linhas}
    </tbody>
  </table>
  </section>
  ${cascataHtml(resumo.cascataA, `Cascata — ${nomes.a}`)}
  ${cascataHtml(resumo.cascataB, `Cascata — ${nomes.b}`)}
  <section class="bloco">
  ${listaMudancasHtml(resumo.mudancas?.a, `Mudanças — ${nomes.a}`)}
  ${listaMudancasHtml(resumo.mudancas?.b, `Mudanças — ${nomes.b}`)}
  </section>
  <h2>Observações</h2>
  <ul>${(resumo.observacoes ?? []).map((o) => `<li>${escHtml(o)}</li>`).join("")}</ul>
  <p class="meta">FastFlow · comparador de cenários · Imprimir → “Salvar como PDF”.</p>
  ${scriptPrint}
</body>
</html>`;
}

/** Normaliza entrada JSON (texto ou objeto) em lista F3. */
export function carregarListaMudancas(entrada) {
  if (entrada == null || entrada === "") return [];
  if (Array.isArray(entrada)) return desserializarLista(entrada);
  if (typeof entrada === "object" && Array.isArray(entrada.mudancas)) {
    return desserializarLista(entrada.mudancas);
  }
  if (typeof entrada === "string") {
    const texto = entrada.trim();
    if (!texto) return [];
    const parsed = JSON.parse(texto);
    if (Array.isArray(parsed)) return desserializarLista(parsed);
    if (parsed && Array.isArray(parsed.mudancas)) return desserializarLista(parsed.mudancas);
    throw new TypeError("JSON deve ser uma lista de mudanças ou { mudancas: [...] }");
  }
  throw new TypeError("Entrada de mudanças inválida");
}
