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
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    };
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch("/api" + path, {
      ...opts,
      headers,
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
    const usados = new Set();
    const aliases = {
      caixadebolinhasdepingpong: ["bolasdepingpong", "bolinhasdepingpong"],
      bolinhasdepingpong: ["caixadebolinhasdepingpong", "bolasdepingpong"],
      uniformeescolarbranco: ["camisaescolarbranca"],
      uniformeescolarpreto: ["camisaescolarpreta"],
      jalecomecanica: ["jalecoparamecanica"],
      oculosdeprotecao: ["oculosprotecao"],
    };
    document
      .querySelectorAll("#productsTrack .product-slide:not([data-tc-dinamico='1'])")
      .forEach((card) => {
        const btn = card.querySelector("button");
        if (!btn) return;

        if (!btn.dataset.original)
          btn.dataset.original = btn.textContent.trim();

        const nomeCard = norm(card.querySelector("h5")?.textContent);
        let p = mapa.get(nomeCard);
        if (!p) {
          const candidatos = new Set(aliases[nomeCard] || []);
          p = produtos.find((item) => candidatos.has(norm(item.nome)));
        }
        btn.disabled = false;
        btn.textContent = btn.dataset.original;

        if (!p || Number(p.ativo) !== 1) {
          card.classList.add("d-none");
          btn.disabled = true;
          btn.textContent = "Indisponível";
          btn.onclick = null;
          return;
        }
        card.classList.remove("d-none");

        usados.add(p.id);
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

    // Produtos criados no painel administrativo também entram na vitrine.
    const track = $("productsTrack");
    if (!track) return;
    track.querySelectorAll(".product-slide[data-tc-dinamico='1']").forEach((card) => card.remove());
    produtos.filter((p) => !usados.has(p.id)).forEach((p) => {
      if (Number(p.ativo) !== 1) return;
      const slide = h("div", { class: "product-slide", "data-category": norm(p.categoria), "data-tc-dinamico": "1" });
      const card = h("div", { class: "card bg-dark text-white h-100 border-secondary rounded-3 p-3 product-card" });
      const imageBox = h("div", { class: "text-center my-3 product-img-box" });
      const image = h("img", { class: "img-fluid", alt: p.nome, src: p.imagem || "/landing/images/logoTechCampus.png" });
      image.style.maxHeight = "160px";
      image.style.objectFit = "contain";
      image.addEventListener("error", () => { image.src = "/landing/images/logoTechCampus.png"; }, { once: true });
      imageBox.append(image);
      const body = h("div", { class: "card-body d-flex flex-column p-0 text-start" });
      body.append(h("h5", { class: "fw-bold mb-1" }, p.nome));
      body.append(h("p", { class: "text-secondary small mb-3" }, p.descricao || "Produto disponibilizado pela AAPM."));
      const footer = h("div", { class: "mt-auto" });
      footer.append(h("strong", { class: "preco-por d-block" }, "Por " + brl(p.preco_centavos)));
      const button = h("button", { class: "btn btn-outline-danger text-white w-100 mt-3", type: "button" }, "Comprar agora");
      button.disabled = Number(p.estoque) < 1 || Number(p.preco_centavos) <= 0;
      button.textContent = Number(p.estoque) < 1 ? "Esgotado" : Number(p.preco_centavos) <= 0 ? "Em breve" : "Comprar agora";
      if (!button.disabled) button.addEventListener("click", () => abrirModalProduto(p));
      footer.append(button);
      body.append(footer);
      card.append(imageBox, body);
      slide.append(card);
      track.append(slide);
    });
    document.dispatchEvent(new CustomEvent("tc-produtos-atualizados"));
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
          "Token válido por 15 minutos. Digite este código no dispositivo para liberar sua retirada."
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
    "meus-tokens",
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
    confirmado: "Confirmado",
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
    confirmado: "success",
    falhou: "danger",
    estornado: "secondary",
  };

  let secGerente, modalProdAdmin, editandoId = null, listaProdAdmin = [], gProdPreviewUrl = null;

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
          <h2 class="fw-bold fs-1 mb-1">Painel Administrativo</h2>
          <p class="text-secondary small">Gerencie produtos, acompanhe pedidos e consulte tokens de retirada dos alunos.</p>
        </div>
        <ul class="nav nav-pills mb-3 gap-2">
          <li class="nav-item"><button type="button" class="nav-link active" id="tabGProd">Produtos</button></li>
          <li class="nav-item"><button type="button" class="nav-link" id="tabGPed">Pedidos</button></li>
          <li class="nav-item"><button type="button" class="nav-link" id="tabGTok">Tokens IoT</button></li>
          <li class="nav-item"><button type="button" class="nav-link" id="tabGAvisos">Avisos</button></li>
        </ul>
        <div id="gProdutos">
          <div class="d-flex flex-wrap gap-2 mb-3">
            <input id="gBusca" class="form-control bg-dark text-white border-secondary" style="max-width:320px" placeholder="Buscar produto ou categoria">
            <button type="button" class="btn btn-outline-light" id="gAtualizarProdutos"><i class="bi bi-arrow-clockwise me-1"></i>Atualizar produtos</button>
            <button type="button" class="btn btn-danger ms-auto" id="gNovo"><i class="bi bi-plus-lg me-1"></i>Novo produto</button>
          </div>
          <div id="gProdTabela"></div>
        </div>
        <div id="gTokens" hidden>
          <div class="d-flex flex-wrap gap-2 mb-3">
            <p class="text-secondary small mb-0 me-auto">Consulte os tokens de retirada e o estado de cada pedido.</p>
            <button type="button" class="btn btn-outline-light" id="gAtualizarTokens"><i class="bi bi-arrow-clockwise me-1"></i>Atualizar tokens</button>
          </div>
          <div id="gTokensTabela"></div>
        </div>
        <div id="gAvisos" hidden>
          <form id="gFormAviso" class="border border-secondary rounded-3 p-3 mb-4">
            <input type="hidden" id="gAvisoId">
            <h5 id="gAvisoFormTitulo" class="mb-3">Publicar aviso</h5>
            <div class="row g-3">
              <div class="col-12"><label for="gAvisoTitulo" class="form-label">Título</label><input id="gAvisoTitulo" class="form-control bg-dark text-white border-secondary" maxlength="150" required></div>
              <div class="col-md-4"><label for="gAvisoCategoria" class="form-label">Categoria</label><select id="gAvisoCategoria" class="form-select bg-dark text-white border-secondary" required><option value="evento">Evento</option><option value="academico">Acadêmico</option><option value="reuniao">Reunião</option><option value="importante">Importante</option></select></div>
              <div class="col-md-4"><label for="gAvisoData" class="form-label">Data</label><input id="gAvisoData" type="date" class="form-control bg-dark text-white border-secondary" required></div>
              <div class="col-md-4"><label for="gAvisoHorario" class="form-label">Horário</label><input id="gAvisoHorario" type="time" class="form-control bg-dark text-white border-secondary" value="08:00"></div>
              <div class="col-12"><label for="gAvisoLocal" class="form-label">Local</label><input id="gAvisoLocal" class="form-control bg-dark text-white border-secondary" maxlength="150" placeholder="Ex.: Auditório SENAI"></div>
              <div class="col-12"><label for="gAvisoConteudo" class="form-label">Descrição</label><textarea id="gAvisoConteudo" class="form-control bg-dark text-white border-secondary" rows="3" maxlength="5000" required></textarea></div>
              <div class="col-12 d-flex flex-wrap gap-2"><button class="btn btn-danger" id="gAvisoSalvar" type="submit">Publicar aviso</button><button class="btn btn-outline-secondary" id="gAvisoCancelar" type="button" hidden>Cancelar edição</button></div>
              <div class="col-12"><div id="gAvisoMsg" role="status" class="small"></div></div>
            </div>
          </form>
          <div class="d-flex align-items-center justify-content-between gap-2 mb-3"><h5 class="mb-0">Avisos cadastrados</h5><button type="button" class="btn btn-outline-light btn-sm" id="gAvisoAtualizar">Atualizar</button></div>
          <div id="gAvisoLista"></div>
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
        <div class="modal-header border-secondary"><h5 class="modal-title" id="gProdTitulo"></h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button></div>
        <div class="modal-body">
          <label class="form-label small" for="gProdNome">Nome</label>
          <input id="gProdNome" class="form-control bg-dark text-white border-secondary mb-2" maxlength="120">
          <label class="form-label small" for="gProdCat">Categoria</label>
          <select id="gProdCat" class="form-select bg-dark text-white border-secondary mb-2">${CATEGORIAS.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
          <label class="form-label small" for="gProdDesc">Descrição</label>
          <textarea id="gProdDesc" rows="2" class="form-control bg-dark text-white border-secondary mb-2"></textarea>
          <label class="form-label small" for="gProdFoto">Foto do produto</label>
          <input id="gProdFoto" type="file" accept="image/png,image/jpeg" class="form-control bg-dark text-white border-secondary mb-2">
          <input id="gProdImagem" type="hidden">
          <div class="mb-3"><img id="gProdFotoPreview" alt="Prévia da foto do produto" src="/landing/images/logoTechCampus.png" style="width:100%;max-width:180px;height:130px;object-fit:contain;background:#fff;border-radius:8px;padding:6px"></div>
          <div class="row g-2">
            <div class="col"><label class="form-label small" for="gProdPreco">Preço (R$)</label>
              <input id="gProdPreco" type="number" min="0" step="0.01" class="form-control bg-dark text-white border-secondary"></div>
            <div class="col"><label class="form-label small" for="gProdEstoque">Estoque</label>
              <input id="gProdEstoque" type="number" min="0" step="1" class="form-control bg-dark text-white border-secondary"></div>
          </div>
          <div class="form-check form-switch mt-3" id="gProdAtivoBox">
            <input class="form-check-input" type="checkbox" id="gProdAtivo" checked><label class="form-check-label" for="gProdAtivo">Produto ativo na loja</label>
          </div>
          <div id="gProdMsg" role="alert" class="small mt-2"></div>
        </div>
        <div class="modal-footer border-secondary">
          <button type="button" class="btn btn-outline-danger me-auto" id="gProdExcluir" hidden>Excluir produto</button>
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-danger" id="gProdSalvar">Salvar</button>
        </div>
      </div></div>
    </div>`;
    document.body.append(m.firstElementChild);
    modalProdAdmin = new bootstrap.Modal($("modalProdAdmin"));

    $("tabGProd").onclick = () => aba("prod");
    $("tabGPed").onclick = () => aba("ped");
    $("tabGTok").onclick = () => aba("tokens");
    $("tabGAvisos").onclick = () => aba("avisos");
    $("gAtualizarTokens").onclick = carregarTokensAdmin;
    $("gFormAviso").addEventListener("submit", salvarAvisoAdmin);
    $("gAvisoCancelar").onclick = resetAvisoAdmin;
    $("gAvisoAtualizar").onclick = carregarAvisosAdmin;
    $("gBusca").addEventListener("input", renderProdutosAdmin);
    $("gNovo").onclick = () => abrirProduto(null);
    $("gAtualizarProdutos").onclick = async () => {
      const btn = $("gAtualizarProdutos");
      btn.disabled = true;
      try {
        await Promise.all([carregarProdutosAdmin(), carregarProdutos()]);
        setMsg($("gMsg"), "Lista de produtos atualizada.", "success");
      } finally { btn.disabled = false; }
    };
    $("gProdSalvar").onclick = salvarProduto;
    $("gProdExcluir").onclick = async () => {
      const p = listaProdAdmin.find((item) => String(item.id) === String(editandoId));
      if (!p) {
        setMsg($("gProdMsg"), "Não foi possível identificar o produto. Feche e abra a edição novamente.");
        return;
      }
      // O clique em "Excluir produto" já é a ação explícita do administrador.
      // Evita window.confirm dentro do modal Bootstrap, que pode ser suprimido pelo navegador.
      const btn = $("gProdExcluir");
      btn.disabled = true;
      setMsg($("gProdMsg"), "Excluindo produto...");
      try {
        await api("/produtos/" + p.id, { method: "DELETE" });
        modalProdAdmin.hide();
        await Promise.all([carregarProdutosAdmin(), carregarProdutos()]);
        setMsg($("gMsg"), "Produto excluído.", "success");
      } catch (e) {
        setMsg($("gProdMsg"), e.message || "Não foi possível excluir o produto.");
      } finally {
        btn.disabled = false;
      }
    };
    $("gProdFoto").addEventListener("change", () => {
      const file = $("gProdFoto").files?.[0];
      if (gProdPreviewUrl) {
        URL.revokeObjectURL(gProdPreviewUrl);
        gProdPreviewUrl = null;
      }
      if (!file) {
        $("gProdFotoPreview").src = "/landing/images/logoTechCampus.png";
        return;
      }
      if (!/^image\/(jpeg|png)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
        setMsg($("gProdMsg"), "Escolha uma foto JPG ou PNG de até 20 MB.");
        $("gProdFoto").value = "";
        $("gProdFotoPreview").src = "/landing/images/logoTechCampus.png";
        return;
      }
      gProdPreviewUrl = URL.createObjectURL(file);
      $("gProdFotoPreview").src = gProdPreviewUrl;
      setMsg($("gProdMsg"), "");
    });
    $("gFiltroPed").onchange = carregarPedidosAdmin;
    $("gAtualizar").onclick = () => {
      carregarProdutosAdmin();
      carregarPedidosAdmin();
    };
  }

  function aba(qual) {
    $("tabGProd").classList.toggle("active", qual === "prod");
    $("tabGPed").classList.toggle("active", qual === "ped");
    $("tabGTok").classList.toggle("active", qual === "tokens");
    $("tabGAvisos").classList.toggle("active", qual === "avisos");
    $("gProdutos").hidden = qual !== "prod";
    $("gPedidos").hidden = qual !== "ped";
    $("gTokens").hidden = qual !== "tokens";
    $("gAvisos").hidden = qual !== "avisos";
    if (qual === "ped") carregarPedidosAdmin();
    if (qual === "tokens") carregarTokensAdmin();
    if (qual === "avisos") carregarAvisosAdmin();
  }

  async function carregarTokensAdmin() {
    const container = $("gTokensTabela");
    if (!container) return;
    container.replaceChildren(h("p", { class: "text-secondary" }, "Carregando tokens..."));
    try {
      const tokens = await api("/admin/tokens");
      if (!tokens.length) {
        container.replaceChildren(h("p", { class: "text-secondary" }, "Ainda não há tokens de retirada."));
        return;
      }
      const corpo = h("tbody", {}, tokens.map((t) => h("tr", {},
        h("td", {}, "#" + t.pedido_id),
        h("td", {}, t.cliente || "—", h("div", { class: "small text-secondary" }, t.cliente_email || "")),
        h("td", {}, h("code", { class: "fs-6" }, t.token)),
        h("td", {}, STATUS[t.pedido_status] || t.pedido_status || "—"),
        h("td", {}, PAG[t.pagamento_status] || t.pagamento_status || "Sem pagamento"),
        h("td", {}, t.usado ? "Utilizado" : (t.expira_em && t.expira_em < Date.now() ? "Expirado" : "Ativo")),
        h("td", {}, t.expira_em ? new Date(t.expira_em).toLocaleString("pt-BR") : "—")
      )));
      container.replaceChildren(tabela(["Pedido", "Aluno", "Token", "Status pedido", "Pagamento", "Estado token", "Expiração"], corpo));
    } catch (e) {
      container.replaceChildren(h("div", { class: "alert alert-danger" }, e.message));
    }
  }

  async function carregarProdutosAdmin() {
    try {
      const resposta = await api("/admin/produtos");
      // A API omite produtos excluídos; ativar/desativar permanece uma ação independente.
      listaProdAdmin = resposta;
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
                h("div", { class: "d-flex justify-content-end gap-2" },
                  h("button", {
                    class: "btn btn-sm btn-outline-light",
                    type: "button",
                    onclick: () => abrirProduto(p),
                  }, "Editar")
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
    $("gProdTitulo").textContent = p ? "Editar produto" : "Novo produto";
    $("gProdNome").value = p?.nome || "";
    $("gProdCat").value = p?.categoria || CATEGORIAS[0];
    $("gProdDesc").value = p?.descricao || "";
    $("gProdImagem").value = p?.imagem || "";
    $("gProdFoto").value = "";
    $("gProdFotoPreview").src = p?.imagem || "/landing/images/logoTechCampus.png";
    $("gProdPreco").value = p ? (p.preco_centavos / 100).toFixed(2) : "";
    $("gProdEstoque").value = p ? p.estoque : 0;
    $("gProdAtivo").checked = p ? !!p.ativo : true;
    $("gProdAtivoBox").hidden = !p;
    $("gProdExcluir").hidden = !p;
    $("gProdExcluir").disabled = false;
    setMsg($("gProdMsg"), "");
    modalProdAdmin.show();
  }

  async function salvarProduto() {
    const preco = Math.round(
      parseFloat(String($("gProdPreco").value).replace(",", ".")) * 100
    );
    const estoque = parseInt($("gProdEstoque").value, 10);
    const nome = $("gProdNome").value.trim();

    if (
      !nome ||
      !Number.isSafeInteger(preco) ||
      preco < 0 ||
      !Number.isSafeInteger(estoque) ||
      estoque < 0
    )
      return setMsg($("gProdMsg"), "Informe nome, preço e estoque válidos.");

    const btn = $("gProdSalvar");
    btn.disabled = true;
    const body = {
      nome,
      categoria: $("gProdCat").value,
      descricao: $("gProdDesc").value,
      imagem: $("gProdImagem").value,
      preco_centavos: preco,
      estoque,
    };

    try {
      const arquivo = $("gProdFoto").files?.[0];
      if (arquivo) {
        if (!/^image\/(jpeg|png)$/.test(arquivo.type) || arquivo.size > 20 * 1024 * 1024)
          throw new Error("Escolha uma foto JPG ou PNG de até 20 MB.");
        const dados = new FormData();
        dados.append("foto", arquivo);
        const upload = await api("/produtos/imagem", { method: "POST", body: dados });
        body.imagem = upload.imagem;
      }
      if (!body.imagem) throw new Error("Selecione uma foto para o produto.");
      if (editandoId)
        await api(`/produtos/${editandoId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...body, ativo: $("gProdAtivo").checked ? 1 : 0 }),
        });
      else
        await api("/produtos", { method: "POST", body: JSON.stringify(body) });
      modalProdAdmin.hide();
      $("gProdFoto").value = "";
      if (gProdPreviewUrl) {
        URL.revokeObjectURL(gProdPreviewUrl);
        gProdPreviewUrl = null;
      }
      $("gProdFotoPreview").src = "/landing/images/logoTechCampus.png";
      await carregarProdutosAdmin();
      // Atualiza também a vitrine e os cards de compra sem exigir recarga da página.
      await carregarProdutos();
      setMsg($("gMsg"), "Produto salvo com sucesso.", "success");
    } catch (e) {
      setMsg($("gProdMsg"), e.message);
    } finally {
      btn.disabled = false;
    }
  }

  const CATEGORIAS_AVISO = { evento: "Evento", academico: "Acadêmico", reuniao: "Reunião", importante: "Importante" };

  async function carregarAvisosAdmin() {
    const container = $("gAvisoLista");
    if (!container) return;
    container.replaceChildren(h("p", { class: "text-secondary" }, "Carregando avisos..."));
    try {
      const avisos = await api("/admin/avisos");
      container.replaceChildren();
      if (!avisos.length) {
        container.append(h("p", { class: "text-secondary" }, "Nenhum aviso cadastrado."));
        return;
      }
      avisos.forEach((aviso) => {
        const item = h("article", { class: "d-flex flex-wrap justify-content-between align-items-start gap-3 p-3 mb-2 rounded-3 border border-secondary bg-dark" });
        const info = h("div", { class: "flex-grow-1" },
          h("strong", { class: "d-block mb-1" }, aviso.titulo + (Number(aviso.publicado) === 1 ? "" : " (excluído)")),
          h("p", { class: "small text-white-50 mb-2" }, aviso.conteudo),
          h("small", { class: "text-secondary" }, (CATEGORIAS_AVISO[aviso.categoria] || "Aviso") + " · " + (aviso.data_evento || "Sem data") + " · " + (aviso.horario || "Sem horário") + " · " + (aviso.local || "Sem local"))
        );
        const actions = h("div", { class: "d-flex flex-wrap gap-2" });
        const edit = h("button", { type: "button", class: "btn btn-sm btn-outline-light", onclick: () => editarAvisoAdmin(aviso) }, "Editar");
        const del = h("button", { type: "button", class: "btn btn-sm btn-outline-danger", onclick: async () => {
          if (!confirm("Excluir o aviso “" + aviso.titulo + "”? Ele deixará de aparecer no calendário.")) return;
          try { await api("/avisos/" + aviso.id, { method: "DELETE" }); await carregarAvisosAdmin(); setMsg($("gAvisoMsg"), "Aviso excluído.", "success"); }
          catch (e) { setMsg($("gAvisoMsg"), e.message); }
        } }, "Excluir");
        actions.append(edit, del); item.append(info, actions); container.append(item);
      });
    } catch (e) {
      container.replaceChildren(h("p", { class: "text-danger" }, e.message));
    }
  }

  function editarAvisoAdmin(aviso) {
    $("gAvisoId").value = aviso.id;
    $("gAvisoTitulo").value = aviso.titulo || "";
    $("gAvisoCategoria").value = aviso.categoria || "importante";
    $("gAvisoData").value = aviso.data_evento || "";
    $("gAvisoHorario").value = aviso.horario || "";
    $("gAvisoLocal").value = aviso.local || "";
    $("gAvisoConteudo").value = aviso.conteudo || "";
    $("gAvisoFormTitulo").textContent = "Editar aviso #" + aviso.id;
    $("gAvisoSalvar").textContent = "Salvar alterações";
    $("gAvisoCancelar").hidden = false;
    $("gFormAviso").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetAvisoAdmin() {
    $("gFormAviso").reset();
    $("gAvisoId").value = "";
    $("gAvisoHorario").value = "08:00";
    $("gAvisoFormTitulo").textContent = "Publicar aviso";
    $("gAvisoSalvar").textContent = "Publicar aviso";
    $("gAvisoCancelar").hidden = true;
  }

  async function salvarAvisoAdmin(event) {
    event.preventDefault();
    const id = $("gAvisoId").value;
    const body = {
      titulo: $("gAvisoTitulo").value.trim(),
      categoria: $("gAvisoCategoria").value,
      data_evento: $("gAvisoData").value,
      horario: $("gAvisoHorario").value,
      local: $("gAvisoLocal").value.trim(),
      conteudo: $("gAvisoConteudo").value.trim(),
    };
    try {
      await api(id ? "/avisos/" + id : "/avisos", { method: id ? "PATCH" : "POST", body: JSON.stringify(body) });
      resetAvisoAdmin();
      await carregarAvisosAdmin();
      document.dispatchEvent(new CustomEvent("tc-avisos-atualizados", { detail: { data: body.data_evento } }));
      setMsg($("gAvisoMsg"), id ? "Aviso atualizado e calendário sincronizado." : "Aviso publicado e calendário sincronizado.", "success");
    } catch (e) {
      setMsg($("gAvisoMsg"), e.message);
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
                      disabled: p.pagamento_status !== "confirmado",
                      title:
                        p.pagamento_status !== "confirmado"
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
        h("span", { class: "fw-bold fs-6" }, "Painel Administrativo"),
        h("span", { class: "text-white-50 small" }, "Produtos, pedidos e tokens")
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
  // EDITOR DE AVISOS NA PRÓPRIA TELA DE AVISOS (ADMIN)
  // =====================================================
  function configurarEditorAvisosPagina() {
    const tools = $("avisosAdminFerramentas");
    const form = $("avisosAdminForm");
    if (!tools || !form) return;

    // Os controles podem não existir em todas as versões da tela de Avisos.
    const abrir = $("avisosAdminAbrir");
    const novo = $("avisosAdminNovo");
    const fechar = $("avisosAdminFechar");
    const editor = $("avisosAdminEditor");

    // Não inicializa um editor incompleto; evita addEventListener em null.
    if (!abrir || !novo || !fechar || !editor) return;

    tools.classList.remove("d-none");
    abrir.addEventListener("click", async () => {
      editor.hidden = false;
      await carregarAvisosPaginaAdmin();
    });
    novo.addEventListener("click", resetAvisoPaginaAdmin);
    fechar.addEventListener("click", () => { editor.hidden = true; });
    form.addEventListener("submit", salvarAvisoPaginaAdmin);
    document.addEventListener("tc-avisos-atualizados", carregarAvisosPaginaAdmin);
  }

  async function carregarAvisosPaginaAdmin() {
    const list = $("avisosAdminLista");
    if (!list) return;
    list.replaceChildren(h("p", { class: "text-secondary small" }, "Carregando avisos..."));
    try {
      const avisos = await api("/admin/avisos");
      list.replaceChildren();
      if (!avisos.length) {
        list.append(h("p", { class: "text-secondary small" }, "Nenhum aviso cadastrado."));
        return;
      }
      avisos.forEach((aviso) => {
        const row = h("div", { class: "border border-secondary rounded-3 p-3 mb-2 d-flex flex-wrap align-items-start justify-content-between gap-3" });
        const details = h("div", { class: "flex-grow-1" },
          h("strong", { class: "d-block" }, aviso.titulo),
          h("p", { class: "small text-white-50 my-2" }, aviso.conteudo),
          h("small", { class: "text-secondary" }, [aviso.data_evento, aviso.horario, aviso.local, aviso.categoria].filter(Boolean).join(" · "))
        );
        const actions = h("div", { class: "d-flex gap-2" });
        actions.append(
          h("button", { type: "button", class: "btn btn-sm btn-outline-light", onclick: () => editarAvisoPaginaAdmin(aviso) }, "Editar"),
          h("button", { type: "button", class: "btn btn-sm btn-outline-danger", onclick: async () => {
            if (!confirm("Excluir o aviso “" + aviso.titulo + "”?")) return;
            try {
              await api("/avisos/" + aviso.id, { method: "DELETE" });
              await carregarAvisosPaginaAdmin();
              document.dispatchEvent(new CustomEvent("tc-avisos-atualizados"));
              setMsg($("avisosAdminMsg"), "Aviso excluído do calendário.", "success");
            } catch (e) { setMsg($("avisosAdminMsg"), e.message); }
          } }, "Excluir")
        );
        row.append(details, actions);
        list.append(row);
      });
    } catch (e) {
      list.replaceChildren(h("p", { class: "text-danger small" }, e.message));
    }
  }

  function editarAvisoPaginaAdmin(aviso) {
    $("avisosAdminId").value = aviso.id;
    $("avisosAdminNome").value = aviso.titulo || "";
    $("avisosAdminCategoria").value = aviso.categoria || "importante";
    $("avisosAdminData").value = aviso.data_evento || "";
    $("avisosAdminHorario").value = aviso.horario || "";
    $("avisosAdminLocal").value = aviso.local || "";
    $("avisosAdminDescricao").value = aviso.conteudo || "";
    $("avisosAdminTitulo").textContent = "Editar aviso";
    $("avisosAdminSalvar").textContent = "Salvar alterações";
    $("avisosAdminEditor").hidden = false;
    $("avisosAdminNome").focus();
  }

  function resetAvisoPaginaAdmin() {
    $("avisosAdminForm").reset();
    $("avisosAdminId").value = "";
    $("avisosAdminTitulo").textContent = "Publicar aviso";
    $("avisosAdminSalvar").textContent = "Publicar aviso";
    setMsg($("avisosAdminMsg"), "");
  }

  async function salvarAvisoPaginaAdmin(event) {
    event.preventDefault();
    const id = $("avisosAdminId").value;
    const body = {
      titulo: $("avisosAdminNome").value.trim(),
      categoria: $("avisosAdminCategoria").value,
      data_evento: $("avisosAdminData").value,
      horario: $("avisosAdminHorario").value,
      local: $("avisosAdminLocal").value.trim(),
      conteudo: $("avisosAdminDescricao").value.trim()
    };
    try {
      await api(id ? "/avisos/" + id : "/avisos", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(body)
      });
      resetAvisoPaginaAdmin();
      await carregarAvisosPaginaAdmin();
      document.dispatchEvent(new CustomEvent("tc-avisos-atualizados", { detail: { data: body.data_evento } }));
      setMsg($("avisosAdminMsg"), id ? "Aviso atualizado e calendário sincronizado." : "Aviso publicado no calendário.", "success");
    } catch (e) { setMsg($("avisosAdminMsg"), e.message); }
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

    // Disponibiliza o papel para a navegação central bloquear telas de aluno no Admin.
    window.tcPapelUsuario = user.papel;

    // Atualizar nome do usuário
    const nome = document.querySelector("#userDropdown .fw-semibold");
    const sub = document.querySelector("#userDropdown small");
    if (nome) nome.textContent = user.nome;
    if (sub) sub.textContent = user.papel === "admin" ? "Administrador" : "Aluno SENAI";
    const saudacao = document.getElementById("tcNomeUsuario");
    if (saudacao) saudacao.textContent = (user.nome || "Aluno").trim().split(/\s+/)[0];

    // Recursos de compra são inicializados somente para alunos.
    if (document.getElementById("productsTrack") && user.papel !== "admin") {
      carregarCarrinho();
      montarModalProduto();
      montarModalCarrinho();
      montarModalPagamento();
      criarBotaoCarrinho();
      carregarProdutos();
    }

    // Agendamentos
    ligarAgendamento();

    // Editor na própria aba Avisos: somente administradores.
    if (user.papel === "admin") {
      ativarModoGerente();
      configurarEditorAvisosPagina();
      document.querySelector('a.menu-item[href="#pedidos"]')?.remove();
      document.querySelector('a.menu-item[href="#meus-tokens"]')?.remove();
      $("pedidos")?.classList.add("d-none");
      $("meus-tokens")?.classList.add("d-none");
      if (["#pedidos", "#meus-tokens"].includes(location.hash)) location.hash = "#gerente";
    } else {
      document.querySelector('a.menu-item[href="#usuarios"]')?.remove();
      document.getElementById("avisosAdminFerramentas")?.remove();
    }
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
