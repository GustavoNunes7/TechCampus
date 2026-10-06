// Verificação de sessão e separação entre Aluno e Admin
(async () => {
  const token = sessionStorage.getItem("techcampus_token");

  const redirect = () => {
    sessionStorage.removeItem("techcampus_token");
    sessionStorage.removeItem("techcampus_usuario");
    location.replace("/frontend/login.html");
  };

  if (!token) return redirect();

  try {
    const response = await fetch("/api/perfil", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return redirect();

    const user = await response.json();

    // Salva os dados atualizados do usuário
    sessionStorage.setItem(
      "techcampus_usuario",
      JSON.stringify(user)
    );

    // Descobre qual página está sendo acessada
    const pagina = location.pathname;

    // ==========================================
    // ÁREA DO ALUNO
    // ==========================================

    if (pagina.endsWith("/sistema.html")) {
      if (user.papel !== "aluno") {
        location.replace("/frontend/admin.html");
        return;
      }
    }

    // ==========================================
    // ÁREA DO ADMINISTRADOR
    // ==========================================

    if (pagina.endsWith("/admin.html")) {
      if (user.papel !== "admin") {
        location.replace("/frontend/sistema.html");
        return;
      }
    }

    // ==========================================
    // BOTÃO SAIR
    // ==========================================

    document.querySelectorAll("a").forEach((a) => {
      if (a.textContent.trim() === "Sair") {
        a.addEventListener("click", (e) => {
          e.preventDefault();

          sessionStorage.removeItem("techcampus_token");
          sessionStorage.removeItem("techcampus_usuario");

          location.replace("/landing/index.html");
        });
      }
    });

    // Usuário autorizado
    document.body.style.visibility = "visible";

  } catch {
    redirect();
  }
})();