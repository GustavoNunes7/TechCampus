(() => {
  "use strict";
  const form = document.getElementById("formValidar");
  const campo = document.getElementById("token");
  const resultado = document.getElementById("resultado");
  const confirmar = document.getElementById("confirmar");
  let tokenValidado = "";

  function mostrar(texto, tipo = "secondary") {
    resultado.replaceChildren();
    const p = document.createElement("p");
    p.className = `alert alert-${tipo} mb-0`;
    p.textContent = texto;
    resultado.append(p);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    tokenValidado = campo.value.trim();
    confirmar.hidden = true;
    if (!/^\d{6}$/.test(tokenValidado)) return mostrar("Informe um token numérico de 6 dígitos.", "warning");
    try {
      const resp = await fetch("/api/iot/validar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenValidado })
      });
      const dados = await resp.json();
      if (!resp.ok || !dados.valido) return mostrar(dados.erro || "Token inválido.", "danger");
      mostrar(`Token válido!\nPedido #${dados.pedidoId}\nItens: ${dados.produtos}\nConfirme somente após entregar os itens ao aluno.`, "success");
      confirmar.hidden = false;
    } catch {
      mostrar("Não foi possível conectar à API do TechCampus.", "danger");
    }
  });

  confirmar.addEventListener("click", async () => {
    if (!tokenValidado) return;
    confirmar.disabled = true;
    try {
      const resp = await fetch("/api/iot/confirmar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenValidado })
      });
      const dados = await resp.json();
      if (!resp.ok) return mostrar(dados.erro || "Não foi possível confirmar a retirada.", "danger");
      mostrar(dados.mensagem || "Retirada confirmada.", "success");
      confirmar.hidden = true;
      campo.value = "";
      tokenValidado = "";
    } catch {
      mostrar("Não foi possível conectar à API do TechCampus.", "danger");
    } finally { confirmar.disabled = false; }
  });
})();
