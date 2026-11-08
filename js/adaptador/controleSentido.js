// Porta de entrada da tela de inversão de sentido. A UI não acessa o motor direto.
import { Emissor } from "../motor/eventos.js";
import { Simulacao } from "../motor/simulacao.js";
import { maiorComponenteForte } from "../motor/roteamento.js";
import { construirGrafo, pontoNaGeometria } from "./carregarMalha.js";

export async function carregarControleSentido(urlMalha, opcoes) {
  const resposta = await fetch(urlMalha);
  if (!resposta.ok) throw new Error(`Não foi possível carregar a malha (${resposta.status}).`);
  return new ControleSentido(await resposta.json(), opcoes);
}

const ROTULO_SENTIDO = {
  0: "Mão dupla",
  1: "Sentido da geometria (→)",
  [-1]: "Sentido contrário (←)",
};

export class ControleSentido extends Emissor {
  #grafo;
  #simulacao;
  #registro = [];
  selecionado = null;

  constructor(
    geojson,
    {
      quantidadeVeiculos = 50,
      fatorTempo = 1,
      aleatorio,
      politicaSentido = "complete",
      intervaloSpawn = 0.2,
    } = {}
  ) {
    super();
    this.#grafo = construirGrafo(geojson);
    this.#simulacao = new Simulacao(this.#grafo, {
      fatorTempo,
      aleatorio,
      politicaSentido,
      intervaloSpawn,
    });
    this.#simulacao.definirQuantidade(quantidadeVeiculos);

    this.#simulacao.on("sentidoReagido", (e) => {
      this.#registrar(e);
      this.emitir("sentidoReagido", e);
    });
    this.#grafo.on("sentidoAlterado", (e) => this.emitir("sentidoAlterado", e));
  }

  trecho(id) {
    const t = this.#grafo.trechos.get(id);
    if (!t) return null;
    const veiculosNoTrecho = this.#simulacao.veiculos.filter(
      (v) => this.#grafo.arestas.get(v.rota[v.indice]).trechoId === id
    ).length;
    return {
      id: t.id,
      nome: t.meta.nome ?? "Via sem nome",
      temNome: Boolean(t.meta.nome),
      referencia: t.meta.referencia,
      tipo: t.meta.tipo,
      sentidoUnico: t.meta.sentidoUnico,
      permiteDuplo: t.permiteDuplo,
      sentido: t.sentido,
      sentidoInicial: t.sentidoInicial,
      alterado: t.sentido !== t.sentidoInicial,
      sentidoRotulo: ROTULO_SENTIDO[t.sentido],
      comprimento: t.meta.comprimento,
      pontos: t.meta.pontos,
      meio: t.meta.meio,
      extremidades: t.meta.extremidades,
      veiculosNoTrecho,
      direcoesAtivas: this.#direcoesAtivas(t),
    };
  }

  #direcoesAtivas(trecho) {
    return trecho.arestas
      .filter((id) => this.#grafo.estaAcessivel(id))
      .map((id) => {
        const a = this.#grafo.arestas.get(id);
        return { id, de: a.de, para: a.para, geometria: a.geometria };
      });
  }

  trechos() {
    return [...this.#grafo.trechos.keys()].map((id) => this.trecho(id));
  }

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

  veiculos() {
    return this.#simulacao.veiculos.map((v) => {
      const aresta = this.#grafo.arestas.get(v.rota[v.indice]);
      const [lat, lon] = pontoNaGeometria(aresta.geometria, v.progresso);
      return {
        id: v.id,
        arestaId: aresta.id,
        lat,
        lon,
        status: v.evacuando ? "evacuando" : v.status,
      };
    });
  }

  estatisticas() {
    const principal = maiorComponenteForte(this.#grafo);
    const totalNos = this.#grafo.nos.size;
    return {
      ...this.#simulacao.estatisticas(),
      malhaConectada: principal.size === totalNos,
      nosNaMalha: principal.size,
      nosTotal: totalNos,
    };
  }

  registro() {
    return [...this.#registro];
  }

  selecionar(id) {
    this.selecionado = id && this.#grafo.trechos.has(id) ? id : null;
    this.emitir("selecaoAlterada", this.selecionado);
  }

  inverterSelecionado() {
    if (!this.selecionado) return { ok: false, motivo: "Nenhuma via selecionada." };
    const ok = this.#grafo.inverterSentido(this.selecionado);
    if (!ok) return { ok: false, motivo: "Não foi possível inverter (via bloqueada?)." };
    return { ok: true, trecho: this.trecho(this.selecionado) };
  }

  definirPolitica(politica) {
    this.#simulacao.politicaSentido = politica === "uturn" ? "uturn" : "complete";
  }

  avancar(dtSegundos) {
    this.#simulacao.avancar(dtSegundos);
  }

  definirQuantidadeVeiculos(n) {
    this.#simulacao.definirQuantidade(n);
  }

  definirFatorTempo(fator) {
    this.#simulacao.fatorTempo = fator;
  }

  // Encerra esta simulação (troca de local): some com veículos, rotas e registro.
  encerrar() {
    this.#simulacao.encerrar();
    this.#registro = [];
    this.selecionado = null;
  }

  #registrar(e) {
    const trecho = this.trecho(e.trechoId);
    const partes = [];
    if (e.evacuando) partes.push(`${e.evacuando} concluindo a travessia`);
    if (e.retornos) partes.push(`${e.retornos} retornaram`);
    if (e.recalculadas) partes.push(`${e.recalculadas} rotas recalculadas`);
    this.#registro.unshift({
      trechoId: e.trechoId,
      nome: trecho?.nome ?? e.trechoId,
      sentido: e.sentido,
      texto:
        `${trecho?.nome ?? e.trechoId} → ${ROTULO_SENTIDO[e.sentido]}` +
        (partes.length ? ` — ${partes.join(", ")}` : ""),
      horario: new Date(),
    });
    if (this.#registro.length > 40) this.#registro.length = 40;
  }
}
