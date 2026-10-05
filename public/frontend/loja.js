/* =====================================================
   TECHCAMPUS - LOJA (front)
   - Aluno: botão "Comprar" abre o checkout com pagamento
   - Gerente: painel com produtos e pedidos
   Carregar no sistema.html DEPOIS do ../landing/script.js
===================================================== */
(() => {
  "use strict";

  const token = sessionStorage.getItem("techcampus_token");
  if (!token) return; // auth.js cuida do redirecionamento

  // ---------- utilitários ----------
  const brl = (c) =>
    (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const dataBR = (s) => {
    const d = new Date(String(s).replace(" ", "T") + "Z");
    return isNaN(d) ? "" : d.toLocaleString("pt-BR");
  };
  const STATUS = { pendente: "Pendente", aprovado: "Aprovado", rejeitado: "Rejeitado", entregue: "Entregue", cancelado: "Cancelado" };
  const PAG = { pendente: "Aguardando", pago: "Pago", falhou: "Falhou", estornado: "Estornado" };
  const COR = { pendente: "warning", aprovado: "success", rejeitado: "danger", entregue: "info", cancelado: "secondary", pago: "success", falhou: "danger", estornado: "secondary" };

  // Cria elementos com textContent (nunca innerHTML com dados vindos da API → sem XSS)
  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => n.append(c instanceof Node ? c : document.createTextNode(c ?? "")));
    return n;
  };
  const badge = (txt, cor) => h("span", { class: `badge text-bg-${cor || "secondary"}` }, txt);

  async function api(path, opts = {}) {
    const res = await fetch("/api" + path, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    let data = null;
    try { data = await res.json(); } catch { /* 204 etc. */ }
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
  const setMsg = (el, txt, tipo = "danger") => {
    el.className = `small mt-3 text-${tipo}`;
    el.textContent = txt || "";
  };

  /* =====================================================
     1) VITRINE + CHECKOUT (aluno)
  ===================================================== */
  let produtos = [];
  let modalCompra, atual;

  function resetAtual() {
    atual = { produto: null, pedido: null, pagamento: null, pago: false };
  }

  function montarModalCompra() {
    const wrap = h("div");
    wrap.innerHTML = `
    <div class="modal fade" id="modalCompra" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-white border-secondary">
          <div class="modal-header border-secondary">
            <h5 class="modal-title">Finalizar compra</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <div id="cpPasso1">
              <div class="d-flex gap-3 align-items-center mb-3">
                <img id="cpImg" alt="" style="height:70px;width:70px;object-fit:contain">
                <div><div class="fw-bold" id="cpNome"></div><div class="text-white-50 small" id="cpUnit"></div></div>
              </div>
              <label class="form-label small" for="cpQtd">Quantidade</label>
              <input id="cpQtd" type="number" min="1" value="1" class="form-control bg-dark text-white border-secondary mb-3">
              <div class="small mb-1">Forma de pagamento</div>
              <div class="d-flex gap-2 mb-3">
                <input type="radio" class="btn-check" name="cpMetodo" id="cpPix" value="pix" checked>
                <label class="btn btn-outline-light flex-fill" for="cpPix"><i class="bi bi-qr-code me-1"></i>Pix</label>
                <input type="radio" class="btn-check" name="cpMetodo" id="cpCartao" value="cartao">
                <label class="btn btn-outline-light flex-fill" for="cpCartao"><i class="bi bi-credit-card me-1"></i>Cartão</label>
              </div>
              <div class="d-flex justify-content-between fs-5"><span>Total</span><strong id="cpTotal"></strong></div>
            </div>
            <div id="cpPasso2" hidden>
              <p class="fw-semibold mb-2" id="cpPedidoInfo"></p>
              <div id="cpBlocoPix" hidden>
                <label class="small text-white-50" for="cpCodigo">Código Pix (copia e cola)</label>
                <div class="input-group mb-2">
                  <input id="cpCodigo" readonly class="form-control bg-dark text-white border-secondary">
                  <button class="btn btn-outline-light" type="button" id="cpCopiar">Copiar</button>
                </div>
              </div>
              <p class="small text-white-50 mb-0" id="cpNota"></p>
            </div>
            <div id="cpPasso3" hidden class="text-center py-3">
              <i class="bi bi-check-circle-fill text-success display-4"></i>
              <p class="mt-2 mb-0" id="cpOk"></p>
            </div>
            <div id="cpMsg" role="alert" class="small mt-3"></div>
          </div>
          <div class="modal-footer border-secondary" id="cpRodape"></div>
        </div>
      </div>
    </div>`;
    document.body.append(wrap.firstElementChild);
    const el = document.getElementById("modalCompra");
    modalCompra = new bootstrap.Modal(el);
    el.addEventListener("hidden.bs.modal", async () => {
      // Fechou sem pagar: cancela para devolver o estoque reservado
      if (atual.pedido && !atual.pago) {
        try { await api(`/pedidos/${atual.pedido.id}/cancelar`, { method: "POST" }); } catch { /* já tratado no servidor */ }
        carregarProdutos();
      }
      resetAtual();
    });
    document.getElementById("cpQtd").addEventListener("input", atualizarTotal);
    document.getElementById("cpCopiar").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(document.getElementById("cpCodigo").value); setMsg(document.getElementById("cpMsg"), "Código copiado.", "success"); } catch { /* sem permissão */ }
    });
  }

  const $ = (id) => document.getElementById(id);
  const quantidade = () => {
    const max = Math.min(100, atual.produto.estoque);
    const q = parseInt($("cpQtd").value, 10);
    return Number.isInteger(q) ? Math.max(1, Math.min(q, max)) : 1;
  };
  function atualizarTotal() {
    $("cpTotal").textContent = brl(atual.produto.preco_centavos * quantidade());
  }
  function rodape(...botoes) {
    $("cpRodape").replaceChildren(...botoes);
  }
  function passo(n) {
    [1, 2, 3].forEach((i) => ($("cpPasso" + i).hidden = i !== n));
  }

  function abrirCompra(p) {
    resetAtual();
    atual.produto = p;
    $("cpImg").src = p.imagem || "";
    $("cpNome").textContent = p.nome;
    $("cpUnit").textContent = `${brl(p.preco_centavos)} cada • ${p.estoque} em estoque`;
    $("cpQtd").max = Math.min(100, p.estoque);
    $("cpQtd").value = 1;
    $("cpPix").checked = true;
    setMsg($("cpMsg"), "");
    passo(1);
    atualizarTotal();
    rodape(
      h("button", { class: "btn btn-outline-secondary", type: "button", "data-bs-dismiss": "modal" }, "Cancelar"),
      h("button", { class: "btn btn-danger", type: "button", id: "cpContinuar", onclick: iniciarPagamento }, "Continuar para pagamento"),
    );
    modalCompra.show();
  }

  async function iniciarPagamento() {
    const btn = $("cpContinuar");
    btn.disabled = true;
    setMsg($("cpMsg"), "");
    try {
      const metodo = document.querySelector('input[name="cpMetodo"]:checked').value;
      if (!atual.pedido)
        atual.pedido = await api("/pedidos", {
          method: "POST",
          body: JSON.stringify({ itens: [{ produto_id: atual.produto.id, quantidade: quantidade() }] }),
        });
      atual.pagamento = await api(`/pedidos/${atual.pedido.id}/pagamento`, {
        method: "POST",
        body: JSON.stringify({ metodo }),
      });
      mostrarPagamento();
    } catch (e) {
      setMsg($("cpMsg"), e.message);
      btn.disabled = false;
    }
  }

  function mostrarPagamento() {
    const pg = atual.pagamento;
    passo(2);
    $("cpPedidoInfo").textContent = `Pedido #${atual.pedido.id} • Total ${brl(pg.valor_centavos)}`;
    $("cpBlocoPix").hidden = pg.metodo !== "pix";
    $("cpCodigo").value = pg.codigo || "";
    $("cpNota").textContent =
      pg.metodo === "pix"
        ? "Pague o Pix com o código acima. Seu pedido será analisado pelo gerente após a confirmação do pagamento."
        : "O pagamento com cartão será feito na tela segura do provedor de pagamento. Este site nunca recebe nem guarda dados do seu cartão.";
    rodape(
      h("button", { class: "btn btn-outline-secondary", type: "button", onclick: cancelarPedido }, "Cancelar pedido"),
      h("button", { class: "btn btn-danger", type: "button", id: "cpSimular", onclick: simularPagamento }, "Simular pagamento (modo teste)"),
    );
  }

  async function cancelarPedido() {
    try {
      await api(`/pedidos/${atual.pedido.id}/cancelar`, { method: "POST" });
      atual.pedido = null; // evita novo cancelamento ao fechar
      modalCompra.hide();
      carregarProdutos();
    } catch (e) { setMsg($("cpMsg"), e.message); }
  }

  async function simularPagamento() {
    $("cpSimular").disabled = true;
    try {
      await api(`/pagamentos/${atual.pagamento.id}/confirmar-simulado`, { method: "POST" });
      atual.pago = true;
      passo(3);
      $("cpOk").textContent = `Pagamento do pedido #${atual.pedido.id} confirmado! Agora é só aguardar a aprovação do gerente.`;
      setMsg($("cpMsg"), "");
      rodape(h("button", { class: "btn btn-danger", type: "button", "data-bs-dismiss": "modal" }, "Fechar"));
      carregarProdutos();
    } catch (e) {
      setMsg($("cpMsg"), e.status === 404
        ? "A confirmação de teste está desativada. O pagamento será confirmado automaticamente quando o provedor estiver integrado."
        : e.message);
      $("cpSimular").disabled = false;
    }
  }

  function ligarCards() {
    const mapa = new Map(produtos.map((p) => [norm(p.nome), p]));
    document.querySelectorAll("#productsTrack .product-slide").forEach((card) => {
      const btn = card.querySelector("button");
      if (!btn) return;
      if (!btn.dataset.original) btn.dataset.original = btn.textContent.trim();
      const p = mapa.get(norm(card.querySelector("h5")?.textContent));
      btn.disabled = false;
      btn.textContent = btn.dataset.original;
      if (!p) { btn.disabled = true; btn.textContent = "Indisponível"; btn.onclick = null; return; }
      const por = card.querySelector(".preco-por");
      if (por && p.preco_centavos > 0) por.textContent = "Por " + brl(p.preco_centavos);
      if (p.estoque <= 0) { btn.disabled = true; btn.textContent = "Esgotado"; btn.onclick = null; return; }
      if (p.preco_centavos <= 0) { btn.disabled = true; btn.textContent = "Em breve"; btn.onclick = null; return; }
      btn.onclick = () => abrirCompra(p); // onclick (e não addEventListener) evita duplicar ao recarregar
    });
  }

  async function carregarProdutos() {
    try { produtos = await api("/produtos"); } catch { produtos = []; }
    ligarCards();
  }

  /* =====================================================
     2) PAINEL DO GERENTE
  ===================================================== */
  const TELAS = ["inicio", "documento", "pedidos", "avisos", "sobre", "formatura", "ajuda", "perfil", "configuracoes"];
  const CATEGORIAS = ["uniformes", "esportes", "jogos", "epi", "acessorios"];
  let secGerente, modalProd, editandoId = null;

  function tabela(cabecalho, corpo) {
    return h("div", { class: "table-responsive" },
      h("table", { class: "table table-dark table-hover align-middle mb-0" },
        h("thead", {}, h("tr", {}, cabecalho.map((c) => h("th", {}, c)))),
        corpo));
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
    modalProd = new bootstrap.Modal($("modalProdAdmin"));

    $("tabGProd").onclick = () => aba("prod");
    $("tabGPed").onclick = () => aba("ped");
    $("gBusca").addEventListener("input", renderProdutosAdmin);
    $("gNovo").onclick = () => abrirProduto(null);
    $("mpSalvar").onclick = salvarProduto;
    $("gFiltroPed").onchange = carregarPedidosAdmin;
    $("gAtualizar").onclick = () => { carregarProdutosAdmin(); carregarPedidosAdmin(); };
  }

  function aba(qual) {
    $("tabGProd").classList.toggle("active", qual === "prod");
    $("tabGPed").classList.toggle("active", qual === "ped");
    $("gProdutos").hidden = qual !== "prod";
    $("gPedidos").hidden = qual !== "ped";
    if (qual === "ped") carregarPedidosAdmin();
  }

  // ----- produtos (gerente) -----
  let listaProdAdmin = [];
  async function carregarProdutosAdmin() {
    try { listaProdAdmin = await api("/admin/produtos"); renderProdutosAdmin(); }
    catch (e) { setMsg($("gMsg"), e.message); }
  }
  function renderProdutosAdmin() {
    const q = norm($("gBusca").value);
    const rows = listaProdAdmin.filter((p) => !q || norm(p.nome + p.categoria).includes(q));
    const corpo = h("tbody", {}, rows.length ? rows.map((p) =>
      h("tr", {},
        h("td", {}, p.nome),
        h("td", {}, p.categoria),
        h("td", {}, brl(p.preco_centavos)),
        h("td", {}, p.estoque <= 0 ? badge("Esgotado", "danger") : String(p.estoque)),
        h("td", {}, p.ativo ? badge("Ativo", "success") : badge("Inativo", "secondary")),
        h("td", { class: "text-end" }, h("button", { class: "btn btn-sm btn-outline-light", type: "button", onclick: () => abrirProduto(p) }, "Editar"))))
      : h("tr", {}, h("td", { colspan: 6, class: "text-center text-secondary" }, "Nenhum produto encontrado.")));
    $("gProdTabela").replaceChildren(tabela(["Produto", "Categoria", "Preço", "Estoque", "Status", ""], corpo));
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
    modalProd.show();
  }
  async function salvarProduto() {
    const preco = Math.round(parseFloat(String($("mpPreco").value).replace(",", ".")) * 100);
    const estoque = parseInt($("mpEstoque").value, 10);
    const nome = $("mpNome").value.trim();
    if (!nome || !Number.isSafeInteger(preco) || preco < 0 || !Number.isSafeInteger(estoque) || estoque < 0)
      return setMsg($("mpMsg"), "Informe nome, preço e estoque válidos.");
    const body = { nome, categoria: $("mpCat").value, descricao: $("mpDesc").value, imagem: $("mpImg").value, preco_centavos: preco, estoque };
    try {
      if (editandoId) await api(`/produtos/${editandoId}`, { method: "PATCH", body: JSON.stringify({ ...body, ativo: $("mpAtivo").checked ? 1 : 0 }) });
      else await api("/produtos", { method: "POST", body: JSON.stringify(body) });
      modalProd.hide();
      await carregarProdutosAdmin();
      carregarProdutos(); // atualiza a vitrine
    } catch (e) { setMsg($("mpMsg"), e.message); }
  }

  // ----- pedidos (gerente) -----
  async function carregarPedidosAdmin() {
    try {
      const s = $("gFiltroPed").value;
      const lista = await api("/admin/pedidos" + (s ? `?status=${encodeURIComponent(s)}` : ""));
      renderPedidosAdmin(lista);
    } catch (e) { setMsg($("gMsg"), e.message); }
  }
  async function mudarStatus(id, status) {
    if (status === "rejeitado" && !confirm(`Rejeitar o pedido #${id}? O estoque será devolvido.`)) return;
    try {
      await api(`/pedidos/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMsg($("gMsg"), `Pedido #${id}: ${STATUS[status].toLowerCase()}.`, "success");
      carregarPedidosAdmin();
      carregarProdutosAdmin();
    } catch (e) { setMsg($("gMsg"), e.message); }
  }
  async function alternarItens(tr, id) {
    const proximo = tr.nextElementSibling;
    if (proximo && proximo.dataset.itensDe === String(id)) return proximo.remove();
    try {
      const ped = await api(`/pedidos/${id}`);
      const lista = h("ul", { class: "mb-0 small" }, ped.itens.map((i) =>
        h("li", {}, `${i.quantidade}× ${i.nome} — ${brl(i.preco_unitario_centavos)} cada`)));
      if (ped.observacao) lista.append(h("li", { class: "text-secondary" }, "Obs.: " + ped.observacao));
      tr.after(h("tr", { "data-itens-de": id }, h("td", { colspan: 7, class: "bg-black" }, lista)));
    } catch (e) { setMsg($("gMsg"), e.message); }
  }
  function renderPedidosAdmin(lista) {
    const corpo = h("tbody", {}, lista.length ? lista.map((p) => {
      const tr = h("tr", {},
        h("td", {}, "#" + p.id),
        h("td", {}, h("div", {}, p.cliente), h("div", { class: "small text-secondary" }, p.cliente_email)),
        h("td", {}, dataBR(p.criado_em)),
        h("td", {}, brl(p.total_centavos)),
        h("td", {}, p.pagamento_status ? badge(PAG[p.pagamento_status], COR[p.pagamento_status]) : badge("Sem pagamento", "secondary")),
        h("td", {}, badge(STATUS[p.status] || p.status, COR[p.status])),
        h("td", { class: "text-end text-nowrap" },
          h("button", { class: "btn btn-sm btn-outline-secondary me-1", type: "button", onclick: () => alternarItens(tr, p.id) }, "Itens"),
          p.status === "pendente" && [
            h("button", { class: "btn btn-sm btn-success me-1", type: "button", disabled: p.pagamento_status !== "pago", title: p.pagamento_status !== "pago" ? "Aguardando pagamento" : "", onclick: () => mudarStatus(p.id, "aprovado") }, "Aprovar"),
            h("button", { class: "btn btn-sm btn-outline-danger", type: "button", onclick: () => mudarStatus(p.id, "rejeitado") }, "Rejeitar"),
          ],
          p.status === "aprovado" && h("button", { class: "btn btn-sm btn-info", type: "button", onclick: () => mudarStatus(p.id, "entregue") }, "Marcar entregue")));
      return tr;
    }) : h("tr", {}, h("td", { colspan: 7, class: "text-center text-secondary" }, "Nenhum pedido encontrado.")));
    $("gPedTabela").replaceChildren(tabela(["Pedido", "Cliente", "Data", "Total", "Pagamento", "Status", ""], corpo));
  }

  // ----- navegação do painel (script.js só conhece as telas fixas) -----
  function sincronizarGerente() {
    if (!secGerente) return;
    if (location.hash === "#gerente") {
      TELAS.forEach((id) => document.getElementById(id)?.classList.add("d-none"));
      secGerente.classList.remove("d-none");
      document.querySelectorAll(".menu-item").forEach((i) => i.classList.toggle("ativo", i.getAttribute("href") === "#gerente"));
      carregarProdutosAdmin();
    } else {
      secGerente.classList.add("d-none");
    }
  }

  function ativarModoGerente() {
    montarPainel();
    const link = h("a", { href: "#gerente", class: "menu-item d-flex align-items-start gap-3 text-decoration-none text-white p-2 rounded" },
      h("i", { class: "bi bi-shop fs-3 flex-shrink-0" }),
      h("div", { class: "d-flex flex-column" },
        h("span", { class: "fw-bold fs-6" }, "Gerência"),
        h("span", { class: "text-white-50 small" }, "Produtos e pedidos")));
    const alvo = document.querySelector('a.menu-item[href="#usuario"]');
    alvo ? alvo.before(link) : document.querySelector("#sidebar nav")?.append(link);
    window.addEventListener("hashchange", sincronizarGerente);
    sincronizarGerente();
  }

  /* =====================================================
     INICIALIZAÇÃO
  =========== */
  async function iniciar() {
    resetAtual();
    let user = null;
    try { user = await api("/perfil"); } catch { return; }

    const nome = document.querySelector("#userDropdown .fw-semibold");
    const sub = document.querySelector("#userDropdown small");
    if (nome) nome.textContent = user.nome;
    if (sub) sub.textContent = user.papel === "admin" ? "Gerente" : "Aluno SENAI";

    if (document.getElementById("productsTrack")) {
      montarModalCompra();
      carregarProdutos();
    }
    if (user.papel === "admin") ativarModoGerente();
    else document.querySelector('a.menu-item[href="#usuario"]')?.remove(); // item só para gerente
  }
  document.addEventListener("DOMContentLoaded", iniciar);
})();