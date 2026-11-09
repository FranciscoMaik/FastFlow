import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatarDistancia,
  formatarDuracao,
  formatarAtraso,
} from "../../js/contingenciaMetricas.js";

const rotas = JSON.parse(
  readFileSync(new URL("../../data/rotas-contingencia.json", import.meta.url), "utf8")
);

test("formatarDistancia usa km com vírgula e não inventa valor", () => {
  assert.equal(formatarDistancia(4200), "4,2 km");
  assert.equal(formatarDistancia(0), "0,0 km");
  assert.equal(formatarDistancia(undefined), "—");
  assert.equal(formatarDistancia(null), "—");
  assert.equal(formatarDistancia(Number.NaN), "—");
});

test("formatarDuracao arredonda segundos para minutos", () => {
  assert.equal(formatarDuracao(720), "12 min");
  assert.equal(formatarDuracao(90), "2 min");
  assert.equal(formatarDuracao(undefined), "—");
});

test("formatarAtraso compara com a duração da rota principal", () => {
  assert.equal(formatarAtraso(960, 720), "+4 min");
  assert.equal(formatarAtraso(720, 720), "");
  assert.equal(formatarAtraso(600, 720), "");
  assert.equal(formatarAtraso(960, undefined), "");
});

test("todas as rotas do catálogo têm distanciaM e duracaoS do OSRM", () => {
  const faltando = [];
  for (const [id, cenario] of Object.entries(rotas)) {
    for (const [tipo, rota] of Object.entries(cenario.rotas || {})) {
      if (typeof rota.distanciaM !== "number" || typeof rota.duracaoS !== "number") {
        faltando.push(`${id}/${tipo}`);
      }
    }
  }
  assert.deepEqual(faltando, []);
});
