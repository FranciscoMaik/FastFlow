// Formatação compartilhada das prévias de impacto (inversão / bloqueio).

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const nfInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function texto(el, valor) {
  if (el) el.textContent = valor ?? "—";
}

export function fmtNumero(n, { digitos = 1, vazio = "—" } = {}) {
  if (n == null || Number.isNaN(n)) return vazio;
  if (!Number.isFinite(n)) return "∞";
  return (digitos === 0 ? nfInt : nf).format(n);
}

export function fmtDelta(absoluto, percentual, { unidade = "", digitos = 1 } = {}) {
  if (absoluto == null || Number.isNaN(absoluto)) return "—";
  const sinal = absoluto > 0 ? "+" : absoluto < 0 ? "−" : "";
  const absFmt = fmtNumero(Math.abs(absoluto), { digitos });
  const pct =
    percentual == null || Number.isNaN(percentual)
      ? ""
      : ` (${sinal}${fmtNumero(Math.abs(percentual), { digitos })}%)`;
  return `${sinal}${absFmt}${unidade}${pct}`;
}

export function fmtTempo(segundos) {
  if (segundos == null || Number.isNaN(segundos)) return "—";
  if (!Number.isFinite(segundos)) return "∞";
  if (Math.abs(segundos) >= 60) return `${fmtNumero(segundos / 60)} min`;
  return `${fmtNumero(segundos)} s`;
}

export function fmtDistancia(metros) {
  if (metros == null || Number.isNaN(metros)) return "—";
  if (Math.abs(metros) >= 1000) return `${fmtNumero(metros / 1000)} km`;
  return `${fmtNumero(metros, { digitos: 0 })} m`;
}

export function fmtComparacao(base, cenario, delta, formatador) {
  const baseTxt = formatador(base);
  const cenTxt = formatador(cenario);
  if (delta?.absoluto == null || Number.isNaN(delta.absoluto)) {
    return { baseTxt, cenTxt, deltaTxt: "—" };
  }
  const sinal = delta.absoluto > 0 ? "+" : delta.absoluto < 0 ? "−" : "";
  const absFmt = formatador(Math.abs(delta.absoluto));
  const pct =
    delta.percentual == null || Number.isNaN(delta.percentual)
      ? ""
      : ` (${sinal}${fmtNumero(Math.abs(delta.percentual))}%)`;
  return { baseTxt, cenTxt, deltaTxt: `${sinal}${absFmt}${pct}` };
}

export function fmtInt(n) {
  return nfInt.format(n);
}

/**
 * Rótulo curto do perfil F1 no rodapé.
 * @param {string | null | undefined} periodo
 */
export function rotuloDemandaPeriodo(periodo) {
  if (periodo === "pico") return "demanda de pico";
  if (periodo === "foraPico") return "demanda fora de pico";
  return "demanda estimada";
}

/**
 * Rodapé das prévias F2.
 * @param {number} tamanho
 * @param {{
 *   bprSimulacao?: boolean,
 *   bprAnalitico?: boolean,
 *   periodo?: string | null,
 * }} [opcoes]
 *   `bprAnalitico` = passagem BPR sobre fluxo OD na prévia (aproximada).
 *   `bprSimulacao` = simulação ao vivo com F4 ligado.
 */
export function rodapeAmostra(
  tamanho,
  { bprSimulacao = false, bprAnalitico = false, periodo = null } = {}
) {
  const base = `Prévia analítica · amostra de ${nfInt.format(tamanho)} viagens · ${rotuloDemandaPeriodo(periodo)}`;
  if (bprAnalitico) {
    return `${base} · BPR analítico aproximado (volumes da amostra OD; não substitui o tick ao vivo F4)`;
  }
  if (bprSimulacao) {
    return `${base} · prévia sem BPR dinâmico (na simulação ao vivo, congestionamento BPR está ativo)`;
  }
  return `${base} · sem congestionamento dinâmico (prévia F2)`;
}

/**
 * Aviso curto para cards de prévia quando o motor F4 está (ou não) ativo na simulação.
 * Com `bprAnalitico`, suaviza o “sem BPR dinâmico”.
 * @param {{
 *   bprSimulacao?: boolean,
 *   bprAnalitico?: boolean,
 *   contexto?: "dispositivo" | "ligacao" | "geral",
 * }} [opcoes]
 */
export function avisoPreviewSemBprDinamico({
  bprSimulacao = false,
  bprAnalitico = false,
  contexto = "geral",
} = {}) {
  if (bprAnalitico) {
    if (contexto === "ligacao") {
      return "Prévia analítica F2 com BPR aproximado (volumes OD). Paradoxo de Braess ainda não é modelado como equilíbrio dinâmico.";
    }
    if (contexto === "dispositivo") {
      return "Estimativa analítica com BPR aproximado (volumes OD). Na simulação ao vivo, congestionamento BPR e fuga de rota continuam ativos.";
    }
    return "Prévia analítica F2 com BPR aproximado (volumes da amostra OD). Não substitui o congestionamento ao vivo da simulação.";
  }
  if (contexto === "ligacao") {
    return bprSimulacao
      ? "Prévia analítica F2: sem BPR dinâmico nesta estimativa (paradoxo de Braess não modelado aqui). Na simulação ao vivo, congestionamento BPR está ativo."
      : "Prévia analítica F2: sem congestionamento dinâmico (paradoxo de Braess não modelado aqui).";
  }
  if (contexto === "dispositivo") {
    return bprSimulacao
      ? "Estimativa analítica (ajuste de tempo de travessia). Prévia sem BPR dinâmico — na simulação ao vivo, congestionamento BPR e fuga de rota estão ativos."
      : "Estimativa analítica (ajuste de tempo de travessia). Sem congestionamento dinâmico da simulação (prévia F2).";
  }
  return bprSimulacao
    ? "Prévia analítica F2: sem BPR dinâmico nesta estimativa. Na simulação ao vivo, congestionamento BPR está ativo."
    : "Prévia analítica F2: sem congestionamento dinâmico.";
}
