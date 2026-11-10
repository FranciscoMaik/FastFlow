// Regra de borda: um bloqueio só é aceito se nenhum veículo já presente na malha
// ficar sem rota de escape. Escape = conseguir voltar à malha principal (maior
// componente fortemente conexa calculada COM o bloqueio aplicado).
// Nada é alterado aqui: o bloqueio é avaliado de forma hipotética.
import { alcancaveis, maiorComponenteForte } from "./roteamento.js";

const TIPOS_VIA_ESTRUTURAL = new Set([
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
]);

function motivoInoperante(trecho) {
  if (trecho.meta.operacional === false) return "Via marcada como inoperante.";
  const tipo = String(trecho.meta.tipo ?? "").toLowerCase();
  if (tipo && !TIPOS_VIA_ESTRUTURAL.has(tipo)) {
    return `Via local ou não homologada para bloqueio (${tipo}).`;
  }
  return null;
}

// Calculada fora do loop de animação e refeita apenas quando a malha muda.
// Cada direção ativa do trecho precisa ter um caminho alternativo entre seus nós.
export function analisarElegibilidade(grafo) {
  const resultado = new Map();
  for (const trecho of grafo.trechos.values()) {
    if (trecho.bloqueado) {
      resultado.set(trecho.id, { permitido: false, motivo: "Este trecho já está bloqueado." });
      continue;
    }

    const motivo = motivoInoperante(trecho);
    if (motivo) {
      resultado.set(trecho.id, { permitido: false, motivo });
      continue;
    }

    const ignorar = new Set(trecho.arestas);
    const direcoesAtivas = trecho.arestas
      .map((id) => grafo.arestas.get(id))
      .filter((aresta) => aresta && Number.isFinite(aresta.peso));
    if (
      direcoesAtivas.length === 0 ||
      direcoesAtivas.some(
        (aresta) => !alcancaveis(grafo, [aresta.de], { ignorar }).has(aresta.para)
      )
    ) {
      resultado.set(trecho.id, {
        permitido: false,
        motivo: "Trecho terminal ou sem rota de escape/alternativa para os nós adjacentes.",
      });
      continue;
    }

    resultado.set(trecho.id, { permitido: true, motivo: null });
  }
  return resultado;
}

// `posicoes`: [{ id, no, arestaId }], onde `no` é o próximo nó que o veículo
// alcança (o fim da aresta em que ele está agora).
export function validarBloqueio(grafo, trechoId, posicoes, elegibilidade = analisarElegibilidade(grafo)) {
  const trecho = grafo.trechos.get(trechoId);
  if (!trecho) {
    return { permitido: false, motivo: "Trecho inexistente." };
  }
  if (trecho.bloqueado) {
    return { permitido: false, motivo: "Este trecho já está bloqueado." };
  }

  const ignorar = new Set(trecho.arestas);
  const principal = maiorComponenteForte(grafo, { ignorar });
  const conseguemVoltar = alcancaveis(grafo, principal, { ignorar, reverso: true });

  const veiculosNoTrecho = posicoes.filter((p) => ignorar.has(p.arestaId));
  const presos = posicoes.filter((p) => !conseguemVoltar.has(p.no));

  if (presos.length > 0) {
    const presosNoTrecho = presos.filter((p) => ignorar.has(p.arestaId)).length;
    const quantos = presos.length === 1 ? "1 veículo ficaria" : `${presos.length} veículos ficariam`;
    const onde =
      presosNoTrecho > 0
        ? `${presosNoTrecho} no próprio trecho, sem saída após a interdição`
        : "a região em que estão ficaria isolada da malha";
    return {
      permitido: false,
      motivo: `Bloqueio recusado: ${quantos} sem rota de escape (${onde}).`,
      veiculosPresos: presos.map((p) => p.id),
    };
  }

  const regra = elegibilidade.get(trechoId);
  if (regra && !regra.permitido) {
    return { permitido: false, motivo: `Bloqueio recusado: ${regra.motivo}` };
  }

  return { permitido: true, veiculosNoTrecho: veiculosNoTrecho.length };
}
