/* Integra o formulário de perfil e as preferências com a API original. */
(() => {
  "use strict";
  const token = () => sessionStorage.getItem("techcampus_token");
  const api = async (url, options = {}) => {
    const headers = { Authorization: `Bearer ${token()}`, ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`/api${url}`, { ...options, headers });
    const type = response.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await response.json() : null;
    if (!response.ok) throw new Error(data?.erro || `Erro ${response.status}`);
    return data;
  };
  const avisar = (mensagem, erro = false) => {
    let el = document.getElementById("tc-perfil-feedback");
    if (!el) {
      el = document.createElement("div"); el.id = "tc-perfil-feedback";
      el.className = "alert mt-3";
      (document.getElementById("perfilForm") || document.getElementById("configuracoesForm") || document.body).append(el);
    }
    el.className = `alert mt-3 ${erro ? "alert-danger" : "alert-success"}`;
    el.textContent = mensagem;
  };
  async function editarFotoAntesDeEnviar(arquivo, input) {
    const url = URL.createObjectURL(arquivo);
    const modal = document.createElement("div");
    modal.className = "tc-photo-editor-backdrop";
    modal.innerHTML = `
      <section class="tc-photo-editor" role="dialog" aria-modal="true" aria-labelledby="tcPhotoEditorTitle">
        <header><h2 id="tcPhotoEditorTitle">Editar foto de perfil</h2><button type="button" class="tc-photo-close" aria-label="Fechar">×</button></header>
        <p class="tc-photo-hint">Ajuste o enquadramento. A foto será salva em formato quadrado.</p>
        <div class="tc-photo-stage" title="Arraste a foto com o mouse ou toque para ajustar o enquadramento"><canvas width="320" height="320" aria-label="Pré-visualização da foto cortada; arraste para posicionar"></canvas></div>
        <p class="tc-photo-hint">Dica: clique e arraste a imagem para posicioná-la dentro do quadrado.</p>
        <label>Zoom <input class="tc-photo-zoom" type="range" min="1" max="3" step="0.05" value="1"></label>
        <label>Posição horizontal <input class="tc-photo-x" type="range" min="-1" max="1" step="0.01" value="0"></label>
        <label>Posição vertical <input class="tc-photo-y" type="range" min="-1" max="1" step="0.01" value="0"></label>
        <div class="tc-photo-actions">
          <button type="button" class="tc-photo-rotate">Girar 90°</button>
          <button type="button" class="tc-photo-flip">Espelhar</button>
          <button type="button" class="tc-photo-reset">Reverter ajustes</button>
        </div>
        <footer><button type="button" class="tc-photo-cancel">Cancelar</button><button type="button" class="tc-photo-save">Usar esta foto</button></footer>
        <p class="tc-photo-status" role="status"></p>
      </section>`;
    if (!document.getElementById("tc-photo-editor-styles")) {
      const style = document.createElement("style");
      style.id = "tc-photo-editor-styles";
      style.textContent = `
        .tc-photo-editor-backdrop{position:fixed;inset:0;z-index:20000;background:#000b;display:flex;align-items:center;justify-content:center;padding:16px}
        .tc-photo-editor{width:min(480px,100%);max-height:92vh;overflow:auto;background:#171b22;color:#f5f7fa;border:1px solid #454b55;border-radius:16px;padding:20px;box-shadow:0 20px 70px #0009}
        .tc-photo-editor header,.tc-photo-editor footer,.tc-photo-actions{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
        .tc-photo-editor header h2{font-size:1.2rem;margin:0}.tc-photo-editor button{border:1px solid #555e6b;background:#242a33;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer}
        .tc-photo-editor button:focus-visible,.tc-photo-editor input:focus-visible{outline:2px solid #e53945;outline-offset:2px}
        .tc-photo-editor .tc-photo-save{background:#bd2f39;border-color:#bd2f39}.tc-photo-editor .tc-photo-hint,.tc-photo-editor .tc-photo-status{font-size:.88rem;color:#aeb8c6}
        .tc-photo-stage{width:min(320px,100%);aspect-ratio:1;margin:12px auto;background:#090b0e;border-radius:12px;overflow:hidden}.tc-photo-stage canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:none}.tc-photo-stage canvas:active{cursor:grabbing}
        .tc-photo-editor label{display:block;font-size:.9rem;margin:12px 0}.tc-photo-editor input[type=range]{display:block;width:100%;accent-color:#d33843}
        .tc-photo-editor footer{justify-content:flex-end;margin-top:16px}
      `;
      document.head.append(style);
    }
    document.body.append(modal);
    const image = new Image();
    const canvas = modal.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const zoom = modal.querySelector(".tc-photo-zoom");
    const posX = modal.querySelector(".tc-photo-x");
    const posY = modal.querySelector(".tc-photo-y");
    const status = modal.querySelector(".tc-photo-status");
    let rotation = 0, flipped = false, closed = false;
    let dragging = false, dragStartX = 0, dragStartY = 0, dragOriginX = 0, dragOriginY = 0;
    const close = () => { if (closed) return; closed = true; URL.revokeObjectURL(url); modal.remove(); };
    const render = () => {
      if (!image.complete || !image.naturalWidth) return;
      const size = 320, angle = ((rotation % 360) + 360) % 360;
      const swap = angle === 90 || angle === 270;
      const rw = swap ? image.naturalHeight : image.naturalWidth;
      const rh = swap ? image.naturalWidth : image.naturalHeight;
      const scale = Math.max(size / rw, size / rh) * Number(zoom.value);
      const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
      ctx.clearRect(0, 0, size, size);
      ctx.save(); ctx.translate(size / 2, size / 2); ctx.rotate(angle * Math.PI / 180);
      ctx.scale(flipped ? -1 : 1, 1);
      ctx.drawImage(image, -w / 2 + Number(posX.value) * Math.max(0, w-size)/2, -h / 2 + Number(posY.value) * Math.max(0, h-size)/2, w, h);
      ctx.restore();
    };
    image.onload = render;
    image.onerror = () => { status.textContent = "Não foi possível abrir esta imagem."; };
    image.src = url;
    [zoom, posX, posY].forEach(el => el.addEventListener("input", render));
    // Arraste direto sobre a prévia para posicionar a foto, como em editores de imagem.
    canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      dragging = true;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragOriginX = Number(posX.value);
      dragOriginY = Number(posY.value);
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    canvas.addEventListener("pointermove", event => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const angle = ((rotation % 360) + 360) % 360;
      const rw = angle === 90 || angle === 270 ? image.naturalHeight : image.naturalWidth;
      const rh = angle === 90 || angle === 270 ? image.naturalWidth : image.naturalHeight;
      const scale = Math.max(320 / rw, 320 / rh) * Number(zoom.value);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const dx = (event.clientX - dragStartX) * 320 / Math.max(1, rect.width);
      const dy = (event.clientY - dragStartY) * 320 / Math.max(1, rect.height);
      posX.value = String(Math.max(-1, Math.min(1, dragOriginX + dx / Math.max(1, (width - 320) / 2))));
      posY.value = String(Math.max(-1, Math.min(1, dragOriginY + dy / Math.max(1, (height - 320) / 2))));
      render();
    });
    const stopDragging = () => { dragging = false; };
    canvas.addEventListener("pointerup", stopDragging);
    canvas.addEventListener("pointercancel", stopDragging);
    canvas.addEventListener("lostpointercapture", stopDragging);
    modal.querySelector(".tc-photo-rotate").addEventListener("click", () => { rotation = (rotation + 90) % 360; render(); });
    modal.querySelector(".tc-photo-flip").addEventListener("click", () => { flipped = !flipped; render(); });
    modal.querySelector(".tc-photo-reset").addEventListener("click", () => { zoom.value = "1"; posX.value = "0"; posY.value = "0"; rotation = 0; flipped = false; render(); });
    modal.querySelector(".tc-photo-close").addEventListener("click", close);
    modal.querySelector(".tc-photo-cancel").addEventListener("click", close);
    modal.addEventListener("click", event => { if (event.target === modal) close(); });
    modal.querySelector(".tc-photo-save").addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true; status.textContent = "Preparando foto...";
      try {
        const output = document.createElement("canvas"); output.width = 512; output.height = 512;
        output.getContext("2d").drawImage(canvas, 0, 0, 512, 512);
        const blob = await new Promise(resolve => output.toBlob(resolve, "image/jpeg", 0.9));
        if (!blob) throw new Error("Não foi possível preparar a foto.");
        const dados = new FormData(); dados.append("foto", blob, "foto-perfil.jpg");
        await api("/perfil/foto", { method: "POST", body: dados });
        await carregarFoto();
        avisar("Foto de perfil atualizada.");
        close();
      } catch (error) {
        status.textContent = error.message || "Não foi possível salvar a foto.";
        button.disabled = false;
      }
    });
    modal.querySelector(".tc-photo-close").focus();
    return close;
  }

  async function carregarFoto() {
    const img = document.getElementById("profilePreview");
    if (!img || !token()) return;

    // Ao trocar de conta, nunca manter a imagem da sessão anterior enquanto
    // a API carrega ou quando o usuário atual ainda não tem foto cadastrada.
    const avatar = document.querySelector("#userDropdown .user-avatar");
    const dropdown = document.getElementById("userDropdown");
    // Limpa ícones/imagens duplicados que versões anteriores podem ter deixado
    // diretamente no link do usuário, fora do círculo do avatar.
    if (dropdown) {
      dropdown.querySelectorAll(":scope > img, :scope > i.bi-person-fill, :scope > .user-avatar + i").forEach(el => el.remove());
    }
    const objectUrlAnterior = img.dataset.objectUrl;
    if (objectUrlAnterior) {
      URL.revokeObjectURL(objectUrlAnterior);
      delete img.dataset.objectUrl;
    }
    img.src = "../landing/images/logoTechCampus.png";
    if (avatar) {
      avatar.replaceChildren();
      avatar.style.width = "38px";
      avatar.style.height = "38px";
      avatar.style.minWidth = "38px";
      avatar.style.flex = "0 0 38px";
      avatar.style.overflow = "hidden";
      avatar.style.position = "relative";
      const icone = document.createElement("i");
      icone.className = "bi bi-person-fill text-white fs-5";
      avatar.append(icone);
    }

    try {
      const response = await fetch("/api/perfil/foto", {
        headers: { Authorization: `Bearer ${token()}` },
        cache: "no-store"
      });
      // 404 significa que esta conta não possui foto; manter os placeholders.
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) return;
      const url = URL.createObjectURL(blob);
      img.dataset.objectUrl = url;
      img.src = url;
      if (avatar) {
        const avatarImg = document.createElement("img");
        avatarImg.alt = "Foto de perfil";
        avatarImg.className = "rounded-circle";
        avatarImg.style.width = "38px";
        avatarImg.style.height = "38px";
        avatarImg.style.objectFit = "cover";
        avatarImg.style.display = "block";
        avatarImg.style.position = "absolute";
        avatarImg.style.inset = "0";
        avatarImg.style.borderRadius = "50%";
        avatar.replaceChildren(avatarImg);
        avatarImg.src = url;
      }
    } catch {
      // Sem foto ou API indisponível: manter a imagem padrão desta conta.
    }
  }
  function ligarGerenciamentoUsuarios() {
    const tabela = document.getElementById("tabelaUsuarios");
    const form = document.getElementById("formUsuario");
    const botaoNovo = document.getElementById("btnNovoUsuario");
    if (!tabela || !form || !botaoNovo || form.dataset.apiWired) return;
    form.dataset.apiWired = "1";
    let usuarios = [];
    const fotoObjectUrls = new Set();
    const modalEl = document.getElementById("modalUsuario");
    const modal = window.bootstrap?.Modal && modalEl ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;
    const campo = (id) => document.getElementById(id);
    const filtros = ["buscarUsuario", "filtroTipoUsuario", "filtroStatusUsuario"];
    const mostrarErro = (msg) => {
      let el = document.getElementById("tc-usuarios-feedback");
      if (!el) { el = document.createElement("div"); el.id = "tc-usuarios-feedback"; el.className = "alert alert-danger mt-3"; document.getElementById("usuarios")?.prepend(el); }
      el.textContent = msg;
    };
    async function carregar() {
      try {
        usuarios = await api("/usuarios");
        campo("totalAlunos") && (campo("totalAlunos").textContent = String(usuarios.filter(u => u.papel === "aluno").length));
        campo("totalAtivos") && (campo("totalAtivos").textContent = String(usuarios.filter(u => u.ativo !== 0).length));
        renderizar();
      } catch (e) { mostrarErro(e.message); }
    }
    function renderizar() {
      const q = (campo("buscarUsuario")?.value || "").trim().toLowerCase();
      const papel = campo("filtroTipoUsuario")?.value || "aluno";
      const status = campo("filtroStatusUsuario")?.value || "todos";
      const filtrados = usuarios.filter(u => {
        const texto = `${u.nome || ""} ${u.email || ""} ${u.turma || ""}`.toLowerCase();
        return (!q || texto.includes(q)) && (papel === "todos" || u.papel === papel) &&
          (status === "todos" || (status === "ativo" ? u.ativo !== 0 : u.ativo === 0));
      });
      for (const url of fotoObjectUrls) URL.revokeObjectURL(url);
      fotoObjectUrls.clear();
      tabela.replaceChildren();
      for (const u of filtrados) {
        const tr = document.createElement("tr");
        const fotoCelula = document.createElement("td");
        const foto = document.createElement("img");
        foto.alt = "Foto de " + (u.nome || "usuário");
        foto.className = "rounded-circle border border-secondary";
        foto.width = 42; foto.height = 42;
        foto.style.objectFit = "cover";
        foto.src = "/landing/images/logoTechCampus.png";
        fotoCelula.append(foto);
        tr.append(fotoCelula);
        if (u.foto_url) {
          fetch("/api/usuarios/" + u.id + "/foto", { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" })
            .then(response => { if (!response.ok) throw new Error("Foto indisponível"); return response.blob(); })
            .then(blob => {
              const url = URL.createObjectURL(blob);
              if (!foto.isConnected) { URL.revokeObjectURL(url); return; }
              fotoObjectUrls.add(url);
              foto.src = url;
            })
            .catch(() => {});
        }
        for (const valor of [u.nome, u.turma || "—", u.email, u.papel === "admin" ? "Administrador" : "Aluno", u.ativo === 0 ? "Inativo" : "Ativo"]) {
          const td = document.createElement("td"); td.textContent = valor || "—"; tr.append(td);
        }
        const acoes = document.createElement("td"); acoes.className = "text-end text-nowrap";
        const editar = document.createElement("button"); editar.type = "button"; editar.className = "btn btn-sm btn-outline-primary me-1"; editar.textContent = "Editar"; editar.addEventListener("click", () => abrir(u));
        const statusBtn = document.createElement("button"); statusBtn.type = "button"; statusBtn.className = `btn btn-sm ${u.ativo === 0 ? "btn-outline-success" : "btn-outline-danger"}`; statusBtn.textContent = u.ativo === 0 ? "Ativar" : "Desativar";
        statusBtn.addEventListener("click", async () => {
          if (!confirm(`${u.ativo === 0 ? "Ativar" : "Desativar"} a conta de ${u.nome}?`)) return;
          try { await api(`/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify({ ativo: u.ativo === 0 ? 1 : 0 }) }); await carregar(); }
          catch (e) { mostrarErro(e.message); }
        });
        acoes.append(editar, statusBtn); tr.append(acoes); tabela.append(tr);
      }
      const vazio = document.getElementById("usuariosVazio"); if (vazio) vazio.style.display = filtrados.length ? "none" : "block";
    }
    function abrir(u = null) {
      form.reset();
      campo("usuarioId").value = u?.id || "";
      campo("tituloModalUsuario").textContent = u ? "Editar cadastro" : "Novo cadastro";
      campo("usuarioNome").value = u?.nome || "";
      campo("usuarioTipo").value = u?.papel || "aluno";
      campo("usuarioMatricula").value = u?.turma || "";
      campo("usuarioEmail").value = u?.email || "";
      campo("usuarioSenha").value = "";
      campo("usuarioSenha").required = !u;
      campo("usuarioStatus").value = u?.ativo === 0 ? "inativo" : "ativo";
      if (modal) modal.show(); else modalEl?.classList.add("show");
    }
    botaoNovo.addEventListener("click", () => abrir());
    filtros.forEach(id => campo(id)?.addEventListener("input", renderizar));
    campo("filtroTipoUsuario")?.addEventListener("change", renderizar);
    campo("filtroStatusUsuario")?.addEventListener("change", renderizar);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = campo("usuarioId").value;
      const senha = campo("usuarioSenha").value;
      if (!id && senha.length < 5) return mostrarErro("A senha inicial precisa ter pelo menos 5 caracteres.");
      const body = {
        nome: campo("usuarioNome").value.trim(),
        email: campo("usuarioEmail").value.trim(),
        papel: campo("usuarioTipo").value,
        turma: campo("usuarioMatricula").value.trim(),
        ativo: campo("usuarioStatus").value === "ativo" ? 1 : 0
      };
      if (senha) body.senha = senha;
      const btn = form.querySelector('[type="submit"]'); if (btn) btn.disabled = true;
      try {
        await api(id ? `/usuarios/${id}` : "/usuarios", { method: id ? "PATCH" : "POST", body: JSON.stringify(body) });
        modal?.hide(); await carregar();
      } catch (e) { mostrarErro(e.message); }
      finally { if (btn) btn.disabled = false; }
    });
    carregar();
  }

  async function iniciar() {
    if (!token()) return;
    try {
      const perfil = await api("/perfil");
      for (const [id, value] of [["nome", perfil.nome], ["email", perfil.email], ["telefone", perfil.telefone || ""]]) {
        const campo = document.getElementById(id); if (campo) campo.value = value || "";
      }
      await carregarFoto();
      if (perfil.papel === "admin") ligarGerenciamentoUsuarios();
    } catch (e) { console.warn("Perfil não carregado:", e.message); }

    const form = document.getElementById("perfilForm");
    if (form && !form.dataset.apiWired) {
      form.dataset.apiWired = "1";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const btn = form.querySelector('[type="submit"]'); if (btn) btn.disabled = true;
        try {
          await api("/perfil", { method: "PATCH", body: JSON.stringify({
            nome: document.getElementById("nome")?.value || "",
            email: document.getElementById("email")?.value || "",
            telefone: document.getElementById("telefone")?.value || ""
          }) });
          avisar("Perfil salvo na conta TechCampus.");
        } catch (e) { avisar(e.message, true); }
        finally { if (btn) btn.disabled = false; }
      });
    }

    const foto = document.getElementById("profilePhoto");
    if (foto && !foto.dataset.apiWired) {
      foto.dataset.apiWired = "1";
      foto.addEventListener("change", async () => {
        const arquivo = foto.files?.[0]; if (!arquivo) return;
        if (!/^image\/(jpeg|png)$/.test(arquivo.type) || arquivo.size > 20 * 1024 * 1024) {
          avisar("Escolha uma imagem JPG ou PNG de até 20 MB.", true); foto.value = ""; return;
        }
        await editarFotoAntesDeEnviar(arquivo, foto);
        foto.value = "";
      });
    }

    const configForm = document.getElementById("configuracoesForm");
    const notif = document.getElementById("notificacoesSistema");
    const notifEmail = document.getElementById("notificacoesEmail");
    const selectTema = document.getElementById("tema");
    const chave = "techcampusConfiguracoes";
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(chave) || "{}"); } catch { prefs = {}; }
    if (notif && prefs.notificacoesSistema !== undefined) notif.checked = !!prefs.notificacoesSistema;
    if (notifEmail && prefs.notificacoesEmail !== undefined) notifEmail.checked = !!prefs.notificacoesEmail;
    if (selectTema && window.TechCampusTema) selectTema.value = window.TechCampusTema.get();
    if (notif && !notif.dataset.apiWired) {
      notif.dataset.apiWired = "1";
      notif.addEventListener("change", () => {
        localStorage.setItem("tc_notificacoes_ativas", notif.checked ? "1" : "0");
        window.dispatchEvent(new CustomEvent("tc-preferencia-notificacoes"));
      });
    }
    if (configForm && !configForm.dataset.apiWired) {
      configForm.dataset.apiWired = "1";
      configForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const config = {
          notificacoesSistema: notif?.checked ?? true,
          notificacoesEmail: notifEmail?.checked ?? true,
          exibirTelefone: document.getElementById("exibirTelefone")?.checked ?? false,
          exibirEmail: document.getElementById("exibirEmail")?.checked ?? false,
          tema: selectTema?.value || "escuro"
        };
        localStorage.setItem(chave, JSON.stringify(config));
        localStorage.setItem("tc_notificacoes_ativas", config.notificacoesSistema ? "1" : "0");
        if (window.TechCampusTema) window.TechCampusTema.set(config.tema);
        window.dispatchEvent(new CustomEvent("tc-preferencia-notificacoes"));
        avisar("Configurações salvas.");
      });
    }

    // Os botões do layout passam a executar ações reais.
    const sair = [...document.querySelectorAll(".settings-action")].find((b) => /encerrar sessão/i.test(b.textContent));
    if (sair && !sair.dataset.apiWired) {
      sair.dataset.apiWired = "1";
      sair.addEventListener("click", () => { sessionStorage.removeItem("techcampus_token"); sessionStorage.removeItem("techcampus_usuario"); location.replace("/landing/index.html"); });
    }
    const encerrar = document.createElement("button");
    encerrar.type = "button"; encerrar.className = "btn btn-outline-danger mt-3"; encerrar.textContent = "Encerrar minha conta";
    encerrar.addEventListener("click", async () => {
      const senha = prompt("Para encerrar a conta, confirme sua senha:");
      if (senha === null) return;
      if (!senha) return avisar("Informe sua senha para continuar.", true);
      if (!confirm("Essa ação desativará seu acesso ao TechCampus. Deseja continuar?")) return;
      try {
        await api("/perfil", { method: "DELETE", body: JSON.stringify({ senha }) });
        sessionStorage.removeItem("techcampus_token"); sessionStorage.removeItem("techcampus_usuario");
        alert("Conta encerrada."); location.replace("/landing/index.html");
      } catch (e) { avisar(e.message, true); }
    });
    const seguranca = [...document.querySelectorAll(".settings-card")].find((card) => /segurança/i.test(card.textContent));
    if (seguranca && !seguranca.querySelector("#tc-encerrar-conta")) { encerrar.id = "tc-encerrar-conta"; seguranca.append(encerrar); }
  }
  document.addEventListener("DOMContentLoaded", iniciar);
})();
