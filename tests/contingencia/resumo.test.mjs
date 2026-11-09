import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amostrarPontos,
  mapaRotasSvg,
  montarResumoContingencia,
  resumoContingenciaParaHtml,
  resumoContingenciaParaJson,
} from "../../js/contingenciaResumo.js";

const ROTAS_EXEMPLO = [
  {
    id: "primary",
    nome: "Rota principal",
    tag: "Interrompida",
    duracaoS: 600,
    distanciaM: 3000,
    robustez: "frágil",
    descricao: "Passa pelo bloqueio",
    pontos: [
      [-23.36, -46.88],
      [-23.355, -46.875],
      [-23.35, -46.87],
    ],
  },
  {
    id: "alternative",
    nome: "Desvio sugerido",
    tag: "Recomendada",
    selecionada: true,
    duracaoS: 840,
    distanciaM: 4200,
    robustez: "robusta",
    composicao: {
      totalAtrasoS: 240,
      percentuais: { extraDistancia: 50, dispositivos: 20, congestionamento: 30 },
    },
    descricao: "Evita o bloqueio",
    pontos: [
      [-23.36, -46.88],
      [-23.358, -46.885],
      [-23.35, -46.87],
    ],
  },
  {
    id: "alternative-two",
    nome: "Alternativa 2",
    tag: "Mais distante",
    duracaoS: 960,
    distanciaM: 5100,
    robustez: "robusta",
    pontos: [
      [-23.36, -46.88],
      [-23.365, -46.87],
      [-23.35, -46.87],
    ],
  },
];

test("montarResumoContingencia: tipo, Δ vs principal e atraso formatado", () => {
  const resumo = montarResumoContingencia({
    origem: "Centro",
    destino: "Jordanésia",
    modo: "demo",
    bloqueio: [-23.356, -46.875],
    rotas: ROTAS_EXEMPLO,
  });
  assert.equal(resumo.tipo, "fastflow.contingencia.resumo");
  assert.equal(resumo.versao, 1);
  assert.ok(resumo.geradoEm);
  const desvio = resumo.rotas.find((r) => r.id === "alternative");
  assert.equal(desvio.atrasoVsPrincipalS, 240);
  assert.equal(desvio.atrasoTexto, "+4 min");
  assert.equal(desvio.selecionada, true);
});

test("amostrarPontos: reduz polilinha densa preservando extremos", () => {
  const pontos = Array.from({ length: 200 }, (_, i) => [i, i]);
  const amostra = amostrarPontos(pontos, 20);
  assert.equal(amostra.length, 20);
  assert.deepEqual(amostra[0], pontos[0]);
  assert.deepEqual(amostra[amostra.length - 1], pontos[pontos.length - 1]);
});

test("mapaRotasSvg: gera SVG com polylines e bloqueio", () => {
  const resumo = montarResumoContingencia({
    rotas: ROTAS_EXEMPLO,
    bloqueio: [-23.356, -46.875],
  });
  const svg = mapaRotasSvg(resumo);
  assert.ok(svg.includes("<svg"));
  assert.ok(svg.includes("<polyline"));
  assert.ok(svg.includes("Bloqueio"));
  assert.ok(svg.includes("#17a88b"));
});

test("resumoContingenciaParaHtml: print-CSS e autoPrint como no comparador", () => {
  const resumo = montarResumoContingencia({
    titulo: "Teste contingência",
    origem: "A",
    destino: "B",
    local: { id: "centro", nome: "Centro" },
    ocorrencia: { titulo: "Bloqueio", local: "Av. teste" },
    rotas: ROTAS_EXEMPLO,
    mudancas: [{ tipo: "bloquear", trechoId: "T1" }],
  });
  const json = resumoContingenciaParaJson(resumo);
  assert.ok(json.includes("fastflow.contingencia.resumo"));

  const html = resumoContingenciaParaHtml(resumo);
  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(html.includes("lang=\"pt-BR\""));
  assert.ok(html.includes("Comparativo numérico"));
  assert.ok(html.includes("Mapa — rota principal × desvios"));
  assert.ok(html.includes("@page"));
  assert.ok(html.includes("@media print"));
  assert.ok(html.includes("Gerar PDF / Imprimir"));
  assert.ok(html.includes("Desvio sugerido"));
  assert.ok(html.includes("+4 min"));
  assert.ok(html.includes("bloquear"));
  assert.ok(html.includes("<svg"));

  const htmlPdf = resumoContingenciaParaHtml(resumo, { autoPrint: true });
  assert.ok(htmlPdf.includes("window.print"));
  assert.ok(htmlPdf.includes("auto-print"));
});
