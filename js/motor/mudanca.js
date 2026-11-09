// Modelo de mudança (F3): intervenções tipadas, JSON-friendly, aplicáveis e
// reversíveis sobre uma cópia do grafo (e dispositivos, quando houver).
// F2 avalia listas de mudanças; F5 persiste cenários com serializar/desserializar.
import { Grafo } from "./grafo.js";
import { GerenciadorDispositivos } from "./dispositivos.js";

export const TIPOS_MUDANCA = Object.freeze([
  "bloquear",
  "inverter",
  "adicionarLigacao",
  "lombada",
  "semaforo",
]);

const TIPOS = new Set(TIPOS_MUDANCA);

function ehObjeto(valor) {
  return valor != null && typeof valor === "object" && !Array.isArray(valor);
}

function clonarGeometria(geo) {
  if (!geo) return undefined;
  return {
    ...geo,
    pontos: Array.isArray(geo.pontos) ? geo.pontos.map((p) => [...p]) : geo.pontos,
    acumulado: Array.isArray(geo.acumulado) ? [...geo.acumulado] : geo.acumulado,
  };
}

function clonarMeta(meta) {
  if (!meta || typeof meta !== "object") return {};
  const copia = { ...meta };
  if (Array.isArray(meta.pontos)) copia.pontos = meta.pontos.map((p) => [...p]);
  if (Array.isArray(meta.extremidades)) copia.extremidades = [...meta.extremidades];
  if (meta.meio && Array.isArray(meta.meio)) copia.meio = [...meta.meio];
  return copia;
}

/** Cópia profunda do grafo (nós, arestas, trechos e adjacência). Sem listeners. */
export function clonarGrafo(grafo) {
  if (!(grafo instanceof Grafo)) {
    throw new TypeError("clonarGrafo espera uma instância de Grafo");
  }
  const g = new Grafo();
  for (const [id, no] of grafo.nos) {
    g.nos.set(id, { ...no });
    g.saidas.set(id, [...(grafo.saidas.get(id) ?? [])]);
    g.entradas.set(id, [...(grafo.entradas.get(id) ?? [])]);
  }
  for (const [id, aresta] of grafo.arestas) {
    const { geometria, ...resto } = aresta;
    g.arestas.set(id, {
      ...resto,
      ...(geometria ? { geometria: clonarGeometria(geometria) } : {}),
    });
  }
  for (const [id, trecho] of grafo.trechos) {
    g.trechos.set(id, {
      ...trecho,
      arestas: [...trecho.arestas],
      meta: clonarMeta(trecho.meta),
    });
  }
  return g;
}

/** Recria o gerenciador a partir da lista pública (sem listeners). */
export function clonarDispositivos(origem) {
  if (!(origem instanceof GerenciadorDispositivos)) {
    throw new TypeError("clonarDispositivos espera GerenciadorDispositivos");
  }
  const destino = new GerenciadorDispositivos();
  for (const d of origem.listarTodos()) {
    if (d.tipo === "lombada") {
      destino.adicionarLombada({
        id: d.id,
        trechoId: d.trechoId,
        distancia: d.distancia,
        fracao: d.fracao,
        coordenadas: d.coordenadas ? [...d.coordenadas] : d.coordenadas,
        velocidadeMaxKmh: d.velocidadeMaxKmh,
        raioEfeito: d.raioEfeito,
      });
    } else if (d.tipo === "semaforo") {
      destino.adicionarSemaforo({
        id: d.id,
        trechoId: d.trechoId,
        distancia: d.distancia,
        fracao: d.fracao,
        coordenadas: d.coordenadas ? [...d.coordenadas] : d.coordenadas,
        estadoInicial: d.estado,
        tempos: { ...d.tempos },
        sentido: d.sentido,
      });
      const clone = destino.obter(d.id);
      if (clone) {
        clone.estado = d.estado;
        clone.tempoRestante = d.tempoRestante;
      }
    }
  }
  return destino;
}

/**
 * Aceita `Grafo` nu ou `{ grafo, dispositivos? }`.
 * @returns {{ grafo: Grafo, dispositivos: GerenciadorDispositivos | null }}
 */
export function normalizarEstado(grafoOuEstado) {
  if (grafoOuEstado instanceof Grafo) {
    return { grafo: grafoOuEstado, dispositivos: null };
  }
  if (ehObjeto(grafoOuEstado) && grafoOuEstado.grafo instanceof Grafo) {
    const dispositivos =
      grafoOuEstado.dispositivos instanceof GerenciadorDispositivos
        ? grafoOuEstado.dispositivos
        : null;
    return { grafo: grafoOuEstado.grafo, dispositivos };
  }
  throw new TypeError("Estado inválido: informe um Grafo ou { grafo, dispositivos? }");
}

/** Clone imutável-friendly do estado (grafo sempre; dispositivos se existirem). */
export function clonarEstado(grafoOuEstado) {
  const { grafo, dispositivos } = normalizarEstado(grafoOuEstado);
  return {
    grafo: clonarGrafo(grafo),
    dispositivos: dispositivos ? clonarDispositivos(dispositivos) : new GerenciadorDispositivos(),
  };
}

function exigirCampos(mudanca, campos) {
  for (const campo of campos) {
    if (mudanca[campo] == null || mudanca[campo] === "") {
      return `Mudança ${mudanca.tipo}: campo obrigatório ausente (${campo})`;
    }
  }
  return null;
}

/** Valida e devolve objeto JSON-serializável canônico (sem funções). */
export function normalizarMudanca(entrada) {
  if (!ehObjeto(entrada)) {
    return { ok: false, motivo: "Mudança deve ser um objeto" };
  }
  const tipo = entrada.tipo;
  if (!TIPOS.has(tipo)) {
    return {
      ok: false,
      motivo: `Tipo de mudança inválido: ${tipo ?? "(ausente)"}. Use: ${TIPOS_MUDANCA.join(", ")}`,
    };
  }

  if (tipo === "bloquear" || tipo === "inverter") {
    const motivo = exigirCampos(entrada, ["trechoId"]);
    if (motivo) return { ok: false, motivo };
    const muda = { tipo, trechoId: String(entrada.trechoId) };
    if (tipo === "inverter" && entrada.sentido !== undefined && entrada.sentido !== null) {
      const sentido = Number(entrada.sentido);
      if (![0, 1, -1].includes(sentido)) {
        return { ok: false, motivo: `Sentido inválido: ${entrada.sentido}` };
      }
      muda.sentido = sentido;
    }
    if (entrada.id != null) muda.id = String(entrada.id);
    return { ok: true, mudanca: muda };
  }

  if (tipo === "adicionarLigacao") {
    const motivo = exigirCampos(entrada, ["de", "para"]);
    if (motivo) return { ok: false, motivo };
    const comprimento = Number(entrada.comprimento);
    const velocidade = Number(entrada.velocidade ?? 10);
    if (!(comprimento > 0) || !Number.isFinite(comprimento)) {
      return { ok: false, motivo: "adicionarLigacao: comprimento deve ser positivo" };
    }
    if (!(velocidade > 0) || !Number.isFinite(velocidade)) {
      return { ok: false, motivo: "adicionarLigacao: velocidade deve ser positiva (m/s)" };
    }
    const sentido = entrada.sentido === undefined || entrada.sentido === null ? 0 : Number(entrada.sentido);
    if (![0, 1, -1].includes(sentido)) {
      return { ok: false, motivo: `adicionarLigacao: sentido inválido (${entrada.sentido})` };
    }
    const muda = {
      tipo,
      de: String(entrada.de),
      para: String(entrada.para),
      comprimento,
      velocidade,
      sentido,
    };
    if (entrada.id != null) muda.id = String(entrada.id);
    if (entrada.nome != null) muda.nome = String(entrada.nome);
    if (entrada.geometria) muda.geometria = clonarGeometria(entrada.geometria);
    if (Array.isArray(entrada.pontos)) muda.pontos = entrada.pontos.map((p) => [...p]);
    return { ok: true, mudanca: muda };
  }

  // lombada | semaforo
  const motivo = exigirCampos(entrada, ["trechoId", "distancia"]);
  if (motivo) return { ok: false, motivo };
  const distancia = Number(entrada.distancia);
  if (!Number.isFinite(distancia) || distancia < 0) {
    return { ok: false, motivo: `${tipo}: distancia inválida` };
  }
  const muda = {
    tipo,
    trechoId: String(entrada.trechoId),
    distancia,
  };
  if (entrada.id != null) muda.id = String(entrada.id);
  if (entrada.fracao != null) muda.fracao = Number(entrada.fracao);
  if (entrada.coordenadas) muda.coordenadas = [...entrada.coordenadas];
  if (tipo === "lombada") {
    if (entrada.velocidadeMaxKmh != null) muda.velocidadeMaxKmh = Number(entrada.velocidadeMaxKmh);
    if (entrada.raioEfeito != null) muda.raioEfeito = Number(entrada.raioEfeito);
  } else {
    if (entrada.estadoInicial != null) muda.estadoInicial = String(entrada.estadoInicial);
    if (entrada.sentido != null) muda.sentido = String(entrada.sentido);
    if (entrada.tempos && ehObjeto(entrada.tempos)) {
      muda.tempos = {
        ...(entrada.tempos.verde != null ? { verde: Number(entrada.tempos.verde) } : {}),
        ...(entrada.tempos.amarelo != null ? { amarelo: Number(entrada.tempos.amarelo) } : {}),
        ...(entrada.tempos.vermelho != null ? { vermelho: Number(entrada.tempos.vermelho) } : {}),
      };
    }
  }
  return { ok: true, mudanca: muda };
}

export function serializarMudanca(mudanca) {
  const { ok, motivo, mudanca: canonica } = normalizarMudanca(mudanca);
  if (!ok) throw new TypeError(motivo);
  return canonica;
}

export function desserializarMudanca(json) {
  const entrada = typeof json === "string" ? JSON.parse(json) : json;
  const { ok, motivo, mudanca } = normalizarMudanca(entrada);
  if (!ok) throw new TypeError(motivo);
  return mudanca;
}

export function serializarLista(mudancas) {
  return mudancas.map((m) => serializarMudanca(m));
}

export function desserializarLista(json) {
  const lista = typeof json === "string" ? JSON.parse(json) : json;
  if (!Array.isArray(lista)) throw new TypeError("Lista de mudanças deve ser um array");
  return lista.map((m) => desserializarMudanca(m));
}

function snapshotPesos(grafo, trechoId) {
  const trecho = grafo.trechos.get(trechoId);
  if (!trecho) return null;
  return Object.fromEntries(trecho.arestas.map((id) => [id, grafo.arestas.get(id).peso]));
}

function restaurarPesos(grafo, pesos) {
  for (const [id, peso] of Object.entries(pesos)) {
    const aresta = grafo.arestas.get(id);
    if (aresta) aresta.peso = peso;
  }
}

function geometriaPadraoLigacao(de, para, comprimento, nos) {
  const a = nos.get(de);
  const b = nos.get(para);
  const p0 = a?.lat != null && a?.lon != null ? [a.lat, a.lon] : [0, 0];
  const p1 = b?.lat != null && b?.lon != null ? [b.lat, b.lon] : [0, comprimento / 111320];
  return {
    pontos: [p0, p1],
    acumulado: [0, comprimento],
    comprimento,
  };
}

function removerTrechoDoGrafo(grafo, trechoId) {
  const trecho = grafo.trechos.get(trechoId);
  if (!trecho) return false;
  for (const id of [...trecho.arestas]) {
    const aresta = grafo.arestas.get(id);
    if (!aresta) continue;
    const saidas = grafo.saidas.get(aresta.de);
    if (saidas) grafo.saidas.set(aresta.de, saidas.filter((x) => x !== id));
    const entradas = grafo.entradas.get(aresta.para);
    if (entradas) grafo.entradas.set(aresta.para, entradas.filter((x) => x !== id));
    grafo.arestas.delete(id);
  }
  grafo.trechos.delete(trechoId);
  return true;
}

function aplicarBloquear(estado, mudanca) {
  const { grafo } = estado;
  if (!grafo.trechos.has(mudanca.trechoId)) {
    return { ok: false, motivo: `Trecho inexistente: ${mudanca.trechoId}` };
  }
  const trecho = grafo.trechos.get(mudanca.trechoId);
  if (trecho.bloqueado) {
    return { ok: false, motivo: `Trecho já bloqueado: ${mudanca.trechoId}` };
  }
  const pesosAntes = snapshotPesos(grafo, mudanca.trechoId);
  const ok = grafo.bloquearTrecho(mudanca.trechoId);
  if (!ok) return { ok: false, motivo: `Falha ao bloquear ${mudanca.trechoId}` };
  return {
    ok: true,
    undo: { tipo: "bloquear", trechoId: mudanca.trechoId, pesosAntes },
  };
}

function reverterBloquear(estado, undo) {
  const { grafo } = estado;
  const trecho = grafo.trechos.get(undo.trechoId);
  if (!trecho) return { ok: false, motivo: `Trecho inexistente: ${undo.trechoId}` };
  if (!trecho.bloqueado) {
    // Já desbloqueado — restaura pesos se fornecidos e considera ok.
    if (undo.pesosAntes) restaurarPesos(grafo, undo.pesosAntes);
    return { ok: true };
  }
  const ok = grafo.desbloquearTrecho(undo.trechoId);
  if (!ok) return { ok: false, motivo: `Falha ao desbloquear ${undo.trechoId}` };
  return { ok: true };
}

function aplicarInverter(estado, mudanca) {
  const { grafo } = estado;
  if (!grafo.trechos.has(mudanca.trechoId)) {
    return { ok: false, motivo: `Trecho inexistente: ${mudanca.trechoId}` };
  }
  const trecho = grafo.trechos.get(mudanca.trechoId);
  if (trecho.bloqueado) {
    return { ok: false, motivo: `Não é possível inverter trecho bloqueado: ${mudanca.trechoId}` };
  }
  const sentidoAnterior = trecho.sentido;
  const arestasAntes = [...trecho.arestas];
  let ok;
  if (mudanca.sentido !== undefined) {
    if (sentidoAnterior === mudanca.sentido) {
      return { ok: false, motivo: `Trecho ${mudanca.trechoId} já está no sentido ${mudanca.sentido}` };
    }
    try {
      ok = grafo.definirSentido(mudanca.trechoId, mudanca.sentido);
    } catch (erro) {
      return { ok: false, motivo: erro.message };
    }
  } else {
    ok = grafo.inverterSentido(mudanca.trechoId);
  }
  if (!ok) return { ok: false, motivo: `Falha ao inverter ${mudanca.trechoId}` };
  const arestasDepois = [...grafo.trechos.get(mudanca.trechoId).arestas];
  const arestasCriadas = arestasDepois.filter((id) => !arestasAntes.includes(id));
  return {
    ok: true,
    undo: {
      tipo: "inverter",
      trechoId: mudanca.trechoId,
      sentidoAnterior,
      arestasCriadas,
    },
  };
}

function reverterInverter(estado, undo) {
  const { grafo } = estado;
  const trecho = grafo.trechos.get(undo.trechoId);
  if (!trecho) return { ok: false, motivo: `Trecho inexistente: ${undo.trechoId}` };
  if (trecho.bloqueado) {
    // Desbloqueia temporariamente para restaurar sentido, depois rebloqueia.
    grafo.desbloquearTrecho(undo.trechoId);
    try {
      grafo.definirSentido(undo.trechoId, undo.sentidoAnterior);
    } catch (erro) {
      return { ok: false, motivo: erro.message };
    }
    grafo.bloquearTrecho(undo.trechoId);
    return { ok: true };
  }
  try {
    const mudou = grafo.definirSentido(undo.trechoId, undo.sentidoAnterior);
    if (!mudou && grafo.sentidoDoTrecho(undo.trechoId) !== undo.sentidoAnterior) {
      return { ok: false, motivo: `Não restaurou sentido de ${undo.trechoId}` };
    }
  } catch (erro) {
    return { ok: false, motivo: erro.message };
  }
  // Arestas criadas sob demanda (#garantirParDeArestas) permanecem — inofensivas
  // e batem o comportamento do motor ao inverter mão única.
  return { ok: true };
}

function aplicarAdicionarLigacao(estado, mudanca) {
  const { grafo } = estado;
  const trechoId = mudanca.id ?? `ligacao-${grafo.trechos.size + 1}`;
  if (grafo.trechos.has(trechoId)) {
    return { ok: false, motivo: `Trecho já existe: ${trechoId}` };
  }
  if (mudanca.de === mudanca.para) {
    return { ok: false, motivo: "adicionarLigacao: de e para devem ser distintos" };
  }

  const nosAntes = new Set(grafo.nos.keys());
  const comprimento = mudanca.comprimento;
  const velocidade = mudanca.velocidade;
  const peso = comprimento / velocidade;
  const sentido = mudanca.sentido;
  const geoBase =
    mudanca.geometria ??
    (mudanca.pontos
      ? {
          pontos: mudanca.pontos,
          acumulado: [0, comprimento],
          comprimento,
        }
      : geometriaPadraoLigacao(mudanca.de, mudanca.para, comprimento, grafo.nos));
  const geoInversa = {
    pontos: [...geoBase.pontos].reverse(),
    acumulado: [...(geoBase.acumulado ?? [0, comprimento])],
    comprimento,
  };

  const arestas = [];
  const baseAresta = {
    trechoId,
    comprimento,
    velocidade,
    peso,
  };

  if (sentido === 0 || sentido === 1) {
    grafo.adicionarAresta({
      ...baseAresta,
      id: `${trechoId}>`,
      de: mudanca.de,
      para: mudanca.para,
      geometria: clonarGeometria(geoBase),
    });
    arestas.push(`${trechoId}>`);
  }
  if (sentido === 0 || sentido === -1) {
    grafo.adicionarAresta({
      ...baseAresta,
      id: `${trechoId}<`,
      de: mudanca.para,
      para: mudanca.de,
      geometria: clonarGeometria(geoInversa),
    });
    arestas.push(`${trechoId}<`);
  }

  grafo.adicionarTrecho({
    id: trechoId,
    arestas,
    sentido,
    permiteDuplo: sentido === 0,
    nome: mudanca.nome ?? null,
    comprimento,
    pontos: geoBase.pontos,
    extremidades: [mudanca.de, mudanca.para],
  });

  const nosCriados = [...grafo.nos.keys()].filter((id) => !nosAntes.has(id));
  return {
    ok: true,
    undo: { tipo: "adicionarLigacao", trechoId, nosCriados },
    resultado: { trechoId },
  };
}

function reverterAdicionarLigacao(estado, undo) {
  const { grafo } = estado;
  if (!removerTrechoDoGrafo(grafo, undo.trechoId)) {
    return { ok: false, motivo: `Ligação inexistente: ${undo.trechoId}` };
  }
  for (const noId of undo.nosCriados ?? []) {
    const saidas = grafo.saidas.get(noId) ?? [];
    const entradas = grafo.entradas.get(noId) ?? [];
    if (saidas.length === 0 && entradas.length === 0) {
      grafo.nos.delete(noId);
      grafo.saidas.delete(noId);
      grafo.entradas.delete(noId);
    }
  }
  return { ok: true };
}

function exigirDispositivos(estado, tipo) {
  if (!(estado.dispositivos instanceof GerenciadorDispositivos)) {
    return {
      ok: false,
      motivo: `${tipo} requer estado.dispositivos (GerenciadorDispositivos)`,
    };
  }
  return null;
}

function aplicarLombada(estado, mudanca) {
  const falta = exigirDispositivos(estado, "lombada");
  if (falta) return falta;
  if (!estado.grafo.trechos.has(mudanca.trechoId)) {
    return { ok: false, motivo: `Trecho inexistente: ${mudanca.trechoId}` };
  }
  if (mudanca.id && estado.dispositivos.obter(mudanca.id)) {
    return { ok: false, motivo: `Dispositivo já existe: ${mudanca.id}` };
  }
  const lombada = estado.dispositivos.adicionarLombada({
    id: mudanca.id,
    trechoId: mudanca.trechoId,
    distancia: mudanca.distancia,
    fracao: mudanca.fracao,
    coordenadas: mudanca.coordenadas,
    velocidadeMaxKmh: mudanca.velocidadeMaxKmh,
    raioEfeito: mudanca.raioEfeito,
  });
  return {
    ok: true,
    undo: { tipo: "lombada", dispositivoId: lombada.id },
    resultado: { dispositivoId: lombada.id },
  };
}

function aplicarSemaforo(estado, mudanca) {
  const falta = exigirDispositivos(estado, "semaforo");
  if (falta) return falta;
  if (!estado.grafo.trechos.has(mudanca.trechoId)) {
    return { ok: false, motivo: `Trecho inexistente: ${mudanca.trechoId}` };
  }
  if (mudanca.id && estado.dispositivos.obter(mudanca.id)) {
    return { ok: false, motivo: `Dispositivo já existe: ${mudanca.id}` };
  }
  const semaforo = estado.dispositivos.adicionarSemaforo({
    id: mudanca.id,
    trechoId: mudanca.trechoId,
    distancia: mudanca.distancia,
    fracao: mudanca.fracao,
    coordenadas: mudanca.coordenadas,
    estadoInicial: mudanca.estadoInicial,
    tempos: mudanca.tempos,
    sentido: mudanca.sentido,
  });
  return {
    ok: true,
    undo: { tipo: "semaforo", dispositivoId: semaforo.id },
    resultado: { dispositivoId: semaforo.id },
  };
}

function reverterDispositivo(estado, undo) {
  const falta = exigirDispositivos(estado, undo.tipo);
  if (falta) return falta;
  const ok = estado.dispositivos.removerDispositivo(undo.dispositivoId);
  if (!ok) return { ok: false, motivo: `Dispositivo inexistente: ${undo.dispositivoId}` };
  return { ok: true };
}

/**
 * Aplica uma mudança in-place. Devolve token `undo` para `reverter`.
 * @returns {{ ok: boolean, motivo?: string, undo?: object, mudanca?: object, resultado?: object }}
 */
export function aplicar(grafoOuEstado, mudancaEntrada) {
  const validacao = normalizarMudanca(mudancaEntrada);
  if (!validacao.ok) return { ok: false, motivo: validacao.motivo };
  const mudanca = validacao.mudanca;
  const estado = normalizarEstado(grafoOuEstado);

  let saida;
  switch (mudanca.tipo) {
    case "bloquear":
      saida = aplicarBloquear(estado, mudanca);
      break;
    case "inverter":
      saida = aplicarInverter(estado, mudanca);
      break;
    case "adicionarLigacao":
      saida = aplicarAdicionarLigacao(estado, mudanca);
      break;
    case "lombada":
      saida = aplicarLombada(estado, mudanca);
      break;
    case "semaforo":
      saida = aplicarSemaforo(estado, mudanca);
      break;
    default:
      saida = { ok: false, motivo: `Tipo não suportado: ${mudanca.tipo}` };
  }
  if (!saida.ok) return saida;
  return { ok: true, mudanca, undo: saida.undo, resultado: saida.resultado };
}

/** Desfaz o efeito de um `aplicar` bem-sucedido (usa o token `undo`). */
export function reverter(grafoOuEstado, undo) {
  if (!ehObjeto(undo) || !TIPOS.has(undo.tipo)) {
    return { ok: false, motivo: "Token de reversão inválido" };
  }
  const estado = normalizarEstado(grafoOuEstado);
  switch (undo.tipo) {
    case "bloquear":
      return reverterBloquear(estado, undo);
    case "inverter":
      return reverterInverter(estado, undo);
    case "adicionarLigacao":
      return reverterAdicionarLigacao(estado, undo);
    case "lombada":
    case "semaforo":
      return reverterDispositivo(estado, undo);
    default:
      return { ok: false, motivo: `Tipo de undo não suportado: ${undo.tipo}` };
  }
}

/**
 * Aplica várias mudanças in-place, empilhando undos.
 * Em falha, reverte o que já tinha sido aplicado nesta chamada.
 */
export function aplicarLista(grafoOuEstado, mudancas) {
  const estado = normalizarEstado(grafoOuEstado);
  const undos = [];
  const aplicadas = [];
  const resultados = [];

  for (let i = 0; i < mudancas.length; i++) {
    const r = aplicar(estado, mudancas[i]);
    if (!r.ok) {
      for (let j = undos.length - 1; j >= 0; j--) {
        reverter(estado, undos[j]);
      }
      return {
        ok: false,
        motivo: r.motivo,
        indice: i,
        aplicadas: [],
        undos: [],
      };
    }
    undos.push(r.undo);
    aplicadas.push(r.mudanca);
    resultados.push(r.resultado ?? null);
  }
  return { ok: true, aplicadas, undos, resultados };
}

/** Reverte undos na ordem inversa (LIFO). */
export function reverterLista(grafoOuEstado, undos) {
  const estado = normalizarEstado(grafoOuEstado);
  for (let i = undos.length - 1; i >= 0; i--) {
    const r = reverter(estado, undos[i]);
    if (!r.ok) return { ok: false, motivo: r.motivo, indice: i };
  }
  return { ok: true };
}

/**
 * Padrão imutável: clona o estado, aplica a lista e devolve a cópia.
 * O original não é alterado.
 */
export function aplicarEmCopia(grafoOuEstado, mudancas) {
  const estado = clonarEstado(grafoOuEstado);
  const lista = Array.isArray(mudancas) ? mudancas : [mudancas];
  const r = aplicarLista(estado, lista);
  if (!r.ok) {
    return { ok: false, motivo: r.motivo, indice: r.indice, estado: null };
  }
  return {
    ok: true,
    estado,
    aplicadas: r.aplicadas,
    undos: r.undos,
    resultados: r.resultados,
  };
}
