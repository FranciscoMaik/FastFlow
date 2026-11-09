// Diálogo de parâmetros da nova ligação (mão + velocidade).

/**
 * @param {{
 *   comprimento: number,
 *   de: string,
 *   para: string,
 *   sentidoPadrao?: 0|1|-1,
 *   velocidadeKmhPadrao?: number,
 * }} opcoes
 * @returns {Promise<null | { sentido: 0|1|-1, velocidadeKmh: number }>}
 */
export function solicitarParametrosLigacao({
  comprimento,
  de,
  para,
  sentidoPadrao = 0,
  velocidadeKmhPadrao = 40,
} = {}) {
  return new Promise((resolve) => {
    const dialogo = document.createElement("dialog");
    dialogo.className = "dialogo-confirmacao dialogo-ligacao";
    dialogo.setAttribute("aria-labelledby", "dialogo-lig-titulo");

    const compTxt =
      comprimento >= 1000
        ? `${(comprimento / 1000).toFixed(2)} km`
        : `${Math.round(comprimento)} m`;

    dialogo.innerHTML = `
      <form method="dialog" class="dialogo-confirmacao-corpo">
        <h2 id="dialogo-lig-titulo" class="dialogo-titulo">Nova ligação viária</h2>
        <p class="dialogo-mensagem">
          Interseções <strong>${de}</strong> → <strong>${para}</strong>
          · comprimento estimado <strong>${compTxt}</strong>
        </p>
        <fieldset class="dialogo-campo">
          <legend>Sentido</legend>
          <label class="dialogo-opcao">
            <input type="radio" name="sentido" value="0" />
            Mão dupla
          </label>
          <label class="dialogo-opcao">
            <input type="radio" name="sentido" value="1" />
            Mão única (1ª → 2ª)
          </label>
        </fieldset>
        <label class="dialogo-campo">
          <span>Velocidade (km/h)</span>
          <select name="velocidade" class="dialogo-select">
            <option value="30">30</option>
            <option value="40">40</option>
            <option value="50">50</option>
            <option value="60">60</option>
          </select>
        </label>
        <div class="dialogo-acoes">
          <button type="submit" value="cancelar" class="botao botao-secundario" data-acao="cancelar">Cancelar</button>
          <button type="submit" value="confirmar" class="botao botao-primario" data-acao="confirmar">Pré-visualizar</button>
        </div>
      </form>
    `;

    const form = dialogo.querySelector("form");
    const sentidoAlvo = String(sentidoPadrao === -1 ? 1 : sentidoPadrao);
    const radio = form.querySelector(`input[name="sentido"][value="${sentidoAlvo}"]`);
    if (radio) radio.checked = true;
    else form.querySelector('input[name="sentido"][value="0"]').checked = true;

    const sel = form.querySelector('select[name="velocidade"]');
    const vel = String(velocidadeKmhPadrao);
    if ([...sel.options].some((o) => o.value === vel)) sel.value = vel;
    else sel.value = "40";

    function encerrar(resultado) {
      dialogo.close();
      dialogo.remove();
      resolve(resultado);
    }

    dialogo.addEventListener("cancel", (e) => {
      e.preventDefault();
      encerrar(null);
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const acao = e.submitter?.dataset?.acao ?? "cancelar";
      if (acao !== "confirmar") {
        encerrar(null);
        return;
      }
      const sentido = Number(form.querySelector('input[name="sentido"]:checked')?.value ?? 0);
      const velocidadeKmh = Number(sel.value);
      encerrar({
        sentido: sentido === 0 ? 0 : 1,
        velocidadeKmh: Number.isFinite(velocidadeKmh) && velocidadeKmh > 0 ? velocidadeKmh : 40,
      });
    });

    document.body.appendChild(dialogo);
    dialogo.showModal();
    form.querySelector('[data-acao="cancelar"]').focus();
  });
}
