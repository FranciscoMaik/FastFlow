import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validarMalha,
  validarCadastro,
  lerLocalId,
  salvarLocalId,
  CHAVE_LOCAL,
} from "../../js/adaptador/locais.js";
import { construirGrafo } from "../../js/adaptador/carregarMalha.js";

const raiz = new URL("../../", import.meta.url);
const lerJson = (caminho) => JSON.parse(readFileSync(new URL(caminho, raiz), "utf8"));

const via = (props = {}, coords = [[-46.87, -23.35], [-46.871, -23.351]]) => ({
  type: "Feature",
  properties: { nome: "Rua A", tipo: "residential", sentidoUnico: 0, velocidade: 30, ...props },
  geometry: { type: "LineString", coordinates: coords },
});
const malha = (...features) => ({ type: "FeatureCollection", features });

test("malha no padrão não tem erros", () => {
  assert.deepEqual(validarMalha(malha(via(), via({ nome: null, sentidoUnico: -1 }))), []);
});

test("malha fora do padrão é recusada com mensagem", () => {
  assert.equal(validarMalha(null).length, 1);
  assert.equal(validarMalha({ type: "Feature" }).length, 1);
  assert.match(validarMalha(malha())[0], /nenhuma via/);
  assert.match(validarMalha(malha(via({}, [[-46.87, -23.35]])))[0], /LineString/);
  assert.match(validarMalha(malha(via({}, [[-23.35, -146.87], [0, 0]])))[0], /coordenada/);
  assert.match(validarMalha(malha(via({ sentidoUnico: 2 })))[0], /sentidoUnico/);
  assert.match(validarMalha(malha(via({ velocidade: "30" })))[0], /velocidade/);
  assert.match(validarMalha(malha(via({ tipo: undefined })))[0], /tipo/);
});

test("lista de erros é limitada para não travar a tela", () => {
  const ruins = Array.from({ length: 50 }, () => via({ velocidade: 0 }));
  assert.equal(validarMalha(malha(...ruins)).length, 5);
});

test("cadastro inválido é recusado", () => {
  const local = { id: "a", nome: "A", arquivo: "a.geojson", limites: [[-23.4, -46.9], [-23.3, -46.8]] };
  assert.deepEqual(validarCadastro({ locais: [local] }), []);
  assert.equal(validarCadastro({ locais: [] }).length, 1);
  assert.match(validarCadastro({ locais: [local, local] })[0], /repetido/);
  assert.match(validarCadastro({ locais: [{ ...local, limites: [[-23.3, -46.8], [-23.4, -46.9]] }] })[0], /limites/);
  assert.match(validarCadastro({ padrao: "x", locais: [local] })[0], /padrão/);
});

test("todas as malhas do cadastro real seguem o padrão e viram um grafo utilizável", () => {
  const cadastro = lerJson("data/locais.json");
  assert.deepEqual(validarCadastro(cadastro), []);
  for (const local of cadastro.locais) {
    const geojson = lerJson(local.arquivo);
    assert.deepEqual(validarMalha(geojson), [], local.nome);
    assert.ok(construirGrafo(geojson).trechos.size > 50, `${local.nome} tem trechos`);
  }
});

function storageMemoria(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (chave) => (dados.has(chave) ? dados.get(chave) : null),
    setItem: (chave, valor) => dados.set(chave, String(valor)),
    removeItem: (chave) => dados.delete(chave),
  };
}

test("persistência do local salva, lê e migra a chave legada", () => {
  const ids = ["centro", "polvilho", "ponunduva"];
  const storage = storageMemoria({ "fastflow.regiao": "polvilho" });
  assert.equal(lerLocalId(ids, "centro", storage), "polvilho");
  assert.equal(storage.getItem(CHAVE_LOCAL), "polvilho");
  assert.equal(storage.getItem("fastflow.regiao"), null);

  salvarLocalId("ponunduva", storage);
  assert.equal(lerLocalId(ids, "centro", storage), "ponunduva");
  assert.equal(lerLocalId(ids, "centro", storageMemoria({ [CHAVE_LOCAL]: "inexistente" })), "centro");
});
