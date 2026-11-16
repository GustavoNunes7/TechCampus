/* ===================================================== TECHCAMPUS - PAINEL DO ADMIN: PAGAMENTOS + FINANCEIRO
   Acrescenta duas abas ao painel "Gerência" criado pelo loja.js:
   - Pagamentos: fila para confirmar/recusar dinheiro, cartão e PIX
                 (ao confirmar, o servidor gera o token de retirada)
   - Financeiro: receitas (pagamentos confirmados) x despesas  ===================================================== */
(() => {
  "use strict";

  const tokenAuth = sessionStorage.getItem("techcampus_token");
  if (!tokenAuth) return;

  const $ = (id) => document.getElementById(id);
  const brl = (c) => ((c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBR = (s) => {
    const d = new Date(String(s).replace(" ", "T") + (String(s).includes("Z") ? "" : "Z"));
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR");
  };
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
  const badge = (txt, cor) => h("span", { class: `badge text-bg-${cor}` }, txt);

  async function api(path, opts = {}) {
    const res = await fetch("/api" + path, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAuth}` },
    });
    let data = null;
    try { data = await res.json(); } catch { /* sem corpo */ }
    if (!res.ok) throw new Error((data && data.erro) || `Erro ${res.status}`);
    return data;
  }

  const FORMA = (p) =>
    p.metodo === "pix" ? "PIX"
    : p.metodo === "dinheiro" ? "Dinheiro"
    : p.tipo_cartao === "credito" ? `Crédito ${p.parcelas}x` : "Débito";
  const ROTULO_FORMA = { pix: "PIX", dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito" };
  const COR_ST = { pendente: "warning", confirmado: "success", cancelado: "secondary" };
  const TXT_ST = { pendente: "Aguardando", confirmado: "Confirmado", cancelado: "Cancelado" };

  function detalhe(p) {
    if (p.metodo === "dinheiro")
      return `Entregue ${brl(p.valor_entregue_centavos)} • Troco ${brl(p.troco_centavos)}`;
    if (p.tipo_cartao === "credito" && p.parcelas_valores)
      return p.parcelas > 1 ? `${p.parcelas}x (1ª ${brl(p.parcelas_valores[0])}, demais ${brl(p.parcelas_valores[1])})` : "À vista";
    if (p.metodo === "pix") return p.codigo ? "Cód. " + p.codigo.slice(0, 8) + "…" : "";
    return "";
  }

  let abas = null;        // { pag, fin }
  let timer = null;

  // ---------- montagem ----------
  function montar() {
    const sec = $("gerente");
    if (!sec || $("tabGPag")) return;
    const nav = sec.querySelector(".nav-pills");
    const anchor = $("gUsuarios") || sec.querySelector("#gMsg");
    if (!nav || !anchor) return;

    const liPag = h("li", { class: "nav-item" },
      h("button", { type: "button", class: "nav-link", id: "tabGPag" }, "Pagamentos ", h("span", { id: "gPagBadge", class: "badge text-bg-danger ms-1", hidden: true })));
    const liFin = h("li", { class: "nav-item" }, h("button", { type: "button", class: "nav-link", id: "tabGFin" }, "Financeiro"));
    nav.append(liPag, liFin);

    const hoje = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const ini = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    const fim = iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));

    const paneStyle = "form-control bg-dark text-white border-secondary";
    const panePag = h("div", { id: "gPagamentos", hidden: true },
      h("div", { class: "d-flex flex-wrap gap-2 mb-3" },
        h("select", { id: "gPagFiltro", class: "form-select bg-dark text-white border-secondary", style: "max-width:220px", onchange: carregarPagamentos },
          h("option", { value: "pendente" }, "Aguardando confirmação"),
          h("option", { value: "confirmado" }, "Confirmados"),
          h("option", { value: "cancelado" }, "Cancelados"),
          h("option", { value: "" }, "Todos")),
        h("button", { type: "button", class: "btn btn-outline-secondary", onclick: carregarPagamentos }, h("i", { class: "bi bi-arrow-clockwise me-1" }), "Atualizar")),
      h("div", { id: "gPagTabela" }));

    const paneFin = h("div", { id: "gFinanceiro", hidden: true },
      h("div", { class: "d-flex flex-wrap align-items-end gap-2 mb-3" },
        h("div", {}, h("label", { class: "form-label small mb-1", for: "gFinDe" }, "De"), h("input", { id: "gFinDe", type: "date", class: paneStyle, value: ini })),
        h("div", {}, h("label", { class: "form-label small mb-1", for: "gFinAte" }, "Até"), h("input", { id: "gFinAte", type: "date", class: paneStyle, value: fim })),
        h("button", { type: "button", class: "btn btn-danger", onclick: carregarFinanceiro }, "Aplicar")),
      h("div", { id: "gFinCards", class: "row g-3 mb-3" }),
      h("div", { id: "gFinForma", class: "mb-3" }),
      h("div", { id: "gFinTabela" }),
      h("p", { class: "small text-secondary mt-2 mb-0" },
        "Receitas = pagamentos confirmados de pedidos não cancelados (o troco não conta). Despesas vêm do cadastro de despesas do Controle Financeiro."));

    anchor.after(panePag, paneFin);
    abas = { pag: panePag, fin: paneFin };

    $("tabGPag").addEventListener("click", () => abrirAba("pag"));
    $("tabGFin").addEventListener("click", () => abrirAba("fin"));
    // quando o loja.js troca de aba, esconde as minhas
    document.addEventListener("tc-aba-gerente", () => {
      panePag.hidden = true; paneFin.hidden = true;
      $("tabGPag").classList.remove("active"); $("tabGFin").classList.remove("active");
    });

    atualizarBadge();
    timer = setInterval(() => {
      if (document.hidden || $("gerente").classList.contains("d-none")) return;
      atualizarBadge();
      if (!panePag.hidden && $("gPagFiltro").value === "pendente") carregarPagamentos(true);
    }, 20000);
  }

  function abrirAba(qual) {
    ["gProdutos", "gPedidos", "gUsuarios"].forEach((id) => { const e = $(id); if (e) e.hidden = true; });
    ["tabGProd", "tabGPed", "tabGUsr"].forEach((id) => $(id)?.classList.remove("active"));
    abas.pag.hidden = qual !== "pag";
    abas.fin.hidden = qual !== "fin";
    $("tabGPag").classList.toggle("active", qual === "pag");
    $("tabGFin").classList.toggle("active", qual === "fin");
    if (qual === "pag") carregarPagamentos();
    else carregarFinanceiro();
  }

  const aviso = (txt, tipo = "danger") => {
    const el = $("gMsg");
    if (!el) return;
    el.className = `small mt-3 text-${tipo}`;
    el.textContent = txt || "";
  };

  // ---------- pagamentos ----------
  async function atualizarBadge() {
    try {
      const l = await api("/admin/pagamentos?status=pendente");
      const b = $("gPagBadge");
      b.textContent = String(l.length);
      b.hidden = l.length === 0;
    } catch { /* ignora */ }
  }

  async function carregarPagamentos(silencioso) {
    try {
      const lista = await api("/admin/pagamentos?status=" + encodeURIComponent($("gPagFiltro").value));
      renderPagamentos(lista);
      if (silencioso !== true) aviso("");
      if ($("gPagFiltro").value === "pendente") {
        const b = $("gPagBadge"); b.textContent = String(lista.length); b.hidden = lista.length === 0;
      }
    } catch (e) { aviso(e.message); }
  }

  function renderPagamentos(lista) {
    const corpo = h("tbody", {}, lista.length ? lista.map((p) => {
      const pend = p.status === "pendente" && p.pedido_status === "pendente";
      return h("tr", {},
        h("td", {}, "#" + p.pedido_id),
        h("td", {}, h("div", {}, p.aluno), h("div", { class: "small text-secondary" }, p.aluno_email)),
        h("td", { class: "small" }, p.itens || ""),
        h("td", {}, FORMA(p)),
        h("td", { class: "text-nowrap" }, brl(p.valor_centavos)),
        h("td", { class: "small" }, detalhe(p)),
        h("td", { class: "small text-nowrap" }, dataBR(p.criado_em)),
        h("td", {}, badge(TXT_ST[p.status] || p.status, COR_ST[p.status] || "secondary")),
        h("td", { class: "text-end text-nowrap" }, pend && [
          h("button", { type: "button", class: "btn btn-sm btn-success me-1", onclick: (e) => confirmar(p, e.currentTarget) }, "Confirmar"),
          h("button", { type: "button", class: "btn btn-sm btn-outline-danger", onclick: (e) => recusar(p, e.currentTarget) }, "Recusar"),
        ]));
    }) : h("tr", {}, h("td", { colspan: 9, class: "text-center text-secondary" }, "Nenhum pagamento nesta situação.")));

    $("gPagTabela").replaceChildren(
      h("div", { class: "table-responsive" },
        h("table", { class: "table table-hover align-middle mb-0" },
          h("thead", {}, h("tr", {}, ["Pedido", "Aluno", "Itens", "Forma", "Valor", "Detalhe", "Data", "Situação", ""].map((c) => h("th", {}, c)))),
          corpo)));
  }

  async function confirmar(p, btn) {
    const resumo = p.metodo === "dinheiro"
      ? `Confirmar o recebimento de ${brl(p.valor_centavos)} em dinheiro?\nO aluno entregou ${brl(p.valor_entregue_centavos)} — devolva ${brl(p.troco_centavos)} de troco.`
      : `Confirmar o pagamento de ${brl(p.valor_centavos)} (${FORMA(p)}) do pedido #${p.pedido_id}?`;
    if (!confirm(resumo + "\n\nAo confirmar, o token de retirada é liberado para o aluno.")) return;
    btn.disabled = true;                      // evita confirmação duplicada por duplo clique
    try {
      await api(`/admin/pagamentos/${p.id}/confirmar`, { method: "POST" });
      aviso(`Pedido #${p.pedido_id}: pagamento confirmado e token liberado.`, "success");
    } catch (e) { aviso(e.message); }
    carregarPagamentos(true);
  }

  async function recusar(p, btn) {
    const motivo = prompt(`Recusar o pagamento do pedido #${p.pedido_id}? O pedido será encerrado e o estoque devolvido.\n\nMotivo (opcional):`, "");
    if (motivo === null) return;
    btn.disabled = true;
    try {
      await api(`/admin/pagamentos/${p.id}/recusar`, { method: "POST", body: JSON.stringify({ motivo }) });
      aviso(`Pedido #${p.pedido_id}: pagamento recusado.`, "success");
    } catch (e) { aviso(e.message); }
    carregarPagamentos(true);
  }

  // ---------- financeiro ----------
  async function carregarFinanceiro() {
    const de = $("gFinDe").value, ate = $("gFinAte").value;
    const q = `?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`;
    try {
      const [resumo, rec] = await Promise.all([api("/admin/financeiro/resumo" + q), api("/admin/financeiro/receitas" + q)]);

      const card = (titulo, valor, cor) =>
        h("div", { class: "col-12 col-md-4" },
          h("div", { class: "p-3 rounded border border-secondary h-100" },
            h("div", { class: "small text-secondary" }, titulo),
            h("div", { class: `fs-4 fw-bold ${cor || ""}` }, brl(valor))));
      $("gFinCards").replaceChildren(
        card("Receitas (pagamentos confirmados)", resumo.receitas_centavos, "text-success"),
        card("Despesas", resumo.despesas_centavos, "text-danger"),
        card("Saldo", resumo.saldo_centavos, resumo.saldo_centavos >= 0 ? "text-success" : "text-danger"));

      $("gFinForma").replaceChildren(
        h("div", { class: "d-flex flex-wrap gap-2" },
          Object.entries(resumo.por_forma_centavos).map(([k, v]) =>
            h("span", { class: "badge text-bg-secondary fs-6 fw-normal" }, `${ROTULO_FORMA[k]}: ${brl(v)}`))));

      const FORMA_LANC = { pix: "PIX", dinheiro: "Dinheiro", cartao_debito: "Débito", cartao_credito: "Crédito" };
      const corpo = h("tbody", {}, rec.lancamentos.length ? rec.lancamentos.map((l) =>
        h("tr", {},
          h("td", { class: "small text-nowrap" }, dataBR(l.data)),
          h("td", {}, "#" + l.pedido_id),
          h("td", {}, l.aluno),
          h("td", {}, FORMA_LANC[l.forma] || l.forma, l.forma === "cartao_credito" && l.parcelas > 1 ? ` ${l.parcelas}x` : ""),
          h("td", { class: "text-nowrap" }, brl(l.valor_centavos)),
          h("td", { class: "small text-secondary" }, l.troco_centavos ? "Troco " + brl(l.troco_centavos) : "")))
        : h("tr", {}, h("td", { colspan: 6, class: "text-center text-secondary" }, "Nenhuma receita no período.")));
      $("gFinTabela").replaceChildren(
        h("div", { class: "table-responsive" },
          h("table", { class: "table table-hover align-middle mb-0" },
            h("thead", {}, h("tr", {}, ["Data", "Pedido", "Aluno", "Forma", "Valor", ""].map((c) => h("th", {}, c)))),
            corpo)));
      aviso("");
    } catch (e) { aviso(e.message); }
  }

  // o painel é criado de forma assíncrona pelo loja.js
  document.addEventListener("tc-painel-gerente-pronto", montar);
  if (document.readyState !== "loading") montar();
  else document.addEventListener("DOMContentLoaded", montar);
})();