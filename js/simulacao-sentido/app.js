/*
 * app.js — Cola entre UI (DOM), renderização e os módulos puros (grafo + engine).
 * Toda a lógica de malha fica em graph.js / engine.js; aqui só há eventos e atualização de tela.
 */
(function () {
  'use strict';
  const { RoadGraph, buildDemoNetwork, TrafficEngine, MapRenderer } = window.Malha;
  const $ = (id) => document.getElementById(id);

  const graph = buildDemoNetwork(new RoadGraph());
  const engine = new TrafficEngine(graph, { maxVehicles: 50, policy: 'complete' });
  const canvas = $('map');
  const renderer = new MapRenderer(canvas, graph, engine);
  renderer.fit();

  const ui = {
    empty: $('sel-empty'), info: $('sel-info'), name: $('sel-name'), id: $('sel-id'),
    dir: $('sel-dir'), count: $('sel-count'), btn: $('btn-reverse'), btnClear: $('btn-clear'),
    play: $('btn-play'), speed: $('speed'), speedOut: $('speed-out'),
    cars: $('cars'), carsOut: $('cars-out'), policy: $('policy'), log: $('log'),
    st: { cars: $('st-cars'), rev: $('st-rev'), rer: $('st-rer'), evac: $('st-evac'), desp: $('st-desp') },
    conn: $('st-conn'),
  };
  let paused = false;
  let speed = 1;

  // ---------- seleção e inversão ----------
  function select(id) {
    renderer.selectedId = id;
    renderSelection();
  }

  function renderSelection() {
    const id = renderer.selectedId;
    ui.empty.hidden = !!id;
    ui.info.hidden = !id;
    if (!id) return;
    const r = graph.roads.get(id);
    ui.name.textContent = r.name;
    ui.id.textContent = id;
    ui.dir.textContent = `${graph.roadFrom(r)} → ${graph.roadTo(r)}`;
    ui.count.textContent = engine.countOnRoad(id);
  }

  function reverseSelected() {
    const id = renderer.selectedId;
    if (!id) return;
    graph.reverseRoad(id); // a engine reage via evento do grafo
    renderer.flash(id);
    renderSelection();
    updateConnectivity();
  }

  function updateConnectivity() {
    const ok = graph.isStronglyConnected();
    ui.conn.textContent = ok ? 'Malha conectada' : 'Malha com trechos isolados';
    ui.conn.dataset.ok = ok ? '1' : '0';
  }

  engine.on((e) => {
    if (e.type !== 'reversal') return;
    const parts = [];
    if (e.evacuating) parts.push(`${e.evacuating} concluindo a travessia`);
    if (e.uturned) parts.push(`${e.uturned} retornaram`);
    if (e.rerouted) parts.push(`${e.rerouted} rotas recalculadas`);
    const li = document.createElement('li');
    li.textContent = `${e.name} (${e.roadId}) invertida` + (parts.length ? ` — ${parts.join(', ')}` : '');
    ui.log.prepend(li);
    while (ui.log.children.length > 40) ui.log.lastChild.remove();
  });

  ui.btn.addEventListener('click', reverseSelected);
  ui.btnClear.addEventListener('click', () => select(null));
  ui.play.addEventListener('click', () => {
    paused = !paused;
    ui.play.textContent = paused ? 'Retomar' : 'Pausar';
    ui.play.setAttribute('aria-pressed', String(paused));
  });
  ui.speed.addEventListener('input', () => { speed = +ui.speed.value; ui.speedOut.textContent = `${speed}×`; });
  ui.cars.addEventListener('input', () => { engine.opts.maxVehicles = +ui.cars.value; ui.carsOut.textContent = ui.cars.value; });
  ui.policy.addEventListener('change', () => { engine.opts.policy = ui.policy.value; });

  // ---------- ponteiro: selecionar, arrastar (pan) e zoom ----------
  let drag = null;
  const local = (ev) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const pick = (p) => {
    const w = renderer.screenToWorld(p.x, p.y);
    return graph.nearestRoad(w.x, w.y, Math.max(7, 12 / renderer.view.scale));
  };

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    const p = local(ev);
    drag = { sx: p.x, sy: p.y, vx: renderer.view.x, vy: renderer.view.y, moved: false };
  });
  canvas.addEventListener('pointermove', (ev) => {
    const p = local(ev);
    if (drag) {
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) { renderer.view.x = drag.vx + dx; renderer.view.y = drag.vy + dy; canvas.style.cursor = 'grabbing'; }
    } else {
      renderer.hoverId = pick(p);
      canvas.style.cursor = renderer.hoverId ? 'pointer' : 'default';
    }
  });
  canvas.addEventListener('pointerup', (ev) => {
    if (drag && !drag.moved) select(pick(local(ev)));
    drag = null;
    canvas.style.cursor = renderer.hoverId ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { renderer.hoverId = null; });
  canvas.addEventListener('dblclick', (ev) => {
    const id = pick(local(ev));
    if (id) { select(id); reverseSelected(); }
  });
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const p = local(ev);
    renderer.zoomAt(p.x, p.y, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  window.addEventListener('keydown', (ev) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;
    if (ev.key === 'r' || ev.key === 'R') reverseSelected();
    else if (ev.key === 'Escape') select(null);
    else if (ev.key === ' ' && ev.target.tagName !== 'BUTTON') { ev.preventDefault(); ui.play.click(); }
  });
  window.addEventListener('resize', () => { renderer.resize(); });

  // ---------- loop ----------
  let last = performance.now();
  let statTimer = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) {
      let remaining = dt * speed;
      while (remaining > 0) { const h = Math.min(0.05, remaining); engine.step(h); remaining -= h; }
    }
    renderer.draw(now);
    statTimer += dt;
    if (statTimer > 0.25) {
      statTimer = 0;
      const s = engine.stats;
      ui.st.cars.textContent = engine.vehicles.length;
      ui.st.rev.textContent = s.reversals;
      ui.st.rer.textContent = s.rerouted;
      ui.st.evac.textContent = s.evacuated + s.uturned;
      ui.st.desp.textContent = s.despawned;
      if (renderer.selectedId) ui.count.textContent = engine.countOnRoad(renderer.selectedId);
    }
    requestAnimationFrame(frame);
  }

  updateConnectivity();
  renderSelection();
  // aquecimento: já começa com tráfego
  for (let i = 0; i < 400; i++) engine.step(0.05);
  requestAnimationFrame(frame);
})();
