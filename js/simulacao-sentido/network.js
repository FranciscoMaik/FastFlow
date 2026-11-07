/*
 * network.js — Malha de demonstração (inspirada no traçado de Jordanésia / Cajamar).
 * Módulo puro: apenas popula um RoadGraph.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Malha = Object.assign(root.Malha || {}, factory());
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildDemoNetwork(graph, seed = 7) {
    const C = 10, R = 7, dx = 96, dy = 92, ox = 70, oy = 60;
    const rnd = mulberry32(seed);
    const id = (r, c) => `n${r}_${c}`;

    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const jx = (rnd() - 0.5) * 14;
        const jy = (rnd() - 0.5) * 14;
        graph.addNode(id(r, c), ox + c * dx + jx, oy + r * dy + jy);
      }
    }

    // Ruas horizontais: anel externo em sentido horário, internas alternadas.
    for (let r = 0; r < R; r++) {
      const dir = r === 0 ? 1 : r === R - 1 ? -1 : r % 2 === 1 ? -1 : 1;
      for (let c = 0; c < C - 1; c++) {
        graph.addRoad(`h${r}_${c}`, id(r, c), id(r, c + 1), { name: `Rua ${r + 1}`, dir });
      }
    }
    // Ruas verticais (dir 1 = para o sul).
    for (let c = 0; c < C; c++) {
      const dir = c === C - 1 ? 1 : c === 0 ? -1 : c % 2 === 1 ? -1 : 1;
      const name = c === 7 ? 'Av. Bom Sucesso' : `Travessa ${c + 1}`;
      for (let r = 0; r < R - 1; r++) {
        graph.addRoad(`v${r}_${c}`, id(r, c), id(r + 1, c), { name, dir });
      }
    }
    // Avenida diagonal.
    const diag = [[5, 1], [4, 2], [3, 3], [2, 4]];
    for (let i = 0; i < diag.length - 1; i++) {
      const [r1, c1] = diag[i];
      const [r2, c2] = diag[i + 1];
      graph.addRoad(`d${i}`, id(r1, c1), id(r2, c2), { name: 'Av. Dr. Antônio João Abdala', dir: 1 });
    }
    return graph;
  }

  return { buildDemoNetwork, mulberry32 };
});
