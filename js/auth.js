(function () {
  const sessionKey = "fastflow.session";
  const loginPath = "login.html";
  const allowedDestinations = /^pagina[123](?:\.html)?$/;
  const currentPath = window.location.pathname;
  const isLoginPage = /\/login(?:\.html)?$/.test(currentPath);

  function readSession() {
    const storedSession = window.localStorage.getItem(sessionKey);
    if (!storedSession) return null;

    let session;
    try {
      session = JSON.parse(storedSession);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      window.localStorage.removeItem(sessionKey);
      return null;
    }

    if (!session || session.authenticated !== true || typeof session.email !== "string") {
      return null;
    }
    return session;
  }

  function getDestination() {
    const requestedPath = new URLSearchParams(window.location.search).get("next") || "pagina1.html";
    const destination = new URL(requestedPath, window.location.href);
    const destinationName = destination.pathname.split("/").pop();
    if (destination.origin !== window.location.origin || !allowedDestinations.test(destinationName)) {
      return new URL("pagina1.html", window.location.href);
    }
    return destination;
  }

  function goToLogin(storageError) {
    const login = new URL(loginPath, window.location.href);
    const currentPage = currentPath.split("/").pop();
    login.searchParams.set("next", `${currentPage}${window.location.search}${window.location.hash}`);
    if (storageError) login.searchParams.set("storageError", "1");
    window.location.replace(login.href);
  }

  let session = null;
  let storageAvailable = true;
  try {
    session = readSession();
  } catch (error) {
    storageAvailable = false;
    console.error("Não foi possível acessar o armazenamento da sessão.", error);
  }

  if (isLoginPage && session) {
    window.location.replace(getDestination().href);
    return;
  }

  if (!isLoginPage && (!session || !storageAvailable)) {
    goToLogin(!storageAvailable);
    return;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("login-form");
    if (form) initializeLogin(form, storageAvailable);

    document.querySelectorAll("[data-logout]").forEach(function (button) {
      button.addEventListener("click", function () {
        try {
          window.localStorage.removeItem(sessionKey);
          window.location.replace(new URL(loginPath, window.location.href).href);
        } catch (error) {
          console.error("Não foi possível encerrar a sessão.", error);
          const feedback = document.getElementById("session-feedback");
          if (feedback) feedback.textContent = "Não foi possível encerrar a sessão neste navegador.";
        }
      });
    });
  });

  function initializeLogin(form, canUseStorage) {
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const feedback = document.getElementById("login-feedback");
    const submitButton = document.getElementById("login-submit");
    const fillButton = document.getElementById("login-preencher");
    const demoEmail = document.getElementById("demo-email");
    const demoPassword = document.getElementById("demo-password");
    const config = window.FASTFLOW_AUTH_CONFIG;
    let isSubmitting = false;

    if (config && typeof config.email === "string" && typeof config.password === "string") {
      if (demoEmail) demoEmail.textContent = config.email;
      if (demoPassword) demoPassword.textContent = config.password;
    }

    if (fillButton) {
      fillButton.addEventListener("click", function () {
        if (!config || typeof config.email !== "string" || typeof config.password !== "string") {
          showError("A configuração de autenticação não está disponível. Contate a equipe responsável.");
          return;
        }
        emailInput.value = config.email;
        passwordInput.value = config.password;
        emailInput.removeAttribute("aria-invalid");
        passwordInput.removeAttribute("aria-invalid");
        feedback.textContent = "";
        feedback.hidden = true;
        emailInput.focus();
      });
    }

    if (!canUseStorage) {
      showError("O armazenamento de sessão está indisponível neste navegador. Habilite o armazenamento local e tente novamente.");
    } else if (new URLSearchParams(window.location.search).has("storageError")) {
      showError("Não foi possível acessar o armazenamento de sessão. Habilite o armazenamento local e tente novamente.");
    }

    [emailInput, passwordInput].forEach(function (input) {
      input.addEventListener("input", function () {
        input.removeAttribute("aria-invalid");
        feedback.textContent = "";
        feedback.hidden = true;
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (isSubmitting) return;

      emailInput.value = emailInput.value.trim();
      if (!emailInput.value) {
        showFieldError(emailInput, "Informe seu e-mail.");
        return;
      }
      if (!emailInput.validity.valid) {
        showFieldError(emailInput, "Informe um endereço de e-mail válido.");
        return;
      }
      if (!passwordInput.value) {
        showFieldError(passwordInput, "Informe sua senha.");
        return;
      }
      if (!config || typeof config.email !== "string" || typeof config.password !== "string") {
        showError("A configuração de autenticação não está disponível. Contate a equipe responsável.");
        return;
      }

      isSubmitting = true;
      submitButton.disabled = true;
      submitButton.textContent = "Validando...";
      feedback.hidden = true;

      window.setTimeout(function () {
        const credentialsMatch =
          emailInput.value.toLowerCase() === config.email.toLowerCase() &&
          passwordInput.value === config.password;

        if (!credentialsMatch) {
          isSubmitting = false;
          submitButton.disabled = false;
          submitButton.textContent = "Entrar";
          passwordInput.value = "";
          showError("E-mail ou senha inválidos. Confira seus dados e tente novamente.");
          passwordInput.focus();
          return;
        }

        try {
          window.localStorage.setItem(sessionKey, JSON.stringify({
            authenticated: true,
            email: emailInput.value,
            createdAt: new Date().toISOString()
          }));
          window.location.replace(getDestination().href);
        } catch (error) {
          console.error("Não foi possível salvar a sessão.", error);
          isSubmitting = false;
          submitButton.disabled = false;
          submitButton.textContent = "Entrar";
          showError("Não foi possível iniciar sua sessão neste navegador. Habilite o armazenamento local e tente novamente.");
        }
      }, 350);
    });

    function showFieldError(input, message) {
      input.setAttribute("aria-invalid", "true");
      showError(message);
      input.focus();
    }

    function showError(message) {
      feedback.textContent = message;
      feedback.hidden = false;
      feedback.setAttribute("role", "alert");
    }
  }
})();
