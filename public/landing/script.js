// DOCUMENTOS - UPLOAD
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("docForm");
  const input = document.getElementById("docFile");
  const msg = document.getElementById("docMsg");
  const table = document.getElementById("documentsTable");

  if (!form || !input || !msg || !table) return;

  const token = () => sessionStorage.getItem("techcampus_token");

  const escapeHtml = (v) => String(v ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const typeName = (mime) =>
    mime === "application/pdf" ? "PDF" :
    mime === "image/jpeg" ? "JPG" :
    mime === "image/png" ? "PNG" : "Arquivo";

  const dateName = (v) => {
    if (!v) return "-";
    const d = new Date(String(v).replace(" ", "T") + "Z");
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString("pt-BR");
  };

  async function carregarDocumentos() {
    const t = token();
    if (!t) {
      table.innerHTML = '<tr><td colspan="5" class="empty">Faça login novamente.</td></tr>';
      return;
    }

    try {
      const r = await fetch("/api/documentos", {
        headers: { Authorization: "Bearer " + t }
      });
      const dados = await r.json().catch(() => []);
      if (!r.ok) throw new Error(dados.erro || "Erro ao carregar documentos.");

      if (!dados.length) {
        table.innerHTML = '<tr><td colspan="5" class="empty">Nenhum documento enviado.</td></tr>';
        return;
      }

      table.innerHTML = dados.map((d) => {
        const url = "/api/documentos/" + d.id + "/arquivo";
        const status = d.status === "aprovado"
          ? '<span class="badge bg-success">Aprovado</span>'
          : d.status === "rejeitado"
          ? '<span class="badge bg-danger">Rejeitado</span>'
          : '<span class="badge bg-warning text-dark">Em análise</span>';

        return '<tr>' +
          '<td><a href="#" class="text-white text-decoration-none fw-semibold js-ver-documento" data-id="' + d.id + '">' +
          '<i class="bi bi-file-earmark-text me-2 text-danger"></i>' + escapeHtml(d.nome) + '</a></td>' +
          '<td><span class="badge bg-secondary">' + typeName(d.mime) + '</span></td>' +
          '<td>' + dateName(d.criado_em) + '</td>' +
          '<td>' + status + '</td>' +
          '<td class="d-flex gap-2">' +
          '<button type="button" class="btn btn-sm btn-outline-light js-ver-documento" data-id="' + d.id + '"><i class="bi bi-eye"></i></button>' +
          '<button type="button" class="btn btn-sm btn-outline-danger js-excluir-documento" data-id="' + d.id + '"><i class="bi bi-trash"></i></button>' +
          '</td>' +
          '</tr>';
      }).join("");
    } catch (e) {
      console.error("Documentos:", e);
      table.innerHTML = '<tr><td colspan="5" class="text-danger text-center">' +
        escapeHtml(e.message) + '</td></tr>';
    }
  }

  async function abrirDocumento(id) {
    const janela = window.open("about:blank", "_blank");
    const t = token();
    if (!t) {
      if (janela && !janela.closed) janela.close();
      msg.textContent = "Sua sessão expirou. Faça login novamente.";
      msg.className = "text-danger mt-2";
      return;
    }

    try {
      const r = await fetch("/api/documentos/" + id + "/arquivo", {
        headers: { Authorization: "Bearer " + t }
      });

      if (!r.ok) {
        const erro = await r.json().catch(() => ({}));
        throw new Error(erro.erro || "Não foi possível abrir o documento.");
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);

      if (janela && !janela.closed) {
        janela.location.href = url;
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error("Visualização:", e);
      msg.textContent = e.message || "Não foi possível abrir o documento.";
      msg.className = "text-danger mt-2";
    }
  }

  async function excluirDocumento(id) {
    const t = token();
    if (!t) {
      msg.textContent = "Sua sessão expirou. Faça login novamente.";
      msg.className = "text-danger mt-2";
      return;
    }

    if (!window.confirm("Tem certeza que deseja excluir este documento?")) return;

    try {
      const r = await fetch("/api/documentos/" + id, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + t }
      });

      const dados = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dados.erro || "Não foi possível excluir o documento.");

      msg.textContent = "Documento excluído com sucesso.";
      msg.className = "text-success mt-2";
      await carregarDocumentos();
    } catch (e) {
      console.error("Exclusão:", e);
      msg.textContent = e.message || "Erro ao excluir documento.";
      msg.className = "text-danger mt-2";
    }
  }

  table.addEventListener("click", function (e) {
    const visualizar = e.target.closest(".js-ver-documento");
    const excluir = e.target.closest(".js-excluir-documento");

    if (visualizar) abrirDocumento(visualizar.dataset.id);
    if (excluir) excluirDocumento(excluir.dataset.id);
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const arquivo = input.files[0];
    if (!arquivo) {
      msg.textContent = "Selecione um arquivo.";
      return;
    }

    if (!["application/pdf", "image/jpeg", "image/png"].includes(arquivo.type)) {
      msg.textContent = "Formato inválido. Envie PDF, JPG ou PNG.";
      return;
    }

    if (arquivo.size > 10 * 1024 * 1024) {
      msg.textContent = "O arquivo não pode ultrapassar 10 MB.";
      return;
    }

    const t = token();
    if (!t) {
      msg.textContent = "Sua sessão expirou. Faça login novamente.";
      return;
    }

    const formData = new FormData();
    formData.append("arquivo", arquivo);

    const botao = form.querySelector('button[type="submit"]');
    const original = botao ? botao.textContent : "Enviar documento";

    try {
      if (botao) {
        botao.disabled = true;
        botao.textContent = "Enviando...";
      }

      msg.textContent = "";

      const r = await fetch("/api/documentos", {
        method: "POST",
        headers: { Authorization: "Bearer " + t },
        body: formData
      });

      const dados = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dados.erro || "Erro ao enviar documento.");

      msg.textContent = "Documento enviado com sucesso!";
      msg.className = "text-success mt-2";
      form.reset();
      await carregarDocumentos();
    } catch (e) {
      console.error("Upload:", e);
      msg.textContent = e.message || "Erro ao enviar documento.";
      msg.className = "text-danger mt-2";
    } finally {
      if (botao) {
        botao.disabled = false;
        botao.textContent = original;
      }
    }
  });

  carregarDocumentos();
});

document.addEventListener("DOMContentLoaded", function () {
  // ======================================================
  // 1. ABRIR / FECHAR SIDEBAR (TOGGLE)
  // ======================================================
  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebar = document.getElementById("sidebar");
  const mainContent = document.querySelector(".main-content");

  if (sidebarToggle && sidebar && mainContent) {
    sidebarToggle.addEventListener("click", function () {
      const sidebarFechada = sidebar.classList.toggle("fechado");

      mainContent.classList.toggle("expandido", sidebarFechada);
      document.body.classList.toggle("sidebar-fechada", sidebarFechada);
      sidebarToggle.setAttribute("aria-expanded", String(!sidebarFechada));
    });
  }

  // ======================================================
  // 2. SISTEMA DE ROTAS / NAVEGAÇÃO ENTRE AS SEÇÕES DO HTML
  // ======================================================
  // Seleciona os links do menu lateral e os links do rodapé
  const menuLinks = document.querySelectorAll(
    ".nav-menu .menu-item, .footer-links a, .footer-brand",
  );

  menuLinks.forEach((link) => {
    link.addEventListener("click", function (event) {
      const targetId = this.getAttribute("href");

      // Verifica se o link clicado é uma rota interna (ex: #documento)
      if (targetId && targetId.startsWith("#")) {
        event.preventDefault();

        // Busca a seção com o ID correspondente ao href clicado
        const secaoAlvo = document.querySelector(targetId);

        if (secaoAlvo) {
          // 1. Oculta todas as seções filhas diretas da <main class="main-content">
          const todasAsSecoes = mainContent.children;
          Array.from(todasAsSecoes).forEach((secao) => {
            secao.classList.add("d-none");
          });

          // 2. Exibe apenas a seção selecionada
          secaoAlvo.classList.remove("d-none");

          // 3. Atualiza a marcação visual de item "ativo" no menu lateral
          document.querySelectorAll(".nav-menu .menu-item").forEach((item) => {
            item.classList.remove("ativo");
          });

          // Procura o item correspondente no menu da sidebar e ativa a cor de destaque
          const itemSidebarCorrespondente = document.querySelector(
            `.nav-menu a[href="${targetId}"]`,
          );
          if (itemSidebarCorrespondente) {
            itemSidebarCorrespondente.classList.add("ativo");
          }

          // 4. Rola a página para o topo de forma suave
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    });
  });

  // ======================================================
  // 3. RECUPERAÇÃO DE SENHA / LOGIN (SE HOUVER FORMULÁRIO)
  // ======================================================
  const loginSection = document.getElementById("loginSection");
  const forgotPasswordSection = document.getElementById(
    "forgotPasswordSection",
  );
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  const backToLogin = document.getElementById("backToLogin");
  const forgotPasswordForm = document.getElementById("forgotPasswordForm");

  /* Abrir formulário de recuperação de senha */
  if (forgotPasswordLink && forgotPasswordSection && loginSection) {
    forgotPasswordLink.addEventListener("click", function (event) {
      event.preventDefault();
      loginSection.hidden = true;
      forgotPasswordSection.hidden = false;
    });
  }

  /* Voltar para tela de login */
  if (backToLogin && forgotPasswordSection && loginSection) {
    backToLogin.addEventListener("click", function (event) {
      event.preventDefault();
      forgotPasswordSection.hidden = true;
      loginSection.hidden = false;
    });
  }

  /* Submissão do formulário de senha */
  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", function (event) {
      event.preventDefault();
      alert(
        "A recuperação de senha será conectada ao Back-end posteriormente.",
      );
    });
  }
});

// Filtro da Tela de Produtos Disponíveis
const filterButtons = document.querySelectorAll(".btn-filter");
const productCards = document.querySelectorAll(".product-card-item");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    // Altera visual dos botões
    filterButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");

    const category = button.getAttribute("data-category");

    // Exibe/Oculta os cards baseados na categoria
    productCards.forEach((card) => {
      if (
        category === "todos" ||
        card.getAttribute("data-category") === category
      ) {
        card.classList.remove("d-none");
      } else {
        card.classList.add("d-none");
      }
    });
  });
});

const productsTrack = document.getElementById("productsTrack");

const nextButton = document.querySelector(".products-next");
const prevButton = document.querySelector(".products-prev");

let currentProduct = 0;

/* =========================================================
   QUANTIDADE DE PRODUTOS VISÍVEIS
   ========================================================= */

function getVisibleProducts() {
  if (window.innerWidth <= 767) {
    return 1;
  }

  return 3;
}

/* =========================================================
   ATUALIZA O CARROSSEL
   ========================================================= */

function updateProductsCarousel() {
  const products = document.querySelectorAll(".product-slide");

  const visibleProducts = getVisibleProducts();

  const totalProducts = products.length;

  const maxPosition = totalProducts - visibleProducts;

  /* Não deixa passar do limite */

  if (currentProduct > maxPosition) {
    currentProduct = maxPosition;
  }

  if (currentProduct < 0) {
    currentProduct = 0;
  }

  /* Calcula o tamanho de cada produto */

  const productWidth = products[0].getBoundingClientRect().width;

  const gap = 15;

  /* Move os produtos */

  productsTrack.style.transform = `translateX(-${currentProduct * (productWidth + gap)}px)`;

  /* Desativa botão anterior */

  prevButton.disabled = currentProduct === 0;

  /* Desativa botão próximo */

  nextButton.disabled = currentProduct >= maxPosition;
}

/* =========================================================
   PRÓXIMO
   ========================================================= */

nextButton.addEventListener("click", () => {
  const products = document.querySelectorAll(".product-slide");

  const visibleProducts = getVisibleProducts();

  const maxPosition = products.length - visibleProducts;

  if (currentProduct < maxPosition) {
    currentProduct++;

    updateProductsCarousel();
  }
});

/* =========================================================
   ANTERIOR
   ========================================================= */

prevButton.addEventListener("click", () => {
  if (currentProduct > 0) {
    currentProduct--;

    updateProductsCarousel();
  }
});

/* =========================================================
   RESPONSIVIDADE
   ========================================================= */

window.addEventListener("resize", () => {
  updateProductsCarousel();
});

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

updateProductsCarousel();

document.addEventListener("DOMContentLoaded", function () {
  // 1. Busca ao vivo nas Perguntas Frequentes (FAQ)
  const searchInput = document.getElementById("helpSearchInput");
  const faqItems = document.querySelectorAll(".faq-item");

  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      const searchTerm = e.target.value.toLowerCase().trim();

      faqItems.forEach((item) => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
          item.classList.remove("d-none");
        } else {
          item.classList.add("d-none");
        }
      });
    });
  }

  // 2. Filtro rápido ao clicar nos Cards de Categoria
  const categoryCards = document.querySelectorAll(".help-cat-card");

  categoryCards.forEach((card) => {
    card.addEventListener("click", function () {
      const cat = this.getAttribute("data-cat");

      faqItems.forEach((item) => {
        const itemCat = item.getAttribute("data-category");
        if (cat === "contatos" || itemCat === cat) {
          item.classList.remove("d-none");
        } else {
          item.classList.add("d-none");
        }
      });
    });
  });

  // 3. Simulação de Envio do Formulário de Suporte
  const contactForm = document.getElementById("helpContactForm");

  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      alert(
        "Sua dúvida foi enviada com sucesso! A equipe da AAPM responderá no seu e-mail em breve.",
      );
      contactForm.reset();
    });
  }
});

document.addEventListener("DOMContentLoaded", function () {
  /* =========================================================
       NAVEGAÇÃO ENTRE AS TELAS
    ========================================================= */

  const telas = [
    "inicio",
    "documento",
    "pedidos",
    "avisos",
    "sobre",
    "formatura",
    "ajuda",
    "usuarios",
    "perfil",
    "configuracoes",
  ];

  function mostrarTela(id) {
    // Verifica se a tela existe
    const tela = document.getElementById(id);

    if (!tela) {
      console.warn("Tela não encontrada:", id);
      return;
    }

    // Esconde todas as telas
    telas.forEach(function (telaId) {
      const elemento = document.getElementById(telaId);

      if (elemento) {
        elemento.classList.add("d-none");
      }
    });

    // Mostra a tela selecionada
    tela.classList.remove("d-none");

    // Atualiza menu lateral
    document.querySelectorAll(".menu-item").forEach(function (item) {
      item.classList.remove("ativo");

      const href = item.getAttribute("href");

      if (href === "#" + id) {
        item.classList.add("ativo");
      }
    });

    // Volta o conteúdo para o topo
    const mainContent = document.querySelector(".main-content");

    if (mainContent) {
      mainContent.scrollTop = 0;
    }
  }

  /* =========================================================
       NAVEGAÇÃO POR HASH
    ========================================================= */

  function navegarPeloHash() {
    let id = window.location.hash.replace("#", "");

    // Corrige caso não exista hash
    if (!id || !telas.includes(id)) {
      id = "inicio";
    }

    mostrarTela(id);
  }

  // Detecta mudança de # na URL
  window.addEventListener("hashchange", navegarPeloHash);

  // Links que possuem #
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (event) {
      const href = this.getAttribute("href");

      if (!href || href === "#") {
        return;
      }

      const id = href.substring(1);

      if (telas.includes(id)) {
        event.preventDefault();

        window.location.hash = id;

        mostrarTela(id);
      }
    });
  });

  /* =========================================================
       SIDEBAR
    ========================================================= */

  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebar = document.getElementById("sidebar");

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", function () {
      sidebar.classList.toggle("collapsed");
    });
  }

  /* =========================================================
       MEU PERFIL
    ========================================================= */

  const perfilForm = document.getElementById("perfilForm");

  const profilePhoto = document.getElementById("profilePhoto");
  const profilePreview = document.getElementById("profilePreview");

  const nomeInput = document.getElementById("nome");
  const emailInput = document.getElementById("email");
  const dataNascimentoInput = document.getElementById("dataNascimento");
  const cpfInput = document.getElementById("cpf");
  const telefoneInput = document.getElementById("telefone");
  const generoInput = document.getElementById("genero");
  const observacaoInput = document.getElementById("observacao");

  /* =========================================================
       CARREGAR PERFIL SALVO
    ========================================================= */

  function carregarPerfil() {
    const perfilSalvo = localStorage.getItem("techcampusPerfil");

    if (!perfilSalvo) {
      return;
    }

    try {
      const perfil = JSON.parse(perfilSalvo);

      if (nomeInput) {
        nomeInput.value = perfil.nome || "";
      }

      if (emailInput) {
        emailInput.value = perfil.email || "";
      }

      if (dataNascimentoInput) {
        dataNascimentoInput.value = perfil.dataNascimento || "";
      }

      if (cpfInput) {
        cpfInput.value = perfil.cpf || "";
      }

      if (telefoneInput) {
        telefoneInput.value = perfil.telefone || "";
      }

      if (generoInput) {
        generoInput.value = perfil.genero || "";
      }

      if (observacaoInput) {
        observacaoInput.value = perfil.observacao || "";
      }

      if (perfil.foto && profilePreview) {
        profilePreview.src = perfil.foto;
      }
    } catch (erro) {
      console.error("Erro ao carregar perfil:", erro);
    }
  }

  /* =========================================================
       SALVAR PERFIL
    ========================================================= */

  if (perfilForm) {
    perfilForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const perfil = {
        nome: nomeInput ? nomeInput.value.trim() : "",

        email: emailInput ? emailInput.value.trim() : "",

        dataNascimento: dataNascimentoInput ? dataNascimentoInput.value : "",

        cpf: cpfInput ? cpfInput.value.trim() : "",

        telefone: telefoneInput ? telefoneInput.value.trim() : "",

        genero: generoInput ? generoInput.value : "",

        observacao: observacaoInput ? observacaoInput.value.trim() : "",

        foto: profilePreview ? profilePreview.src : "",
      };

      localStorage.setItem("techcampusPerfil", JSON.stringify(perfil));

      // Atualiza nome no topo
      atualizarNomeUsuario(perfil.nome);

      mostrarMensagem("Perfil atualizado com sucesso!", "success");
    });
  }

  /* =========================================================
       FOTO DE PERFIL
    ========================================================= */

  if (profilePhoto) {
    profilePhoto.addEventListener("change", function () {
      const arquivo = this.files[0];

      if (!arquivo) {
        return;
      }

      // Verifica o tamanho
      if (arquivo.size > 5 * 1024 * 1024) {
        mostrarMensagem("A foto deve ter no máximo 5 MB.", "danger");

        this.value = "";

        return;
      }

      // Verifica o tipo
      const tiposPermitidos = ["image/jpeg", "image/png"];

      if (!tiposPermitidos.includes(arquivo.type)) {
        mostrarMensagem("Utilize uma imagem JPG ou PNG.", "danger");

        this.value = "";

        return;
      }

      const leitor = new FileReader();

      leitor.onload = function (event) {
        if (profilePreview) {
          profilePreview.src = event.target.result;

          salvarFotoTemporaria(event.target.result);
        }
      };

      leitor.readAsDataURL(arquivo);
    });
  }

  /* =========================================================
       SALVAR FOTO NO LOCALSTORAGE
    ========================================================= */

  function salvarFotoTemporaria(foto) {
    const perfilSalvo = localStorage.getItem("techcampusPerfil");

    let perfil = {};

    if (perfilSalvo) {
      try {
        perfil = JSON.parse(perfilSalvo);
      } catch (erro) {
        perfil = {};
      }
    }

    perfil.foto = foto;

    localStorage.setItem("techcampusPerfil", JSON.stringify(perfil));
  }

  /* =========================================================
       BOTÃO CANCELAR DO PERFIL
    ========================================================= */

  const botoesCancelar = document.querySelectorAll(
    "#perfilForm .btn-secondary",
  );

  botoesCancelar.forEach(function (botao) {
    botao.addEventListener("click", function () {
      carregarPerfil();

      mostrarMensagem("Alterações canceladas.", "secondary");
    });
  });

  /* =========================================================
       MÁSCARA CPF
    ========================================================= */

  if (cpfInput) {
    cpfInput.addEventListener("input", function () {
      let valor = this.value.replace(/\D/g, "");

      valor = valor.substring(0, 11);

      valor = valor.replace(/(\d{3})(\d)/, "$1.$2");

      valor = valor.replace(/(\d{3})(\d)/, "$1.$2");

      valor = valor.replace(/(\d{3})(\d{1,2})$/, "$1-$2");

      this.value = valor;
    });
  }

  /* =========================================================
       MÁSCARA TELEFONE
    ========================================================= */

  if (telefoneInput) {
    telefoneInput.addEventListener("input", function () {
      let valor = this.value.replace(/\D/g, "");

      valor = valor.substring(0, 11);

      if (valor.length <= 10) {
        valor = valor.replace(/(\d{2})(\d)/, "($1) $2");

        valor = valor.replace(/(\d{4})(\d)/, "$1-$2");
      } else {
        valor = valor.replace(/(\d{2})(\d)/, "($1) $2");

        valor = valor.replace(/(\d{5})(\d)/, "$1-$2");
      }

      this.value = valor;
    });
  }

  /* =========================================================
       CONFIGURAÇÕES
    ========================================================= */

  const configuracoesForm = document.getElementById("configuracoesForm");

  function carregarConfiguracoes() {
    const configuracoesSalvas = localStorage.getItem("techcampusConfiguracoes");

    if (!configuracoesSalvas) {
      return;
    }

    try {
      const config = JSON.parse(configuracoesSalvas);

      const notificacoesSistema = document.getElementById(
        "notificacoesSistema",
      );

      const notificacoesEmail = document.getElementById("notificacoesEmail");

      const exibirTelefone = document.getElementById("exibirTelefone");

      const exibirEmail = document.getElementById("exibirEmail");

      const tema = document.getElementById("tema");

      if (notificacoesSistema) {
        notificacoesSistema.checked = config.notificacoesSistema ?? true;
      }

      if (notificacoesEmail) {
        notificacoesEmail.checked = config.notificacoesEmail ?? true;
      }

      if (exibirTelefone) {
        exibirTelefone.checked = config.exibirTelefone ?? false;
      }

      if (exibirEmail) {
        exibirEmail.checked = config.exibirEmail ?? false;
      }

      if (tema) {
        tema.value = config.tema || "escuro";
      }
    } catch (erro) {
      console.error("Erro ao carregar configurações:", erro);
    }
  }

  /* =========================================================
       SALVAR CONFIGURAÇÕES
    ========================================================= */

  if (configuracoesForm) {
    configuracoesForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const configuracoes = {
        notificacoesSistema:
          document.getElementById("notificacoesSistema")?.checked ?? true,

        notificacoesEmail:
          document.getElementById("notificacoesEmail")?.checked ?? true,

        exibirTelefone:
          document.getElementById("exibirTelefone")?.checked ?? false,

        exibirEmail: document.getElementById("exibirEmail")?.checked ?? false,

        tema: document.getElementById("tema")?.value || "escuro",
      };

      localStorage.setItem(
        "techcampusConfiguracoes",
        JSON.stringify(configuracoes),
      );

      aplicarTema(configuracoes.tema);

      mostrarMensagem("Configurações salvas com sucesso!", "success");
    });
  }

  /* =========================================================
       TEMA
    ========================================================= */

  function aplicarTema(tema) {
    /*
     * Por enquanto o TechCampus continua
     * utilizando o tema escuro.
     *
     * O suporte ao tema claro pode ser
     * implementado posteriormente no CSS.
     */

    if (tema === "escuro") {
      document.body.classList.remove("tema-claro");
    }

    if (tema === "claro") {
      document.body.classList.add("tema-claro");
    }

    if (tema === "sistema") {
      const prefereClaro = window.matchMedia(
        "(prefers-color-scheme: light)",
      ).matches;

      document.body.classList.toggle("tema-claro", prefereClaro);
    }
  }

  /* =========================================================
       RESTAURAR CONFIGURAÇÕES
    ========================================================= */

  const restaurarBtn = document.querySelector(
    "#configuracoesForm .settings-actions .btn-secondary",
  );

  if (restaurarBtn) {
    restaurarBtn.addEventListener("click", function () {
      const confirmar = confirm("Deseja restaurar as configurações padrão?");

      if (!confirmar) {
        return;
      }

      localStorage.removeItem("techcampusConfiguracoes");

      const notificacoesSistema = document.getElementById(
        "notificacoesSistema",
      );

      const notificacoesEmail = document.getElementById("notificacoesEmail");

      const exibirTelefone = document.getElementById("exibirTelefone");

      const exibirEmail = document.getElementById("exibirEmail");

      const tema = document.getElementById("tema");

      if (notificacoesSistema) notificacoesSistema.checked = true;

      if (notificacoesEmail) notificacoesEmail.checked = true;

      if (exibirTelefone) exibirTelefone.checked = false;

      if (exibirEmail) exibirEmail.checked = false;

      if (tema) tema.value = "escuro";

      aplicarTema("escuro");

      mostrarMensagem("Configurações restauradas.", "success");
    });
  }

  /* =========================================================
       ATUALIZAR NOME DO USUÁRIO
    ========================================================= */

  function atualizarNomeUsuario(nome) {
    if (!nome) {
      return;
    }

    const nomeTopo = document.querySelector("#userDropdown .fw-semibold");

    if (nomeTopo) {
      nomeTopo.textContent = nome;
    }
  }

  /* =========================================================
       MENSAGEM TEMPORÁRIA
    ========================================================= */

  function mostrarMensagem(mensagem, tipo = "success") {
    const antiga = document.getElementById("techcampusMessage");

    if (antiga) {
      antiga.remove();
    }

    const alerta = document.createElement("div");

    alerta.id = "techcampusMessage";

    alerta.className = `alert alert-${tipo} position-fixed`;

    alerta.style.top = "80px";
    alerta.style.right = "25px";
    alerta.style.zIndex = "9999";
    alerta.style.minWidth = "280px";

    alerta.innerHTML = `
            <div class="d-flex align-items-center gap-2">
                <i class="bi bi-check-circle"></i>
                <span>${mensagem}</span>
            </div>
        `;

    document.body.appendChild(alerta);

    setTimeout(function () {
      alerta.remove();
    }, 3000);
  }

  /* =========================================================
       INICIALIZAÇÃO
    ========================================================= */

  carregarPerfil();

  carregarConfiguracoes();

  const perfilSalvo = localStorage.getItem("techcampusPerfil");

  if (perfilSalvo) {
    try {
      const perfil = JSON.parse(perfilSalvo);

      atualizarNomeUsuario(perfil.nome);
    } catch (erro) {
      console.error(erro);
    }
  }

  // Inicializa a tela correta
  navegarPeloHash();
});

/* =========================================================
   PRODUTOS - FILTROS + CARROSSEL
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const carousel = document.getElementById("productsCarousel");
  const track = document.getElementById("productsTrack");

  if (!carousel || !track) {
    return;
  }

  const prevButton = carousel.querySelector(".products-prev");
  const nextButton = carousel.querySelector(".products-next");

  const categoryButtons = document.querySelectorAll(
    ".products-filters .btn-filter",
  );

  const products = Array.from(track.querySelectorAll(".product-slide"));

  /*
   * Índice atual do carrossel.
   */
  let currentIndex = 0;

  /*
   * Categoria atual.
   */
  let currentCategory = "todos";

  /*
   * Quantidade de produtos visíveis.
   */
  function getVisibleProducts() {
    if (window.innerWidth <= 767) {
      return 1;
    }

    if (window.innerWidth <= 1199) {
      return 2;
    }

    return 3;
  }

  /*
   * Produtos pertencentes à categoria selecionada.
   */
  function getFilteredProducts() {
    if (currentCategory === "todos") {
      return products;
    }

    return products.filter((product) => {
      return product.dataset.category === currentCategory;
    });
  }

  /*
   * Atualiza o estado visual dos botões.
   */
  function updateButtons() {
    categoryButtons.forEach((button) => {
      const category = button.dataset.category;

      button.classList.toggle("active", category === currentCategory);
    });
  }

  /*
   * Atualiza os controles do carrossel.
   */
  function updateCarouselControls() {
    if (currentCategory !== "todos") {
      if (prevButton) {
        prevButton.style.display = "none";
      }

      if (nextButton) {
        nextButton.style.display = "none";
      }

      return;
    }

    if (prevButton) {
      prevButton.style.display = "";
    }

    if (nextButton) {
      nextButton.style.display = "";
    }

    const visibleProducts = getVisibleProducts();

    const maxIndex = Math.max(0, products.length - visibleProducts);

    if (prevButton) {
      prevButton.disabled = currentIndex <= 0;
    }

    if (nextButton) {
      nextButton.disabled = currentIndex >= maxIndex;
    }
  }

  /*
   * Atualiza a posição do carrossel.
   */
  function updateCarouselPosition() {
    if (currentCategory !== "todos") {
      track.style.transform = "none";

      return;
    }

    const visibleProducts = getVisibleProducts();

    if (!products.length) {
      return;
    }

    const firstProduct = products[0];

    const productWidth = firstProduct.offsetWidth;

    if (!productWidth) {
      return;
    }

    const gap = parseFloat(getComputedStyle(track).gap) || 0;

    const move = currentIndex * (productWidth + gap);

    track.style.transform = `translateX(-${move}px)`;
  }

  /*
   * Mostra/esconde os produtos de acordo com a categoria.
   */
  function filterProducts() {
    const filteredProducts = getFilteredProducts();

    /*
     * MODO TODOS
     *
     * Todos os produtos aparecem e
     * o carrossel fica ativo.
     */
    if (currentCategory === "todos") {
      carousel.classList.remove("category-mode");

      products.forEach((product) => {
        product.classList.remove("product-hidden");

        product.style.display = "";
      });

      currentIndex = 0;

      updateCarouselPosition();
      updateCarouselControls();

      return;
    }

    /*
     * MODO CATEGORIA
     *
     * O carrossel é desativado.
     */
    carousel.classList.add("category-mode");

    products.forEach((product) => {
      const productCategory = product.dataset.category;

      if (productCategory === currentCategory) {
        product.classList.remove("product-hidden");

        product.style.display = "";
      } else {
        product.classList.add("product-hidden");

        product.style.display = "none";
      }
    });

    /*
     * Garante que o track não fique
     * deslocado por causa do carrossel.
     */
    track.style.transform = "none";

    updateCarouselControls();
  }

  /*
   * Clique nas categorias.
   */
  categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;

      if (!category) {
        return;
      }

      currentCategory = category;

      updateButtons();

      filterProducts();
    });
  });

  /*
   * Botão ANTERIOR.
   */
  if (prevButton) {
    prevButton.addEventListener("click", () => {
      if (currentCategory !== "todos") {
        return;
      }

      currentIndex--;

      if (currentIndex < 0) {
        currentIndex = 0;
      }

      updateCarouselPosition();
      updateCarouselControls();
    });
  }

  /*
   * Botão PRÓXIMO.
   */
  if (nextButton) {
    nextButton.addEventListener("click", () => {
      if (currentCategory !== "todos") {
        return;
      }

      const visibleProducts = getVisibleProducts();

      const maxIndex = Math.max(0, products.length - visibleProducts);

      currentIndex++;

      if (currentIndex > maxIndex) {
        currentIndex = maxIndex;
      }

      updateCarouselPosition();
      updateCarouselControls();
    });
  }

  /*
   * Ao redimensionar a tela,
   * recalcula o carrossel.
   */
  window.addEventListener("resize", () => {
    if (currentCategory === "todos") {
      const visibleProducts = getVisibleProducts();

      const maxIndex = Math.max(0, products.length - visibleProducts);

      if (currentIndex > maxIndex) {
        currentIndex = maxIndex;
      }

      updateCarouselPosition();
      updateCarouselControls();
    }
  });

  /*
   * Inicialização.
   */
  updateButtons();

  filterProducts();
});

/* =========================================================
   AVISOS GERAIS - CALENDÁRIO
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const calendarDays = document.getElementById("calendarDays");
  const calendarMonth = document.getElementById("calendarMonth");

  const previousButton = document.getElementById("calendarPrev");
  const nextButton = document.getElementById("calendarNext");
  const todayButton = document.getElementById("calendarToday");

  if (!calendarDays || !calendarMonth) {
    return;
  }

  /* =======================================================
     DADOS DOS AVISOS

     Futuramente estes dados podem vir da API:
     GET /api/avisos
  ======================================================= */

  const avisos = [
    {
      id: 1,
      titulo: "Semana de Integração 2026",
      categoria: "evento",
      data: "2026-09-30",
      horario: "08:00",
      local: "Auditório SENAI",
      descricao:
        "Participe da Semana de Integração 2026. Serão realizadas atividades para integração entre os alunos.",
    },

    {
      id: 2,
      titulo: "Entrega de Projetos",
      categoria: "academico",
      data: "2026-10-02",
      horario: "23:59",
      local: "Plataforma TechCampus",
      descricao: "Prazo final para entrega dos projetos acadêmicos da turma.",
    },

    {
      id: 3,
      titulo: "Reunião da AAPM",
      categoria: "reuniao",
      data: "2026-10-05",
      horario: "15:00",
      local: "Sala de reuniões da AAPM",
      descricao:
        "Reunião para tratar das atividades, projetos e próximos eventos da AAPM.",
    },

    {
      id: 4,
      titulo: "Prazo para documentação",
      categoria: "importante",
      data: "2026-10-08",
      horario: "17:00",
      local: "TechCampus",
      descricao: "Último dia para envio dos documentos pendentes para análise.",
    },
  ];

  /* =======================================================
     ESTADO DO CALENDÁRIO
  ======================================================= */

  let currentDate = new Date();

  /* =======================================================
     NOMES DOS MESES
  ======================================================= */

  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  /* =======================================================
     RENDERIZAR CALENDÁRIO
  ======================================================= */

  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    calendarMonth.textContent = `${monthNames[month]} ${year}`;

    calendarDays.innerHTML = "";

    /* Primeiro dia do mês */

    const firstDay = new Date(year, month, 1).getDay();

    /* Último dia do mês */

    const lastDate = new Date(year, month + 1, 0).getDate();

    /* Dias do mês anterior */

    const previousLastDate = new Date(year, month, 0).getDate();

    /* =====================================================
       DIAS DO MÊS ANTERIOR
    ====================================================== */

    for (let i = firstDay - 1; i >= 0; i--) {
      const day = createDayElement(previousLastDate - i, true);

      calendarDays.appendChild(day);
    }

    /* =====================================================
       DIAS DO MÊS ATUAL
    ====================================================== */

    for (let dayNumber = 1; dayNumber <= lastDate; dayNumber++) {
      const day = createDayElement(dayNumber, false);

      calendarDays.appendChild(day);
    }

    /* =====================================================
       COMPLETAR GRID
    ====================================================== */

    const totalCells = calendarDays.children.length;

    const remaining = (7 - (totalCells % 7)) % 7;

    for (let i = 1; i <= remaining; i++) {
      const day = createDayElement(i, true);

      calendarDays.appendChild(day);
    }
  }

  /* =======================================================
     CRIAR DIA
  ======================================================= */

  function createDayElement(dayNumber, otherMonth) {
    const element = document.createElement("div");

    element.className = "calendar-day";

    if (otherMonth) {
      element.classList.add("other-month");

      element.innerHTML = `
        <span class="calendar-day-number">
          ${dayNumber}
        </span>
      `;

      return element;
    }

    const year = currentDate.getFullYear();

    const month = currentDate.getMonth();

    const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;

    /* =====================================================
       VERIFICAR SE É HOJE
    ====================================================== */

    const today = new Date();

    if (
      dayNumber === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    ) {
      element.classList.add("today");
    }

    /* =====================================================
       AVISOS DO DIA
    ====================================================== */

    const dayAvisos = avisos.filter((aviso) => aviso.data === dateString);

    let eventsHTML = "";

    dayAvisos.forEach((aviso) => {
      eventsHTML += `
        <div
          class="calendar-event ${aviso.categoria}"
          title="${aviso.titulo}">

          ${aviso.titulo}

        </div>
      `;
    });

    element.innerHTML = `

      <span class="calendar-day-number">
        ${dayNumber}
      </span>

      <div class="calendar-events">
        ${eventsHTML}
      </div>

    `;

    /* =====================================================
       CLIQUE NO DIA
    ====================================================== */

    if (dayAvisos.length > 0) {
      element.addEventListener("click", () => {
        abrirAviso(dayAvisos[0]);
      });
    }

    return element;
  }

  /* =======================================================
     ABRIR MODAL
  ======================================================= */

  function abrirAviso(aviso) {
    const modalElement = document.getElementById("avisoModal");

    if (!modalElement) return;

    document.getElementById("avisoModalLabel").textContent = aviso.titulo;

    document.getElementById("modalAvisoCategoria").textContent =
      formatarCategoria(aviso.categoria);

    document.getElementById("modalAvisoCategoria").className =
      `agenda-tag ${aviso.categoria}`;

    document.getElementById("modalAvisoData").textContent = formatarData(
      aviso.data,
    );

    document.getElementById("modalAvisoHorario").textContent = aviso.horario;

    document.getElementById("modalAvisoLocal").textContent = aviso.local;

    document.getElementById("modalAvisoDescricao").textContent =
      aviso.descricao;

    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

    modal.show();
  }

  /* =======================================================
     FORMATAR CATEGORIA
  ======================================================= */

  function formatarCategoria(categoria) {
    const categorias = {
      evento: "Evento",

      academico: "Acadêmico",

      reuniao: "Reunião",

      importante: "Importante",
    };

    return categorias[categoria] || "Aviso";
  }

  /* =======================================================
     FORMATAR DATA
  ======================================================= */

  function formatarData(data) {
    const partes = data.split("-");

    const dataObj = new Date(
      Number(partes[0]),
      Number(partes[1]) - 1,
      Number(partes[2]),
    );

    return dataObj.toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  /* =======================================================
     NAVEGAÇÃO
  ======================================================= */

  previousButton?.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);

    renderCalendar();
  });

  nextButton?.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);

    renderCalendar();
  });

  todayButton?.addEventListener("click", () => {
    currentDate = new Date();

    renderCalendar();
  });

  /* =======================================================
     FILTROS
  ======================================================= */

  const filterButtons = document.querySelectorAll(".avisos-filter");

  const agendaItems = document.querySelectorAll(".agenda-item");

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;

      filterButtons.forEach((btn) => {
        btn.classList.remove("active");
        btn.classList.remove("btn-danger");

        btn.classList.add("btn-outline-secondary");
      });

      button.classList.add("active");
      button.classList.remove("btn-outline-secondary");
      button.classList.add("btn-danger");

      let visible = 0;

      agendaItems.forEach((item) => {
        const category = item.dataset.category;

        const show = filter === "todos" || category === filter;

        item.style.display = show ? "flex" : "none";

        if (show) {
          visible++;
        }
      });

      const empty = document.getElementById("agendaEmpty");

      if (empty) {
        empty.classList.toggle("d-none", visible !== 0);
      }
    });
  });

  /* =======================================================
     CLIQUE NOS PRÓXIMOS AVISOS
  ======================================================= */

  agendaItems.forEach((item) => {
    item.addEventListener("click", () => {
      const id = Number(item.dataset.aviso);

      const aviso = avisos.find((aviso) => aviso.id === id);

      if (aviso) {
        abrirAviso(aviso);
      }
    });
  });

  /* =======================================================
     INICIALIZAR
  ======================================================= */

  renderCalendar();
});

/* VOLTAR DAS CONFIGURAÇÕES */

document.addEventListener("DOMContentLoaded", () => {
  const botaoVoltar = document.getElementById("voltarConfiguracoes");

  const linksConfiguracoes = document.querySelectorAll(
    'a[href="#configuracoes"]',
  );

  const telas = [
    "inicio",
    "documento",
    "pedidos",
    "avisos",
    "sobre",
    "formatura",
    "ajuda",
    "perfil",
  ];

  let telaAnterior = "inicio";

  function obterTelaAtual() {
    // Prioriza a seção que está realmente visível.
    for (const id of telas) {
      const secao = document.getElementById(id);

      if (
        secao &&
        !secao.classList.contains("d-none") &&
        getComputedStyle(secao).display !== "none"
      ) {
        return id;
      }
    }

    // Alternativa: usa a URL.
    const hash = location.hash.replace("#", "");

    return telas.includes(hash) ? hash : "inicio";
  }

  // Guarda a tela ao clicar em Configurações.
  linksConfiguracoes.forEach((link) => {
    link.addEventListener(
      "click",
      () => {
        telaAnterior = obterTelaAtual();
      },
      { capture: true },
    );
  });

  if (botaoVoltar) {
    botaoVoltar.addEventListener("click", () => {
      const destino = telas.includes(telaAnterior) ? telaAnterior : "inicio";

      // Reutiliza a navegação existente do sistema.
      const linkMenu = document.querySelector(
        `.nav-menu a[href="#${destino}"]`,
      );

      if (linkMenu) {
        linkMenu.click();
      } else {
        location.hash = destino;
      }
    });
  }
});

/* TechCampus: organiza Perfil e Configurações na mesma área das outras telas. */
(() => {
  "use strict";
  const ids = [
    "inicio",
    "documento",
    "pedidos",
    "avisos",
    "sobre",
    "formatura",
    "ajuda",
    "perfil",
    "configuracoes",
  ];
  let previous = "inicio";
  const visible = (el) =>
    el &&
    !el.classList.contains("d-none") &&
    getComputedStyle(el).display !== "none";
  const current = () =>
    ids.find(
      (id) => id !== "configuracoes" && visible(document.getElementById(id)),
    ) || "inicio";
  document.addEventListener("DOMContentLoaded", () => {
    const main = document.querySelector(".layout-wrapper > .main-content");
    if (!main) {
      console.warn("TechCampus: .main-content não encontrado.");
      return;
    }
    // Corrige a estrutura sem recriar os formulários nem perder IDs/eventos.
    for (const id of ["perfil", "configuracoes"]) {
      const section = document.getElementById(id);
      if (section && section.parentElement !== main) main.appendChild(section);
    }
    const back = document.getElementById("voltarConfiguracoes");
    // Captura a tela de origem antes de o script principal ocultá-la.
    document.querySelectorAll('a[href="#configuracoes"]').forEach((link) => {
      link.addEventListener(
        "click",
        () => {
          previous = current();
        },
        true,
      );
    });
    back?.addEventListener("click", () => {
      const target =
        document.getElementById(previous) || document.getElementById("inicio");
      if (!target) return;
      // Navega pelo mesmo mecanismo já usado pelos links do TechCampus.
      const nav = document.querySelector(`.nav-menu a[href="#${target.id}"]`);
      if (nav) nav.click();
      else {
        ids.forEach((id) =>
          document.getElementById(id)?.classList.add("d-none"),
        );
        target.classList.remove("d-none");
        location.hash = target.id;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    // Corrige o fechamento da sidebar-top, caso o HTML original esteja incompleto.
    const sidebar = document.getElementById("sidebar");
    const sidebarTop = sidebar?.querySelector(".sidebar-top");
    const nav = sidebar?.querySelector(".nav-menu");
    const bottom = sidebar?.querySelector(".sidebar-bottom");
    if (sidebar && sidebarTop && nav && nav.parentElement === sidebarTop)
      sidebar.insertBefore(nav, bottom || null);
    if (sidebar && bottom && bottom.parentElement !== sidebar)
      sidebar.appendChild(bottom);
  });
})();

/* =========================================
   MODAL - DESTINOS DA FORMATURA
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {

  const modal = document.getElementById("modalDestino");

  if (!modal) return;

  const imagem = document.getElementById("modalDestinoImagem");
  const nome = document.getElementById("modalDestinoNome");
  const endereco = document.getElementById("modalDestinoEndereco");
  const descricao = document.getElementById("modalDestinoDescricao");
  const site = document.getElementById("modalDestinoSite");

  const destinos = document.querySelectorAll(".destino-clicavel");

  destinos.forEach((destino) => {

    destino.addEventListener("click", () => {

      const local = destino.dataset.local;
      const enderecoLocal = destino.dataset.endereco;
      const descricaoLocal = destino.dataset.descricao;
      const imagemLocal = destino.dataset.imagem;
      const siteLocal = destino.dataset.site;

      nome.textContent = local;

      endereco.textContent = enderecoLocal;

      descricao.textContent = descricaoLocal;

      imagem.src = imagemLocal;
      imagem.alt = local;

      /*
       * Se o local possuir site,
       * mostra o botão.
       */

      if (siteLocal && siteLocal !== "#") {

        site.href = siteLocal;
        site.style.display = "inline-block";

      } else {

        site.style.display = "none";

      }

    });

  });

});


document.addEventListener("DOMContentLoaded", () => {

    const menuUsuarios = document.getElementById("menuUsuarios");
    const secaoUsuarios = document.getElementById("usuarios");

    if (!menuUsuarios || !secaoUsuarios) {
        return;
    }

    let usuario = null;

    try {
        usuario = JSON.parse(localStorage.getItem("usuario"));
    } catch (erro) {
        usuario = null;
    }

    const tipoUsuario = usuario?.tipo || usuario?.perfil || usuario?.role;

    const ehAdmin =
        tipoUsuario &&
        tipoUsuario.toString().toLowerCase() === "admin";

    if (!ehAdmin) {
        // Esconde o item do menu
        menuUsuarios.style.display = "none";

        // Esconde a seção
        secaoUsuarios.style.display = "none";
    }

});

/* =========================================================
   PEDIDOS DISPONÍVEIS
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const botoes = document.querySelectorAll("#pedidos .product-slide button:not(.products-control)");

  botoes.forEach((botao) => {
    botao.addEventListener("click", async () => {
      const card = botao.closest(".product-slide");
      const nomeElemento = card?.querySelector("h5");
      const token = sessionStorage.getItem("techcampus_token");

      if (!nomeElemento) return;

      if (!token) {
        alert("Faça login novamente para realizar o pedido.");
        return;
      }

      const nomeTela = nomeElemento.textContent
        .trim()
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toLowerCase()
        .replace(/\\s+/g, " ");

      const textoOriginal = botao.textContent.trim();
      botao.disabled = true;
      botao.textContent = "Processando...";

      try {
        const respostaProdutos = await fetch("/api/produtos");
        const produtos = await respostaProdutos.json();

        if (!respostaProdutos.ok) {
          throw new Error(produtos.erro || "Não foi possível carregar os produtos.");
        }

        const produto = produtos.find((item) => {
          const nomeBanco = String(item.nome || "")
            .trim()
            .normalize("NFD")
            .replace(/[\\u0300-\\u036f]/g, "")
            .toLowerCase()
            .replace(/\\s+/g, " ");

          return nomeBanco === nomeTela;
        });

        if (!produto) {
          throw new Error("Produto não encontrado no sistema.");
        }

        if (Number(produto.estoque) < 1) {
          throw new Error("Este produto está sem estoque.");
        }

        const respostaPedido = await fetch("/api/pedidos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            itens: [{ produto_id: produto.id, quantidade: 1 }],
          }),
        });

        const pedido = await respostaPedido.json().catch(() => ({}));

        if (!respostaPedido.ok) {
          throw new Error(pedido.erro || "Não foi possível realizar o pedido.");
        }

        alert("Pedido realizado com sucesso! Número do pedido: " + pedido.id);
      } catch (erro) {
        console.error("Pedido:", erro);
        alert(erro.message || "Não foi possível realizar o pedido.");
      } finally {
        botao.disabled = false;
        botao.textContent = textoOriginal;
      }
    });
  });
});
function mostrarQuemSomos(event) {
  event.preventDefault();

  const inicio = document.getElementById("inicio");
  const quemSomos = document.getElementById("quem-somos");

  inicio.classList.add("d-none");
  quemSomos.classList.remove("d-none");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


function voltarInicio() {

  const inicio = document.getElementById("inicio");
  const quemSomos = document.getElementById("quem-somos");

  quemSomos.classList.add("d-none");
  inicio.classList.remove("d-none");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}
/* =========================================================
   MOSTRAR SEÇÃO
========================================================= */

function mostrarSecao(secao) {

    const elemento = document.getElementById(secao);

    if (!elemento) {
        return;
    }


    /*
       Se estiver abrindo a AAPM,
       fecha possibilidades.
    */

    if (secao === "aapm") {

        const possibilidades =
            document.getElementById("possibilidades");

        if (possibilidades) {
            possibilidades.classList.remove("mostrar");
        }

    }


    /*
       Se estiver abrindo possibilidades,
       fecha AAPM.
    */

    if (secao === "possibilidades") {

        const aapm =
            document.getElementById("aapm");

        if (aapm) {
            aapm.classList.remove("mostrar");
        }

    }


    /*
       Mostra a seção escolhida.
    */

    elemento.classList.add("mostrar");


    /*
       Rola automaticamente até ela.
    */

    setTimeout(function () {

        elemento.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    }, 100);

}



/* =========================================================
   FECHAR SEÇÃO
========================================================= */

function fecharSecao(secao) {

    const elemento =
        document.getElementById(secao);

    if (!elemento) {
        return;
    }


    elemento.classList.remove("mostrar");


    /*
       Volta para o início.
    */

    document.getElementById("inicio").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}



/* =========================================================
   FAQ
========================================================= */

const faqItems =
    document.querySelectorAll(".faq-item");


faqItems.forEach(function (item) {

    const button =
        item.querySelector(".faq-question");

    const symbol =
        item.querySelector(".symbol");


    button.addEventListener("click", function () {

        const estavaAberto =
            item.classList.contains("active");


        /*
           Fecha todos os outros.
        */

        faqItems.forEach(function (outroItem) {

            outroItem.classList.remove("active");

            const outroSymbol =
                outroItem.querySelector(".symbol");

            if (outroSymbol) {
                outroSymbol.textContent = "+";
            }

        });


        /*
           Abre o clicado.
        */

        if (!estavaAberto) {

            item.classList.add("active");

            symbol.textContent = "−";

        }

    });

});



/* =========================================================
   LINKS DO MENU
========================================================= */

const linksMenu =
    document.querySelectorAll('a[href^="#"]');


linksMenu.forEach(function (link) {

    link.addEventListener("click", function (event) {

        const destinoID =
            this.getAttribute("href");

        const destino =
            document.querySelector(destinoID);


        if (!destino) {
            return;
        }


        event.preventDefault();


        /*
           Se for uma seção que começa escondida,
           abre ela.
        */

        if (
            destino.id === "aapm" ||
            destino.id === "possibilidades"
        ) {

            mostrarSecao(destino.id);

            return;

        }


        /*
           Para as outras seções,
           apenas faz o scroll.
        */

        destino.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    });

});
