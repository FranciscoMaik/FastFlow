/*
 * graph.js — Malha viária (grafo dirigido).
 *
 * Módulo PURO: não conhece DOM, canvas nem eventos do navegador.
 * Cada via (aresta) liga dois nós e tem um sentido: dir = 1 (a → b) ou dir = -1 (b → a).
 * Inverter o sentido altera apenas esse vetor e notifica os assinantes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Malha = Object.assign(root.Malha || {}, factory());
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class RoadGraph {
    constructor() {
      this.nodes = new Map();
      this.roads = new Map();
      this.version = 0;
      this._out = null;
      this._listeners = new Set();
    }

    addNode(id, x, y) {
      this.nodes.set(id, { id, x, y });
      this._out = null;
      return this;
    }

    addRoad(id, a, b, opts = {}) {
      const na = this.nodes.get(a);
      const nb = this.nodes.get(b);
      if (!na || !nb) throw new Error(`Via ${id}: nó inexistente (${a}, ${b})`);
      const length = Math.hypot(nb.x - na.x, nb.y - na.y);
      this.roads.set(id, {
        id, a, b, length,
        name: opts.name || id,
        dir: opts.dir === -1 ? -1 : 1,
      });
      this._out = null;
      return this;
    }

    _road(r) { return typeof r === 'object' ? r : this.roads.get(r); }

    /** Nó de onde o tráfego parte, segundo o sentido atual. */
    roadFrom(r) { r = this._road(r); return r.dir === 1 ? r.a : r.b; }
    /** Nó para onde o tráfego segue, segundo o sentido atual. */
    roadTo(r) { r = this._road(r); return r.dir === 1 ? r.b : r.a; }
    /** Um veículo só pode entrar na via pelo nó de origem do sentido atual. */
    canEnter(roadId, fromNode) { return this.roadFrom(roadId) === fromNode; }

    /** Inverte o sentido da via. Atualiza o grafo imediatamente e notifica. */
    reverseRoad(id) {
      const road = this.roads.get(id);
      if (!road) throw new Error(`Via inexistente: ${id}`);
      const previous = { from: this.roadFrom(road), to: this.roadTo(road) };
      road.dir = -road.dir;
      this.version++;
      this._out = null;
      const event = {
        type: 'reverse',
        roadId: id,
        version: this.version,
        previous,
        current: { from: this.roadFrom(road), to: this.roadTo(road) },
      };
      this._listeners.forEach((fn) => fn(event));
      return event;
    }

    subscribe(fn) {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }

    /** Vias que saem do nó, respeitando o sentido atual. */
    outRoads(nodeId) {
      if (!this._out) {
        this._out = new Map();
        for (const id of this.nodes.keys()) this._out.set(id, []);
        for (const r of this.roads.values()) this._out.get(this.roadFrom(r)).push(r.id);
      }
      return this._out.get(nodeId) || [];
    }

    /** Menor caminho dirigido (Dijkstra). Retorna { roads, length } ou null. */
    shortestPath(src, dst) {
      if (!this.nodes.has(src) || !this.nodes.has(dst)) return null;
      if (src === dst) return { roads: [], length: 0 };
      const dist = new Map([[src, 0]]);
      const prev = new Map();
      const open = new Set([src]);
      const done = new Set();
      while (open.size) {
        let u = null;
        let best = Infinity;
        for (const n of open) {
          const d = dist.get(n);
          if (d < best) { best = d; u = n; }
        }
        open.delete(u);
        if (u === dst) break;
        done.add(u);
        for (const rid of this.outRoads(u)) {
          const r = this.roads.get(rid);
          const v = this.roadTo(r);
          if (done.has(v)) continue;
          const nd = best + r.length;
          if (nd < (dist.has(v) ? dist.get(v) : Infinity)) {
            dist.set(v, nd);
            prev.set(v, { node: u, road: rid });
            open.add(v);
          }
        }
      }
      if (!prev.has(dst)) return null;
      const roads = [];
      for (let n = dst; n !== src; n = prev.get(n).node) roads.push(prev.get(n).road);
      return { roads: roads.reverse(), length: dist.get(dst) };
    }

    /** Via mais próxima do ponto (x, y) dentro de maxDist; ou null. */
    nearestRoad(x, y, maxDist = 10) {
      let best = null;
      let bestD = maxDist;
      for (const r of this.roads.values()) {
        const a = this.nodes.get(r.a);
        const b = this.nodes.get(r.b);
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy)));
        const d = Math.hypot(x - (a.x + t * vx), y - (a.y + t * vy));
        if (d <= bestD) { bestD = d; best = r.id; }
      }
      return best;
    }

    /** Todos os nós alcançam todos os outros? */
    isStronglyConnected() {
      const ids = [...this.nodes.keys()];
      if (!ids.length) return true;
      const reach = (forward) => {
        const adj = new Map(ids.map((i) => [i, []]));
        for (const r of this.roads.values()) {
          const f = this.roadFrom(r);
          const t = this.roadTo(r);
          if (forward) adj.get(f).push(t); else adj.get(t).push(f);
        }
        const seen = new Set([ids[0]]);
        const stack = [ids[0]];
        while (stack.length) for (const n of adj.get(stack.pop())) if (!seen.has(n)) { seen.add(n); stack.push(n); }
        return seen.size === ids.length;
      };
      return reach(true) && reach(false);
    }
  }

  return { RoadGraph };
});
