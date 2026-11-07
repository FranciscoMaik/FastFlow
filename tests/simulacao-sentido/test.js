// Testes da lógica (sem navegador): node tests/simulacao-sentido/test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { RoadGraph } = require('../../js/simulacao-sentido/graph.js');
const { buildDemoNetwork, mulberry32 } = require('../../js/simulacao-sentido/network.js');
const { TrafficEngine } = require('../../js/simulacao-sentido/engine.js');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

const makeGraph = () => buildDemoNetwork(new RoadGraph());

test('malha inicial é fortemente conectada', () => {
  assert.ok(makeGraph().isStronglyConnected());
});

test('reverseRoad inverte from/to, incrementa versão e notifica', () => {
  const g = makeGraph();
  const id = 'h2_3';
  const before = { from: g.roadFrom(id), to: g.roadTo(id) };
  let ev = null;
  g.subscribe((e) => { ev = e; });
  const v0 = g.version;
  g.reverseRoad(id);
  assert.strictEqual(g.roadFrom(id), before.to);
  assert.strictEqual(g.roadTo(id), before.from);
  assert.strictEqual(g.version, v0 + 1);
  assert.strictEqual(ev.type, 'reverse');
  assert.deepStrictEqual(ev.previous, before);
  g.reverseRoad(id); // duas inversões = estado original
  assert.strictEqual(g.roadFrom(id), before.from);
});

test('outRoads e canEnter respeitam o sentido após inverter', () => {
  const g = makeGraph();
  const id = 'v1_4';
  const from0 = g.roadFrom(id);
  assert.ok(g.outRoads(from0).includes(id));
  assert.ok(g.canEnter(id, from0));
  g.reverseRoad(id);
  assert.ok(!g.outRoads(from0).includes(id));
  assert.ok(!g.canEnter(id, from0));
  assert.ok(g.outRoads(g.roadFrom(id)).includes(id));
});

test('menores caminhos nunca usam via contra o sentido (após várias inversões)', () => {
  const g = makeGraph();
  const rnd = mulberry32(3);
  const ids = [...g.roads.keys()];
  for (let i = 0; i < 12; i++) g.reverseRoad(ids[Math.floor(rnd() * ids.length)]);
  const nodes = [...g.nodes.keys()];
  for (const a of nodes) {
    for (const b of nodes) {
      const p = g.shortestPath(a, b);
      if (!p) continue;
      let node = a;
      for (const rid of p.roads) {
        assert.ok(g.canEnter(rid, node), `caminho ${a}->${b} usa ${rid} contra o sentido`);
        node = g.roadTo(rid);
      }
      assert.strictEqual(node, b);
    }
  }
});

test('nearestRoad encontra a via sob o ponto', () => {
  const g = makeGraph();
  const r = g.roads.get('h3_2');
  const a = g.nodes.get(r.a), b = g.nodes.get(r.b);
  assert.strictEqual(g.nearestRoad((a.x + b.x) / 2, (a.y + b.y) / 2 + 1, 6), 'h3_2');
  assert.strictEqual(g.nearestRoad(-500, -500, 6), null);
});

function invariants(engine, label) {
  const g = engine.graph;
  assert.ok(engine.vehicles.length <= engine.opts.maxVehicles, `${label}: excesso de veículos`);
  for (const v of engine.vehicles) {
    const road = g.roads.get(v.roadId);
    assert.ok(Number.isFinite(v.pos) && v.pos >= -1e-6 && v.pos <= road.length + 1e-6, `${label}: pos inválida`);
    // ninguém anda na contramão, exceto quem está concluindo a travessia (evacuating)
    if (g.roadFrom(road) !== v.from) assert.ok(v.evacuating, `${label}: veículo ${v.id} na contramão sem evacuating`);
    else assert.ok(!v.evacuating, `${label}: evacuating em veículo legítimo`);
    assert.ok(engine._routeValid(v), `${label}: rota inválida do veículo ${v.id}`);
  }
}

for (const policy of ['complete', 'uturn']) {
  test(`simulação com inversões contínuas mantém invariantes (política: ${policy})`, () => {
    const g = makeGraph();
    const rng = mulberry32(11);
    const engine = new TrafficEngine(g, { maxVehicles: 60, policy, rng });
    const roadIds = [...g.roads.keys()];
    let steps = 0;
    for (let t = 0; t < 240; t += 0.05) {
      engine.step(0.05);
      steps++;
      if (steps % 40 === 0) {
        // inverte preferencialmente vias que têm veículos, para estressar o caso
        const busy = roadIds.filter((id) => engine.countOnRoad(id) > 0);
        const pool = busy.length ? busy : roadIds;
        g.reverseRoad(pool[Math.floor(rng() * pool.length)]);
      }
      invariants(engine, `${policy} t=${t.toFixed(2)}`);
    }
    assert.ok(engine.stats.reversals >= 100);
    assert.ok(engine.stats.spawned > 60, 'veículos devem circular e ser repostos');
    // 120 inversões aleatórias fragmentam a malha de propósito; o loop deve seguir vivo e repondo veículos.
    assert.ok(engine.vehicles.length > 0, 'a simulação não pode esvaziar por completo');
  });
}

test("política 'complete': veículos na via concluem a travessia e ninguém entra enquanto isso", () => {
  const g = makeGraph();
  const engine = new TrafficEngine(g, { maxVehicles: 80, policy: 'complete', rng: mulberry32(5) });
  for (let i = 0; i < 400; i++) engine.step(0.05);
  const busy = [...g.roads.keys()].find((id) => engine.countOnRoad(id) > 0);
  assert.ok(busy, 'precisa haver uma via ocupada');
  const occupants = engine.vehicles.filter((v) => v.roadId === busy);
  const ids = new Set(occupants.map((v) => v.id));
  const oldTo = g.roadTo(busy);
  g.reverseRoad(busy);
  occupants.forEach((v) => assert.ok(v.evacuating && v.to === oldTo));
  for (let i = 0; i < 20; i++) {
    engine.step(0.05);
    for (const v of engine.vehicles) if (v.roadId === busy) assert.ok(ids.has(v.id) || v.from === g.roadFrom(busy));
  }
});

test("política 'uturn': veículos na via passam a seguir o novo sentido imediatamente", () => {
  const g = makeGraph();
  const engine = new TrafficEngine(g, { maxVehicles: 80, policy: 'uturn', rng: mulberry32(5) });
  for (let i = 0; i < 400; i++) engine.step(0.05);
  const busy = [...g.roads.keys()].find((id) => engine.countOnRoad(id) > 0);
  g.reverseRoad(busy);
  engine.vehicles.filter((v) => v.roadId === busy).forEach((v) => {
    assert.strictEqual(v.from, g.roadFrom(busy));
    assert.ok(!v.evacuating);
  });
});

test('graph.js e engine.js não dependem de DOM/canvas', () => {
  const dir = path.join(__dirname, '..', '..', 'js', 'simulacao-sentido');
  for (const f of ['graph.js', 'engine.js', 'network.js']) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\b(document|window|canvas|getContext|addEventListener|querySelector|requestAnimationFrame)\b/i.test(src), `${f} referencia DOM`);
  }
});

console.log(`\n${passed} testes passaram.`);
