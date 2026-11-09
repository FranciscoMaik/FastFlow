// ControleSentido: F3 undo no registro + Base×Atual. Rodar:
// node --test tests/adaptador/controleSentidoImpacto.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { ControleSentido } from "../../js/adaptador/controleSentido.js";

function geojsonDuasRuas() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { nome: "Rua A", sentidoUnico: false, velocidade: 40 },
        geometry: {
          type: "LineString",
          coordinates: [
            [-46.88, -23.35],
            [-46.879, -23.35],
          ],
        },
      },
      {
        type: "Feature",
        properties: { nome: "Rua B", sentidoUnico: false, velocidade: 40 },
        geometry: {
          type: "LineString",
          coordinates: [
            [-46.879, -23.35],
            [-46.878, -23.351],
          ],
        },
      },
    ],
  };
}

test("inverterSelecionado usa F3 e registro guarda impacto + undo", () => {
  const c = new ControleSentido(geojsonDuasRuas(), {
    quantidadeVeiculos: 0,
    congestionamento: false,
  });
  const ids = c.trechos().map((t) => t.id);
  assert.ok(ids.length >= 1);
  const trechoId = ids[0];
  const sentidoAntes = c.trecho(trechoId).sentido;

  c.selecionar(trechoId);
  const r = c.inverterSelecionado();
  assert.equal(r.ok, true);
  assert.ok(r.undo);
  assert.notEqual(c.trecho(trechoId).sentido, sentidoAntes);

  const reg = c.registro();
  assert.ok(reg.length >= 1);
  const item = reg[0];
  assert.equal(item.trechoId, trechoId);
  assert.equal(item.podeDesfazer, true);
  assert.ok(item.impacto == null || typeof item.impacto.deltaTempo === "number");

  const undo = c.desfazerRegistro(item.id);
  assert.equal(undo.ok, true);
  assert.equal(c.trecho(trechoId).sentido, sentidoAntes);
  assert.equal(c.registro()[0].desfeito, true);
  assert.equal(c.registro()[0].podeDesfazer, false);
  c.encerrar();
});

test("compararComBase e oportunidades respondem ok", () => {
  const c = new ControleSentido(geojsonDuasRuas(), {
    quantidadeVeiculos: 0,
    congestionamento: false,
  });
  const base = c.compararComBase({ demanda: { n: 20, semente: 1 } });
  assert.equal(base.ok, true);
  assert.ok(base.resumo);

  c.selecionar(c.trechos()[0].id);
  c.inverterSelecionado({ semPrevia: true });

  const depois = c.compararComBase({ demanda: { n: 20, semente: 1 } });
  assert.equal(depois.ok, true);

  const opp = c.oportunidades({
    maxCandidatos: 4,
    maxResultados: 3,
    demanda: { n: 20, semente: 2 },
  });
  assert.equal(opp.ok, true);
  assert.ok(Array.isArray(opp.itens));
  c.encerrar();
});
