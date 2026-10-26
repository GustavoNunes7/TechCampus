/* Consulta tokens persistidos no servidor para o aluno recuperar o código. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const tokenAuth = () => sessionStorage.getItem("techcampus_token");
  async function api(path, options = {}) {
    const headers = { Authorization: `Bearer ${tokenAuth()}`, ...(options.headers || {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`/api${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const e = new Error(data.erro || `Erro ${response.status}`); e.status = response.status; throw e; }
    return data;
  }
  const texto = (tag, classe, conteudo) => { const el = document.createElement(tag); if (classe) el.className = classe; el.textContent = conteudo ?? ""; return el; };
  const dataBR = (valor) => { const d = new Date(String(valor || "").replace(" ", "T") + (String(valor || "").includes("Z") ? "" : "Z")); return Number.isNaN(d.getTime()) ? valor || "" : d.toLocaleString("pt-BR"); };
  async function carregar() {
    const lista = $("listaTokens"); if (!lista || !tokenAuth()) return;
    lista.replaceChildren(texto("p", "text-secondary", "Carregando pedidos..."));
    try {
      const pedidos = await api("/pedidos");
      lista.replaceChildren();
      if (!pedidos.length) { lista.append(texto("p", "text-secondary", "Você ainda não possui pedidos.")); return; }
      for (const pedido of pedidos) {
        const col = texto("div", "col-12 col-lg-6", "");
        const card = texto("article", "card h-100 border-secondary", "");
        const corpo = texto("div", "card-body", "");
        const titulo = texto("h5", "card-title", `Pedido #${pedido.id}`);
        const status = texto("p", "small text-secondary", `Status: ${pedido.status} · ${dataBR(pedido.criado_em)}`);
        corpo.append(titulo, status);
        if (Array.isArray(pedido.itens)) {
          const itens = texto("p", "small", pedido.itens.map(i => `${i.nome} × ${i.quantidade}`).join(" · "));
          corpo.append(itens);
        }
        if (["cancelado", "rejeitado"].includes(pedido.status)) {
          corpo.append(texto("div", "alert alert-secondary mb-0", "Este pedido foi encerrado e não possui token ativo."));
        } else if (pedido.status === "entregue") {
          corpo.append(texto("div", "alert alert-success mb-0", "Retirada concluída. O token não pode ser reutilizado."));
        } else {
          try {
            const dados = await api(`/pedidos/${pedido.id}/token`);
            const bloco = texto("div", "p-3 rounded border border-success-subtle mt-2", "");
            bloco.append(texto("div", "small text-secondary", "Token de retirada"));
            const codigo = texto("div", "fs-2 fw-bold text-success", dados.token);
            codigo.style.letterSpacing = ".2em";
            bloco.append(codigo);
            if (dados.expiraEm) bloco.append(texto("div", "small text-secondary mt-2", `Expira em ${new Date(dados.expiraEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`));
            const copiar = texto("button", "btn btn-sm btn-outline-secondary mt-2", "Copiar token"); copiar.type = "button";
            copiar.addEventListener("click", async () => { try { await navigator.clipboard.writeText(dados.token); copiar.textContent = "Copiado!"; } catch { copiar.textContent = dados.token; } });
            bloco.append(copiar); corpo.append(bloco);
          } catch (e) {
            if (e.status === 410) {
              corpo.append(texto("div", "alert alert-warning", "Seu token expirou."));
              const renovar = texto("button", "btn btn-danger", "Gerar novo token"); renovar.type = "button";
              renovar.addEventListener("click", async () => { renovar.disabled = true; try { await api(`/pedidos/${pedido.id}/token/renovar`, { method: "POST" }); await carregar(); } catch (erro) { $("mensagemTokens").textContent = erro.message; renovar.disabled = false; } });
              corpo.append(renovar);
            } else if (e.status === 409) {
              corpo.append(texto("div", "alert alert-warning mb-0", "O token ficará disponível depois que o pagamento for confirmado."));
            } else {
              corpo.append(texto("div", "alert alert-secondary mb-0", e.message));
            }
          }
        }
        card.append(corpo); col.append(card); lista.append(col);
      }
    } catch (e) {
      lista.replaceChildren(texto("div", "alert alert-danger", e.message));
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("atualizarTokens")?.addEventListener("click", carregar);
    if (location.hash === "#meus-tokens") carregar();
    window.addEventListener("hashchange", () => { if (location.hash === "#meus-tokens") carregar(); });
  });
})();
