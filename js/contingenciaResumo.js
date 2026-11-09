// Resumo exportável da Contingência: rota principal × desvios (HTML imprimível → PDF).
// Mesmo padrão do comparador: HTML autocontido + CSS @media print + diálogo Imprimir.
import {
  formatarAtraso,
  formatarDistancia,
  formatarDuracao,
  formatarRobustez,
} from "./contingenciaMetricas.js";

const CORES_ROTA = {
  primary: "#4778e8",
  alternative: "#17a88b",
  "alternative-two": "#a56add",
};

const NOMES_ROTA = {
  primary: "Rota principal",
  alternative: "Desvio sugerido",
  "alternative-two": "Alternativa 2",
};

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Monta o objeto de resumo a partir do snapshot da tela Contingência.
 * @param {object} entrada
 */
export function montarResumoContingencia(entrada = {}) {
  const rotasEntrada = Array.isArray(entrada.rotas) ? entrada.rotas : [];
  const principal = rotasEntrada.find((r) => r.id === "primary") ?? rotasEntrada[0];
  const duracaoPrincipalS = principal?.duracaoS;

  const rotas = rotasEntrada.map((r) => {
    const id = r.id ?? "rota";
    const atrasoVsPrincipalS =
      typeof r.duracaoS === "number" &&
      typeof duracaoPrincipalS === "number" &&
      Number.isFinite(r.duracaoS) &&
      Number.isFinite(duracaoPrincipalS)
        ? r.duracaoS - duracaoPrincipalS
        : null;
    return {
      id,
      nome: r.nome ?? NOMES_ROTA[id] ?? id,
      tag: r.tag ?? "",
      selecionada: Boolean(r.selecionada),
      duracaoS: r.duracaoS ?? null,
      distanciaM: r.distanciaM ?? null,
      atrasoVsPrincipalS,
      atrasoTexto:
        r.atrasoTexto ??
        (id === "primary" ? "" : formatarAtraso(r.duracaoS, duracaoPrincipalS)),
      robustez: r.robustez ?? null,
      composicao: r.composicao ?? null,
      descricao: r.descricao ?? "",
      pontos: Array.isArray(r.pontos) ? r.pontos : [],
      disponivel: r.disponivel !== false && Array.isArray(r.pontos) && r.pontos.length > 0,
    };
  });

  return {
    tipo: "fastflow.contingencia.resumo",
    versao: 1,
    geradoEm: new Date().toISOString(),
    titulo: entrada.titulo ?? "Resumo de contingência — FastFlow",
    origem: entrada.origem ?? null,
    destino: entrada.destino ?? null,
    local: entrada.local ?? null,
    modo: entrada.modo ?? "demo",
    ocorrencia: entrada.ocorrencia ?? null,
    bloqueio: entrada.bloqueio ?? null,
    rotaSelecionada: entrada.rotaSelecionada ?? null,
    mudancas: entrada.mudancas ?? [],
    nMudancas: Array.isArray(entrada.mudancas)
      ? entrada.mudancas.length
      : Number(entrada.nMudancas) || 0,
    rotas,
    observacoes: [
      "Comparativo ilustrativo para a equipe: tempos e distâncias da tela Contingência.",
      entrada.modo === "planejado"
        ? "Rotas calculadas na malha local com o cenário F5 ativo."
        : "Cenário demonstrativo (OSRM / catálogo); robustez usa a malha quando disponível.",
      "Imprimir → «Salvar como PDF» no navegador — sem biblioteca PDF embutida.",
      ...(entrada.observacoes ?? []),
    ],
  };
}

export function resumoContingenciaParaJson(resumo) {
  return JSON.stringify(resumo, null, 2);
}

/** Reduz polilinha densa para o SVG do relatório. */
export function amostrarPontos(pontos, maxPontos = 80) {
  if (!Array.isArray(pontos) || pontos.length <= maxPontos) return pontos ?? [];
  const passo = (pontos.length - 1) / (maxPontos - 1);
  const out = [];
  for (let i = 0; i < maxPontos; i++) {
    out.push(pontos[Math.round(i * passo)]);
  }
  return out;
}

/**
 * SVG esquemático das rotas (lat/lon → plano equiretangular).
 * @param {object} resumo
 * @param {{ largura?: number, altura?: number }} [opcoes]
 */
export function mapaRotasSvg(resumo, opcoes = {}) {
  const largura = opcoes.largura ?? 640;
  const altura = opcoes.altura ?? 360;
  const pad = 28;
  const rotas = (resumo.rotas ?? []).filter((r) => r.disponivel !== false && r.pontos?.length);
  const todos = [];
  for (const r of rotas) {
    for (const p of amostrarPontos(r.pontos)) {
      if (Array.isArray(p) && p.length >= 2) todos.push(p);
    }
  }
  if (resumo.bloqueio && Array.isArray(resumo.bloqueio)) todos.push(resumo.bloqueio);
  if (todos.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="100%" role="img" aria-label="Sem geometria de rotas">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <text x="50%" y="50%" text-anchor="middle" fill="#64748b" font-family="Segoe UI, system-ui, sans-serif" font-size="14">Sem traçado para o mapa</text>
</svg>`;
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [lat, lon] of todos) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  const midLat = (minLat + maxLat) / 2;
  const cos = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  // Evita colapso se todos os pontos coincidem.
  if (maxLat - minLat < 1e-6) {
    minLat -= 0.002;
    maxLat += 0.002;
  }
  if (maxLon - minLon < 1e-6) {
    minLon -= 0.002;
    maxLon += 0.002;
  }

  const spanX = (maxLon - minLon) * cos;
  const spanY = maxLat - minLat;
  const utilW = largura - pad * 2;
  const utilH = altura - pad * 2;
  const escala = Math.min(utilW / spanX, utilH / spanY);

  function proj([lat, lon]) {
    const x = pad + ((lon - minLon) * cos - spanX / 2) * escala + utilW / 2;
    const y = pad + ((maxLat - lat) - spanY / 2) * escala + utilH / 2;
    return [x, y];
  }

  function polyline(pontos) {
    return amostrarPontos(pontos)
      .map((p) => {
        const [x, y] = proj(p);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const paths = rotas
    .map((r) => {
      const cor = CORES_ROTA[r.id] ?? "#64748b";
      const peso = r.selecionada ? 5.5 : 3.5;
      const op = r.id === "primary" ? 0.85 : 1;
      return `<polyline fill="none" stroke="${cor}" stroke-width="${peso}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}" points="${polyline(r.pontos)}"/>`;
    })
    .join("\n  ");

  let bloqueioSvg = "";
  if (resumo.bloqueio) {
    const [bx, by] = proj(resumo.bloqueio);
    bloqueioSvg = `<g>
    <circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="9" fill="#dc2626" opacity="0.2"/>
    <circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="5" fill="#dc2626"/>
    <text x="${bx.toFixed(1)}" y="${(by - 12).toFixed(1)}" text-anchor="middle" fill="#991b1b" font-size="11" font-family="Segoe UI, system-ui, sans-serif">Bloqueio</text>
  </g>`;
  }

  let extremos = "";
  const primeira = rotas[0]?.pontos;
  if (primeira?.length) {
    const [ox, oy] = proj(primeira[0]);
    const [dx, dy] = proj(primeira[primeira.length - 1]);
    extremos = `<circle cx="${ox.toFixed(1)}" cy="${oy.toFixed(1)}" r="5" fill="#4778e8" stroke="#fff" stroke-width="2"/>
  <circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="5" fill="#172338" stroke="#fff" stroke-width="2"/>`;
  }

  const legenda = rotas
    .map((r, i) => {
      const cor = CORES_ROTA[r.id] ?? "#64748b";
      const x = 12 + i * 160;
      return `<g transform="translate(${x}, ${altura - 18})">
      <line x1="0" y1="0" x2="22" y2="0" stroke="${cor}" stroke-width="4" stroke-linecap="round"/>
      <text x="28" y="4" font-size="11" fill="#334155" font-family="Segoe UI, system-ui, sans-serif">${escHtml(r.nome)}</text>
    </g>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="100%" role="img" aria-label="Mapa esquemático das rotas de contingência">
  <rect width="100%" height="100%" fill="#f8fafc" stroke="#e2e8f0"/>
  ${paths}
  ${extremos}
  ${bloqueioSvg}
  ${legenda}
</svg>`;
}

function composicaoHtml(composicao) {
  if (!composicao?.percentuais || !(composicao.totalAtrasoS > 0)) return "—";
  const p = composicao.percentuais;
  return `Dist. ${Math.round(p.extraDistancia)}% · Disp. ${Math.round(p.dispositivos)}% · Cong. ${Math.round(p.congestionamento)}%`;
}

function listaMudancasHtml(mudancas) {
  if (!Array.isArray(mudancas) || mudancas.length === 0) {
    return `<p class="meta">Nenhuma mudança do cenário F5 aplicada.</p>`;
  }
  const itens = mudancas
    .map((m) => {
      const tipo = m?.tipo ?? "?";
      const alvo = m?.trechoId ?? m?.arestaId ?? m?.id ?? "";
      const extra = m?.nome ? ` · ${m.nome}` : "";
      return `<li><code>${escHtml(tipo)}</code>${alvo ? ` · ${escHtml(alvo)}` : ""}${escHtml(extra)}</li>`;
    })
    .join("\n");
  return `<ul class="mudancas">${itens}</ul>`;
}

/**
 * Relatório HTML autocontido. Com `autoPrint: true` abre o diálogo Imprimir
 * (destino “Salvar como PDF”) — sem lib PDF.
 *
 * @param {object} resumo
 * @param {{ autoPrint?: boolean }} [opcoes]
 */
export function resumoContingenciaParaHtml(resumo, opcoes = {}) {
  const autoPrint = Boolean(opcoes.autoPrint);
  const localNome =
    typeof resumo.local === "string"
      ? resumo.local
      : resumo.local?.nome ?? resumo.local?.id ?? null;
  const trajeto =
    resumo.origem && resumo.destino
      ? `${resumo.origem} → ${resumo.destino}`
      : "Trajeto não informado";

  const linhas = (resumo.rotas ?? [])
    .map((r) => {
      const marca = r.selecionada ? ' class="selecionada"' : "";
      const tempo = formatarDuracao(r.duracaoS);
      const dist = formatarDistancia(r.distanciaM);
      const atraso =
        r.id === "primary" ? "—" : r.atrasoTexto && r.atrasoTexto.length ? r.atrasoTexto : "—";
      const robustez = formatarRobustez(r.robustez) || "—";
      return `<tr${marca}>
        <th scope="row">${escHtml(r.nome)}${r.selecionada ? " · selecionada" : ""}</th>
        <td>${escHtml(r.tag || "—")}</td>
        <td>${escHtml(tempo)}</td>
        <td>${escHtml(dist)}</td>
        <td>${escHtml(atraso)}</td>
        <td>${escHtml(robustez)}</td>
        <td class="esq">${escHtml(composicaoHtml(r.composicao))}</td>
      </tr>`;
    })
    .join("\n");

  const scriptPrint = autoPrint
    ? `<script>
document.documentElement.classList.add("auto-print");
window.addEventListener("load", function () {
  setTimeout(function () { window.focus(); window.print(); }, 120);
});
</script>`
    : "";

  const ocorrenciaTitulo = resumo.ocorrencia?.titulo ?? resumo.ocorrencia?.nome ?? null;
  const ocorrenciaLocal = resumo.ocorrencia?.local ?? null;

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
  th:first-child, td:first-child, td.esq { text-align: left; }
  thead th { background: #f1f5f9; font-weight: 600; }
  tr.selecionada td, tr.selecionada th { background: #ecfdf5; font-weight: 600; }
  .meta { color: #64748b; font-size: 0.9rem; }
  ul { color: #475569; margin: 0.4rem 0 1rem; padding-left: 1.2rem; }
  ul.mudancas { font-size: 0.9rem; }
  .bloco { break-inside: avoid; page-break-inside: avoid; }
  .mapa-wrap { margin: 0.75rem 0 1.25rem; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #f8fafc; }
  .mapa-wrap svg { display: block; }
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
    ${localNome ? ` · Local: ${escHtml(localNome)}` : ""}
    · Modo: ${escHtml(resumo.modo === "planejado" ? "malha / F5" : "demonstrativo")}
    ${resumo.nMudancas ? ` · ${escHtml(resumo.nMudancas)} mudança(s) F5` : ""}
  </p>
  <p><strong>${escHtml(trajeto)}</strong></p>
  ${
    ocorrenciaTitulo
      ? `<p class="meta">Ocorrência: ${escHtml(ocorrenciaTitulo)}${
          ocorrenciaLocal ? ` · ${escHtml(ocorrenciaLocal)}` : ""
        }</p>`
      : ""
  }

  <section class="bloco">
    <h2>Mapa — rota principal × desvios</h2>
    <div class="mapa-wrap">${mapaRotasSvg(resumo)}</div>
  </section>

  <section class="bloco">
    <h2>Comparativo numérico</h2>
    <table>
      <thead>
        <tr>
          <th>Rota</th>
          <th>Situação</th>
          <th>Tempo</th>
          <th>Distância</th>
          <th>Δ vs principal</th>
          <th>Robustez</th>
          <th>Composição do atraso</th>
        </tr>
      </thead>
      <tbody>
${linhas}
      </tbody>
    </table>
  </section>

  <section class="bloco">
    <h2>Mudanças do cenário</h2>
    ${listaMudancasHtml(resumo.mudancas)}
  </section>

  <h2>Observações</h2>
  <ul>${(resumo.observacoes ?? []).map((o) => `<li>${escHtml(o)}</li>`).join("")}</ul>
  <p class="meta">FastFlow · contingência · Imprimir → “Salvar como PDF”.</p>
  ${scriptPrint}
</body>
</html>`;
}

/**
 * Abre o HTML do resumo e dispara Imprimir (destino PDF do navegador).
 * Sem lib PDF pesada — só CSS de impressão + diálogo nativo.
 * @param {string} html
 * @param {typeof window} [win]
 */
export function abrirResumoContingenciaParaPdf(html, win = globalThis) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  // Sem "noopener" no 3º arg: senão open() devolve null e o autoPrint do HTML não roda.
  const janela = win.open?.(url, "_blank");
  if (!janela) {
    URL.revokeObjectURL(url);
    return { ok: false, motivo: "Permita pop-ups para abrir o relatório e gerar o PDF." };
  }
  try {
    janela.opener = null;
  } catch {
    /* ignore */
  }
  win.setTimeout?.(() => URL.revokeObjectURL(url), 60_000);
  return { ok: true };
}
