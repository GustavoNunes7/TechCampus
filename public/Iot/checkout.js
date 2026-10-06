/* =========================================================
   TECHCAMPUS - CHECKOUT + TOKEN IoT
   ---------------------------------------------------------
   Fluxo:
   1. Recebe os produtos do carrinho
   2. Calcula subtotal
   3. Escolhe forma de pagamento
   4. Se for dinheiro, calcula troco
   5. Confirma a compra
   6. Gera o Token IoT
   7. Abre a seção do Token
   ========================================================= */

(() => {
    "use strict";

    const CHECKOUT_STORAGE = "techcampus_checkout";
    const PEDIDOS_STORAGE = "techcampus_pedidos";

    let carrinho = [];
    let formaPagamento = null;
    let valorRecebido = 0;

    /* =====================================================
       UTILITÁRIOS
       ===================================================== */

    function formatarMoeda(valor) {
        return Number(valor || 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
    }

    function converterNumero(valor) {
        if (typeof valor === "number") {
            return valor;
        }

        if (!valor) {
            return 0;
        }

        return Number(
            String(valor)
                .replace("R$", "")
                .replace(/\./g, "")
                .replace(",", ".")
                .trim()
        ) || 0;
    }

    function gerarIdPedido() {
        return Date.now();
    }

    /* =====================================================
       CARRINHO
       ===================================================== */

    function carregarCarrinho() {
        try {
            const dados = localStorage.getItem("techcampus_carrinho");

            if (!dados) {
                carrinho = [];
                return [];
            }

            carrinho = JSON.parse(dados);

            if (!Array.isArray(carrinho)) {
                carrinho = [];
            }

            return carrinho;

        } catch (erro) {
            console.error("Erro ao carregar carrinho:", erro);
            carrinho = [];
            return [];
        }
    }

    function salvarCheckout() {
        localStorage.setItem(
            CHECKOUT_STORAGE,
            JSON.stringify({
                carrinho,
                formaPagamento,
                valorRecebido
            })
        );
    }

    /* =====================================================
       CÁLCULOS
       ===================================================== */

    function calcularSubtotal() {
        return carrinho.reduce((total, produto) => {

            const preco = converterNumero(
                produto.preco ??
                produto.price ??
                produto.valor
            );

            const quantidade = Number(
                produto.quantidade ??
                produto.qtd ??
                produto.quantity ??
                1
            );

            return total + (preco * quantidade);

        }, 0);
    }

    function calcularTroco() {
        const subtotal = calcularSubtotal();

        if (formaPagamento !== "dinheiro") {
            return 0;
        }

        return Math.max(
            valorRecebido - subtotal,
            0
        );
    }

    /* =====================================================
       PAGAMENTO
       ===================================================== */

    function selecionarPagamento(tipo) {

        const pagamentosValidos = [
            "debito",
            "credito",
            "dinheiro"
        ];

        if (!pagamentosValidos.includes(tipo)) {
            console.warn(
                "Forma de pagamento inválida:",
                tipo
            );

            return false;
        }

        formaPagamento = tipo;

        salvarCheckout();

        atualizarInterfacePagamento();

        return true;
    }

    function definirValorRecebido(valor) {

        valorRecebido = converterNumero(valor);

        salvarCheckout();

        atualizarTroco();

        return valorRecebido;
    }

    function atualizarInterfacePagamento() {

        const areaDinheiro =
            document.getElementById("area-dinheiro");

        const valorRecebidoInput =
            document.getElementById("valorRecebido");

        if (areaDinheiro) {

            if (formaPagamento === "dinheiro") {
                areaDinheiro.classList.remove("d-none");
            } else {
                areaDinheiro.classList.add("d-none");
            }
        }

        if (
            valorRecebidoInput &&
            formaPagamento !== "dinheiro"
        ) {
            valorRecebidoInput.value = "";
        }

        atualizarTroco();
    }

    function atualizarTroco() {

        const elementoTroco =
            document.getElementById("troco");

        if (!elementoTroco) {
            return;
        }

        if (formaPagamento !== "dinheiro") {
            elementoTroco.textContent = "R$ 0,00";
            return;
        }

        const subtotal = calcularSubtotal();

        if (valorRecebido < subtotal) {

            elementoTroco.textContent =
                "Valor insuficiente";

            elementoTroco.dataset.valido = "false";

            return;
        }

        const troco = calcularTroco();

        elementoTroco.textContent =
            formatarMoeda(troco);

        elementoTroco.dataset.valido = "true";
    }

    /* =====================================================
       VALIDAÇÃO
       ===================================================== */

    function validarCheckout() {

        if (!carrinho.length) {

            alert("Seu carrinho está vazio.");

            return false;
        }

        if (!formaPagamento) {

            alert(
                "Selecione uma forma de pagamento."
            );

            return false;
        }

        const total = calcularSubtotal();

        if (formaPagamento === "dinheiro") {

            if (valorRecebido <= 0) {

                alert(
                    "Informe o valor recebido."
                );

                return false;
            }

            if (valorRecebido < total) {

                alert(
                    `Valor insuficiente.\n\n` +
                    `Total: ${formatarMoeda(total)}\n` +
                    `Recebido: ${formatarMoeda(valorRecebido)}`
                );

                return false;
            }
        }

        return true;
    }

    /* =====================================================
       PEDIDO
       ===================================================== */

    function criarPedido() {

        const total = calcularSubtotal();

        const pedido = {

            id: gerarIdPedido(),

            produtos: carrinho.map(produto => ({
                id: produto.id ?? null,
                nome: produto.nome ??
                      produto.name ??
                      "Produto",

                preco: converterNumero(
                    produto.preco ??
                    produto.price ??
                    produto.valor
                ),

                quantidade: Number(
                    produto.quantidade ??
                    produto.qtd ??
                    produto.quantity ??
                    1
                )
            })),

            total,

            pagamento: formaPagamento,

            valorRecebido:
                formaPagamento === "dinheiro"
                    ? valorRecebido
                    : null,

            troco:
                formaPagamento === "dinheiro"
                    ? calcularTroco()
                    : 0,

            status: "confirmado",

            criadoEm:
                new Date().toISOString()
        };

        return pedido;
    }

    function salvarPedido(pedido) {

        try {

            const pedidosSalvos =
                JSON.parse(
                    localStorage.getItem(
                        PEDIDOS_STORAGE
                    )
                ) || [];

            pedidosSalvos.push(pedido);

            localStorage.setItem(
                PEDIDOS_STORAGE,
                JSON.stringify(pedidosSalvos)
            );

        } catch (erro) {

            console.error(
                "Erro ao salvar pedido:",
                erro
            );
        }
    }

    /* =====================================================
       FINALIZAR COMPRA
       ===================================================== */

    function finalizarCompra() {

        if (!validarCheckout()) {
            return null;
        }

        const pedido = criarPedido();

        salvarPedido(pedido);

        /*
         * GERA O TOKEN IoT
         *
         * O token.js precisa estar carregado
         * antes deste checkout.js.
         */

        let dadosToken = null;

        if (
            window.TechCampusToken &&
            typeof window.TechCampusToken.confirmarCompra ===
                "function"
        ) {

            dadosToken =
                window.TechCampusToken.confirmarCompra({
                    id: pedido.id,
                    total: pedido.total,
                    pagamento: pedido.pagamento
                });

        } else {

            console.error(
                "Token.js não foi carregado."
            );

            alert(
                "A compra foi registrada, " +
                "mas não foi possível gerar o Token."
            );
        }

        /*
         * Limpa o carrinho somente depois
         * de criar o pedido.
         */

        localStorage.removeItem(
            "techcampus_carrinho"
        );

        carrinho = [];

        /*
         * Salva os dados da última compra.
         */

        localStorage.setItem(
            "techcampus_ultima_compra",
            JSON.stringify({
                pedido,
                token: dadosToken
            })
        );

        atualizarResumo();

        return {
            pedido,
            token: dadosToken
        };
    }

    /* =====================================================
       RESUMO
       ===================================================== */

    function atualizarResumo() {

        const elementoSubtotal =
            document.getElementById(
                "checkoutSubtotal"
            );

        const elementoTotal =
            document.getElementById(
                "checkoutTotal"
            );

        const total = calcularSubtotal();

        if (elementoSubtotal) {

            elementoSubtotal.textContent =
                formatarMoeda(total);
        }

        if (elementoTotal) {

            elementoTotal.textContent =
                formatarMoeda(total);
        }

        atualizarTroco();
    }

    /* =====================================================
       EVENTOS
       ===================================================== */

    function configurarEventos() {

        /*
         * Botões de pagamento
         */

        document
            .querySelectorAll(
                "[data-pagamento]"
            )
            .forEach(botao => {

                botao.addEventListener(
                    "click",
                    () => {

                        const tipo =
                            botao.dataset.pagamento;

                        selecionarPagamento(tipo);

                        document
                            .querySelectorAll(
                                "[data-pagamento]"
                            )
                            .forEach(outro => {
                                outro.classList.remove(
                                    "active"
                                );
                            });

                        botao.classList.add(
                            "active"
                        );
                    }
                );
            });

        /*
         * Valor recebido
         */

        const inputValor =
            document.getElementById(
                "valorRecebido"
            );

        if (inputValor) {

            inputValor.addEventListener(
                "input",
                evento => {

                    definirValorRecebido(
                        evento.target.value
                    );
                }
            );
        }

        /*
         * Botão finalizar
         */

        const botaoFinalizar =
            document.getElementById(
                "finalizarCompra"
            );

        if (botaoFinalizar) {

            botaoFinalizar.addEventListener(
                "click",
                () => {

                    const resultado =
                        finalizarCompra();

                    if (!resultado) {
                        return;
                    }

                    console.log(
                        "Pedido:",
                        resultado.pedido
                    );

                    console.log(
                        "Token:",
                        resultado.token
                    );
                }
            );
        }
    }

    /* =====================================================
       INICIALIZAÇÃO
       ===================================================== */

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            carregarCarrinho();

            atualizarResumo();

            configurarEventos();

            atualizarInterfacePagamento();
        }
    );

    /* =====================================================
       API GLOBAL
       ===================================================== */

    window.TechCampusCheckout = {

        carregarCarrinho,

        calcularSubtotal,

        calcularTroco,

        selecionarPagamento,

        definirValorRecebido,

        validarCheckout,

        criarPedido,

        salvarPedido,

        finalizarCompra,

        atualizarResumo,

        formatarMoeda

    };

})();
