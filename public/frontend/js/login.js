// Login TechCampus: autenticação e recuperação de senha por link seguro.
(() => {
  const form = document.getElementById("loginForm");
  const forgot = document.getElementById("forgotPasswordLink");
  const back = document.getElementById("backToLogin");
  const recovery = document.getElementById("forgotPasswordForm");
  const resetForm = document.getElementById("resetPasswordForm");
  const loginSection = document.getElementById("loginSection");
  const forgotSection = document.getElementById("forgotPasswordSection");
  const resetSection = document.getElementById("resetPasswordSection");
  const message = document.createElement("p");
  message.setAttribute("role", "alert"); message.className = "mt-3"; form.appendChild(message);
  const params = new URLSearchParams(location.search);
  const resetToken = params.get("token");
  if (resetToken) { loginSection.hidden = true; forgotSection.hidden = true; resetSection.hidden = false; }
  forgot.addEventListener("click", (e) => { e.preventDefault(); loginSection.hidden = true; forgotSection.hidden = false; resetSection.hidden = true; });
  back.addEventListener("click", (e) => { e.preventDefault(); forgotSection.hidden = true; loginSection.hidden = false; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); const button = form.querySelector('button[type="submit"]'); button.disabled = true; message.textContent = "Validando...";
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: document.getElementById("email").value.trim(), senha: document.getElementById("senha").value }) });
      const data = await response.json(); if (!response.ok || !data.token) throw new Error(data.erro || "Não foi possível entrar.");
      sessionStorage.setItem("techcampus_token", data.token); sessionStorage.setItem("techcampus_usuario", JSON.stringify(data.usuario)); location.replace("/frontend/sistema.html");
    } catch (err) { message.textContent = err.message || "Falha de conexão com o servidor."; } finally { button.disabled = false; }
  });
  recovery.addEventListener("submit", async (e) => {
    e.preventDefault(); const button = recovery.querySelector('button[type="submit"]'); let feedback = recovery.querySelector('[role="alert"]');
    if (!feedback) { feedback = document.createElement("p"); feedback.setAttribute("role", "alert"); feedback.className = "mt-3"; recovery.append(feedback); }
    button.disabled = true; feedback.textContent = "Enviando solicitação...";
    try {
      const response = await fetch("/api/auth/recuperar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: document.getElementById("recoveryEmail").value.trim() }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.erro || "Não foi possível solicitar a recuperação."); feedback.textContent = data.mensagem;
    } catch (err) { feedback.textContent = err.message || "Erro de conexão."; } finally { button.disabled = false; }
  });
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault(); const button = resetForm.querySelector('button[type="submit"]'); const feedback = document.getElementById("resetPasswordMessage");
    const nova = document.getElementById("newPassword").value; const confirmar = document.getElementById("confirmPassword").value;
    if (nova.length < 5 || nova.length > 128) { feedback.textContent = "A senha deve ter entre 5 e 128 caracteres."; return; }
    if (nova !== confirmar) { feedback.textContent = "As senhas não coincidem."; return; }
    button.disabled = true; feedback.textContent = "Salvando nova senha...";
    try {
      const response = await fetch("/api/auth/redefinir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: resetToken, senha: nova }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.erro || "Não foi possível redefinir a senha.");
      feedback.textContent = "Senha alterada! Você já pode entrar com a nova senha."; resetForm.reset(); history.replaceState({}, "", location.pathname);
      setTimeout(() => { resetSection.hidden = true; loginSection.hidden = false; }, 1800);
    } catch (err) { feedback.textContent = err.message || "Erro de conexão."; } finally { button.disabled = false; }
  });
})();

const togglePassword = document.getElementById("togglePassword");
const senha = document.getElementById("senha");
if (togglePassword && senha) {
  togglePassword.addEventListener("click", () => {
    const mostrandoSenha = senha.type === "text"; senha.type = mostrandoSenha ? "password" : "text";
    const icon = togglePassword.querySelector("i");
    if (icon) { icon.classList.toggle("bi-eye", mostrandoSenha); icon.classList.toggle("bi-eye-slash", !mostrandoSenha); }
    togglePassword.setAttribute("aria-label", mostrandoSenha ? "Mostrar senha" : "Ocultar senha");
  });
}
