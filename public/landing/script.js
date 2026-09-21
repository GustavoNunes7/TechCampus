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
    const menuLinks = document.querySelectorAll(".nav-menu .menu-item, .footer-links a, .footer-brand");

    menuLinks.forEach(link => {
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
                    Array.from(todasAsSecoes).forEach(secao => {
                        secao.classList.add("d-none");
                    });

                    // 2. Exibe apenas a seção selecionada
                    secaoAlvo.classList.remove("d-none");

                    // 3. Atualiza a marcação visual de item "ativo" no menu lateral
                    document.querySelectorAll(".nav-menu .menu-item").forEach(item => {
                        item.classList.remove("ativo");
                    });

                    // Procura o item correspondente no menu da sidebar e ativa a cor de destaque
                    const itemSidebarCorrespondente = document.querySelector(`.nav-menu a[href="${targetId}"]`);
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
    const forgotPasswordSection = document.getElementById("forgotPasswordSection");
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
            alert("A recuperação de senha será conectada ao Back-end posteriormente.");
        });
    }

});

// Filtro da Tela de Produtos Disponíveis
const filterButtons = document.querySelectorAll(".btn-filter");
const productCards = document.querySelectorAll(".product-card-item");

filterButtons.forEach(button => {
    button.addEventListener("click", () => {
        // Altera visual dos botões
        filterButtons.forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");

        const category = button.getAttribute("data-category");

        // Exibe/Oculta os cards baseados na categoria
        productCards.forEach(card => {
            if (category === "todos" || card.getAttribute("data-category") === category) {
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

    productsTrack.style.transform =
        `translateX(-${currentProduct * (productWidth + gap)}px)`;


    /* Desativa botão anterior */

    prevButton.disabled = currentProduct === 0;


    /* Desativa botão próximo */

    nextButton.disabled =
        currentProduct >= maxPosition;
}


/* =========================================================
   PRÓXIMO
   ========================================================= */

nextButton.addEventListener("click", () => {

    const products = document.querySelectorAll(".product-slide");

    const visibleProducts = getVisibleProducts();

    const maxPosition =
        products.length - visibleProducts;


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

            faqItems.forEach(item => {
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

    categoryCards.forEach(card => {
        card.addEventListener("click", function () {
            const cat = this.getAttribute("data-cat");

            faqItems.forEach(item => {
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
            alert("Sua dúvida foi enviada com sucesso! A equipe da AAPM responderá no seu e-mail em breve.");
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
        "perfil",
        "configuracoes"
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

                dataNascimento: dataNascimentoInput
                    ? dataNascimentoInput.value
                    : "",

                cpf: cpfInput
                    ? cpfInput.value.trim()
                    : "",

                telefone: telefoneInput
                    ? telefoneInput.value.trim()
                    : "",

                genero: generoInput
                    ? generoInput.value
                    : "",

                observacao: observacaoInput
                    ? observacaoInput.value.trim()
                    : "",

                foto: profilePreview
                    ? profilePreview.src
                    : ""

            };


            localStorage.setItem(
                "techcampusPerfil",
                JSON.stringify(perfil)
            );


            // Atualiza nome no topo
            atualizarNomeUsuario(perfil.nome);


            mostrarMensagem(
                "Perfil atualizado com sucesso!",
                "success"
            );

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

                mostrarMensagem(
                    "A foto deve ter no máximo 5 MB.",
                    "danger"
                );

                this.value = "";

                return;
            }


            // Verifica o tipo
            const tiposPermitidos = [
                "image/jpeg",
                "image/png"
            ];

            if (!tiposPermitidos.includes(arquivo.type)) {

                mostrarMensagem(
                    "Utilize uma imagem JPG ou PNG.",
                    "danger"
                );

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

        localStorage.setItem(
            "techcampusPerfil",
            JSON.stringify(perfil)
        );

    }


    /* =========================================================
       BOTÃO CANCELAR DO PERFIL
    ========================================================= */

    const botoesCancelar = document.querySelectorAll(
        "#perfilForm .btn-secondary"
    );

    botoesCancelar.forEach(function (botao) {

        botao.addEventListener("click", function () {

            carregarPerfil();

            mostrarMensagem(
                "Alterações canceladas.",
                "secondary"
            );

        });

    });


    /* =========================================================
       MÁSCARA CPF
    ========================================================= */

    if (cpfInput) {

        cpfInput.addEventListener("input", function () {

            let valor = this.value.replace(/\D/g, "");

            valor = valor.substring(0, 11);

            valor = valor.replace(
                /(\d{3})(\d)/,
                "$1.$2"
            );

            valor = valor.replace(
                /(\d{3})(\d)/,
                "$1.$2"
            );

            valor = valor.replace(
                /(\d{3})(\d{1,2})$/,
                "$1-$2"
            );

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

                valor = valor.replace(
                    /(\d{2})(\d)/,
                    "($1) $2"
                );

                valor = valor.replace(
                    /(\d{4})(\d)/,
                    "$1-$2"
                );

            } else {

                valor = valor.replace(
                    /(\d{2})(\d)/,
                    "($1) $2"
                );

                valor = valor.replace(
                    /(\d{5})(\d)/,
                    "$1-$2"
                );

            }

            this.value = valor;

        });

    }


    /* =========================================================
       CONFIGURAÇÕES
    ========================================================= */

    const configuracoesForm =
        document.getElementById("configuracoesForm");


    function carregarConfiguracoes() {

        const configuracoesSalvas =
            localStorage.getItem("techcampusConfiguracoes");

        if (!configuracoesSalvas) {
            return;
        }

        try {

            const config = JSON.parse(configuracoesSalvas);


            const notificacoesSistema =
                document.getElementById("notificacoesSistema");

            const notificacoesEmail =
                document.getElementById("notificacoesEmail");

            const exibirTelefone =
                document.getElementById("exibirTelefone");

            const exibirEmail =
                document.getElementById("exibirEmail");

            const tema =
                document.getElementById("tema");


            if (notificacoesSistema) {
                notificacoesSistema.checked =
                    config.notificacoesSistema ?? true;
            }

            if (notificacoesEmail) {
                notificacoesEmail.checked =
                    config.notificacoesEmail ?? true;
            }

            if (exibirTelefone) {
                exibirTelefone.checked =
                    config.exibirTelefone ?? false;
            }

            if (exibirEmail) {
                exibirEmail.checked =
                    config.exibirEmail ?? false;
            }

            if (tema) {
                tema.value =
                    config.tema || "escuro";
            }

        } catch (erro) {

            console.error(
                "Erro ao carregar configurações:",
                erro
            );

        }

    }


    /* =========================================================
       SALVAR CONFIGURAÇÕES
    ========================================================= */

    if (configuracoesForm) {

        configuracoesForm.addEventListener(
            "submit",
            function (event) {

                event.preventDefault();


                const configuracoes = {

                    notificacoesSistema:
                        document.getElementById(
                            "notificacoesSistema"
                        )?.checked ?? true,

                    notificacoesEmail:
                        document.getElementById(
                            "notificacoesEmail"
                        )?.checked ?? true,

                    exibirTelefone:
                        document.getElementById(
                            "exibirTelefone"
                        )?.checked ?? false,

                    exibirEmail:
                        document.getElementById(
                            "exibirEmail"
                        )?.checked ?? false,

                    tema:
                        document.getElementById(
                            "tema"
                        )?.value || "escuro"

                };


                localStorage.setItem(
                    "techcampusConfiguracoes",
                    JSON.stringify(configuracoes)
                );


                aplicarTema(configuracoes.tema);


                mostrarMensagem(
                    "Configurações salvas com sucesso!",
                    "success"
                );

            }
        );

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

            const prefereClaro =
                window.matchMedia(
                    "(prefers-color-scheme: light)"
                ).matches;

            document.body.classList.toggle(
                "tema-claro",
                prefereClaro
            );

        }

    }


    /* =========================================================
       RESTAURAR CONFIGURAÇÕES
    ========================================================= */

    const restaurarBtn =
        document.querySelector(
            "#configuracoesForm .settings-actions .btn-secondary"
        );


    if (restaurarBtn) {

        restaurarBtn.addEventListener(
            "click",
            function () {

                const confirmar =
                    confirm(
                        "Deseja restaurar as configurações padrão?"
                    );

                if (!confirmar) {
                    return;
                }


                localStorage.removeItem(
                    "techcampusConfiguracoes"
                );


                const notificacoesSistema =
                    document.getElementById(
                        "notificacoesSistema"
                    );

                const notificacoesEmail =
                    document.getElementById(
                        "notificacoesEmail"
                    );

                const exibirTelefone =
                    document.getElementById(
                        "exibirTelefone"
                    );

                const exibirEmail =
                    document.getElementById(
                        "exibirEmail"
                    );

                const tema =
                    document.getElementById("tema");


                if (notificacoesSistema)
                    notificacoesSistema.checked = true;

                if (notificacoesEmail)
                    notificacoesEmail.checked = true;

                if (exibirTelefone)
                    exibirTelefone.checked = false;

                if (exibirEmail)
                    exibirEmail.checked = false;

                if (tema)
                    tema.value = "escuro";


                aplicarTema("escuro");


                mostrarMensagem(
                    "Configurações restauradas.",
                    "success"
                );

            }
        );

    }


    /* =========================================================
       ATUALIZAR NOME DO USUÁRIO
    ========================================================= */

    function atualizarNomeUsuario(nome) {

        if (!nome) {
            return;
        }

        const nomeTopo =
            document.querySelector(
                "#userDropdown .fw-semibold"
            );

        if (nomeTopo) {
            nomeTopo.textContent = nome;
        }

    }


    /* =========================================================
       MENSAGEM TEMPORÁRIA
    ========================================================= */

    function mostrarMensagem(mensagem, tipo = "success") {

        const antiga =
            document.getElementById(
                "techcampusMessage"
            );

        if (antiga) {
            antiga.remove();
        }


        const alerta =
            document.createElement("div");

        alerta.id = "techcampusMessage";

        alerta.className =
            `alert alert-${tipo} position-fixed`;

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

    const perfilSalvo =
        localStorage.getItem("techcampusPerfil");

    if (perfilSalvo) {

        try {

            const perfil =
                JSON.parse(perfilSalvo);

            atualizarNomeUsuario(perfil.nome);

        } catch (erro) {

            console.error(erro);

        }

    }


    // Inicializa a tela correta
    navegarPeloHash();

});