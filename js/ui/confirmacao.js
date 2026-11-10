// Diálogo de confirmação e toast com desfazer (ações destrutivas).

let toastAtual = null;

export function confirmar({
  titulo,
  mensagem,
  confirmarTexto = "Confirmar",
  cancelarTexto = "Cancelar",
  perigo = false,
} = {}) {
  return new Promise((resolve) => {
    const dialogo = document.createElement("dialog");
    dialogo.className = "dialogo-confirmacao";
    dialogo.setAttribute("aria-labelledby", "dialogo-titulo");
    dialogo.setAttribute("aria-describedby", "dialogo-mensagem");

    dialogo.innerHTML = `
      <form method="dialog" class="dialogo-confirmacao-corpo">
        <h2 id="dialogo-titulo" class="dialogo-titulo"></h2>
        <p id="dialogo-mensagem" class="dialogo-mensagem"></p>
        <div class="dialogo-acoes">
          <button type="submit" value="cancelar" class="botao botao-secundario" data-acao="cancelar"></button>
          <button type="submit" value="confirmar" class="botao ${perigo ? "botao-bloquear" : "botao-primario"}" data-acao="confirmar"></button>
        </div>
      </form>
    `;

    dialogo.querySelector("#dialogo-titulo").textContent = titulo ?? "Confirmar ação";
    dialogo.querySelector("#dialogo-mensagem").textContent = mensagem ?? "";
    dialogo.querySelector('[data-acao="cancelar"]').textContent = cancelarTexto;
    dialogo.querySelector('[data-acao="confirmar"]').textContent = confirmarTexto;

    function encerrar(resultado) {
      dialogo.close();
      dialogo.remove();
      resolve(resultado);
    }

    dialogo.addEventListener("cancel", (e) => {
      e.preventDefault();
      encerrar(false);
    });

    dialogo.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const acao = e.submitter?.dataset?.acao ?? "cancelar";
      encerrar(acao === "confirmar");
    });

    document.body.appendChild(dialogo);
    dialogo.showModal();
    dialogo.querySelector('[data-acao="cancelar"]').focus();
  });
}

export function oferecerDesfazer({
  mensagem,
  aoDesfazer,
  tempoMs = 12000,
  host = document.body,
} = {}) {
  toastAtual?.descartar();

  const toast = document.createElement("div");
  toast.className = "toast-desfazer";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  const texto = document.createElement("span");
  texto.textContent = mensagem;

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "botao botao-secundario botao-pequeno";
  botao.textContent = "Desfazer";

  toast.append(texto, botao);
  host.appendChild(toast);

  let ativo = true;
  const timer = window.setTimeout(() => descartar(), tempoMs);

  function descartar() {
    if (!ativo) return;
    ativo = false;
    window.clearTimeout(timer);
    toast.remove();
    if (toastAtual === api) toastAtual = null;
  }

  botao.addEventListener("click", () => {
    if (!ativo) return;
    descartar();
    aoDesfazer?.();
  });

  const api = { descartar };
  toastAtual = api;
  return api;
}
