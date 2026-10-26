/* Notificações persistentes integradas ao sino do cabeçalho. */
(() => {
  "use strict";
  const token = () => sessionStorage.getItem("techcampus_token");
  const botao = document.querySelector(".notification-btn");
  if (!botao || botao.dataset.tcNotificacoes === "1") return;
  botao.dataset.tcNotificacoes = "1";

  const menu = botao.closest(".dropdown")?.querySelector(".dropdown-menu");
  const badge = botao.querySelector(".notification-badge");
  if (!menu) return;

  menu.classList.add("tc-notification-menu");
  menu.style.width = "min(380px, calc(100vw - 24px))";
  menu.style.maxHeight = "min(70vh, 560px)";
  menu.style.overflowY = "auto";
  menu.style.backgroundColor = "#171b22";
  menu.style.opacity = "1";
  menu.replaceChildren();

  const cabecalho = document.createElement("div");
  cabecalho.className = "tc-notification-header d-flex justify-content-between align-items-center gap-2 mb-2 pb-2 border-bottom";
  const titulo = document.createElement("strong");
  titulo.textContent = "Notificações";
  const atualizar = document.createElement("button");
  atualizar.type = "button";
  atualizar.className = "btn btn-sm btn-outline-secondary";
  atualizar.textContent = "Atualizar";
  cabecalho.append(titulo, atualizar);
  const lista = document.createElement("div");
  lista.setAttribute("aria-live", "polite");
  menu.append(cabecalho, lista);

  function aplicarPreferencia() {
    const ativa = localStorage.getItem("tc_notificacoes_ativas") !== "0";
    botao.hidden = !ativa;
    if (!ativa && badge) badge.hidden = true;
  }
  aplicarPreferencia();
  window.addEventListener("tc-preferencia-notificacoes", aplicarPreferencia);

  function texto(tag, classe, valor) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    el.textContent = valor ?? "";
    return el;
  }

  async function carregar() {
    if (!token()) return;
    try {
      const resp = await fetch("/api/notificacoes", {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const dados = await resp.json().catch(() => []);
      if (!resp.ok) throw new Error(dados.erro || "Não foi possível carregar as notificações.");
      const itens = Array.isArray(dados) ? dados : [];
      const naoLidas = itens.filter((n) => Number(n.lida) === 0).length;
      if (badge) {
        badge.textContent = naoLidas > 99 ? "99+" : String(naoLidas);
        badge.hidden = naoLidas === 0;
        badge.setAttribute("aria-label", `${naoLidas} notificações não lidas`);
      }
      lista.replaceChildren();
      if (!itens.length) {
        lista.append(texto("p", "small text-secondary mb-0 py-2", "Você não tem notificações no momento."));
        return;
      }
      for (const item of itens) {
        const bloco = document.createElement("article");
        bloco.className = "tc-notification-item p-3 mb-2 rounded border";
        if (Number(item.lida) === 0) bloco.classList.add("is-unread");
        bloco.append(
          texto("strong", "d-block", item.titulo || "Notificação"),
          texto("p", "small mb-1 text-wrap", item.mensagem || ""),
          texto("small", "text-secondary", item.criada_em || "")
        );
        if (Number(item.lida) === 0) {
          const ler = texto("button", "btn btn-sm btn-outline-secondary mt-2 tc-notification-read", "Marcar como lida");
          ler.type = "button";
          ler.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            ler.disabled = true;
            try {
              const resposta = await fetch(`/api/notificacoes/${encodeURIComponent(item.id)}/lida`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token()}` }
              });
              if (!resposta.ok) throw new Error("Não foi possível atualizar a notificação.");
              await carregar();
            } catch (erro) {
              ler.disabled = false;
              lista.prepend(texto("p", "small text-danger", erro.message));
            }
          });
          bloco.append(ler);
        }
        lista.append(bloco);
      }
    } catch (erro) {
      lista.replaceChildren(texto("p", "small text-danger mb-0", erro.message));
    }
  }

  const dropdown = botao.closest(".dropdown");
  dropdown?.addEventListener("show.bs.dropdown", carregar);
  botao.addEventListener("click", () => {
    // Bootstrap abre o menu; o clique também atualiza caso a biblioteca não esteja disponível.
    carregar();
  });
  atualizar.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    carregar();
  });
  carregar();
  window.setInterval(carregar, 60000);
})();