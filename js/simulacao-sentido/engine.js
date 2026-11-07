/*
 * engine.js — Motor de tráfego.
 *
 * Módulo PURO: lê o RoadGraph e simula veículos. Não toca DOM nem canvas.
 *
 * Quando uma via é invertida (evento 'reverse' do grafo), a engine:
 *  1. Impede qualquer NOVA entrada na via contra o sentido atual (canEnter).
 *  2. Trata os veículos que já estavam na via conforme a política:
 *       'complete' — concluem a travessia com segurança (marcados como `evacuating`);
 *                    ninguém entra na via enquanto ainda houver veículos saindo.
 *       'uturn'    — invertem o deslocamento na hora e seguem o novo sentido.
 *  3. Recalcula a rota de todo veículo cuja rota ficou inválida.
 *  4. Veículo sem rota possível escolhe novo destino; sem nenhum destino alcançável, é removido.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Malha = Object.assign(root.Malha || {}, factory());
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class TrafficEngine {
    constructor(graph, opts = {}) {
      this.graph = graph;
      this.opts = Object.assign({
        maxVehicles: 50,
        policy: 'complete', // 'complete' | 'uturn'
        rng: Math.random,
        carLength: 7,
        minGap: 5,
        speedRange: [26, 44], // unidades do mundo por segundo
        spawnInterval: 0.2,
        patience: 25, // segundos esperando antes de replanejar
      }, opts);
      this.vehicles = [];
      this.time = 0;
      this._spawnTimer = 0;
      this._nextId = 1;
      this._listeners = new Set();
      this.stats = { spawned: 0, despawned: 0, rerouted: 0, evacuated: 0, uturned: 0, reversals: 0 };
      graph.subscribe((e) => this._onGraphEvent(e));
    }

    on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
    _emit(e) { this._listeners.forEach((fn) => fn(e)); }
    _rand(n) { return Math.floor(this.opts.rng() * n); }
    _nodeIds() { return [...this.graph.nodes.keys()]; }

    countOnRoad(roadId) {
      let n = 0;
      for (const v of this.vehicles) if (v.roadId === roadId) n++;
      return n;
    }

    positionOf(v) {
      const g = this.graph;
      const a = g.nodes.get(v.from);
      const b = g.nodes.get(v.to);
      const t = Math.max(0, Math.min(1, v.pos / g.roads.get(v.roadId).length));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }

    // ---------- planejamento de rotas ----------

    /** Planeja a rota a partir do nó v.to. Tenta manter o destino; senão escolhe outro. */
    _plan(v, forceNew = false) {
      const g = this.graph;
      const n = v.to;
      if (!forceNew && v.dest && v.dest !== n) {
        const p = g.shortestPath(n, v.dest);
        if (p && p.roads.length) { v.route = p.roads; return true; }
      }
      const ids = this._nodeIds();
      for (let k = 0; k < 15; k++) {
        const d = ids[this._rand(ids.length)];
        if (d === n) continue;
        const p = g.shortestPath(n, d);
        if (p && p.roads.length) { v.dest = d; v.route = p.roads; return true; }
      }
      v.route = [];
      return false;
    }

    /** A rota restante é percorrível no sentido atual das vias? */
    _routeValid(v) {
      const g = this.graph;
      let node = v.to;
      for (const rid of v.route) {
        if (!g.canEnter(rid, node)) return false;
        node = g.roadTo(rid);
      }
      return true;
    }

    // ---------- reação à inversão ----------

    _onGraphEvent(e) {
      if (e.type !== 'reverse') return;
      const g = this.graph;
      const road = g.roads.get(e.roadId);
      this.stats.reversals++;
      let onRoad = 0, evacuating = 0, uturned = 0, rerouted = 0;

      for (const v of this.vehicles) {
        if (v.roadId !== road.id) continue;
        onRoad++;
        if (g.roadFrom(road) === v.from) { v.evacuating = false; continue; } // voltou a ser legítimo
        if (this.opts.policy === 'uturn') {
          const f = v.from; v.from = v.to; v.to = f;
          v.pos = road.length - v.pos;
          v.evacuating = false;
          v.waited = 0;
          uturned++;
        } else {
          v.evacuating = true;
          evacuating++;
        }
      }
      for (const v of this.vehicles) {
        if (this._routeValid(v)) continue;
        rerouted++;
        this._plan(v);
      }
      this.stats.rerouted += rerouted;
      this.stats.evacuated += evacuating;
      this.stats.uturned += uturned;
      this._emit({ type: 'reversal', roadId: road.id, name: road.name, onRoad, evacuating, uturned, rerouted });
    }

    // ---------- simulação ----------

    _entryFree(roadId, fromNode) {
      const { carLength, minGap } = this.opts;
      for (const v of this.vehicles) {
        if (v.roadId !== roadId) continue;
        if (v.from !== fromNode) return false; // há veículos saindo no sentido antigo
        if (v.pos < carLength + minGap) return false;
      }
      return true;
    }

    _trySpawn() {
      const g = this.graph;
      const ids = this._nodeIds();
      const node = ids[this._rand(ids.length)];
      const outs = g.outRoads(node);
      if (!outs.length) return false;
      const roadId = outs[this._rand(outs.length)];
      if (!this._entryFree(roadId, node)) return false;
      const [lo, hi] = this.opts.speedRange;
      const v = {
        id: this._nextId++,
        roadId,
        from: node,
        to: g.roadTo(roadId),
        pos: 0,
        speed: 0,
        vmax: lo + this.opts.rng() * (hi - lo),
        dest: null,
        route: [],
        evacuating: false,
        waited: 0,
        hue: this._rand(360),
      };
      if (!this._plan(v, true)) return false;
      // _plan parte de v.to; a via inicial vem antes da rota planejada.
      this.vehicles.push(v);
      this.stats.spawned++;
      return true;
    }

    _despawn(v) {
      const i = this.vehicles.indexOf(v);
      if (i >= 0) this.vehicles.splice(i, 1);
      this.stats.despawned++;
    }

    /** Veículo no fim da via: tenta entrar na próxima. Retorna 'moved' | 'wait' | 'despawn'. */
    _arrive(v) {
      const g = this.graph;
      const n = v.to;
      if (!v.route.length || n === v.dest) {
        if (!this._plan(v, true)) return 'despawn';
      } else if (!g.canEnter(v.route[0], n)) {
        if (!this._plan(v)) return 'despawn';
      }
      const next = v.route[0];
      if (!next) return 'despawn';
      if (!this._entryFree(next, n)) return 'wait';
      v.route.shift();
      v.roadId = next;
      v.from = n;
      v.to = g.roadTo(next);
      v.pos = 0;
      v.waited = 0;
      v.evacuating = false; // entrou pelo sentido legítimo da nova via
      return 'moved';
    }

    step(dt) {
      const { carLength, minGap, maxVehicles, spawnInterval, patience } = this.opts;
      this.time += dt;

      // remove excedentes se o limite diminuiu
      while (this.vehicles.length > maxVehicles) this._despawn(this.vehicles[0]);
      this._spawnTimer += dt;
      while (this._spawnTimer >= spawnInterval) {
        this._spawnTimer -= spawnInterval;
        if (this.vehicles.length < maxVehicles) this._trySpawn();
      }

      // agrupa por (via, sentido) para seguir o veículo da frente
      const lanes = new Map();
      for (const v of this.vehicles) {
        const key = `${v.roadId}|${v.from}`;
        if (!lanes.has(key)) lanes.set(key, []);
        lanes.get(key).push(v);
      }
      const toRemove = [];
      for (const list of lanes.values()) {
        list.sort((a, b) => b.pos - a.pos);
        let leader = null;
        for (const v of list) {
          const len = this.graph.roads.get(v.roadId).length;
          let limit = len;
          let speed = v.vmax;
          if (leader) {
            const gap = leader.pos - v.pos - carLength;
            speed = gap <= minGap ? 0 : Math.min(v.vmax, (gap - minGap) * 2);
            limit = Math.min(limit, leader.pos - carLength);
          }
          const newPos = Math.max(v.pos, Math.min(v.pos + speed * dt, limit));
          v.speed = (newPos - v.pos) / dt;
          v.pos = newPos;

          if (v.pos >= len - 1e-6) {
            const res = this._arrive(v);
            if (res === 'despawn') toRemove.push(v);
            else if (res === 'wait') {
              v.pos = len;
              v.speed = 0;
              v.waited += dt;
              if (v.waited > patience) { this._plan(v, true); v.waited = 0; }
            }
          }
          leader = v;
        }
      }
      toRemove.forEach((v) => this._despawn(v));
    }
  }

  return { TrafficEngine };
});
