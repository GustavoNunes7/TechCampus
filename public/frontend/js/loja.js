/* =====================================================
   TECHCAMPUS - LOJA (FRONT)

   Fluxo:
   1. Aluno vê vitrine de produtos
   2. Clica "Comprar" → abre modal do produto
   3. Escolhe quantidade → "Adicionar ao carrinho"
   4. Abre carrinho → escolhe mais produtos
   5. Escolhe forma de pagamento
   6. Finaliza compra → cria 1 pedido com todos os itens
   7. Sistema aguarda confirmação de pagamento
   8. Mostra código de retirada

   Gerente: painel com produtos e pedidos

   Carregar DEPOIS de ../landing/script.js
===================================================== */
(() => {
  "use strict";

  // =====================================================
  // 1) CONFIGURAÇÃO
  // =====================================================
  const CONFIG = {
    TOKEN_KEY: "techcampus_token",
    CARRINHO_KEY: "techcampus_carrinho",
    QTD_MAX_PRODUTO: 100,
    DURACAO_AGENDAMENTO_MIN: 60,
  };

  // =====================================================
  // 2) UTILITÁRIOS
  // =====================================================
  const brl = (c) =>
    (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const dataBR = (s) => {
    const d = new Date(String(s).replace(" ", "T") + "Z");
    return isNaN(d) ? "" : d.toLocaleString("pt-BR");
  };

  const $ = (id) => document.getElementById(id);

  // Cria elementos com textContent (nunca innerHTML com dados da API → sem XSS)
  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
    }
    kids
      .flat()
      .forEach((c) =>
        n.append(c instanceof Node ? c : document.createTextNode(c ?? ""))
      );
    return n;
  };

  const badge = (txt, cor) =>
    h("span", { class: `badge text-bg-${cor || "secondary"}` }, txt);

  const setMsg = (el, txt, tipo = "danger") => {
    el.className = `small mt-3 text-${tipo}`;
    el.textContent = txt || "";
  };

  // =====================================================
  // 3) API
  // =====================================================
  const token = sessionStorage.getItem(CONFIG.TOKEN_KEY);
  if (!token) return; // auth.js cuida do redirecionamento

  async function api(path, opts = {}) {
    const res = await fetch("/api" + path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* 204 etc. */
    }
    if (!res.ok) {
      if (res.status === 401) {
        sessionStorage.clear();
        location.replace("/frontend/login.html");
      }
      const e = new Error((data && data.erro) || `Erro ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return data;
  }

  // =====================================================
  // 4) ESTADO DA LOJA
  // =====================================================
  let produtos = [];
  let carrinho = [];
  let estadoPagamento = {
    metodo: "pix", // pix, dinheiro, cartao
    tipoCartao: null, // debito, credito (para cartao)
    valorEntregue: 0, // para dinheiro (em centavos)
  };

  // =====================================================
  // 5) PRODUTOS
  // =====================================================
  async function carregarProdutos() {
    try {
      produtos = await api("/produtos");
      ligarCards();
    } catch {
      produtos = [];
    }
  }

  function ligarCards() {
    const mapa = new Map(produtos.map((p) => [norm(p.nome), p]));
    document
      .querySelectorAll("#productsTrack .product-slide")
      .forEach((card) => {
        const btn = card.querySelector("button");
        if (!btn) return;

        if (!btn.dataset.original)
          btn.dataset.original = btn.textContent.trim();

        const p = mapa.get(norm(card.querySelector("h5")?.textContent));
        btn.disabled = false;
        btn.textContent = btn.dataset.original;

        if (!p) {
          btn.disabled = true;
          btn.textContent = "Indisponível";
          btn.onclick = null;
          return;
        }

        const por = card.querySelector(".preco-por");
        if (por && p.preco_centavos > 0)
          por.textContent = "Por " + brl(p.preco_centavos);

        if (p.estoque <= 0) {
          btn.disabled = true;
          btn.textContent = "Esgotado";
          btn.onclick = null;
          return;
        }

        if (p.preco_centavos <= 0) {
          btn.disabled = true;
          btn.textContent = "Em breve";
          btn.onclick = null;
          return;
        }

        btn.onclick = () => abrirModalProduto(p);
      });
  }

  // =====================================================
  // 6) MODAL DO PRODUTO
  // =====================================================
  let modalProduto = null;

  function montarModalProduto() {
    const wrap = h("div");
    wrap.innerHTML = `
    <div class="modal fade" id="modalProduto" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-white border-secondary">
          <div class="modal-header border-secondary">
            <h5 class="modal-title">Detalhes do Produto</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <div class="d-flex gap-3 align-items-start mb-4">
              <img id="mpImg" alt="Produto" style="height:100px;width:100px;object-fit:contain;background:#111;border-radius:8px;">
              <div class="flex-grow-1">
                <h5 id="mpNome" class="mb-1"></h5>
                <p id="mpDesc" class="text-white-50 small mb-3"></p>
                <div class="d-flex align-items-baseline gap-2">
                  <span class="fs-5 fw-bold text-info" id="mpPreco"></span>
                  <span class="text-white-50 small" id="mpEstoque"></span>
                </div>
              </div>
            </div>

            <div class="mb-4">
              <label class="form-label small mb-2">Quantidade</label>
              <div class="d-flex align-items-center gap-2">
                <button type="button" class="btn btn-sm btn-outline-light" id="mpMenos">−</button>
                <input id="mpQtd" type="number" min="1" value="1" class="form-control bg-dark text-white border-secondary text-center" style="width:70px;" readonly>
                <button type="button" class="btn btn-sm btn-outline-light" id="mpMais">+</button>
              </div>
              <small class="text-white-50 mt-2 d-block">Máx: <span id="mpMax">100</span> unidades</small>
            </div>

            <div class="bg-secondary-subtle p-3 rounded mb-4">
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-white-50">Subtotal</span>
                <span class="fs-5 fw-bold text-info" id="mpTotal">R$ 0,00</span>
              </div>
            </div>

            <div id="mpMsg" role="alert" class="small mb-3"></div>
          </div>
          <div class="modal-footer border-secondary">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-light" id="mpAdicionarSemFechar">
              <i class="bi bi-plus-lg me-1"></i>Adicionar ao carrinho
            </button>
            <button type="button" class="btn btn-danger" id="mpAdicionarEIr">
              <i class="bi bi-cart-check me-1"></i>Adicionar e ir para o carrinho
            </button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.append(wrap.firstElementChild);
    modalProduto = new bootstrap.Modal($("modalProduto"));

    $("mpMenos").addEventListener("click", () => alterarQtdProduto(-1));
    $("mpMais").addEventListener("click", () => alterarQtdProduto(1));
    $("mpAdicionarSemFechar").addEventListener("click", () =>
      finalizarAddProduto(false)
    );
    $("mpAdicionarEIr").addEventListener("click", () =>
      finalizarAddProduto(true)
    );
  }

  let produtoEmEdicao = null;

  function abrirModalProduto(produto) {
    produtoEmEdicao = produto;
    $("mpImg").src = produto.imagem || "";
    $("mpNome").textContent = produto.nome;
    $("mpDesc").textContent = produto.descricao || "";
    $("mpPreco").textContent = brl(produto.preco_centavos);
    $("mpEstoque").textContent = `${produto.estoque} em estoque`;

    const qtdMax = Math.min(CONFIG.QTD_MAX_PRODUTO, produto.estoque);
    $("mpMax").textContent = qtdMax;
    $("mpQtd").max = qtdMax;
    $("mpQtd").value = 1;

    setMsg($("mpMsg"), "");
    atualizarTotalProduto();
    modalProduto.show();
  }

  function alterarQtdProduto(delta) {
    const input = $("mpQtd");
    const max = parseInt(input.max, 10);
    const val = Math.max(1, Math.min(parseInt(input.value, 10) + delta, max));
    input.value = val;
    atualizarTotalProduto();
  }

  function atualizarTotalProduto() {
    if (!produtoEmEdicao) return;
    const qtd = parseInt($("mpQtd").value, 10);
    const total = produtoEmEdicao.preco_centavos * qtd;
    $("mpTotal").textContent = brl(total);
  }

  function finalizarAddProduto(irParaCarrinho) {
    const qtd = parseInt($("mpQtd").value, 10);
    adicionarCarrinho(produtoEmEdicao, qtd);
    setMsg(
      $("mpMsg"),
      `${produtoEmEdicao.nome} adicionado ao carrinho!`,
      "success"
    );

    setTimeout(() => {
      modalProduto.hide();
      if (irParaCarrinho) {
        setTimeout(() => abrirCarrinho(), 300);
      }
    }, 400);
  }

  // =====================================================
  // 7) CARRINHO
  // =====================================================
  let modalCarrinho = null;

  function salvarCarrinho() {
    sessionStorage.setItem(CONFIG.CARRINHO_KEY, JSON.stringify(carrinho));
    atualizarBadgeCarrinho();
  }

  function carregarCarrinho() {
    try {
      carrinho = JSON.parse(sessionStorage.getItem(CONFIG.CARRINHO_KEY)) || [];
    } catch {
      carrinho = [];
    }
  }

  function quantidadeCarrinho() {
    return carrinho.reduce((total, item) => total + item.quantidade, 0);
  }

  function totalCarrinho() {
    return carrinho.reduce(
      (total, item) => total + item.preco_centavos * item.quantidade,
      0
    );
  }

  function adicionarCarrinho(produto, quantidade = 1) {
    if (!produto || produto.estoque <= 0) return;

    const existente = carrinho.find((item) => item.produto_id === produto.id);

    if (existente) {
      existente.quantidade = Math.min(
        existente.quantidade + quantidade,
        produto.estoque
      );
    } else {
      carrinho.push({
        produto_id: produto.id,
        nome: produto.nome,
        imagem: produto.imagem || "",
        preco_centavos: produto.preco_centavos,
        estoque: produto.estoque,
        quantidade,
      });
    }

    salvarCarrinho();
  }

  function removerCarrinho(produtoId) {
    carrinho = carrinho.filter((item) => item.produto_id !== produtoId);
    salvarCarrinho();
    atualizarCarrinhoUI();
  }

  function alterarQuantidadeCarrinho(produtoId, novaQuantidade) {
    const item = carrinho.find((item) => item.produto_id === produtoId);
    if (!item) return;

    novaQuantidade = Math.max(
      1,
      Math.min(Number(novaQuantidade), item.estoque)
    );

    item.quantidade = novaQuantidade;
    salvarCarrinho();
    atualizarCarrinhoUI();
  }

  function limparCarrinho() {
    carrinho = [];
    salvarCarrinho();
    atualizarCarrinhoUI();
  }

  function atualizarBadgeCarrinho() {
    const badge = $("carrinhoBadge");
    if (!badge) return;

    const qtd = quantidadeCarrinho();
    badge.textContent = qtd;
    badge.hidden = qtd === 0;
  }

  function montarModalCarrinho() {
    const wrap = h("div");
    wrap.innerHTML = `
<div class="modal fade" id="modalCarrinho" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg">
    <div class="modal-content bg-dark text-white border-secondary">

      <div class="modal-header border-secondary">
        <div>
          <h5 class="modal-title fw-bold">
            <i class="bi bi-cart3 me-2"></i>
            Meu Carrinho
          </h5>
          <div class="small text-white-50" id="carrinhoQuantidade">
            0 itens
          </div>
        </div>

        <button
          type="button"
          class="btn-close btn-close-white"
          data-bs-dismiss="modal"
          aria-label="Fechar">
        </button>
      </div>

      <div class="modal-body">

        <div id="carrinhoVazio" class="text-center py-5">
          <i class="bi bi-cart-x display-3 text-white-50"></i>

          <h5 class="mt-3">
            Seu carrinho está vazio
          </h5>

          <p class="text-white-50 mb-0">
            Adicione produtos da loja para começar.
          </p>
        </div>

        <div id="carrinhoItens"></div>

        <div
          id="carrinhoResumo"
          class="border-top border-secondary mt-3 pt-3"
          hidden>

          <div class="d-flex justify-content-between align-items-center">
            <span class="text-white-50">
              Total
            </span>

            <strong
              id="carrinhoTotal"
              class="fs-4 text-info">
              R$ 0,00
            </strong>
          </div>

        </div>

        <div id="carrinhoSecaoPagamento" hidden>
          <div class="border-top border-secondary mt-4 pt-4">
            <h6 class="mb-3">Forma de pagamento</h6>
            <div id="carrinhoOpcoesPagamento"></div>
          </div>
        </div>

        <div
          id="carrinhoMsg"
          role="alert"
          class="small mt-3">
        </div>

      </div>

      <div
        class="modal-footer border-secondary"
        id="carrinhoFooter">

        <button
          type="button"
          class="btn btn-outline-secondary"
          data-bs-dismiss="modal">
          Continuar comprando
        </button>

      </div>

    </div>
  </div>
</div>
`;

    document.body.append(wrap.firstElementChild);
    modalCarrinho = new bootstrap.Modal($("modalCarrinho"));
  }

  function abrirCarrinho() {
    atualizarCarrinhoUI();
    $("carrinhoMsg").textContent = "";
    modalCarrinho.show();
  }

  function atualizarCarrinhoUI() {
    const container = $("carrinhoItens");
    const vazio = $("carrinhoVazio");
    const resumo = $("carrinhoResumo");
    const secPagamento = $("carrinhoSecaoPagamento");
    const total = $("carrinhoTotal");
    const quantidade = $("carrinhoQuantidade");
    const footer = $("carrinhoFooter");

    if (!container) return;

    quantidade.textContent = `${quantidadeCarrinho()} ${
      quantidadeCarrinho() === 1 ? "item" : "itens"
    }`;

    container.replaceChildren();

    if (!carrinho.length) {
      vazio.hidden = false;
      resumo.hidden = true;
      secPagamento.hidden = true;

      footer.replaceChildren(
        h(
          "button",
          {
            class: "btn btn-outline-secondary",
            type: "button",
            "data-bs-dismiss": "modal",
          },
          "Continuar comprando"
        )
      );

      return;
    }

    vazio.hidden = true;
    resumo.hidden = false;
    secPagamento.hidden = false;

    carrinho.forEach((item) => {
      const subtotal = item.preco_centavos * item.quantidade;

      const card = h(
        "div",
        {
          class:
            "d-flex gap-3 align-items-center border-bottom border-secondary py-3",
        },

        h("img", {
          src: item.imagem || "",
          alt: item.nome,
          class: "rounded",
          style:
            "width:70px;height:70px;object-fit:contain;background:#111;",
        }),

        h(
          "div",
          {
            class: "flex-grow-1",
          },

          h(
            "div",
            {
              class: "fw-bold",
            },
            item.nome
          ),

          h(
            "div",
            {
              class: "small text-white-50",
            },
            `${brl(item.preco_centavos)} cada`
          ),

          h(
            "div",
            {
              class: "d-flex align-items-center gap-2 mt-2",
            },

            h(
              "button",
              {
                class: "btn btn-sm btn-outline-light",
                type: "button",
                onclick: () =>
                  alterarQuantidadeCarrinho(item.produto_id, item.quantidade - 1),
              },
              "−"
            ),

            h(
              "span",
              {
                class: "px-2 fw-bold",
              },
              String(item.quantidade)
            ),

            h(
              "button",
              {
                class: "btn btn-sm btn-outline-light",
                type: "button",
                onclick: () =>
                  alterarQuantidadeCarrinho(item.produto_id, item.quantidade + 1),
              },
              "+"
            )
          )
        ),

        h(
          "div",
          {
            class: "text-end",
          },

          h(
            "div",
            {
              class: "fw-bold text-info",
            },
            brl(subtotal)
          ),

          h(
            "button",
            {
              class: "btn btn-sm btn-link text-danger p-0 mt-2",
              type: "button",
              onclick: () => removerCarrinho(item.produto_id),
            },
            "Remover"
          )
        )
      );

      container.append(card);
    });

    total.textContent = brl(totalCarrinho());

    construirSecaoPagamento();

    footer.replaceChildren(
      h(
        "button",
        {
          class: "btn btn-outline-danger",
          type: "button",
          onclick: () => {
            if (confirm("Deseja limpar o carrinho?")) {
              limparCarrinho();
            }
          },
        },
        "Limpar carrinho"
      ),

      h(
        "button",
        {
          class: "btn btn-outline-secondary",
          type: "button",
          "data-bs-dismiss": "modal",
        },
        "Continuar comprando"
      ),

      h(
        "button",
        {
          class: "btn btn-danger",
          type: "button",
          onclick: finalizarCarrinho,
        },
        h("i", {
          class: "bi bi-credit-card me-1",
        }),
        "Finalizar compra"
      )
    );
  }

  function criarBotaoCarrinho() {
    if ($("botaoCarrinho")) return;

    const botao = h(
      "button",
      {
        id: "botaoCarrinho",
        type: "button",
        class:
          "btn btn-danger position-fixed shadow-lg",
        style:
          "right:24px;bottom:24px;z-index:1050;border-radius:50px;padding:12px 20px;",
        onclick: abrirCarrinho,
      },

      h(
        "i",
        {
          class: "bi bi-cart3 me-2",
        }
      ),

      "Carrinho ",

      h(
        "span",
        {
          id: "carrinhoBadge",
          class: "badge text-bg-light text-dark ms-1",
        },
        "0"
      )
    );

    document.body.append(botao);
    atualizarBadgeCarrinho();
  }

  // =====================================================
  // 8) PAGAMENTO
  // =====================================================
  function construirSecaoPagamento() {
    const container = $("carrinhoOpcoesPagamento");
    if (!container) return;

    const opcoesPix = h(
      "div",
      { class: "form-check mb-3" },
      h("input", {
        type: "radio",
        class: "form-check-input",
        name: "caPagamento",
        id: "caPix",
        value: "pix",
        checked: estadoPagamento.metodo === "pix",
        onchange: () => selecionarPagamento("pix"),
      }),
      h(
        "label",
        { class: "form-check-label", for: "caPix" },
        h("i", { class: "bi bi-qr-code me-2" }),
        "PIX"
      )
    );

    const opcoesDinheiro = h(
      "div",
      { class: "form-check mb-3" },
      h("input", {
        type: "radio",
        class: "form-check-input",
        name: "caPagamento",
        id: "caDinheiro",
        value: "dinheiro",
        onchange: () => selecionarPagamento("dinheiro"),
      }),
      h(
        "label",
        { class: "form-check-label", for: "caDinheiro" },
        h("i", { class: "bi bi-cash-coin me-2" }),
        "Dinheiro"
      )
    );

    const opcoesCartao = h(
      "div",
      { class: "form-check mb-3" },
      h("input", {
        type: "radio",
        class: "form-check-input",
        name: "caPagamento",
        id: "caCartao",
        value: "cartao",
        onchange: () => selecionarPagamento("cartao"),
      }),
      h(
        "label",
        { class: "form-check-label", for: "caCartao" },
        h("i", { class: "bi bi-credit-card me-2" }),
        "Cartão"
      )
    );

    const secDinheiro = h(
      "div",
      {
        id: "caSecDinheiro",
        class: "mt-3 p-3 bg-secondary-subtle rounded",
        hidden: estadoPagamento.metodo !== "dinheiro",
      },
      h("label", { class: "form-label small", for: "caValorEntregue" }, "Valor entregue (R$)"),
      h("input", {
        type: "number",
        id: "caValorEntregue",
        class: "form-control bg-dark text-white border-secondary mb-3",
        min: "0",
        step: "0.01",
        placeholder: "0,00",
        oninput: () => calcularTroco(),
      }),
      h("div", { id: "caCalculoTroco", class: "small text-white-50" })
    );

    const secCartao = h(
      "div",
      {
        id: "caSecCartao",
        class: "mt-3 p-3 bg-secondary-subtle rounded",
        hidden: estadoPagamento.metodo !== "cartao",
      },
      h("label", { class: "form-label small mb-2" }, "Tipo de cartão"),
      h(
        "div",
        { class: "form-check" },
        h("input", {
          type: "radio",
          class: "form-check-input",
          name: "caTypeCartao",
          id: "caDebito",
          value: "debito",
          onchange: () => {
            estadoPagamento.tipoCartao = "debito";
          },
        }),
        h(
          "label",
          { class: "form-check-label", for: "caDebito" },
          "Débito"
        )
      ),
      h(
        "div",
        { class: "form-check" },
        h("input", {
          type: "radio",
          class: "form-check-input",
          name: "caTypeCartao",
          id: "caCredito",
          value: "credito",
          onchange: () => {
            estadoPagamento.tipoCartao = "credito";
          },
        }),
        h(
          "label",
          { class: "form-check-label", for: "caCredito" },
          "Crédito"
        )
      ),
      h("small", { class: "text-white-50 d-block mt-2" }, "Escolha uma opção antes de finalizar")
    );

    container.replaceChildren(opcoesPix, opcoesDinheiro, opcoesCartao, secDinheiro, secCartao);
  }

  function selecionarPagamento(metodo) {
    estadoPagamento.metodo = metodo;
    estadoPagamento.tipoCartao = null;
    estadoPagamento.valorEntregue = 0;

    const secDinheiro = $("caSecDinheiro");
    const secCartao = $("caSecCartao");

    if (secDinheiro) secDinheiro.hidden = metodo !== "dinheiro";
    if (secCartao) secCartao.hidden = metodo !== "cartao";

    if (metodo === "dinheiro") {
      $("caValorEntregue").value = "";
      const div = $("caCalculoTroco");
      if (div) div.textContent = "";
    }

    if (metodo === "cartao") {
      const debito = $("caDebito");
      const credito = $("caCredito");
      if (debito) debito.checked = false;
      if (credito) credito.checked = false;
    }
  }

  function calcularTroco() {
    const totalCentavos = totalCarrinho();
    const valorEntregueStr = $("caValorEntregue").value || "0";
    const valorEntregueReais = parseFloat(valorEntregueStr.replace(",", "."));
    const valorEntreguecentavos = Math.round(valorEntregueReais * 100);

    const div = $("caCalculoTroco");
    if (!div) return;

    if (valorEntreguecentavos < totalCentavos) {
      div.innerHTML = `<span class="text-danger">Valor insuficiente</span>`;
      estadoPagamento.valorEntregue = 0;
      return;
    }

    const trococentavos = valorEntreguecentavos - totalCentavos;
    estadoPagamento.valorEntregue = valorEntreguecentavos;

    div.innerHTML = `
      <div class="d-flex justify-content-between mb-1">
        <span>Total:</span>
        <strong>${brl(totalCentavos)}</strong>
      </div>
      <div class="d-flex justify-content-between">
        <span>Troco:</span>
        <strong>${brl(trococentavos)}</strong>
      </div>
    `;
  }

  // =====================================================
  // 9) FLUXO DE COMPRA (PEDIDO + PAGAMENTO)
  // =====================================================
  let estadoCompra = {
    pedido: null,
    pagamento: null,
    pago: false,
    token: null,
  };

  async function finalizarCarrinho() {
    if (!carrinho.length) {
      setMsg($("carrinhoMsg"), "Carrinho vazio!");
      return;
    }

    if (estadoPagamento.metodo === "cartao" && !estadoPagamento.tipoCartao) {
      setMsg($("carrinhoMsg"), "Escolha Débito ou Crédito");
      return;
    }

    if (
      estadoPagamento.metodo === "dinheiro" &&
      estadoPagamento.valorEntregue < totalCarrinho()
    ) {
      setMsg($("carrinhoMsg"), "Valor entregue insuficiente");
      return;
    }

    const btn = document.querySelector(".modal-footer button:last-child");
    if (btn) btn.disabled = true;

    try {
      // 1) Criar pedido com todos os itens do carrinho
      estadoCompra.pedido = await api("/pedidos", {
        method: "POST",
        body: JSON.stringify({
          itens: carrinho.map((item) => ({
            produto_id: item.produto_id,
            quantidade: item.quantidade,
          })),
        }),
      });

      // 2) Criar pagamento
      const bodyPagamento = {
        metodo: estadoPagamento.metodo,
      };

      if (estadoPagamento.metodo === "dinheiro") {
        bodyPagamento.valor_entregue_centavos = estadoPagamento.valorEntregue;
      } else if (estadoPagamento.metodo === "cartao") {
        bodyPagamento.tipo_cartao = estadoPagamento.tipoCartao;
      }

      estadoCompra.pagamento = await api(
        `/pedidos/${estadoCompra.pedido.id}/pagamento`,
        {
          method: "POST",
          body: JSON.stringify(bodyPagamento),
        }
      );

      // 3) Mostrar tela de pagamento
      modalCarrinho.hide();
      setTimeout(() => mostrarTelaPagamento(), 300);
    } catch (e) {
      setMsg($("carrinhoMsg"), e.message);
      if (btn) btn.disabled = false;
    }
  }

  // =====================================================
  // 10) MODAL DE PAGAMENTO
  // =====================================================
  let modalPagamento = null;

  function montarModalPagamento() {
    const wrap = h("div");
    wrap.innerHTML = `
    <div class="modal fade" id="modalPagamento" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-white border-secondary">
          <div class="modal-header border-secondary">
            <h5 class="modal-title">Pagamento</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body" id="pagConteudo"></div>
          <div class="modal-footer border-secondary" id="pagRodape"></div>
        </div>
      </div>
    </div>`;
    document.body.append(wrap.firstElementChild);
    modalPagamento = new bootstrap.Modal($("modalPagamento"));

    $("modalPagamento").addEventListener("hidden.bs.modal", () => {
      // Quando fecha sem pagar, cancela o pedido
      if (estadoCompra.pedido && !estadoCompra.pago) {
        try {
          api(`/pedidos/${estadoCompra.pedido.id}/cancelar`, {
            method: "POST",
          });
        } catch {
          /* já tratado */
        }
        carregarProdutos();
      }
      resetEstadoCompra();
    });
  }

  function resetEstadoCompra() {
    estadoCompra = {
      pedido: null,
      pagamento: null,
      pago: false,
      token: null,
    };
  }

  function mostrarTelaPagamento() {
    const conteudo = $("pagConteudo");
    const pagamento = estadoCompra.pagamento;
    const pedido = estadoCompra.pedido;

    conteudo.replaceChildren();

    // Header do pedido
    const headerPed = h(
      "div",
      { class: "mb-4" },
      h("h6", { class: "text-white-50 small mb-1" }, "Pedido"),
      h("h5", { class: "mb-0" }, `#${pedido.id}`),
      h(
        "div",
        { class: "small text-info fw-bold mt-2" },
        `Total: ${brl(pagamento.valor_centavos)}`
      )
    );

    conteudo.append(headerPed);

    // Conteúdo específico por método
    if (estadoPagamento.metodo === "pix") {
      mostrarTelaPix(conteudo);
    } else if (estadoPagamento.metodo === "dinheiro") {
      mostrarTelaDinheiro(conteudo);
    } else if (estadoPagamento.metodo === "cartao") {
      mostrarTelaCartao(conteudo);
    }

    const rodape = $("pagRodape");
    rodape.replaceChildren(
      h(
        "button",
        {
          class: "btn btn-outline-secondary",
          type: "button",
          onclick: cancelarCompra,
        },
        "Cancelar"
      ),
      h(
        "button",
        {
          class: "btn btn-danger",
          type: "button",
          id: "pagSimular",
          onclick: simularPagamento,
        },
        "Simular pagamento (modo teste)"
      )
    );

    modalPagamento.show();
  }

  function mostrarTelaPix(container) {
    const pag = estadoCompra.pagamento;

    const blocoPixNode = h(
      "div",
      { class: "bg-secondary-subtle p-4 rounded mb-4" },
      h("h6", { class: "text-white-50 small mb-3" }, "Código PIX (copia e cola)"),
      h(
        "div",
        { class: "input-group mb-2" },
        h("input", {
          id: "pagCodigo",
          type: "text",
          class: "form-control bg-dark text-white border-secondary",
          value: pag.codigo || "",
          readonly: true,
        }),
        h(
          "button",
          {
            class: "btn btn-outline-light",
            type: "button",
            onclick: copiarCodigoPix,
          },
          "Copiar"
        )
      ),
      h(
        "p",
        { class: "small text-white-50 mb-0" },
        "Pague com seu banco ou aplicativo de PIX"
      )
    );

    container.append(blocoPixNode);
  }

  function mostrarTelaDinheiro(container) {
    const pagamento = estadoCompra.pagamento;
    const totalCentavos = pagamento.valor_centavos;
    const valorEntreguecentavos = estadoPagamento.valorEntregue;
    const trococentavos = valorEntreguecentavos - totalCentavos;

    const bloco = h(
      "div",
      { class: "bg-secondary-subtle p-4 rounded mb-4" },
      h("p", { class: "text-white-50 small mb-3" }, "Confirme os valores com o responsável:"),
      h(
        "div",
        { class: "small mb-2 d-flex justify-content-between" },
        h("span", {}, "Total da compra:"),
        h("strong", { class: "text-info" }, brl(totalCentavos))
      ),
      h(
        "div",
        { class: "small mb-2 d-flex justify-content-between" },
        h("span", {}, "Valor entregue:"),
        h("strong", {}, brl(valorEntreguecentavos))
      ),
      h(
        "div",
        { class: "small d-flex justify-content-between border-top border-secondary pt-2" },
        h("span", {}, "Troco:"),
        h("strong", { class: "text-success" }, brl(trococentavos))
      ),
      h(
        "p",
        { class: "small text-white-50 mt-3 mb-0" },
        "O pagamento será confirmado pelo responsável após a entrega do dinheiro."
      )
    );

    container.append(bloco);
  }

  function mostrarTelaCartao(container) {
    const pagamento = estadoCompra.pagamento;
    const tipo = estadoPagamento.tipoCartao === "credito" ? "Crédito" : "Débito";

    const bloco = h(
      "div",
      { class: "bg-secondary-subtle p-4 rounded mb-4" },
      h("h6", { class: "text-white-50 small mb-3" }, "Forma de pagamento"),
      h("p", { class: "mb-0" }, h("strong", {}, `Cartão de ${tipo}`)),
      h(
        "p",
        { class: "small text-white-50 mt-3 mb-0" },
        "O pagamento será processado com segurança. Você não será solicitado a digitar dados sensíveis nesta tela."
      )
    );

    container.append(bloco);
  }

  async function copiarCodigoPix() {
    const input = $("pagCodigo");
    if (!input) return;

    try {
      await navigator.clipboard.writeText(input.value);
      // Feedback visual
      const btn = document.querySelector("[onclick='copiarCodigoPix()']");
      if (btn) {
        const texto = btn.textContent;
        btn.textContent = "Copiado!";
        setTimeout(() => {
          btn.textContent = texto;
        }, 1500);
      }
    } catch {
      alert("Não foi possível copiar o código");
    }
  }

  async function cancelarCompra() {
    if (!estadoCompra.pedido) return;

    try {
      await api(`/pedidos/${estadoCompra.pedido.id}/cancelar`, {
        method: "POST",
      });
      modalPagamento.hide();
      carregarProdutos();
    } catch (e) {
      alert(e.message);
    }
  }

  // =====================================================
  // 11) CONFIRMAR PAGAMENTO (SIMULADO)
  // =====================================================
  async function simularPagamento() {
    const btn = $("pagSimular");
    if (!btn || !estadoCompra.pagamento) return;

    btn.disabled = true;

    try {
      // Confirmar pagamento no backend
      await api(`/pagamentos/${estadoCompra.pagamento.id}/confirmar-simulado`, {
        method: "POST",
      });

      estadoCompra.pago = true;

      // Obter token do backend
      const resposta = await api(`/pedidos/${estadoCompra.pedido.id}/token`);
      if (!resposta?.token) {
        throw new Error("Token não disponível");
      }
      estadoCompra.token = resposta.token;

      // Mostrar tela de sucesso
      mostrarTelaSuccesso();
    } catch (e) {
      alert(
        e.status === 404
          ? "Modo teste desativado. O pagamento será confirmado automaticamente quando o provedor estiver integrado."
          : e.message
      );
      btn.disabled = false;
    }
  }

  function mostrarTelaSuccesso() {
    const conteudo = $("pagConteudo");
    const rodape = $("pagRodape");

    conteudo.replaceChildren(
      h(
        "div",
        { class: "text-center py-4" },
        h("i", { class: "bi bi-check-circle-fill text-success display-4" }),
        h(
          "p",
          { class: "mt-3 fw-semibold" },
          `Pagamento confirmado! Pedido #${estadoCompra.pedido.id}`
        )
      ),
      h(
        "div",
        { class: "p-4 rounded-3 border border-secondary bg-black" },
        h(
          "div",
          { class: "small text-white-50 mb-2" },
          "Seu código de retirada"
        ),
        h(
          "div",
          {
            class: "display-5 fw-bold text-info",
            style: "letter-spacing: 8px;",
          },
          estadoCompra.token
        ),
        h(
          "div",
          { class: "small text-white-50 mt-3" },
          "Digite este código no dispositivo para liberar sua retirada."
        ),
        h(
          "button",
          {
            type: "button",
            class: "btn btn-outline-light btn-sm mt-3",
            id: "pagCopiarToken",
            onclick: copiarToken,
          },
          h("i", { class: "bi bi-copy me-1" }),
          "Copiar código"
        )
      )
    );

    rodape.replaceChildren(
      h(
        "button",
        {
          type: "button",
          class: "btn btn-danger",
          "data-bs-dismiss": "modal",
          onclick: () => {
            limparCarrinho();
            carregarProdutos();
          },
        },
        "Fechar"
      )
    );
  }

  async function copiarToken() {
    if (!estadoCompra.token) return;

    try {
      await navigator.clipboard.writeText(estadoCompra.token);
      const btn = $("pagCopiarToken");
      if (btn) {
        const texto = btn.textContent;
        btn.innerHTML = '<i class="bi bi-check me-1"></i>Copiado!';
        setTimeout(() => {
          btn.innerHTML = texto;
        }, 1500);
      }
    } catch {
      alert("Não foi possível copiar");
    }
  }

  // =====================================================
  // 12) PAINEL DO GERENTE
  // =====================================================
  const TELAS = [
    "inicio",
    "documento",
    "pedidos",
    "avisos",
    "sobre",
    "formatura",
    "ajuda",
    "perfil",
    "configuracoes",
    "usuarios",
  ];
  const CATEGORIAS = ["uniformes", "esportes", "jogos", "epi", "acessorios"];
  const STATUS = {
    pendente: "Pendente",
    aprovado: "Aprovado",
    rejeitado: "Rejeitado",
    entregue: "Entregue",
    cancelado: "Cancelado",
  };
  const PAG = {
    pendente: "Aguardando",
    pago: "Pago",
    falhou: "Falhou",
    estornado: "Estornado",
  };
  const COR = {
    pendente: "warning",
    aprovado: "success",
    rejeitado: "danger",
    entregue: "info",
    cancelado: "secondary",
    pago: "success",
    falhou: "danger",
    estornado: "secondary",
  };

  let secGerente, modalProdAdmin, editandoId = null, listaProdAdmin = [];

  function tabela(cabecalho, corpo) {
    return h(
      "div",
      { class: "table-responsive" },
      h(
        "table",
        { class: "table table-dark table-hover align-middle mb-0" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            cabecalho.map((c) => h("th", {}, c))
          )
        ),
        corpo
      )
    );
  }

  function montarPainel() {
    secGerente = h("section", { id: "gerente", class: "d-none my-4" });
    secGerente.innerHTML = `
      <div class="container-fluid px-0 text-white">
        <div class="mb-4 text-start">
          <h2 class="fw-bold fs-1 mb-1">Gerência</h2>
          <p class="text-secondary small">Visualize os produtos e autorize os pedidos dos alunos.</p>
        </div>
        <ul class="nav nav-pills mb-3 gap-2">
          <li class="nav-item"><button type="button" class="nav-link active" id="tabGProd">Produtos</button></li>
          <li class="nav-item"><button type="button" class="nav-link" id="tabGPed">Pedidos</button></li>
        </ul>
        <div id="gProdutos">
          <div class="d-flex flex-wrap gap-2 mb-3">
            <input id="gBusca" class="form-control bg-dark text-white border-secondary" style="max-width:320px" placeholder="Buscar produto ou categoria">
            <button type="button" class="btn btn-danger ms-auto" id="gNovo"><i class="bi bi-plus-lg me-1"></i>Novo produto</button>
          </div>
          <div id="gProdTabela"></div>
        </div>
        <div id="gPedidos" hidden>
          <div class="d-flex flex-wrap gap-2 mb-3">
            <select id="gFiltroPed" class="form-select bg-dark text-white border-secondary" style="max-width:220px">
              <option value="">Todos os status</option>
              <option value="pendente">Pendentes</option><option value="aprovado">Aprovados</option>
              <option value="entregue">Entregues</option><option value="rejeitado">Rejeitados</option>
              <option value="cancelado">Cancelados</option>
            </select>
            <button type="button" class="btn btn-outline-light" id="gAtualizar"><i class="bi bi-arrow-clockwise me-1"></i>Atualizar</button>
          </div>
          <div id="gPedTabela"></div>
        </div>
        <div id="gMsg" role="alert" class="small mt-3"></div>
      </div>`;
    $("pedidos").after(secGerente);

    const m = h("div");
    m.innerHTML = `
    <div class="modal fade" id="modalProdAdmin" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered"><div class="modal-content bg-dark text-white border-secondary">
        <div class="modal-header border-secondary"><h5 class="modal-title" id="mpTitulo"></h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button></div>
        <div class="modal-body">
          <label class="form-label small" for="mpNome">Nome</label>
          <input id="mpNome" class="form-control bg-dark text-white border-secondary mb-2" maxlength="120">
          <label class="form-label small" for="mpCat">Categoria</label>
          <select id="mpCat" class="form-select bg-dark text-white border-secondary mb-2">${CATEGORIAS.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
          <label class="form-label small" for="mpDesc">Descrição</label>
          <textarea id="mpDesc" rows="2" class="form-control bg-dark text-white border-secondary mb-2"></textarea>
          <label class="form-label small" for="mpImg">Imagem (caminho)</label>
          <input id="mpImg" class="form-control bg-dark text-white border-secondary mb-2" placeholder="/landing/images/produto.png">
          <div class="row g-2">
            <div class="col"><label class="form-label small" for="mpPreco">Preço (R$)</label>
              <input id="mpPreco" type="number" min="0" step="0.01" class="form-control bg-dark text-white border-secondary"></div>
            <div class="col"><label class="form-label small" for="mpEstoque">Estoque</label>
              <input id="mpEstoque" type="number" min="0" step="1" class="form-control bg-dark text-white border-secondary"></div>
          </div>
          <div class="form-check form-switch mt-3" id="mpAtivoBox">
            <input class="form-check-input" type="checkbox" id="mpAtivo" checked><label class="form-check-label" for="mpAtivo">Produto ativo na loja</label>
          </div>
          <div id="mpMsg" role="alert" class="small mt-2"></div>
        </div>
        <div class="modal-footer border-secondary">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-danger" id="mpSalvar">Salvar</button>
        </div>
      </div></div>
    </div>`;
    document.body.append(m.firstElementChild);
    modalProdAdmin = new bootstrap.Modal($("modalProdAdmin"));

    $("tabGProd").onclick = () => aba("prod");
    $("tabGPed").onclick = () => aba("ped");
    $("gBusca").addEventListener("input", renderProdutosAdmin);
    $("gNovo").onclick = () => abrirProduto(null);
    $("mpSalvar").onclick = salvarProduto;
    $("gFiltroPed").onchange = carregarPedidosAdmin;
    $("gAtualizar").onclick = () => {
      carregarProdutosAdmin();
      carregarPedidosAdmin();
    };
  }

  function aba(qual) {
    $("tabGProd").classList.toggle("active", qual === "prod");
    $("tabGPed").classList.toggle("active", qual === "ped");
    $("gProdutos").hidden = qual !== "prod";
    $("gPedidos").hidden = qual !== "ped";
    if (qual === "ped") carregarPedidosAdmin();
  }

  async function carregarProdutosAdmin() {
    try {
      listaProdAdmin = await api("/admin/produtos");
      renderProdutosAdmin();
    } catch (e) {
      setMsg($("gMsg"), e.message);
    }
  }

  function renderProdutosAdmin() {
    const q = norm($("gBusca").value);
    const rows = listaProdAdmin.filter(
      (p) => !q || norm(p.nome + p.categoria).includes(q)
    );
    const corpo = h(
      "tbody",
      {},
      rows.length
        ? rows.map((p) =>
            h(
              "tr",
              {},
              h("td", {}, p.nome),
              h("td", {}, p.categoria),
              h("td", {}, brl(p.preco_centavos)),
              h(
                "td",
                {},
                p.estoque <= 0
                  ? badge("Esgotado", "danger")
                  : String(p.estoque)
              ),
              h(
                "td",
                {},
                p.ativo
                  ? badge("Ativo", "success")
                  : badge("Inativo", "secondary")
              ),
              h(
                "td",
                { class: "text-end" },
                h(
                  "button",
                  {
                    class: "btn btn-sm btn-outline-light",
                    type: "button",
                    onclick: () => abrirProduto(p),
                  },
                  "Editar"
                )
              )
            )
          )
        : h(
            "tr",
            {},
            h(
              "td",
              { colspan: 6, class: "text-center text-secondary" },
              "Nenhum produto encontrado."
            )
          )
    );
    $("gProdTabela").replaceChildren(
      tabela(["Produto", "Categoria", "Preço", "Estoque", "Status", ""], corpo)
    );
  }

  function abrirProduto(p) {
    editandoId = p ? p.id : null;
    $("mpTitulo").textContent = p ? "Editar produto" : "Novo produto";
    $("mpNome").value = p?.nome || "";
    $("mpCat").value = p?.categoria || CATEGORIAS[0];
    $("mpDesc").value = p?.descricao || "";
    $("mpImg").value = p?.imagem || "";
    $("mpPreco").value = p ? (p.preco_centavos / 100).toFixed(2) : "";
    $("mpEstoque").value = p ? p.estoque : 0;
    $("mpAtivo").checked = p ? !!p.ativo : true;
    $("mpAtivoBox").hidden = !p;
    setMsg($("mpMsg"), "");
    modalProdAdmin.show();
  }

  async function salvarProduto() {
    const preco = Math.round(
      parseFloat(String($("mpPreco").value).replace(",", ".")) * 100
    );
    const estoque = parseInt($("mpEstoque").value, 10);
    const nome = $("mpNome").value.trim();

    if (
      !nome ||
      !Number.isSafeInteger(preco) ||
      preco < 0 ||
      !Number.isSafeInteger(estoque) ||
      estoque < 0
    )
      return setMsg($("mpMsg"), "Informe nome, preço e estoque válidos.");

    const body = {
      nome,
      categoria: $("mpCat").value,
      descricao: $("mpDesc").value,
      imagem: $("mpImg").value,
      preco_centavos: preco,
      estoque,
    };

    try {
      if (editandoId)
        await api(`/produtos/${editandoId}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...body,
            ativo: $("mpAtivo").checked ? 1 : 0,
          }),
        });
      else
        await api("/produtos", {
          method: "POST",
          body: JSON.stringify(body),
        });
      modalProdAdmin.hide();
      await carregarProdutosAdmin();
      carregarProdutos();
    } catch (e) {
      setMsg($("mpMsg"), e.message);
    }
  }

  async function carregarPedidosAdmin() {
    try {
      const s = $("gFiltroPed").value;
      const lista = await api(
        "/admin/pedidos" + (s ? `?status=${encodeURIComponent(s)}` : "")
      );
      renderPedidosAdmin(lista);
    } catch (e) {
      setMsg($("gMsg"), e.message);
    }
  }

  async function mudarStatus(id, status) {
    if (
      status === "rejeitado" &&
      !confirm(`Rejeitar o pedido #${id}? O estoque será devolvido.`)
    )
      return;
    try {
      await api(`/pedidos/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMsg(
        $("gMsg"),
        `Pedido #${id}: ${STATUS[status].toLowerCase()}.`,
        "success"
      );
      carregarPedidosAdmin();
      carregarProdutosAdmin();
    } catch (e) {
      setMsg($("gMsg"), e.message);
    }
  }

  async function alternarItens(tr, id) {
    const proximo = tr.nextElementSibling;
    if (proximo && proximo.dataset.itensDe === String(id))
      return proximo.remove();
    try {
      const ped = await api(`/pedidos/${id}`);
      const lista = h(
        "ul",
        { class: "mb-0 small" },
        ped.itens.map((i) =>
          h(
            "li",
            {},
            `${i.quantidade}× ${i.nome} — ${brl(i.preco_unitario_centavos)} cada`
          )
        )
      );
      if (ped.observacao)
        lista.append(
          h("li", { class: "text-secondary" }, "Obs.: " + ped.observacao)
        );
      tr.after(
        h(
          "tr",
          { "data-itens-de": id },
          h("td", { colspan: 7, class: "bg-black" }, lista)
        )
      );
    } catch (e) {
      setMsg($("gMsg"), e.message);
    }
  }

  function renderPedidosAdmin(lista) {
    const corpo = h(
      "tbody",
      {},
      lista.length
        ? lista.map((p) => {
            const tr = h(
              "tr",
              {},
              h("td", {}, "#" + p.id),
              h(
                "td",
                {},
                h("div", {}, p.cliente),
                h("div", { class: "small text-secondary" }, p.cliente_email)
              ),
              h("td", {}, dataBR(p.criado_em)),
              h("td", {}, brl(p.total_centavos)),
              h(
                "td",
                {},
                p.pagamento_status
                  ? badge(PAG[p.pagamento_status], COR[p.pagamento_status])
                  : badge("Sem pagamento", "secondary")
              ),
              h("td", {}, badge(STATUS[p.status] || p.status, COR[p.status])),
              h(
                "td",
                { class: "text-end text-nowrap" },
                h(
                  "button",
                  {
                    class: "btn btn-sm btn-outline-secondary me-1",
                    type: "button",
                    onclick: () => alternarItens(tr, p.id),
                  },
                  "Itens"
                ),
                p.status === "pendente" && [
                  h(
                    "button",
                    {
                      class: "btn btn-sm btn-success me-1",
                      type: "button",
                      disabled: p.pagamento_status !== "pago",
                      title:
                        p.pagamento_status !== "pago"
                          ? "Aguardando pagamento"
                          : "",
                      onclick: () => mudarStatus(p.id, "aprovado"),
                    },
                    "Aprovar"
                  ),
                  h(
                    "button",
                    {
                      class: "btn btn-sm btn-outline-danger",
                      type: "button",
                      onclick: () => mudarStatus(p.id, "rejeitado"),
                    },
                    "Rejeitar"
                  ),
                ],
                p.status === "aprovado" &&
                  h(
                    "button",
                    {
                      class: "btn btn-sm btn-info",
                      type: "button",
                      onclick: () => mudarStatus(p.id, "entregue"),
                    },
                    "Marcar entregue"
                  )
              )
            );
            return tr;
          })
        : h(
            "tr",
            {},
            h(
              "td",
              { colspan: 7, class: "text-center text-secondary" },
              "Nenhum pedido encontrado."
            )
          )
    );
    $("gPedTabela").replaceChildren(
      tabela(
        ["Pedido", "Cliente", "Data", "Total", "Pagamento", "Status", ""],
        corpo
      )
    );
  }

  function sincronizarGerente() {
    if (!secGerente) return;
    if (location.hash === "#gerente") {
      TELAS.forEach((id) =>
        document.getElementById(id)?.classList.add("d-none")
      );
      secGerente.classList.remove("d-none");
      document
        .querySelectorAll(".menu-item")
        .forEach((i) =>
          i.classList.toggle("ativo", i.getAttribute("href") === "#gerente")
        );
      carregarProdutosAdmin();
    } else {
      secGerente.classList.add("d-none");
    }
  }

  function ativarModoGerente() {
    montarPainel();
    const link = h(
      "a",
      {
        href: "#gerente",
        class:
          "menu-item d-flex align-items-start gap-3 text-decoration-none text-white p-2 rounded",
      },
      h("i", { class: "bi bi-shop fs-3 flex-shrink-0" }),
      h(
        "div",
        { class: "d-flex flex-column" },
        h("span", { class: "fw-bold fs-6" }, "Gerência"),
        h("span", { class: "text-white-50 small" }, "Produtos e pedidos")
      )
    );
    const alvo = document.querySelector('a.menu-item[href="#usuarios"]');
    alvo
      ? alvo.before(link)
      : document.querySelector("#sidebar nav")?.append(link);
    window.addEventListener("hashchange", sincronizarGerente);
    sincronizarGerente();
  }

  // =====================================================
  // 13) AGENDAMENTOS
  // =====================================================
  function ligarAgendamento() {
    const modalEl = $("modalAgendamento");
    const form = $("formAgendamento");
    if (!modalEl || !form) return;

    const msg = $("agendamentoMsg");

    modalEl.addEventListener("show.bs.modal", (e) => {
      const btn = e.relatedTarget;
      form.reset();
      $("agendamentoTipo").value = btn?.dataset.recurso || "";
      $("agendamentoTitulo").textContent = btn?.dataset.titulo || "Agendar";
      $("agendamentoData").min = new Date().toLocaleDateString("en-CA");
      setMsg(msg, "");
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const botao = form.querySelector('[type="submit"]');
      botao.disabled = true;
      try {
        const inicio = new Date(
          `${$("agendamentoData").value}T${$("agendamentoHorario").value}:00`
        );
        const fim = new Date(
          inicio.getTime() + CONFIG.DURACAO_AGENDAMENTO_MIN * 60000
        );
        await api("/agendamentos", {
          method: "POST",
          body: JSON.stringify({
            recurso: $("agendamentoTipo").value,
            inicio: inicio.toISOString(),
            fim: fim.toISOString(),
          }),
        });
        setMsg(
          msg,
          "Solicitação enviada! Aguarde a aprovação da AAPM.",
          "success"
        );
        setTimeout(() => bootstrap.Modal.getInstance(modalEl)?.hide(), 1500);
      } catch (err) {
        setMsg(msg, err.message);
      } finally {
        botao.disabled = false;
      }
    });
  }

  // =====================================================
  // 14) INICIALIZAÇÃO
  // =====================================================
  async function iniciar() {
    let user = null;
    try {
      user = await api("/perfil");
    } catch {
      return;
    }

    // Atualizar nome do usuário
    const nome = document.querySelector("#userDropdown .fw-semibold");
    const sub = document.querySelector("#userDropdown small");
    if (nome) nome.textContent = user.nome;
    if (sub) sub.textContent = user.papel === "admin" ? "Gerente" : "Aluno SENAI";

    // Inicializar loja para alunos
    if (document.getElementById("productsTrack")) {
      carregarCarrinho();
      montarModalProduto();
      montarModalCarrinho();
      montarModalPagamento();
      criarBotaoCarrinho();
      carregarProdutos();
    }

    // Agendamentos
    ligarAgendamento();

    // Modo gerente
    if (user.papel === "admin") {
      ativarModoGerente();
    } else {
      document.querySelector('a.menu-item[href="#usuarios"]')?.remove();
    }
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
