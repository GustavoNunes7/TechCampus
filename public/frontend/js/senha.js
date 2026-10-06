/* =====================================================
    TROCAR SENHA (front) */

(() => {
  "use strict";

  const token = sessionStorage.getItem("techcampus_token");
  if (!token) return;

  const $ = (id) => document.getElementById(id);
  let modal;
  let forcado = false;

  async function api(path, opts = {}) {
    const res = await fetch("/api" + path, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    let data = null;
    try { data = await res.json(); } catch { /* sem corpo */ }
    if (!res.ok) {
      if (res.status === 401) {
        sessionStorage.clear();
        location.replace("/frontend/login.html");
      }
      throw new Error((data && data.erro) || `Erro ${res.status}`);
    }
    return data;
  }

  const msg = (txt, tipo = "danger") => {
    const el = $("msMsg");
    el.className = `small mt-3 text-${tipo}`;
    el.textContent = txt || "";
  };

  function montar() {
    const w = document.createElement("div");
    w.innerHTML = `
    <div class="modal fade" id="modalSenha" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-white border-secondary">
          <div class="modal-header border-secondary">
            <h5 class="modal-title" id="msTitulo">Alterar senha</h5>
            <button type="button" class="btn-close btn-close-white" id="msX" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <form id="msForm" novalidate>
            <div class="modal-body">
              <p class="small text-warning" id="msAviso" hidden></p>
              <label class="form-label small" for="msAtual">Senha atual</label>
              <input id="msAtual" type="password" autocomplete="current-password" class="form-control bg-dark text-white border-secondary mb-3" required>
              <label class="form-label small" for="msNova">Nova senha <span class="text-secondary">(mínimo 5 caracteres)</span></label>
              <input id="msNova" type="password" autocomplete="new-password" minlength="5" maxlength="128" class="form-control bg-dark text-white border-secondary mb-3" required>
              <label class="form-label small" for="msConf">Confirmar nova senha</label>
              <input id="msConf" type="password" autocomplete="new-password" class="form-control bg-dark text-white border-secondary" required>
              <div id="msMsg" role="alert" class="small mt-3"></div>
            </div>
            <div class="modal-footer border-secondary">
              <button type="button" class="btn btn-outline-secondary" id="msCancelar" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-danger" id="msSalvar">Salvar nova senha</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
    document.body.append(w.firstElementChild);
    // backdrop estático: clicar fora / ESC não fecha (necessário na troca obrigatória)
    modal = new bootstrap.Modal($("modalSenha"), { backdrop: "static", keyboard: false });
    $("msForm").addEventListener("submit", salvar);
  }

  function abrir(obrigatorio) {
    forcado = obrigatorio;
    $("msForm").reset();
    msg("");
    $("msTitulo").textContent = obrigatorio ? "Defina uma nova senha" : "Alterar senha";
    $("msAviso").hidden = !obrigatorio;
    $("msAviso").textContent = obrigatorio
      ? "Você entrou com uma senha provisória. Por segurança, escolha uma nova senha para continuar."
      : "";
    $("msX").hidden = obrigatorio;
    $("msCancelar").hidden = obrigatorio;
    modal.show();
  }

  async function salvar(e) {
    e.preventDefault();
    const atual = $("msAtual").value;
    const nova = $("msNova").value;
    const conf = $("msConf").value;
    if (!atual) return msg("Informe a senha atual.");
    if (nova.length < 5) return msg("A nova senha precisa ter pelo menos 5 caracteres.");
    if (nova !== conf) return msg("A confirmação não coincide com a nova senha.");
    if (nova === atual) return msg("A nova senha precisa ser diferente da atual.");

    const btn = $("msSalvar");
    btn.disabled = true;
    try {
      await api("/perfil/senha", {
        method: "PATCH",
        body: JSON.stringify({ senha_atual: atual, senha_nova: nova }),
      });
      forcado = false;
      $("msForm").reset();
      msg("Senha alterada com sucesso!", "success");
      setTimeout(() => {
        $("msX").hidden = false;
        $("msCancelar").hidden = false;
        modal.hide();
      }, 1200);
    } catch (err) {
      msg(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function iniciar() {
    montar();

    // Botão "Alterar senha" da tela de Configurações (identificado pelo texto)
    document.querySelectorAll("button.settings-action").forEach((b) => {
      if (/alterar senha/i.test(b.textContent)) b.addEventListener("click", () => abrir(false));
    });

    // Entrou com senha provisória? Exige a troca já.
    try {
      const s = await api("/perfil/senha/status");
      if (s.trocar_senha) abrir(true);
    } catch { /* sem sessão: auth.js redireciona */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();