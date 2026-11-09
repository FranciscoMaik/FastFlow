// Painéis Base × Atual, Registro com impacto e Oportunidades (Indicadores / sentido).
import {
  texto,
  fmtNumero,
  fmtTempo,
  fmtDelta,
  fmtInt,
  fmtComparacao,
  rodapeAmostra,
} from "./previewImpactoFmt.js";

/**
 * @param {HTMLElement | null} raiz
 */
export function criarPainelBaseAtual(raiz) {
  if (!raiz) {
    return { limpar() {}, renderizar() {}, mostrarErro() {}, mostrarCarregando() {} };
  }

  const els = {
    tempo: raiz.querySelector("[data-base-atual='tempo']"),
    km: raiz.querySelector("[data-base-atual='km']"),
    retidos: raiz.querySelector("[data-base-atual='retidos']"),
    viagens: raiz.querySelector("[data-base-atual='viagens']"),
    rodape: raiz.querySelector("[data-base-atual='rodape']"),
  };

  function limpar() {
    raiz.dataset.estado = "vazio";
    texto(els.tempo, "—");
    texto(els.km, "—");
    texto(els.retidos, "—");
    texto(els.viagens, "—");
    texto(els.rodape, "Comparativo analítico · amostra fixa · sem efeito de congestionamento");
  }

  function mostrarCarregando() {
    raiz.dataset.estado = "carregando";
    texto(els.tempo, "…");
    texto(els.km, "…");
    texto(els.retidos, "…");
    texto(els.viagens, "…");
    texto(els.rodape, "Calculando Base × Atual…");
  }

  function mostrarErro(motivo) {
    raiz.dataset.estado = "erro";
    texto(els.tempo, motivo || "Falha ao comparar.");
    texto(els.km, "—");
    texto(els.retidos, "—");
    texto(els.viagens, "—");
    texto(els.rodape, "");
  }

  /**
   * @param {{ ok: true, resumo: object, avaliacao?: object } | { ok: false, motivo?: string }} resultado
   */
  function renderizar(resultado) {
    if (!resultado?.ok || !resultado.resumo) {
      mostrarErro(resultado?.motivo);
      return;
    }
    const { resumo, avaliacao } = resultado;
    raiz.dataset.estado = "pronto";

    const tempo = fmtComparacao(
      resumo.tempoMedioViagem.base,
      resumo.tempoMedioViagem.atual,
      resumo.tempoMedioViagem.delta,
      fmtTempo
    );
    texto(els.tempo, `${tempo.baseTxt} → ${tempo.cenTxt} · ${tempo.deltaTxt}`);

    const km = fmtComparacao(
      resumo.kmRodados.base,
      resumo.kmRodados.atual,
      resumo.kmRodados.delta,
      (v) => (v == null || Number.isNaN(v) ? "—" : `${fmtNumero(v)} km`)
    );
    texto(els.km, `${km.baseTxt} → ${km.cenTxt} · ${km.deltaTxt}`);

    const dRet = resumo.retidos.delta;
    const retDelta =
      dRet == null
        ? "—"
        : `${dRet > 0 ? "+" : dRet < 0 ? "−" : ""}${fmtInt(Math.abs(dRet))}`;
    texto(
      els.retidos,
      `${fmtInt(resumo.retidos.base)} → ${fmtInt(resumo.retidos.atual)} · ${retDelta}`
    );

    const dVia = resumo.viagensConcluidas.delta;
    const viaDelta =
      dVia == null
        ? "—"
        : `${dVia > 0 ? "+" : dVia < 0 ? "−" : ""}${fmtInt(Math.abs(dVia))}`;
    texto(
      els.viagens,
      `${fmtInt(resumo.viagensConcluidas.base)} → ${fmtInt(resumo.viagensConcluidas.atual)} · ${viaDelta}`
    );

    const n = avaliacao?.amostra?.tamanho ?? resumo.amostra?.tamanho;
    texto(els.rodape, n != null ? rodapeAmostra(n) : "Comparativo Base × Atual");
  }

  limpar();
  return { limpar, renderizar, mostrarErro, mostrarCarregando };
}

/** Texto curto de variação para a linha do registro. */
export function textoImpactoRegistro(impacto) {
  if (!impacto) return "";
  const partes = [];
  if (impacto.deltaTempo != null && !Number.isNaN(impacto.deltaTempo)) {
    partes.push(fmtDelta(impacto.deltaTempo, impacto.deltaTempoPct, { unidade: " s", digitos: 0 }));
  }
  if (impacto.viagensAfetadasPct != null && !Number.isNaN(impacto.viagensAfetadasPct)) {
    partes.push(`${fmtNumero(impacto.viagensAfetadasPct)}% viagens`);
  }
  return partes.join(" · ");
}

/**
 * @param {HTMLUListElement | null} ul
 * @param {HTMLElement | null} vazio
 * @param {Array<object>} itens
 * @param {{ aoDesfazer?: (id: string) => void }} [opcoes]
 */
export function renderizarRegistroImpacto(ul, vazio, itens, { aoDesfazer } = {}) {
  if (!ul) return;
  ul.replaceChildren(
    ...itens.map((item) => {
      const li = document.createElement("li");
      li.className = "log-sentido-item";
      if (item.desfeito) li.classList.add("log-sentido-desfeito");
      li.dataset.registroId = item.id;

      const corpo = document.createElement("div");
      corpo.className = "log-sentido-corpo";

      const principal = document.createElement("span");
      principal.className = "log-sentido-texto";
      principal.textContent = item.texto;
      corpo.appendChild(principal);

      const varTxt = textoImpactoRegistro(item.impacto);
      if (varTxt) {
        const varEl = document.createElement("span");
        varEl.className = "log-sentido-impacto";
        varEl.textContent = varTxt;
        corpo.appendChild(varEl);
      }

      li.appendChild(corpo);

      if (item.podeDesfazer && typeof aoDesfazer === "function") {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "botao botao-secundario botao-pequeno log-sentido-undo";
        btn.textContent = "Desfazer";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          aoDesfazer(item.id);
        });
        li.appendChild(btn);
      } else if (item.desfeito) {
        const tag = document.createElement("span");
        tag.className = "log-sentido-tag";
        tag.textContent = "Desfeita";
        li.appendChild(tag);
      }

      return li;
    })
  );
  if (vazio) vazio.hidden = itens.length > 0;
}

/**
 * @param {HTMLUListElement | null} ul
 * @param {HTMLElement | null} vazio
 * @param {{ ok?: boolean, itens?: Array<object>, motivo?: string }} resultado
 * @param {{ aoEscolher?: (trechoId: string) => void }} [opcoes]
 */
export function renderizarOportunidades(ul, vazio, resultado, { aoEscolher } = {}) {
  if (!ul) return;
  const itens = resultado?.ok ? resultado.itens ?? [] : [];
  ul.replaceChildren(
    ...itens.map((item) => {
      const li = document.createElement("li");
      li.className = "lista-oportunidades-item";

      const nome = document.createElement("button");
      nome.type = "button";
      nome.className = "lista-oportunidades-nome";
      nome.textContent = item.nome;
      if (typeof aoEscolher === "function") {
        nome.addEventListener("click", () => aoEscolher(item.trechoId));
      }

      const meta = document.createElement("span");
      meta.className = "lista-oportunidades-meta";
      const ganho = fmtTempo(item.ganhoTempo);
      const pct =
        item.viagensAfetadasPct == null
          ? ""
          : ` · ${fmtNumero(item.viagensAfetadasPct)}% viagens`;
      meta.textContent = `−${ganho}${pct}`;

      li.append(nome, meta);
      return li;
    })
  );
  if (vazio) {
    if (!resultado?.ok && resultado?.motivo) {
      vazio.hidden = false;
      vazio.textContent = resultado.motivo;
    } else {
      vazio.hidden = itens.length > 0;
      if (itens.length === 0) {
        vazio.textContent =
          "Nenhuma oportunidade com ganho de tempo na amostra (cap apertado).";
      }
    }
  }
}
