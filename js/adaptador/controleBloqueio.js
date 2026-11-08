// Única porta de entrada da interface para o motor. A UI chama estes métodos e
// escuta os eventos daqui; ela nunca mexe no grafo ou na simulação diretamente.
import { Emissor } from "../motor/eventos.js";
import { Simulacao } from "../motor/simulacao.js";
import { validarBloqueio } from "../motor/validacao.js";
import { construirGrafo, pontoNaGeometria } from "./carregarMalha.js";
import { projetarPontoNaMalha } from "../motor/geometriaSnap.js";

export async function carregarControle(urlMalha, opcoes) {
  const resposta = await fetch(urlMalha);
  if (!resposta.ok) throw new Error(`Não foi possível carregar a malha (${resposta.status}).`);
  return new ControleBloqueio(await resposta.json(), opcoes);
}

export class ControleBloqueio extends Emissor {
  #grafo;
  #simulacao;
  #bloqueios = new Map(); // trechoId -> { horario, rotasRecalculadas }
  #ultimoRecalculo = 0;
  selecionado = null;

  constructor(
    geojson,
    { quantidadeVeiculos = 60, fatorTempo = 4, aleatorio, intervaloSpawn = 0.2 } = {}
  ) {
    super();
    this.#grafo = construirGrafo(geojson);
    this.#simulacao = new Simulacao(this.#grafo, { fatorTempo, aleatorio, intervaloSpawn });
    this.#simulacao.definirQuantidade(quantidadeVeiculos);

    this.#simulacao.on("rotasRecalculadas", (e) => {
      this.#ultimoRecalculo = e.quantidade;
      this.emitir("rotasRecalculadas", e);
    });
    this.#grafo.on("bloqueioAlterado", (e) => this.emitir("bloqueioAlterado", e));

    this.#simulacao.dispositivos.on("faseAlterada", (s) => this.emitir("faseSemafóricaAlterada", s));
    this.#simulacao.dispositivos.on("dispositivoAdicionado", () => this.emitir("dispositivosAlterados", this.dispositivos()));
    this.#simulacao.dispositivos.on("dispositivoRemovido", () => this.emitir("dispositivosAlterados", this.dispositivos()));
    this.#simulacao.dispositivos.on("dispositivoAtualizado", () => this.emitir("dispositivosAlterados", this.dispositivos()));
  }

  // ---------- Consulta ----------

  trecho(id) {
    const t = this.#grafo.trechos.get(id);
    if (!t) return null;
    const veiculosNoTrecho = this.#simulacao
      .posicoesDeSaida()
      .filter((p) => this.#grafo.arestas.get(p.arestaId).trechoId === id).length;
    return {
      id: t.id,
      nome: t.meta.nome ?? "Via sem nome",
      temNome: Boolean(t.meta.nome),
      referencia: t.meta.referencia,
      tipo: t.meta.tipo,
      sentidoUnico: t.meta.sentidoUnico,
      comprimento: t.meta.comprimento,
      pontos: t.meta.pontos,
      meio: t.meta.meio,
      bloqueado: t.bloqueado,
      veiculosNoTrecho,
    };
  }

  trechos() {
    return [...this.#grafo.trechos.keys()].map((id) => this.trecho(id));
  }

  // Logradouros com nome, em ordem alfabética, e os trechos de cada um.
  logradouros() {
    const mapa = new Map();
    for (const t of this.#grafo.trechos.values()) {
      if (!t.meta.nome) continue;
      if (!mapa.has(t.meta.nome)) mapa.set(t.meta.nome, []);
      mapa.get(t.meta.nome).push(t.id);
    }
    return [...mapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([nome, trechos]) => ({ nome, trechos }));
  }

  bloqueios() {
    return [...this.#bloqueios.entries()].map(([id, info]) => ({ ...this.trecho(id), ...info }));
  }

  veiculos() {
    return this.#simulacao.veiculos.map((v) => {
      const aresta = this.#grafo.arestas.get(v.rota[v.indice]);
      const [lat, lon] = pontoNaGeometria(aresta.geometria, v.progresso);
      return { id: v.id, arestaId: aresta.id, lat, lon, status: v.status, velocidade: v.velocidade };
    });
  }

  estatisticas() {
    const listaDispositivos = this.#simulacao.dispositivos.listarTodos();
    return {
      ...this.#simulacao.estatisticas(),
      bloqueios: this.#bloqueios.size,
      lombadas: this.#simulacao.dispositivos.listarLombadas().length,
      semaforos: this.#simulacao.dispositivos.listarSemaforos().length,
      dispositivos: listaDispositivos.length,
    };
  }

  // ---------- Dispositivos de Tráfego (Lombadas e Semáforos) ----------

  projetarPonto(lat, lon, raioMaxMetros = 50, trechoIdPreferido = null) {
    return projetarPontoNaMalha([lat, lon], this.#grafo, raioMaxMetros, trechoIdPreferido);
  }

  adicionarLombada({ lat, lon, trechoId = null, velocidadeMaxKmh = 20, raioEfeito = 25 }) {
    const snap = this.projetarPonto(lat, lon, 50, trechoId);
    if (!snap.valido) {
      return { permitido: false, motivo: snap.motivo };
    }
    const lombada = this.#simulacao.dispositivos.adicionarLombada({
      trechoId: snap.trechoId,
      distancia: snap.distancia,
      fracao: snap.fracao,
      coordenadas: snap.coordenadas,
      velocidadeMaxKmh,
      raioEfeito,
    });
    return { permitido: true, dispositivo: this.dispositivo(lombada.id) };
  }

  adicionarSemaforo({ lat, lon, trechoId = null, tempos, estadoInicial = "verde", sentido = "ambos" }) {
    const snap = this.projetarPonto(lat, lon, 50, trechoId);
    if (!snap.valido) {
      return { permitido: false, motivo: snap.motivo };
    }
    const semaforo = this.#simulacao.dispositivos.adicionarSemaforo({
      trechoId: snap.trechoId,
      distancia: snap.distancia,
      fracao: snap.fracao,
      coordenadas: snap.coordenadas,
      estadoInicial,
      tempos,
      sentido,
    });
    return { permitido: true, dispositivo: this.dispositivo(semaforo.id) };
  }

  removerDispositivo(id) {
    const ok = this.#simulacao.dispositivos.removerDispositivo(id);
    return { removido: ok };
  }

  removerTodosDispositivos() {
    const qtd = this.#simulacao.dispositivos.removerTodos();
    return { removidos: qtd };
  }

  reposicionarDispositivo(id, { lat, lon }) {
    const snap = this.projetarPonto(lat, lon);
    if (!snap.valido) {
      return { permitido: false, motivo: snap.motivo };
    }
    const ok = this.#simulacao.dispositivos.reposicionar(id, {
      trechoId: snap.trechoId,
      distancia: snap.distancia,
      fracao: snap.fracao,
      coordenadas: snap.coordenadas,
    });
    return { permitido: ok, dispositivo: this.dispositivo(id) };
  }

  configurarSemaforo(id, { verde, amarelo, vermelho }) {
    const ok = this.#simulacao.dispositivos.configurarSemaforo(id, { verde, amarelo, vermelho });
    return { configurado: ok, dispositivo: this.dispositivo(id) };
  }

  alternarSemaforo(id) {
    const novoEstado = this.#simulacao.dispositivos.alternarSemaforo(id);
    return { alternado: Boolean(novoEstado), estado: novoEstado };
  }

  dispositivo(id) {
    const d = this.#simulacao.dispositivos.obter(id);
    if (!d) return null;
    const trecho = this.trecho(d.trechoId);
    return {
      ...d,
      nomeTrecho: trecho?.nome ?? "Via sem nome",
      referenciaTrecho: trecho?.referencia ?? null,
    };
  }

  dispositivos() {
    return this.#simulacao.dispositivos.listarTodos().map((d) => this.dispositivo(d.id));
  }

  lombadas() {
    return this.#simulacao.dispositivos.listarLombadas().map((d) => this.dispositivo(d.id));
  }

  semaforos() {
    return this.#simulacao.dispositivos.listarSemaforos().map((d) => this.dispositivo(d.id));
  }

  // ---------- Ações de Bloqueio ----------

  selecionar(id) {
    this.selecionado = id && this.#grafo.trechos.has(id) ? id : null;
    this.emitir("selecaoAlterada", this.selecionado);
  }

  solicitarBloqueio(id) {
    const resultado = validarBloqueio(this.#grafo, id, this.#simulacao.posicoesDeSaida());
    if (!resultado.permitido) return resultado;

    this.#ultimoRecalculo = 0;
    this.#grafo.bloquearTrecho(id); // dispara o recálculo síncrono das rotas
    this.#bloqueios.set(id, { horario: new Date(), rotasRecalculadas: this.#ultimoRecalculo });
    this.emitir("bloqueiosAlterados", this.bloqueios());
    return { permitido: true, rotasRecalculadas: this.#ultimoRecalculo, veiculosNoTrecho: resultado.veiculosNoTrecho };
  }

  removerBloqueio(id) {
    if (!this.#grafo.trechos.get(id)?.bloqueado) return { removido: false };
    this.#ultimoRecalculo = 0;
    this.#grafo.desbloquearTrecho(id);
    this.#bloqueios.delete(id);
    this.emitir("bloqueiosAlterados", this.bloqueios());
    return { removido: true, rotasRecalculadas: this.#ultimoRecalculo };
  }

  // ---------- Simulação ----------

  avancar(dtSegundos) {
    this.#simulacao.avancar(dtSegundos);
  }

  definirQuantidadeVeiculos(n) {
    this.#simulacao.definirQuantidade(n);
  }

  definirFatorTempo(fator) {
    this.#simulacao.fatorTempo = fator;
  }
}
