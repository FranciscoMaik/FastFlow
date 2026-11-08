// Testes unitários para lombadas, semáforos, projeção na malha e comportamento de veículos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { Simulacao } from "../../js/motor/simulacao.js";
import { GerenciadorDispositivos, Semaforo, Lombada } from "../../js/motor/dispositivos.js";
import { projetarPontoNaMalha } from "../../js/motor/geometriaSnap.js";

function criarMalhaLinear() {
  const g = new Grafo();
  // Trecho linear de 200m com velocidade 10 m/s (36 km/h)
  // Ponto A: [-23.350, -46.870], B: [-23.350, -46.868]
  const pontos = [[-23.350, -46.870], [-23.350, -46.868]];
  const geoDireta = { pontos, acumulado: [0, 200], comprimento: 200 };
  const geoInversa = { pontos: [...pontos].reverse(), acumulado: [0, 200], comprimento: 200 };

  g.adicionarNo("A", { lat: -23.350, lon: -46.870 });
  g.adicionarNo("B", { lat: -23.350, lon: -46.868 });

  g.adicionarAresta({
    id: "AB>",
    de: "A",
    para: "B",
    peso: 20,
    trechoId: "AB",
    comprimento: 200,
    velocidade: 10,
    geometria: geoDireta,
  });
  g.adicionarAresta({
    id: "AB<",
    de: "B",
    para: "A",
    peso: 20,
    trechoId: "AB",
    comprimento: 200,
    velocidade: 10,
    geometria: geoInversa,
  });

  g.adicionarTrecho({
    id: "AB",
    arestas: ["AB>", "AB<"],
    nome: "Rua Principal",
    comprimento: 200,
    pontos,
    extremidades: ["A", "B"],
  });

  return g;
}

test("Ciclo semafórico e máquina de estados operam de forma autônoma", () => {
  const s = new Semaforo({
    id: "sem-1",
    trechoId: "AB",
    distancia: 100,
    estadoInicial: "verde",
    tempos: { verde: 10, amarelo: 3, vermelho: 8 },
  });

  assert.equal(s.estado, "verde");
  assert.equal(s.tempoRestante, 10);

  // Avança 5s: continua verde
  let mudou = s.avancar(5);
  assert.equal(mudou, false);
  assert.equal(s.estado, "verde");
  assert.equal(s.tempoRestante, 5);

  // Avança mais 5s: transiciona para amarelo
  mudou = s.avancar(5);
  assert.equal(mudou, true);
  assert.equal(s.estado, "amarelo");
  assert.equal(s.tempoRestante, 3);

  // Avança 3s: transiciona para vermelho
  mudou = s.avancar(3);
  assert.equal(mudou, true);
  assert.equal(s.estado, "vermelho");
  assert.equal(s.tempoRestante, 8);

  // Avança 8s: volta para verde
  mudou = s.avancar(8);
  assert.equal(mudou, true);
  assert.equal(s.estado, "verde");
  assert.equal(s.tempoRestante, 10);
});

test("Configuração de tempos do semáforo e alternância manual", () => {
  const s = new Semaforo({ id: "sem-2", trechoId: "AB", distancia: 50 });
  s.configurarTempos({ verde: 20, amarelo: 4, vermelho: 15 });
  assert.deepEqual(s.tempos, { verde: 20, amarelo: 4, vermelho: 15 });

  s.alternarEstado(); // verde -> amarelo
  assert.equal(s.estado, "amarelo");
  s.alternarEstado(); // amarelo -> vermelho
  assert.equal(s.estado, "vermelho");
  s.alternarEstado(); // vermelho -> verde
  assert.equal(s.estado, "verde");
});

test("Snap projeta ponto próximo na via e rejeita pontos fora da malha", () => {
  const g = criarMalhaLinear();

  // Ponto muito próximo da via (a ~10m)
  const pontoProximo = [-23.35008, -46.869];
  const snapValido = projetarPontoNaMalha(pontoProximo, g, 35);
  assert.equal(snapValido.valido, true);
  assert.equal(snapValido.trechoId, "AB");
  assert.ok(snapValido.distancia > 50 && snapValido.distancia < 150);

  // Ponto bem distante da malha (> 35m)
  const pontoDistante = [-23.370, -46.900];
  const snapInvalido = projetarPontoNaMalha(pontoDistante, g, 35);
  assert.equal(snapInvalido.valido, false);
  assert.match(snapInvalido.motivo, /fora da malha viária/);
});

test("Gerenciador adiciona, lista, reposiciona e remove dispositivos", () => {
  const gm = new GerenciadorDispositivos();
  const l = gm.adicionarLombada({
    trechoId: "AB",
    distancia: 80,
    coordenadas: [-23.350, -46.869],
    velocidadeMaxKmh: 20,
  });
  const s = gm.adicionarSemaforo({
    trechoId: "AB",
    distancia: 180,
    coordenadas: [-23.350, -46.868],
  });

  assert.equal(gm.listarLombadas().length, 1);
  assert.equal(gm.listarSemaforos().length, 1);
  assert.equal(gm.obter(l.id).distancia, 80);

  gm.reposicionar(l.id, { trechoId: "AB", distancia: 120, fracao: 0.6, coordenadas: [-23.350, -46.8685] });
  assert.equal(gm.obter(l.id).distancia, 120);

  assert.equal(gm.removerDispositivo(l.id), true);
  assert.equal(gm.listarLombadas().length, 0);
  assert.equal(gm.listarSemaforos().length, 1);
});

test("Veículo desacelera progressivamente antes da lombada e retoma aceleração", () => {
  const g = criarMalhaLinear();
  const disp = new GerenciadorDispositivos();
  disp.adicionarLombada({
    id: "lomb-1",
    trechoId: "AB",
    distancia: 100, // no metro 100
    velocidadeMaxKmh: 18, // ~5 m/s
    raioEfeito: 30,
  });

  const sim = new Simulacao(g, { dispositivos: disp, fatorTempo: 1 });
  // Injeta veículo antes da lombada
  const v = {
    id: 1,
    destino: "B",
    rota: ["AB>"],
    indice: 0,
    progresso: 50, // a 50m da lombada
    velocidade: 10, // 10 m/s
    inicio: 0,
    status: "circulando",
  };
  sim.veiculos = [v];

  // Avança até se aproximar da zona de desaceleração (a 25m da lombada: progresso 75)
  sim.avancar(2.5); // move cerca de 25m
  assert.ok(v.progresso > 70);

  // À medida que se aproxima da lombada, a velocidade deve cair para próximo de 5 m/s
  while (v.progresso < 98) {
    sim.avancar(0.2);
  }
  assert.ok(v.velocidade <= 7.0, `Velocidade deveria ter caído próximo da lombada, mas é ${v.velocidade}`);

  // Cruza a lombada
  while (v.progresso < 130) {
    sim.avancar(0.2);
  }
  // Após a lombada, acelera de volta em direção a 10 m/s
  assert.ok(v.velocidade > 6.0, `Velocidade deveria estar retomando aceleração, mas é ${v.velocidade}`);
});

test("Veículo para no semáforo vermelho e é liberado no verde", () => {
  const g = criarMalhaLinear();
  const disp = new GerenciadorDispositivos();
  const sem = disp.adicionarSemaforo({
    id: "sem-teste",
    trechoId: "AB",
    distancia: 150,
    estadoInicial: "vermelho",
    tempos: { verde: 15, amarelo: 3, vermelho: 15 },
  });

  const sim = new Simulacao(g, { dispositivos: disp, fatorTempo: 1 });
  const v = {
    id: 1,
    destino: "B",
    rota: ["AB>"],
    indice: 0,
    progresso: 100,
    velocidade: 10,
    inicio: 0,
    status: "circulando",
  };
  sim.veiculos = [v];

  // Avança 8 segundos com semáforo vermelho
  for (let i = 0; i < 40; i++) {
    sim.avancar(0.2);
  }

  // O veículo deve parar antes do semáforo (distancia 150m, margem 2m => progresso <= 148m)
  assert.ok(v.progresso <= 148.5, `Veículo ultrapassou o semáforo vermelho: progresso = ${v.progresso}`);
  assert.equal(v.velocidade, 0, "Veículo deve estar completamente parado");

  // Altera para verde
  sem.definirEstado("verde");

  // Avança simulação
  sim.avancar(1.0);
  assert.ok(v.velocidade > 0, "Veículo deve acelerar e ser liberado no sinal verde");
  assert.ok(v.progresso > 148, "Veículo deve avançar após liberação");
});

test("Veículos em fila no semáforo vermelho respeitam distância de segurança sem sobreposição", () => {
  const g = criarMalhaLinear();
  const disp = new GerenciadorDispositivos();
  disp.adicionarSemaforo({
    id: "sem-fila",
    trechoId: "AB",
    distancia: 180,
    estadoInicial: "vermelho",
    tempos: { verde: 20, amarelo: 3, vermelho: 20 },
  });

  const sim = new Simulacao(g, { dispositivos: disp, fatorTempo: 1 });
  const v1 = { id: 1, destino: "B", rota: ["AB>"], indice: 0, progresso: 120, velocidade: 10, inicio: 0, status: "circulando" };
  const v2 = { id: 2, destino: "B", rota: ["AB>"], indice: 0, progresso: 90, velocidade: 10, inicio: 0, status: "circulando" };
  const v3 = { id: 3, destino: "B", rota: ["AB>"], indice: 0, progresso: 60, velocidade: 10, inicio: 0, status: "circulando" };
  sim.veiculos = [v1, v2, v3];

  // Avança até todos pararem
  for (let i = 0; i < 50; i++) {
    sim.avancar(0.3);
  }

  assert.equal(v1.velocidade, 0);
  assert.equal(v2.velocidade, 0);
  assert.equal(v3.velocidade, 0);

  // Distâncias entre veículos na fila
  const dist12 = v1.progresso - v2.progresso;
  const dist23 = v2.progresso - v3.progresso;

  assert.ok(dist12 >= 6.5, `Distância entre v1 e v2 deve ser segura (>=6.5m), obtido: ${dist12}`);
  assert.ok(dist23 >= 6.5, `Distância entre v2 e v3 deve ser segura (>=6.5m), obtido: ${dist23}`);
});
