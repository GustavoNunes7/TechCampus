// Login TechCampus: integração com a API Node.js (modelo Projeto-Pizzaria).
(() => {
  const form = document.getElementById("loginForm");
  const forgot = document.getElementById("forgotPasswordLink");
  const back = document.getElementById("backToLogin");
  const recovery = document.getElementById("forgotPasswordForm");
  const loginSection = document.getElementById("loginSection");
  const forgotSection = document.getElementById("forgotPasswordSection");
  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.className = "mt-3";
  form.appendChild(message);
  forgot.addEventListener("click", (e) => {
    e.preventDefault();
    loginSection.hidden = true;
    forgotSection.hidden = false;
  });
  back.addEventListener("click", (e) => {
    e.preventDefault();
    forgotSection.hidden = true;
    loginSection.hidden = false;
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message.textContent = "Validando...";
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.getElementById("email").value.trim(),
          senha: document.getElementById("senha").value,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.token)
        throw new Error(data.erro || "Não foi possível entrar.");
      sessionStorage.setItem("techcampus_token", data.token);
      sessionStorage.setItem(
        "techcampus_usuario",
        JSON.stringify(data.usuario),
      );

      sessionStorage.setItem("techcampus_token", data.token);
sessionStorage.setItem(
  "techcampus_usuario",
  JSON.stringify(data.usuario),
);

if (data.usuario.papel === "admin") {
  location.replace("/frontend/admin.html");
} else {
  location.replace("/frontend/sistema.html");
}
      
    } catch (err) {
      message.textContent = err.message || "Falha de conexão com o servidor.";
    } finally {
      button.disabled = false;
    }
  });
  recovery.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = recovery.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const response = await fetch("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.getElementById("recoveryEmail").value.trim(),
        }),
      });
      const data = await response.json();
      alert(
        data.mensagem || data.erro || "Não foi possível solicitar recuperação.",
      );
    } catch {
      alert("Erro de conexão.");
    } finally {
      button.disabled = false;
    }
  });
})();

// ==========================================
// MOSTRAR / OCULTAR SENHA
// ==========================================
const togglePassword = document.getElementById("togglePassword");
const senha = document.getElementById("senha");

if (togglePassword && senha) {
  togglePassword.addEventListener("click", () => {
    const mostrandoSenha = senha.type === "text";

    senha.type = mostrandoSenha ? "password" : "text";

    const icon = togglePassword.querySelector("i");

    if (icon) {
      icon.classList.toggle("bi-eye", mostrandoSenha);
      icon.classList.toggle("bi-eye-slash", !mostrandoSenha);
    }

    togglePassword.setAttribute(
      "aria-label",
      mostrandoSenha ? "Mostrar senha" : "Ocultar senha"
    );
  });
}
