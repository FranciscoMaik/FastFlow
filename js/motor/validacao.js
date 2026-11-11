// Regra de borda: um bloqueio só é aceito se nenhum veículo já presente na malha
// ficar sem rota de escape. Escape = conseguir voltar à malha principal (maior
// componente fortemente conexa calculada COM o bloqueio aplicado) ou deixar a área
// por uma saída real (fim de uma pista que segue para fora, como uma rodovia).
// A regra protege quem está na malha principal. O tráfego de passagem que ainda
// não entrou nela (por exemplo, numa rodovia que vem de fora da área) não impede
// o bloqueio: atrás da interdição ele forma fila (veículos retidos), como numa
// interdição real de rodovia — é o estrangulamento que o operador quer observar.
// Nada é alterado aqui: o bloqueio é avaliado de forma hipotética.
import { alcancaveis, maiorComponenteForte, portoesDaMalha } from "./roteamento.js";

const TIPOS_VIA_ESTRUTURAL = new Set([
  "motorway",
  "motorway_link",
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

    // Rodovias e alças podem ser interditadas sem desvio local: quem já passou
    // da última saída forma fila (regra de tráfego de passagem).
    const tipo = String(trecho.meta.tipo ?? "").toLowerCase();
    const exigeAlternativa = tipo !== "motorway" && tipo !== "motorway_link";
    const ignorar = new Set(trecho.arestas);
    const direcoesAtivas = trecho.arestas
      .map((id) => grafo.arestas.get(id))
      .filter((aresta) => aresta && Number.isFinite(aresta.peso));
    if (
      direcoesAtivas.length === 0 ||
      (exigeAlternativa &&
        direcoesAtivas.some(
          (aresta) => !alcancaveis(grafo, [aresta.de], { ignorar }).has(aresta.para)
        ))
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
  const principalAntes = maiorComponenteForte(grafo);
  const principalDepois = maiorComponenteForte(grafo, { ignorar });
  // Escape = voltar à malha principal ou deixar a área por uma saída real.
  const { sumidouros } = portoesDaMalha(grafo);
  const conseguemSair = alcancaveis(grafo, [...principalDepois, ...sumidouros], { ignorar, reverso: true });

  const veiculosNoTrecho = posicoes.filter((p) => ignorar.has(p.arestaId));
  const presos = posicoes.filter((p) => principalAntes.has(p.no) && !conseguemSair.has(p.no));

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
