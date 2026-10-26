(() => {
  "use strict";
  if (window.__tcAvisosAdminInitialized) return;
  window.__tcAvisosAdminInitialized = true;
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("avisosAdminForm");
    const editor = document.getElementById("avisosAdminEditor");
    const abrir = document.getElementById("avisosAdminAdicionar");
    const novo = document.getElementById("avisosAdminNovo");
    const fechar = document.getElementById("avisosAdminFechar");
    const msg = document.getElementById("avisosAdminMsg");
    if (!form || !editor) return;
    // A descrição é opcional tanto ao criar quanto ao editar avisos.
    const campoDescricao = document.getElementById("avisosAdminDescricao");
    campoDescricao?.removeAttribute("required");
    let salvandoAviso = false;
    const byId = (id) => document.getElementById(id);
    const token = () => sessionStorage.getItem("techcampus_token");
    const authHeaders = () => ({ "Content-Type": "application/json", Authorization: "Bearer " + (token() || "") });
    function mensagem(texto, erro = false) {
      if (!msg) return;
      msg.textContent = texto;
      msg.classList.toggle("text-danger", erro);
      msg.classList.toggle("text-success", !erro);
    }
    function limparFormulario() {
      form.reset();
      byId("avisosAdminId").value = "";
      byId("avisosAdminTitulo").textContent = "Publicar aviso";
      byId("avisosAdminSalvar").textContent = "Publicar aviso";
      mensagem("");
    }
    function editarAviso(aviso) {
      byId("avisosAdminId").value = aviso.id;
      byId("avisosAdminNome").value = aviso.titulo || "";
      byId("avisosAdminCategoria").value = aviso.categoria || "importante";
      byId("avisosAdminData").value = String(aviso.data_evento || "").slice(0, 10);
      byId("avisosAdminHorario").value = aviso.horario || "";
      byId("avisosAdminLocal").value = aviso.local || "";
      byId("avisosAdminDescricao").value = aviso.conteudo || "";
      byId("avisosAdminTitulo").textContent = "Editar aviso";
      byId("avisosAdminSalvar").textContent = "Salvar alterações";
      editor.hidden = false;
      editor.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    abrir?.addEventListener("click", () => { limparFormulario(); editor.hidden = false; editor.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
    novo?.addEventListener("click", limparFormulario);
    fechar?.addEventListener("click", () => { editor.hidden = true; });
    document.addEventListener("tc-editar-aviso", (event) => {
      if (event.detail?.aviso) editarAviso(event.detail.aviso);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (salvandoAviso) return;
      salvandoAviso = true;
      const id = byId("avisosAdminId").value;
      const payload = {
        titulo: byId("avisosAdminNome").value.trim(),
        categoria: byId("avisosAdminCategoria").value,
        data_evento: byId("avisosAdminData").value,
        horario: byId("avisosAdminHorario").value,
        local: byId("avisosAdminLocal").value.trim(),
        conteudo: byId("avisosAdminDescricao").value.trim()
      };
      const salvar = byId("avisosAdminSalvar");
      salvar.disabled = true;
      try {
        const response = await fetch("/api/avisos" + (id ? "/" + encodeURIComponent(id) : ""), {
          method: id ? "PATCH" : "POST", headers: authHeaders(), body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.erro || "Não foi possível salvar o aviso.");
        limparFormulario();
        editor.hidden = true;
        mensagem(id ? "Aviso atualizado com sucesso." : "Aviso publicado com sucesso.");
        document.dispatchEvent(new CustomEvent("tc-avisos-atualizados", { detail: { data: payload.data_evento } }));
      } catch (error) {
        mensagem(error.message || "Erro ao salvar aviso.", true);
      } finally {
        salvandoAviso = false;
        salvar.disabled = false;
      }
    });
  });
})();