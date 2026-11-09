// Prévia de nova ligação: F3 adicionarLigacao + F2 avaliar (espelha ControleBloqueio.avaliarImpactoLigacao).
import test from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { avaliar, viagensQueUsamTrecho } from "../../js/motor/avaliadorImpacto.js";
import { aplicarEmCopia } from "../../js/motor/mudanca.js";
import { snapParaNoMaisProximo } from "../../js/motor/geometriaSnap.js";
import { distanciaMetros } from "../../js/adaptador/carregarMalha.js";

function criarMalha() {
  const g = new Grafo();
  const no = (id, lat, lon) => g.adicionarNo(id, { lat, lon });
  no("A", 0, 0);
  no("B", 0, 0.001);
  no("C", 0, 0.002);
  no("D", 0.001, 0);
  no("E", 0.001, 0.001);
  no("F", 0.002, 0.001);

  const ligar = (id, a, b, comprimento = 100) => {
    const base = { trechoId: id, comprimento, velocidade: 10, peso: comprimento / 10 };
    g.adicionarAresta({ ...base, id: `${id}>`, de: a, para: b });
    g.adicionarAresta({ ...base, id: `${id}<`, de: b, para: a });
    g.adicionarTrecho({
      id,
      arestas: [`${id}>`, `${id}<`],
      nome: id,
      comprimento,
      extremidades: [a, b],
      pontos: [
        [g.nos.get(a).lat, g.nos.get(a).lon],
        [g.nos.get(b).lat, g.nos.get(b).lon],
      ],
    });
  };

  ligar("AB", "A", "B");
  ligar("BC", "B", "C");
  ligar("AD", "A", "D");
  ligar("DE", "D", "E");
  ligar("EC", "E", "C");
  ligar("EF", "E", "F");
  return g;
}

function avaliarLigacao(grafo, { de, para, comprimento, velocidade = 10, sentido = 0 }, paresOD) {
  const existente = [...grafo.trechos.values()].some((t) => {
    const [a, b] = t.meta?.extremidades ?? [];
    return (a === de && b === para) || (a === para && b === de);
  });
  if (existente) return { ok: false, motivo: "Já existe ligação direta" };

  const mudanca = {
    tipo: "adicionarLigacao",
    id: "AF",
    de,
    para,
    comprimento,
    velocidade,
    sentido,
    nome: "Nova ligação",
  };
  const copia = aplicarEmCopia(grafo, mudanca);
  if (!copia.ok) return { ok: false, motivo: copia.motivo };

  const trechoId = copia.resultados?.[0]?.trechoId ?? "AF";
  const avaliacao = avaliar({
    grafo,
    paresOD,
    grafoCenario: copia.estado.grafo,
    trechoAfetado: { nos: [de, para], id: trechoId },
    topN: 3,
  });

  return {
    ok: true,
    mudanca: { ...mudanca, id: trechoId },
    trechoId,
    avaliacao,
  };
}

test("snapParaNoMaisProximo escolhe o cruzamento mais perto", () => {
  const g = criarMalha();
  const snap = snapParaNoMaisProximo([0.00005, 0.00005], g, 80);
  assert.equal(snap.valido, true);
  assert.equal(snap.noId, "A");

  const longe = snapParaNoMaisProximo([1, 1], g, 40);
  assert.equal(longe.valido, false);
});

test("prévia A–F: reduz tempo e conta viagens na ligação", () => {
  const g = criarMalha();
  const comprimento = distanciaMetros(
    [g.nos.get("A").lat, g.nos.get("A").lon],
    [g.nos.get("F").lat, g.nos.get("F").lon]
  );
  const r = avaliarLigacao(
    g,
    { de: "A", para: "F", comprimento },
    [
      { origem: "A", destino: "F" },
      { origem: "F", destino: "A" },
      { origem: "A", destino: "C" },
    ]
  );

  assert.equal(r.ok, true);
  assert.ok(r.avaliacao.delta.tempoMedioViagem.absoluto < 0, "tempo médio deve cair");
  assert.ok(r.avaliacao.extras.viagensNaLigacao.contagem >= 2);
  assert.ok(Array.isArray(r.avaliacao.extras.trechosAliviados));
  assert.equal(g.trechos.has("AF"), false, "prévia não muta a base");
  assert.ok(r.avaliacao.delta.ganhoAcesso);
});

test("prévia recusa par já ligado", () => {
  const g = criarMalha();
  const r = avaliarLigacao(g, { de: "A", para: "B", comprimento: 50 }, [
    { origem: "A", destino: "C" },
  ]);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /já existe/i);
});

test("viagensQueUsamTrecho conta rotas do cenário", () => {
  const g = criarMalha();
  const copia = aplicarEmCopia(g, {
    tipo: "adicionarLigacao",
    id: "AF",
    de: "A",
    para: "F",
    comprimento: 80,
    velocidade: 10,
  });
  assert.equal(copia.ok, true);
  const aval = avaliar({
    grafo: g,
    paresOD: [
      { origem: "A", destino: "F" },
      { origem: "B", destino: "C" },
    ],
    grafoCenario: copia.estado.grafo,
    trechoAfetado: { id: "AF", nos: ["A", "F"] },
  });
  const usam = viagensQueUsamTrecho(aval.extras.resultadosCenario, copia.estado.grafo, "AF");
  assert.equal(usam.contagem, 1);
  assert.equal(aval.extras.viagensNaLigacao.contagem, 1);
});
