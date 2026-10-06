
/* =========================================================
   TECHCAMPUS - TOKEN IoT
   ---------------------------------------------------------
   Responsável por:
   - Gerar um token após a compra ser confirmada
   - Associar o token ao pedido
   - Salvar o token no navegador
   - Recuperar o último token
   - Exibir o token na seção de Token
   ========================================================= */

(() => {
    "use strict";

    const TOKEN_STORAGE_KEY = "techcampus_token";

    /**
     * Gera um código aleatório.
     */
    function gerarCodigoAleatorio(tamanho = 4) {
        const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let resultado = "";

        for (let i = 0; i < tamanho; i++) {
            const indice = Math.floor(Math.random() * caracteres.length);
            resultado += caracteres[indice];
        }

        return resultado;
    }

    /**
     * Gera o Token da compra.
     * Exemplo:
     * TC-8F42-A91C
     */
    function gerarToken() {
        return `TC-${gerarCodigoAleatorio(4)}-${gerarCodigoAleatorio(4)}`;
    }

    /**
     * Cria um token para um pedido.
     *
     * @param {Object} pedido
     * @returns {Object}
     */
    function criarToken(pedido = {}) {
        const token = gerarToken();

        const dadosToken = {
            token,
            pedidoId: pedido.id || pedido.pedidoId || null,
            total: pedido.total || 0,
            pagamento: pedido.pagamento || null,
            criadoEm: new Date().toISOString(),
            status: "ativo"
        };

        localStorage.setItem(
            TOKEN_STORAGE_KEY,
            JSON.stringify(dadosToken)
        );

        return dadosToken;
    }

    /**
     * Recupera o último token salvo.
     */
    function obterToken() {
        try {
            const dados = localStorage.getItem(TOKEN_STORAGE_KEY);

            if (!dados) {
                return null;
            }

            return JSON.parse(dados);
        } catch (erro) {
            console.error("Erro ao recuperar Token:", erro);
            return null;
        }
    }

    /**
     * Exibe o token na interface.
     *
     * Procura pelos elementos:
     * #tokenCompra
     * #tokenPedido
     * #tokenStatus
     */
    function exibirToken(dadosToken = obterToken()) {
        if (!dadosToken) {
            return;
        }

        const elementoToken = document.getElementById("tokenCompra");
        const elementoPedido = document.getElementById("tokenPedido");
        const elementoStatus = document.getElementById("tokenStatus");

        if (elementoToken) {
            elementoToken.textContent = dadosToken.token;
        }

        if (elementoPedido && dadosToken.pedidoId) {
            elementoPedido.textContent = `Pedido #${dadosToken.pedidoId}`;
        }

        if (elementoStatus) {
            elementoStatus.textContent = dadosToken.status;
        }
    }

    /**
     * Abre a seção de Token.
     */
    function abrirSecaoToken() {
        const secaoToken = document.getElementById("secao-token");

        if (secaoToken) {
            secaoToken.classList.remove("d-none");
            secaoToken.classList.add("active");
        }

        exibirToken();
    }

    /**
     * Processo principal após uma compra confirmada.
     *
     * Exemplo:
     *
     * confirmarCompra({
     *     id: 125,
     *     total: 80,
     *     pagamento: "dinheiro"
     * });
     */
    function confirmarCompra(pedido = {}) {
        const dadosToken = criarToken(pedido);

        console.log("Compra confirmada!");
        console.log("Token gerado:", dadosToken.token);

        abrirSecaoToken();

        return dadosToken;
    }

    /**
     * Copia o Token para a área de transferência.
     */
    async function copiarToken() {
        const dadosToken = obterToken();

        if (!dadosToken) {
            console.warn("Nenhum Token disponível.");
            return;
        }

        try {
            await navigator.clipboard.writeText(dadosToken.token);

            console.log("Token copiado!");

            const botao = document.getElementById("copiarToken");

            if (botao) {
                const textoOriginal = botao.textContent;

                botao.textContent = "Copiado!";

                setTimeout(() => {
                    botao.textContent = textoOriginal;
                }, 1500);
            }
        } catch (erro) {
            console.error("Não foi possível copiar o Token:", erro);
        }
    }

    /**
     * Inicialização.
     */
    document.addEventListener("DOMContentLoaded", () => {
        exibirToken();

        const botaoCopiar = document.getElementById("copiarToken");

        if (botaoCopiar) {
            botaoCopiar.addEventListener("click", copiarToken);
        }
    });

    /**
     * Disponibiliza as funções para outros arquivos
     * do TechCampus.
     */
    window.TechCampusToken = {
        gerarToken,
        criarToken,
        obterToken,
        exibirToken,
        abrirSecaoToken,
        confirmarCompra,
        copiarToken
    };

})();

