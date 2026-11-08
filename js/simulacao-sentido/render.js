/*
 * render.js — Camada de renderização (canvas). Somente leitura sobre grafo e engine.
 * Cores vêm de variáveis CSS (tokens), para seguir a identidade visual do projeto.
 */
(function (root) {
  'use strict';

  class MapRenderer {
    constructor(canvas, graph, engine) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.graph = graph;
      this.engine = engine;
      this.view = { scale: 1, x: 0, y: 0 };
      this.selectedId = null;
      this.hoverId = null;
      this.flashes = new Map(); // roadId -> instante (ms) do início
      this.colors = {};
      this.refreshColors();
      this.resize();
    }

    refreshColors() {
      const cs = getComputedStyle(this.canvas);
      const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
      this.colors = {
        bg: v('--map-bg', '#0f1419'),
        roadEdge: v('--road-edge', '#3a4656'),
        road: v('--road', '#222b37'),
        arrow: v('--arrow', '#e8eef6'),
        accent: v('--accent', '#ffb020'),
        hover: v('--hover', '#6cb6ff'),
        node: v('--node', '#4a586b'),
        vehicle: v('--vehicle-hue-s', '70%'),
        warn: v('--warn', '#ff5d5d'),
      };
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
      this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
      this.dpr = dpr;
      this.cssW = rect.width;
      this.cssH = rect.height;
    }

    fit(margin = 36) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of this.graph.nodes.values()) {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
      }
      const s = Math.min((this.cssW - margin * 2) / (maxX - minX), (this.cssH - margin * 2) / (maxY - minY));
      this.view.scale = s;
      this.view.x = (this.cssW - (maxX - minX) * s) / 2 - minX * s;
      this.view.y = (this.cssH - (maxY - minY) * s) / 2 - minY * s;
    }

    screenToWorld(px, py) {
      return { x: (px - this.view.x) / this.view.scale, y: (py - this.view.y) / this.view.scale };
    }

    zoomAt(px, py, factor) {
      const w = this.screenToWorld(px, py);
      const s = Math.max(0.4, Math.min(5, this.view.scale * factor));
      this.view.scale = s;
      this.view.x = px - w.x * s;
      this.view.y = py - w.y * s;
    }

    flash(roadId) { this.flashes.set(roadId, performance.now()); }

    _arrow(x, y, angle, size, fill, outline) {
      const c = this.ctx;
      c.save();
      c.translate(x, y);
      c.rotate(angle);
      c.beginPath();
      c.moveTo(size, 0);
      c.lineTo(-size * 0.8, size * 0.85);
      c.lineTo(-size * 0.35, 0);
      c.lineTo(-size * 0.8, -size * 0.85);
      c.closePath();
      if (outline) { c.lineWidth = size * 0.35; c.strokeStyle = outline; c.lineJoin = 'round'; c.stroke(); }
      c.fillStyle = fill;
      c.fill();
      c.restore();
    }

    draw(now = performance.now()) {
      const c = this.ctx;
      const g = this.graph;
      const col = this.colors;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.fillStyle = col.bg;
      c.fillRect(0, 0, this.cssW, this.cssH);
      c.save();
      c.translate(this.view.x, this.view.y);
      c.scale(this.view.scale, this.view.scale);
      c.lineCap = 'round';

      const stroke = (road, width, color, alpha = 1) => {
        const a = g.nodes.get(road.a), b = g.nodes.get(road.b);
        c.globalAlpha = alpha;
        c.strokeStyle = color;
        c.lineWidth = width;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        c.globalAlpha = 1;
      };

      // asfalto
      for (const r of g.roads.values()) stroke(r, 12, col.roadEdge);
      for (const r of g.roads.values()) stroke(r, 10, col.road);

      // destaque: hover, seleção e flash de inversão
      if (this.hoverId && this.hoverId !== this.selectedId) stroke(g.roads.get(this.hoverId), 14, col.hover, 0.45);
      if (this.selectedId) {
        const sel = g.roads.get(this.selectedId);
        stroke(sel, 18, col.accent, 0.35);
        stroke(sel, 12, col.accent, 0.9);
        stroke(sel, 9.5, col.road);
      }
      for (const [id, t0] of this.flashes) {
        const k = (now - t0) / 700;
        if (k >= 1) { this.flashes.delete(id); continue; }
        stroke(g.roads.get(id), 12 + k * 22, col.accent, 0.8 * (1 - k));
      }

      // nós
      c.fillStyle = col.node;
      for (const n of g.nodes.values()) { c.beginPath(); c.arc(n.x, n.y, 2.2, 0, Math.PI * 2); c.fill(); }

      // setas de sentido (seguem o vetor atual da via)
      for (const r of g.roads.values()) {
        const from = g.nodes.get(g.roadFrom(r));
        const to = g.nodes.get(g.roadTo(r));
        const ang = Math.atan2(to.y - from.y, to.x - from.x);
        const count = Math.max(1, Math.round(r.length / 34));
        const selected = r.id === this.selectedId;
        for (let k = 0; k < count; k++) {
          const t = (k + 0.5) / count;
          this._arrow(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, ang,
            selected ? 4.4 : 3.4, selected ? col.accent : col.arrow, col.road);
        }
      }

      // veículos
      for (const v of this.engine.vehicles) {
        const p = this.engine.positionOf(v);
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.angle);
        c.fillStyle = v.evacuating ? col.warn : `hsl(${v.hue} ${col.vehicle} 62%)`;
        c.strokeStyle = '#0b0f14';
        c.lineWidth = 0.9;
        c.beginPath();
        if (c.roundRect) c.roundRect(-3.6, -2, 7.2, 4, 1.2); else c.rect(-3.6, -2, 7.2, 4);
        c.fill();
        c.stroke();
        c.restore();
      }
      c.restore();
    }
  }

  root.Malha = Object.assign(root.Malha || {}, { MapRenderer });
})(typeof self !== 'undefined' ? self : this);
