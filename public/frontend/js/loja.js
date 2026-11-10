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
      .flat(Infinity)
      .filter((c) => c !== false && c !== true && c != null)
      .forEach((c) =>
        n.append(c instanceof Node ? c : document.createTextNode(String(c)))
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
    parcelas: 1,
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
            estadoPagamento.parcelas = 1;
            const select = $("caParcelas");
            if (select) select.hidden = true;
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
            estadoPagamento.parcelas = 1;
            const select = $("caParcelas");
            if (select) {
              const total = totalCarrinho();
              const max = total > 100000 ? 8 : total > 50000 ? 5 : total > 10000 ? 4 : total > 7500 ? 3 : 1;
              select.replaceChildren(...Array.from({length:max}, (_,i) => {
                const option = document.createElement("option");
                option.value = String(i+1);
                option.textContent = i === 0 ? "À vista (1x)" : `${i+1} parcelas`;
                return option;
              }));
              select.hidden = false;
            }
          },
        }),
        h(
          "label",
          { class: "form-check-label", for: "caCredito" },
          "Crédito"
        )
      ),
      h("label", { class: "form-label small mt-3", for: "caParcelas" }, "Parcelas no crédito"),
      h("select", {
        id: "caParcelas",
        class: "form-select bg-dark text-white border-secondary",
        hidden: true,
        onchange: (e) => { estadoPagamento.parcelas = Number(e.target.value) || 1; },
      }),
      h("small", { class: "text-white-50 d-block mt-2" }, "Crédito: acima de R$ 75 em até 3x, acima de R$ 100 em até 4x, acima de R$ 500 em até 5x e acima de R$ 1.000 em até 8x.")
    );

    container.replaceChildren(opcoesPix, opcoesDinheiro, opcoesCartao, secDinheiro, secCartao);
  }

  function selecionarPagamento(metodo) {
    estadoPagamento.metodo = metodo;
    estadoPagamento.tipoCartao = null;
    estadoPagamento.parcelas = 1;
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
    chaveIdempotencia: null,
    enviando: false,
  };

  async function finalizarCarrinho() {
    if (estadoCompra.enviando) return;
    if (!carrinho.length) {
      setMsg($("carrinhoMsg"), "Carrinho vazio!");
      return;
    }

    if (estadoPagamento.metodo === "cartao") {
      estadoPagamento.tipoCartao =
        document.querySelector('input[name="caTypeCartao"]:checked')?.value ||
        estadoPagamento.tipoCartao;
      if (!estadoPagamento.tipoCartao) {
        setMsg($("carrinhoMsg"), "Escolha Débito ou Crédito");
        return;
      }
      if (estadoPagamento.tipoCartao === "credito") {
        estadoPagamento.parcelas = Number($("caParcelas")?.value || estadoPagamento.parcelas || 1);
      } else {
        estadoPagamento.parcelas = 1;
      }
    }

    if (
      estadoPagamento.metodo === "dinheiro" &&
      estadoPagamento.valorEntregue < totalCarrinho()
    ) {
      setMsg($("carrinhoMsg"), "Valor entregue insuficiente");
      return;
    }

    const btn = document.querySelector(".modal-footer button:last-child");
    estadoCompra.enviando = true;
    if (!estadoCompra.chaveIdempotencia) {
      estadoCompra.chaveIdempotencia = globalThis.crypto?.randomUUID
        ? crypto.randomUUID()
        : `tc-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }
    if (btn) btn.disabled = true;

    try {
      // 1) Criar pedido com todos os itens do carrinho
      estadoCompra.pedido = await api("/pedidos", {
        method: "POST",
        headers: { "Idempotency-Key": estadoCompra.chaveIdempotencia },
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
        bodyPagamento.parcelas = estadoPagamento.tipoCartao === "credito" ? estadoPagamento.parcelas : 1;
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
      estadoCompra.enviando = false;
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
      // Fechar a janela não cancela a reserva: dinheiro/cartão aguardam o Admin
      // e o PIX permanece aguardando a simulação. Cancelamento é ação explícita.
      resetEstadoCompra();
    });
  }

  function resetEstadoCompra() {
    estadoCompra = {
      pedido: null,
      pagamento: null,
      pago: false,
      token: null,
      chaveIdempotencia: null,
      enviando: false,
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
    const botoes = [
      h("button", { class: "btn btn-outline-secondary", type: "button", onclick: cancelarCompra }, "Cancelar pedido")
    ];
    if (estadoPagamento.metodo === "pix") {
      botoes.push(h("button", {
        class: "btn btn-success",
        type: "button",
        id: "pagSimular",
        onclick: simularPagamento,
      }, "Simular pagamento PIX"));
    } else {
      botoes.push(h("span", { class: "small text-secondary me-auto" },
        "Aguardando confirmação presencial do administrador."));
    }
    rodape.replaceChildren(...botoes);

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
    const totalCentavos = Number(pagamento.valor_centavos || 0);
    const parcelas = estadoPagamento.tipoCartao === "credito" ? Math.max(1, Number(estadoPagamento.parcelas || 1)) : 1;
    const valorParcela = Math.round(totalCentavos / parcelas);

    const bloco = h(
      "div",
      { class: "bg-secondary-subtle p-4 rounded mb-4" },
      h("h6", { class: "text-white-50 small mb-3" }, "Forma de pagamento"),
      h("p", { class: "mb-0" }, h("strong", {}, `Cartão de ${tipo}`)),
      ...(estadoPagamento.tipoCartao === "credito"
        ? [h("p", { class: "mt-2 mb-0" }, h("strong", {}, `${parcelas}x de ${brl(valorParcela)} no crédito`))]
        : []),
      h("p", { class: "small text-white-50 mt-3 mb-0" },
        "Apresente este pedido ao responsável da AAPM. O token será gerado após a confirmação presencial.")
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
          <li class="nav-item"><button type="button" class="nav-link" id="tabGFin">Financeiro + Estoque</button></li>
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

        <div id="gFinanceiro" class="tc-finance" hidden>
          <style>
            /* TechCampus Financeiro — tema escuro como padrão */
            #gFinanceiro{
              --fin-bg:#111a23;--fin-card:#18232e;--fin-card-soft:#202d39;
              --fin-border:#2a3947;--fin-text:#edf4f7;--fin-muted:#9aabb8;
              --fin-input:#121d27;--fin-grid:#2a3947;--fin-shadow:0 12px 28px rgba(0,0,0,.16);
              --fin-green:#19c6a3;--fin-red:#ff718c;--fin-blue:#68a9ff;
              color:var(--fin-text)!important;min-width:0
            }
            #gFinanceiro .tc-fin-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}
            #gFinanceiro .tc-fin-head h3{font-size:1.45rem;letter-spacing:-.035em;color:var(--fin-text)!important}
            #gFinanceiro .tc-fin-sub,#gFinanceiro .tc-panel-note{color:var(--fin-muted)!important;font-size:.8rem}
            #gFinanceiro .tc-card{background:var(--fin-card)!important;color:var(--fin-text)!important;border:1px solid var(--fin-border)!important;border-radius:15px;padding:19px;height:100%;box-shadow:var(--fin-shadow);min-width:0}
            #gFinanceiro .tc-kpi{position:relative;overflow:hidden;min-height:126px;padding:19px 20px}
            #gFinanceiro .tc-kpi:after{content:"";position:absolute;width:82px;height:82px;border-radius:50%;right:-24px;top:-28px;background:var(--tc-tint);opacity:.13;pointer-events:none}
            #gFinanceiro .tc-kpi-label{color:var(--fin-muted)!important;font-size:.8rem;font-weight:650;position:relative;z-index:1}
            #gFinanceiro .tc-kpi-value{font-size:clamp(1.35rem,2.4vw,1.85rem);font-weight:780;letter-spacing:-.045em;margin-top:12px;position:relative;z-index:1;color:var(--fin-text)}
            #gFinanceiro .tc-kpi-note{font-size:.73rem;color:var(--fin-muted)!important;margin-top:5px;position:relative;z-index:1}
            #gFinanceiro .tc-section-title{font-size:.98rem;font-weight:750;margin:0 0 4px;color:var(--fin-text)!important;letter-spacing:-.015em}
            #gFinanceiro .tc-fin-field{background:var(--fin-input)!important;color:var(--fin-text)!important;border:1px solid var(--fin-border)!important;border-radius:9px!important;min-height:39px}
            #gFinanceiro .tc-fin-field::placeholder{color:var(--fin-muted)!important}
            #gFinanceiro .tc-fin-field:focus{border-color:var(--fin-green)!important;box-shadow:0 0 0 .2rem rgba(25,198,163,.14)!important}
            #gFinanceiro select option{background:var(--fin-card);color:var(--fin-text)}
            #gFinanceiro .tc-fin-btn{background:#078d78;border:1px solid #078d78;color:#fff;font-weight:700;border-radius:9px;min-height:39px}
            #gFinanceiro .tc-fin-btn:hover{background:#087763;border-color:#087763;color:#fff}
            #gFinanceiro .tc-fin-btn:focus-visible{outline:3px solid rgba(25,198,163,.3);outline-offset:2px}
            #gFinanceiro .tc-bar-chart{display:flex;align-items:flex-end;gap:clamp(8px,1.5vw,16px);height:214px;padding:15px 4px 0;overflow-x:auto;border-bottom:1px solid var(--fin-grid);background:repeating-linear-gradient(to bottom,transparent 0,transparent 39px,var(--fin-grid) 40px)}
            #gFinanceiro .tc-bar-month{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;flex:1 0 34px;height:100%;min-width:34px}
            #gFinanceiro .tc-bars{height:174px;display:flex;align-items:flex-end;gap:4px}
            #gFinanceiro .tc-bar{width:clamp(9px,1.1vw,13px);min-height:2px;border-radius:5px 5px 2px 2px;transition:filter .18s,transform .18s}
            #gFinanceiro .tc-bar:hover{filter:brightness(1.18);transform:translateY(-2px)}
            #gFinanceiro .tc-legend-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
            #gFinanceiro .tc-pie-wrap{display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;padding:12px 0;min-height:210px}
            #gFinanceiro .tc-pie{width:174px;height:174px;border-radius:50%;position:relative;flex:0 0 174px;box-shadow:0 0 0 1px var(--fin-border)}
            #gFinanceiro .tc-pie svg{display:block;width:100%;height:100%;overflow:visible}
            #gFinanceiro .tc-pie-slice{cursor:help;transition:filter .15s,opacity .15s;outline:none}
            #gFinanceiro .tc-pie-slice:hover,#gFinanceiro .tc-pie-slice:focus{filter:brightness(1.18);stroke:var(--fin-text);stroke-width:2.5}
            #gFinanceiro .tc-pie:after{content:"";position:absolute;inset:29%;background:var(--fin-card)!important;border-radius:50%;box-shadow:0 0 0 1px var(--fin-border);pointer-events:none}
            #gFinanceiro .tc-pie-center{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;pointer-events:none}
            #gFinanceiro .tc-pie-center strong{font-size:1.2rem;color:var(--fin-text)!important}
            #gFinanceiro .tc-pie-center span{font-size:.68rem;color:var(--fin-muted)!important}
            #gFinanceiro .tc-pie-legend{display:grid;gap:10px;min-width:145px;flex:1}
            #gFinanceiro .tc-pie-item{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.79rem;color:var(--fin-text)}
            #gFinanceiro .tc-pie-item-name{display:flex;align-items:center;gap:7px;min-width:0}
            #gFinanceiro .tc-pie-swatch{width:9px;height:9px;border-radius:3px;flex:0 0 9px}
            #gFinanceiro .tc-stock-stat{background:var(--fin-card-soft)!important;border:1px solid var(--fin-border);border-radius:11px;padding:13px}
            #gFinanceiro .tc-stock-stat strong{display:block;font-size:1.25rem;color:var(--fin-text)!important}
            #gFinanceiro .tc-stock-stat span{font-size:.74rem;color:var(--fin-muted)!important}
            #gFinanceiro .tc-fin-list-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--fin-grid)}
            #gFinanceiro .tc-fin-list-row:last-child{border-bottom:0}
            #gFinanceiro .tc-rank{width:28px;height:28px;border-radius:9px;background:rgba(25,198,163,.13);color:var(--fin-green);display:grid;place-items:center;font-weight:750;font-size:.8rem;flex:0 0 28px}
            #gFinanceiro .tc-progress{height:6px;background:var(--fin-card-soft);border-radius:99px;overflow:hidden;margin-top:7px}
            #gFinanceiro .tc-progress>span{display:block;height:100%;border-radius:99px;background:var(--fin-green)}
            #gFinanceiro .tc-fin-table{width:100%;font-size:.84rem}
            #gFinanceiro .tc-fin-table td{padding:10px 6px;border-bottom:1px solid var(--fin-grid)}
            #gFinanceiro .tc-fin-table tr:last-child td{border-bottom:0}
            #gFinanceiro #gFinHistorico>div{color:var(--fin-text)!important;border-color:var(--fin-grid)!important;padding:12px 2px!important}
            #gFinanceiro #gFinHistorico strong{color:var(--fin-red)}
            #gFinanceiro #gFinEstoqueLista .tc-fin-list-row span{color:var(--fin-text)!important}
            #gFinanceiro .text-secondary{color:var(--fin-muted)!important}
            #gFinanceiro .border-top,#gFinanceiro .border-bottom{border-color:var(--fin-grid)!important}
            #gFinanceiro .text-success{color:var(--fin-green)!important}
            #gFinanceiro .text-danger{color:var(--fin-red)!important}
            @media(max-width:767px){
              #gFinanceiro .tc-card{padding:15px;border-radius:13px}
              #gFinanceiro .tc-kpi{min-height:112px}
              #gFinanceiro .tc-fin-head h3{font-size:1.25rem}
              #gFinanceiro .tc-pie{width:154px;height:154px;flex-basis:154px}
              #gFinanceiro .tc-pie-wrap{gap:14px}
            }
            @media(max-width:420px){
              #gFinanceiro .tc-pie-wrap{flex-direction:column}
              #gFinanceiro .tc-pie-legend{width:100%}
            }

            /* Tema claro — mesma hierarquia, superfícies claras e contraste reforçado */
            html[data-bs-theme="light"] #gFinanceiro{
              --fin-bg:#f4f6fa;--fin-card:#fff;--fin-card-soft:#f3f6fa;
              --fin-border:#e1e7ef;--fin-text:#243247;--fin-muted:#718096;
              --fin-input:#fff;--fin-grid:#e8edf3;--fin-shadow:0 5px 18px rgba(31,48,70,.055);
              --fin-green:#078d72;--fin-red:#d94d69;--fin-blue:#397bd5;
              color:var(--fin-text)!important
            }
            html[data-bs-theme="light"] #gFinanceiro .tc-pie:after{background:#fff!important}
            html[data-bs-theme="light"] #gFinanceiro .tc-kpi-note{color:#718096!important}
            html[data-bs-theme="light"] #gFinanceiro .tc-fin-btn{background:#078d72;border-color:#078d72}
            html[data-bs-theme="light"] #gFinanceiro .tc-rank{background:#e6f7f2;color:#078d72}
            html[data-bs-theme="light"] #gFinanceiro .tc-progress{background:#edf2f6}
          </style>  </style>
          <div class="tc-fin-head">
            <div><h3 class="fw-bold mb-1">Visão financeira</h3><div class="tc-fin-sub">Acompanhe receitas, despesas, vendas e movimentações do estoque.</div></div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <label class="small fw-semibold" for="gFinMes">Período</label>
              <input id="gFinMes" type="month" class="form-control tc-fin-field" style="max-width:175px">
              <button type="button" class="btn tc-fin-btn px-3" id="gFinAtualizar"><i class="bi bi-arrow-clockwise me-1"></i>Atualizar</button>
            </div>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-12 col-sm-6 col-xl-3"><div class="tc-card tc-kpi" style="--tc-tint:#e2fbf4"><div class="tc-kpi-label"><i class="bi bi-graph-up-arrow me-1 text-success"></i>Receita confirmada</div><div class="tc-kpi-value text-success" id="gFinReceita">R$ 0,00</div><div class="tc-kpi-note">Pagamentos confirmados no mês</div></div></div>
            <div class="col-12 col-sm-6 col-xl-3"><div class="tc-card tc-kpi" style="--tc-tint:#fff0f0"><div class="tc-kpi-label"><i class="bi bi-arrow-down-right me-1 text-danger"></i>Despesas</div><div class="tc-kpi-value text-danger" id="gFinDespesas">R$ 0,00</div><div class="tc-kpi-note">Despesas registradas no mês</div></div></div>
            <div class="col-12 col-sm-6 col-xl-3"><div class="tc-card tc-kpi" style="--tc-tint:#eaf3ff"><div class="tc-kpi-label"><i class="bi bi-wallet2 me-1 text-primary"></i>Resultado estimado</div><div class="tc-kpi-value" id="gFinResultado">R$ 0,00</div><div class="tc-kpi-note">Receitas menos despesas</div></div></div>
            <div class="col-12 col-sm-6 col-xl-3"><div class="tc-card tc-kpi" style="--tc-tint:#f2edff"><div class="tc-kpi-label"><i class="bi bi-box-seam me-1" style="color:#8065d8"></i>Unidades em estoque</div><div class="tc-kpi-value" id="gFinUnidades">0</div><div class="tc-kpi-note"><span id="gFinEstoqueBaixo">0</span> produtos com estoque baixo</div></div></div>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-12 col-xl-7"><div class="tc-card">
              <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-2"><div><h5 class="tc-section-title">Fluxo financeiro</h5><div class="tc-panel-note">Comparativo dos últimos 12 meses</div></div><div class="small d-flex gap-3"><span><i class="tc-legend-dot" style="background:#0fc5a6"></i>Receitas</span><span><i class="tc-legend-dot" style="background:#ff6685"></i>Despesas</span></div></div>
              <div id="gFinGrafico" class="tc-bar-chart"></div><div class="tc-panel-note mt-2">Valores em reais. Passe o cursor sobre as barras para consultar os totais.</div>
            </div></div>
            <div class="col-12 col-xl-5"><div class="tc-card">
              <div class="mb-2"><h5 class="tc-section-title">Produtos mais vendidos</h5><div class="tc-panel-note">Participação de cada produto nas unidades vendidas</div></div>
              <div id="gFinPizza" class="tc-pie-wrap"></div>
              <div class="border-top pt-2 mt-2"><div class="tc-section-title mb-2">Ranking de vendas</div><div id="gFinMaisVendidos"></div></div>
            </div></div>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-12 col-xl-7"><div class="tc-card">
              <div class="mb-3"><h5 class="tc-section-title">Entrada de mercadorias</h5><div class="tc-panel-note">Registre compras e atualize o saldo do estoque automaticamente.</div></div>
              <form id="gEstoqueCompra" class="row g-3">
                <div class="col-12 col-md-6"><label class="form-label small fw-semibold" for="gEstoqueProduto">Produto</label><select id="gEstoqueProduto" class="form-select tc-fin-field" required></select></div>
                <div class="col-6 col-md-3"><label class="form-label small fw-semibold" for="gEstoqueQtd">Quantidade</label><input id="gEstoqueQtd" type="number" min="1" step="1" class="form-control tc-fin-field" required></div>
                <div class="col-6 col-md-3"><label class="form-label small fw-semibold" for="gEstoqueCusto">Custo unitário (R$)</label><input id="gEstoqueCusto" type="number" min="0.01" step="0.01" class="form-control tc-fin-field" required></div>
                <div class="col-12 col-md-5"><label class="form-label small fw-semibold" for="gEstoqueData">Data da compra</label><input id="gEstoqueData" type="date" class="form-control tc-fin-field" required></div>
                <div class="col-12 col-md-7"><label class="form-label small fw-semibold" for="gEstoqueObs">Fornecedor / observação</label><input id="gEstoqueObs" maxlength="180" class="form-control tc-fin-field" placeholder="Opcional"></div>
                <div class="col-12"><button class="btn tc-fin-btn px-4" type="submit"><i class="bi bi-plus-circle me-1"></i>Registrar entrada</button></div>
              </form>
              <div id="gEstoqueMsg" class="small mt-3" role="status"></div>
            </div></div>
            <div class="col-12 col-xl-5"><div class="tc-card">
              <div class="mb-3"><h5 class="tc-section-title">Resumo do estoque</h5><div class="tc-panel-note">Visão rápida dos níveis atuais</div></div>
              <div class="row g-2 mb-3">
                <div class="col-6"><div class="tc-stock-stat"><strong id="gFinEstoqueProdutos">0</strong><span>Produtos ativos</span></div></div>
                <div class="col-6"><div class="tc-stock-stat"><strong id="gFinEstoqueBaixoCard">0</strong><span>Estoque baixo (até 3)</span></div></div>
              </div>
              <div class="tc-panel-note mb-2">Produtos para reposição</div><div id="gFinEstoqueLista" class="small">Carregando estoque...</div>
            </div></div>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-12 col-xl-5"><div class="tc-card">
              <div class="mb-3"><h5 class="tc-section-title">Registrar despesa</h5><div class="tc-panel-note">Lance custos que não vieram de compras de estoque.</div></div>
              <form id="gFinDespesaForm" class="row g-2">
                <div class="col-12 col-md-6"><label class="form-label small fw-semibold" for="gFinCategoria">Categoria</label><select id="gFinCategoria" class="form-select tc-fin-field"><option>Operacional</option><option>Material</option><option>Manutenção</option><option>Serviços</option><option>Outros</option></select></div>
                <div class="col-12 col-md-6"><label class="form-label small fw-semibold" for="gFinValor">Valor (R$)</label><input id="gFinValor" type="number" min="0.01" step="0.01" class="form-control tc-fin-field" required></div>
                <div class="col-12"><label class="form-label small fw-semibold" for="gFinDescricao">Descrição</label><input id="gFinDescricao" maxlength="180" class="form-control tc-fin-field" required></div>
                <div class="col-12"><label class="form-label small fw-semibold" for="gFinData">Data</label><input id="gFinData" type="date" class="form-control tc-fin-field" required></div>
                <div class="col-12"><button class="btn btn-outline-secondary px-4" type="submit">Salvar despesa</button></div>
              </form>
              <div id="gFinDespesaMsg" class="small mt-2" role="status"></div>
            </div></div>
            <div class="col-12 col-xl-7"><div class="tc-card">
              <div class="mb-3"><h5 class="tc-section-title">Despesas recentes</h5><div class="tc-panel-note">Últimos lançamentos registrados</div></div>
              <div id="gFinHistorico"></div>
            </div></div>
          </div>
          <div id="gFinMsg" role="status" class="small mt-2"></div>
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
    $("tabGFin").onclick = () => aba("financeiro");
    $("gFinMes").value = new Date().toISOString().slice(0,7);
    $("gEstoqueData").value = new Date().toISOString().slice(0,10);
    $("gFinData").value = new Date().toISOString().slice(0,10);
    $("gFinAtualizar").onclick = carregarFinanceiroAdmin;
    $("gEstoqueCompra").addEventListener("submit", registrarCompraEstoque);
    $("gFinDespesaForm").addEventListener("submit", registrarDespesaFinanceira);

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
    $("tabGFin").classList.toggle("active", qual === "financeiro");
    $("gProdutos").hidden = qual !== "prod";
    $("gPedidos").hidden = qual !== "ped";
    $("gTokens").hidden = qual !== "tokens";
    $("gAvisos").hidden = qual !== "avisos";
    $("gFinanceiro").hidden = qual !== "financeiro";
    if (qual === "financeiro") carregarFinanceiroAdmin();
    if (qual === "ped") carregarPedidosAdmin();
    if (qual === "tokens") carregarTokensAdmin();
    if (qual === "avisos") carregarAvisosAdmin();
  }


  function valorReal(centavos) { return brl(Number(centavos || 0)); }

  async function carregarFinanceiroAdmin() {
    const msg=$("gFinMsg"); if(!msg)return;
    setMsg(msg,"Carregando dados financeiros...","secondary");
    try {
      const [dados,produtos]=await Promise.all([
        api("/admin/financeiro/resumo?mes="+encodeURIComponent($("gFinMes").value)),
        api("/admin/produtos")
      ]);
      $("gFinReceita").textContent=valorReal(dados.receita_centavos);
      $("gFinDespesas").textContent=valorReal(dados.despesas_centavos);
      $("gFinResultado").textContent=valorReal(dados.resultado_centavos);
      $("gFinResultado").classList.toggle("text-success",dados.resultado_centavos>=0);
      $("gEstoqueProduto").replaceChildren(...produtos.map(p=>h("option",{value:p.id},p.nome+" (estoque: "+p.estoque+")")));
      if(!produtos.length)$("gEstoqueProduto").append(h("option",{value:""},"Cadastre um produto primeiro"));
      const max=Math.max(1,...dados.grafico.flatMap(x=>[x.receita,x.despesas]));
      const graf=$("gFinGrafico");graf.replaceChildren();
      for(const item of dados.grafico){
        const coluna=h("div",{class:"tc-bar-month"});
        const barras=h("div",{class:"tc-bars"});
        barras.append(h("div",{class:"tc-bar",title:"Receita: "+valorReal(item.receita),style:"height:"+Math.max(2,item.receita/max*155)+"px;background:#0fc5a6"}));
        barras.append(h("div",{class:"tc-bar",title:"Despesas: "+valorReal(item.despesas),style:"height:"+Math.max(2,item.despesas/max*155)+"px;background:#ff6685"}));
        coluna.append(barras,h("span",{class:"small mt-2",style:"color:#8492a0"},item.mes.slice(5)));
        graf.append(coluna);
      }
      const estoque=dados.estoque||{};
      $("gFinUnidades").textContent=Number(estoque.unidades||0).toLocaleString("pt-BR");
      $("gFinEstoqueBaixo").textContent=Number(estoque.baixo||0).toLocaleString("pt-BR");
      $("gFinEstoqueProdutos").textContent=Number(estoque.produtos||0).toLocaleString("pt-BR");
      $("gFinEstoqueBaixoCard").textContent=Number(estoque.baixo||0).toLocaleString("pt-BR");
      const baixo=produtos.filter(p=>Number(p.estoque)<=3);
      const listaEstoque=$("gFinEstoqueLista");listaEstoque.replaceChildren();
      if(!baixo.length) listaEstoque.append(h("div",{class:"text-success py-2"},"Todos os produtos estão com estoque acima do limite mínimo."));
      baixo.slice(0,6).forEach(p=>{
        const linha=h("div",{class:"tc-fin-list-row"});
        linha.append(h("span",{class:"text-truncate",style:"color:#34495a"},p.nome),h("strong",{class:"text-danger flex-shrink-0"},Number(p.estoque)+" un."));
        listaEstoque.append(linha);
      });
      const mais=$( "gFinMaisVendidos");mais.replaceChildren();
      const pizza=$( "gFinPizza");pizza.replaceChildren();
      const cores=["#10c5a5","#3f8efc","#f4d94e","#b58be8","#ff8a65","#55b7d8","#ef72ae","#93a4b5"];
      const vendidos=dados.mais_vendidos||[];
      const totalVendidos=vendidos.reduce((sum,p)=>sum+Number(p.quantidade||0),0);
      if(!vendidos.length){
        mais.append(h("p",{class:"tc-panel-note mb-0"},"Ainda não há vendas com pagamento confirmado."));
        pizza.append(h("p",{class:"tc-panel-note mb-0"},"O gráfico aparecerá quando houver vendas confirmadas."));
      }else{
        let acumulado=0;
        const fatias=vendidos.map((p,i)=>{
          const percentual=totalVendidos?Number(p.quantidade||0)/totalVendidos*100:0;
          const inicio=acumulado;acumulado+=percentual;
          return {p,i,percentual,inicio,fim:acumulado};
        });
        const gradiente=fatias.map(f=>cores[f.i]+" "+f.inicio.toFixed(2)+"% "+f.fim.toFixed(2)+"%").join(",");
        const donut=h("div",{class:"tc-pie"});
        const svgNS="http://www.w3.org/2000/svg";
        const svg=document.createElementNS(svgNS,"svg");
        svg.setAttribute("viewBox","0 0 190 190");
        svg.setAttribute("role","img");
        svg.setAttribute("aria-label","Gráfico de participação dos produtos mais vendidos");
        fatias.forEach(f=>{
          const ang1=(-90+f.inicio*3.6)*Math.PI/180;
          const ang2=(-90+f.fim*3.6)*Math.PI/180;
          const x1=95+85*Math.cos(ang1),y1=95+85*Math.sin(ang1);
          const x2=95+85*Math.cos(ang2),y2=95+85*Math.sin(ang2);
          const grande=f.percentual>50?1:0;
          const path=document.createElementNS(svgNS,"path");
          path.setAttribute("d","M 95 95 L "+x1.toFixed(2)+" "+y1.toFixed(2)+" A 85 85 0 "+grande+" 1 "+x2.toFixed(2)+" "+y2.toFixed(2)+" Z");
          path.setAttribute("fill",cores[f.i]);
          path.setAttribute("stroke","var(--fin-card)");
          path.setAttribute("stroke-width","1.5");
          path.setAttribute("class","tc-pie-slice");
          path.setAttribute("tabindex","0");
          path.setAttribute("aria-label",f.p.nome+": "+f.percentual.toLocaleString("pt-BR",{maximumFractionDigits:1})+"%");
          const title=document.createElementNS(svgNS,"title");
          title.textContent=f.p.nome+": "+f.percentual.toLocaleString("pt-BR",{maximumFractionDigits:1})+"% ("+Number(f.p.quantidade).toLocaleString("pt-BR")+" unidades)";
          path.append(title);
          svg.append(path);
        });
        donut.append(svg);
        donut.append(h("div",{class:"tc-pie-center"},h("strong",{},totalVendidos.toLocaleString("pt-BR")),h("span",{},"unidades vendidas")));
        const legenda=h("div",{class:"tc-pie-legend"});
        fatias.forEach(f=>{
          const item=h("div",{class:"tc-pie-item"});
          const nome=h("span",{class:"tc-pie-item-name"});
          nome.append(h("i",{class:"tc-pie-swatch",style:"background:"+cores[f.i]}),h("span",{class:"text-truncate",style:"color:#536575"},f.p.nome));
          item.append(nome,h("strong",{style:"color:#203447"},f.percentual.toLocaleString("pt-BR",{maximumFractionDigits:1})+"%"));
          legenda.append(item);
        });
        pizza.append(donut,legenda);
        fatias.forEach((f)=>{
          const linha=h("div",{class:"tc-fin-list-row"});
          const esquerda=h("div",{class:"d-flex align-items-center gap-2 flex-grow-1",style:"min-width:0"});
          esquerda.append(h("span",{class:"tc-rank"},String(f.i+1)),h("div",{class:"flex-grow-1",style:"min-width:0"},h("div",{class:"small fw-semibold text-truncate",style:"color:#34495a"},f.p.nome),h("div",{class:"tc-progress"},h("span",{style:"width:"+f.percentual+"%;background:"+cores[f.i]}))));
          linha.append(esquerda,h("div",{class:"text-end flex-shrink-0"},h("strong",{class:"small",style:"color:#203447"},Number(f.p.quantidade).toLocaleString("pt-BR")+" un."),h("div",{class:"tc-panel-note"},f.percentual.toLocaleString("pt-BR",{maximumFractionDigits:1})+"%")));
          mais.append(linha);
        });
      }
      const hist=$("gFinHistorico");hist.replaceChildren();
      if(!dados.despesas.length)hist.append(h("p",{class:"text-secondary"},"Nenhuma despesa registrada."));
      else dados.despesas.forEach(d=>{
        const linha=h("div",{class:"d-flex flex-wrap justify-content-between gap-2 border-bottom border-secondary py-2"});
        linha.append(h("span",{},d.data_despesa+" · "+d.descricao),h("strong",{},valorReal(d.valor_centavos)));
        hist.append(linha);
      });
      setMsg(msg,"Dados atualizados. O resultado é uma estimativa baseada em pagamentos confirmados e despesas registradas.","success");
    } catch(e){setMsg(msg,e.message);}
  }

  async function registrarCompraEstoque(event){
    event.preventDefault();
    const btn=$("gEstoqueCompra").querySelector('[type="submit"]');btn.disabled=true;
    try{
      const body={
        produto_id:Number($("gEstoqueProduto").value),
        quantidade:Number($("gEstoqueQtd").value),
        custo_unitario_centavos:Math.round(Number($("gEstoqueCusto").value)*100),
        data_compra:$("gEstoqueData").value,
        observacao:$("gEstoqueObs").value.trim()
      };
      const result=await api("/admin/estoque/compras",{method:"POST",body:JSON.stringify(body)});
      $("gEstoqueCompra").reset();
      $("gEstoqueData").value=new Date().toISOString().slice(0,10);
      setMsg($("gEstoqueMsg"),"Compra registrada: +"+result.quantidade+" unidades. Total: "+valorReal(result.valor_total_centavos)+".","success");
      await Promise.all([carregarFinanceiroAdmin(),carregarProdutosAdmin()]);
    }catch(e){setMsg($("gEstoqueMsg"),e.message);}
    finally{btn.disabled=false;}
  }

  async function registrarDespesaFinanceira(event){
    event.preventDefault();
    const btn=$("gFinDespesaForm").querySelector('[type="submit"]');btn.disabled=true;
    try{
      await api("/admin/financeiro/despesas",{method:"POST",body:JSON.stringify({
        categoria:$("gFinCategoria").value,
        descricao:$("gFinDescricao").value.trim(),
        valor_centavos:Math.round(Number($("gFinValor").value)*100),
        data_despesa:$("gFinData").value
      })});
      $("gFinDespesaForm").reset();
      $("gFinData").value=new Date().toISOString().slice(0,10);
      setMsg($("gFinDespesaMsg"),"Despesa registrada.","success");
      await carregarFinanceiroAdmin();
    }catch(e){setMsg($("gFinDespesaMsg"),e.message);}
    finally{btn.disabled=false;}
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

  async function confirmarPagamentoPresencial(id) {
    if (!confirm(`Confirmar o recebimento presencial do pedido #${id}?`)) return;
    try {
      await api(`/admin/pedidos/${id}/confirmar`, { method: "POST" });
      setMsg($("gMsg"), `Pedido #${id} confirmado. Receita registrada no financeiro e token gerado.`, "success");
      await carregarPedidosAdmin();
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
              h("td", {}, h("div", { class: "tc-admin-payment" },
                h("strong", {}, p.pagamento_metodo === "pix" ? "PIX" : p.pagamento_metodo === "dinheiro" ? "Dinheiro" : p.pagamento_metodo === "cartao" ? `Cartão · ${p.tipo_cartao === "credito" ? "Crédito" : p.tipo_cartao === "debito" ? "Débito" : "Tipo não registrado"}` : "Forma não informada"),
                p.pagamento_metodo === "dinheiro" && h("small", {}, `Entregue: ${p.valor_entregue_centavos == null ? "Não informado" : brl(p.valor_entregue_centavos)} · Troco: ${p.troco_centavos == null ? "—" : brl(p.troco_centavos)}`),
                p.pagamento_metodo === "cartao" && p.tipo_cartao === "credito" && h("small", {}, (() => { const n = Math.max(1, Number(p.parcelas || 1)); return `${n}x de ${brl(Math.round(Number(p.total_centavos || 0) / n))}`; })()),
                p.pagamento_status ? badge(PAG[p.pagamento_status], COR[p.pagamento_status]) : badge("Sem pagamento", "secondary")
              )),
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
                  ["dinheiro", "cartao"].includes(p.pagamento_metodo) && p.pagamento_status === "pendente"
                    ? h("button", {
                        class: "btn btn-sm btn-success me-1",
                        type: "button",
                        onclick: () => confirmarPagamentoPresencial(p.id),
                      }, "Confirmar recebimento")
                    : null,
                  h("button", {
                    class: "btn btn-sm btn-outline-danger",
                    type: "button",
                    onclick: () => mudarStatus(p.id, "rejeitado"),
                  }, "Rejeitar"),
                ],
                p.status === "aprovado"
                  ? h(
                      "button",
                      {
                        class: "btn btn-sm btn-info",
                        type: "button",
                        onclick: () => mudarStatus(p.id, "entregue"),
                      },
                      "Marcar entregue"
                    )
                  : null
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
