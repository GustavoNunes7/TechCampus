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