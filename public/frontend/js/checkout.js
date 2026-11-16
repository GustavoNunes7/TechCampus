/* =====================================================
   TECHCAMPUS - CHECKOUT DO ALUNO
   PIX      : simular pagamento (modo teste) -> token
   Dinheiro : informar valor -> troco -> aguardar o administrador -> token
   Débito   : aguardar o administrador -> token
   Crédito  : escolher parcelas -> aguardar o administrador -> token
   Carregar no sistema.html ANTES do loja.js.
   Uso: window.TCCheckout.abrir(produto, { aoAtualizar })
===================================================== */
(() => {
  "use strict";

  const tokenAuth = sessionStorage.getItem("techcampus_token");
  if (!tokenAuth) return;

  const $ = (id) => document.getElementById(id);
  const brl = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  // "49,98" -> 4998 | "50.5" -> 5050 | "1.234,50" -> 123450 | "1.234" -> 123400 | "abc" -> NaN
  const reaisParaCentavos = (txt) => {
    let v = String(txt).trim().replace(/\s|R\$/g, "");
    if (!v) return NaN;
    if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, ""); // ponto de milhar
    if (!/^\d+(\.\d{1,2})?$/.test(v)) return NaN;
    return Math.round(parseFloat(v) * 100);
  };

  async function api(path, opts = {}) {
    const res = await fetch("/api" + path, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAuth}` },
    });
    let data = null;
    try { data = await res.json(); } catch { /* sem corpo */ }
    if (!res.ok) {
      if (res.status === 401) { sessionStorage.clear(); location.replace("/frontend/login.html"); }
      const e = new Error((data && data.erro) || `Erro ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return data;
  }

  // mesma divisão do servidor: a 1ª parcela absorve o resto dos centavos
  const valoresParcelas = (total, n) => {
    const base = Math.floor(total / n);
    const resto = total - base * n;
    return Array.from({ length: n }, (_, i) => base + (i === 0 ? resto : 0));
  };
  const descreverParcelas = (total, n) => {
    const v = valoresParcelas(total, n);
    if (n === 1) return `1x de ${brl(v[0])} (à vista)`;
    return v[0] === v[1]
      ? `${n}x de ${brl(v[0])} sem juros`
      : `1ª de ${brl(v[0])} + ${n - 1}x de ${brl(v[1])} sem juros`;
  };

  let modal, cfg = null, st = null, poll = null, aoAtualizar = null;
  const novoEstado = (produto) => ({
    produto, pedido: null, pagamento: null, confirmado: false,
    chave: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random(),
  });

  // ---------- estrutura ----------
  function montar() {
    const w = document.createElement("div");
    w.innerHTML = `
    <div class="modal fade" id="modalCheckout" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-white border-secondary">
          <div class="modal-header border-secondary">
            <h5 class="modal-title" id="ckTitulo">Finalizar compra</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">

            <!-- PASSO 1: escolher a forma de pagamento -->
            <div id="ckP1">
              <div class="d-flex gap-3 align-items-center mb-3">
                <img id="ckImg" alt="" style="height:64px;width:64px;object-fit:contain">
                <div><div class="fw-bold" id="ckNome"></div><div class="text-white-50 small" id="ckUnit"></div></div>
              </div>
              <label class="form-label small" for="ckQtd">Quantidade</label>
              <input id="ckQtd" type="number" min="1" value="1" class="form-control bg-dark text-white border-secondary mb-1">
              <div class="small text-white-50 mb-3" id="ckQtdNota" hidden>A quantidade não pode mudar depois que o pedido é criado.</div>

              <div class="small mb-1">Forma de pagamento</div>
              <div class="row g-2 mb-3" id="ckFormas">
                <div class="col-6"><input type="radio" class="btn-check" name="ckForma" id="ckFPix" value="pix" checked>
                  <label class="btn btn-outline-secondary w-100" for="ckFPix"><i class="bi bi-qr-code me-1"></i>PIX</label></div>
                <div class="col-6"><input type="radio" class="btn-check" name="ckForma" id="ckFDin" value="dinheiro">
                  <label class="btn btn-outline-secondary w-100" for="ckFDin"><i class="bi bi-cash-coin me-1"></i>Dinheiro</label></div>
                <div class="col-6"><input type="radio" class="btn-check" name="ckForma" id="ckFDeb" value="debito">
                  <label class="btn btn-outline-secondary w-100" for="ckFDeb"><i class="bi bi-credit-card me-1"></i>Débito</label></div>
                <div class="col-6"><input type="radio" class="btn-check" name="ckForma" id="ckFCre" value="credito">
                  <label class="btn btn-outline-secondary w-100" for="ckFCre"><i class="bi bi-credit-card-2-front me-1"></i>Crédito</label></div>
              </div>

              <div id="ckDetPix" class="small text-white-50">Você receberá um código PIX (copia e cola). Depois de pagar, seu token de retirada é liberado.</div>
              <div id="ckDetDin" hidden>
                <label class="form-label small" for="ckEntregue">Quanto você vai entregar? (R$)</label>
                <input id="ckEntregue" inputmode="decimal" placeholder="0,00" class="form-control bg-dark text-white border-secondary mb-2">
                <div class="d-flex justify-content-between small"><span>Troco a receber</span><strong id="ckTroco">—</strong></div>
                <div class="small text-white-50 mt-2">Entregue o dinheiro ao atendente da AAPM. Seu token é liberado quando o administrador confirmar o recebimento.</div>
              </div>
              <div id="ckDetDeb" hidden class="small text-white-50">Pague no cartão de débito com o atendente da AAPM. Seu token é liberado quando o administrador confirmar o pagamento.</div>
              <div id="ckDetCre" hidden>
                <label class="form-label small" for="ckParcelas">Parcelas</label>
                <select id="ckParcelas" class="form-select bg-dark text-white border-secondary mb-2"></select>
                <div class="small text-white-50">Seu token é liberado quando o administrador confirmar o pagamento no cartão de crédito.</div>
              </div>

              <div class="d-flex justify-content-between fs-5 mt-3"><span>Total</span><strong id="ckTotal"></strong></div>
            </div>

            <!-- PASSO 2: pagamento criado -->
            <div id="ckP2" hidden>
              <p class="fw-semibold mb-1" id="ckInfo"></p>
              <div id="ckBlocoPix" hidden>
                <label class="small text-white-50" for="ckCodigo">Código PIX (copia e cola)</label>
                <div class="input-group mb-2">
                  <input id="ckCodigo" readonly class="form-control bg-dark text-white border-secondary">
                  <button class="btn btn-outline-secondary" type="button" id="ckCopiarPix">Copiar</button>
                </div>
              </div>
              <div id="ckBlocoEspera" hidden class="d-flex align-items-start gap-3 p-3 rounded border border-secondary">
                <div class="spinner-border spinner-border-sm mt-1" role="status" aria-hidden="true"></div>
                <div>
                  <div class="fw-semibold">Aguardando confirmação do administrador</div>
                  <div class="small text-white-50" id="ckEsperaDet"></div>
                </div>
              </div>
              <div class="small text-white-50 mt-2" id="ckNota"></div>
            </div>

            <!-- PASSO 3: token liberado -->
            <div id="ckP3" hidden class="text-center py-2">
              <i class="bi bi-check-circle-fill text-success display-5"></i>
              <p class="mt-2 mb-1" id="ckOk"></p>
              <div class="small text-white-50">Seu token de retirada</div>
              <div class="display-5 fw-bold text-success" id="ckToken" style="letter-spacing:.2em"></div>
              <div class="small text-white-50 mt-1" id="ckExpira"></div>
              <button class="btn btn-outline-secondary btn-sm mt-3" type="button" id="ckCopiarToken">Copiar token</button>
            </div>

            <div id="ckMsg" role="alert" class="small mt-3"></div>
          </div>
          <div class="modal-footer border-secondary" id="ckRodape"></div>
        </div>
      </div>
    </div>`;
    document.body.append(w.firstElementChild);
    modal = new bootstrap.Modal($("modalCheckout"));

    $("modalCheckout").addEventListener("hidden.bs.modal", aoFechar);
    $("ckQtd").addEventListener("input", atualizarValores);
    $("ckEntregue").addEventListener("input", atualizarValores);
    $("ckParcelas").addEventListener("change", atualizarValores);
    document.querySelectorAll('input[name="ckForma"]').forEach((i) => i.addEventListener("change", atualizarValores));
    $("ckCopiarPix").addEventListener("click", () => copiar($("ckCodigo").value, $("ckCopiarPix")));
    $("ckCopiarToken").addEventListener("click", () => copiar($("ckToken").textContent, $("ckCopiarToken")));
  }

  async function copiar(txt, botao) {
    try {
      await navigator.clipboard.writeText(txt);
      const original = botao.textContent;
      botao.textContent = "Copiado!";
      setTimeout(() => (botao.textContent = original), 1500);
    } catch { /* sem permissão da área de transferência */ }
  }

  const msg = (txt, tipo = "danger") => {
    $("ckMsg").className = `small mt-3 text-${tipo}`;
    $("ckMsg").textContent = txt || "";
  };
  const passo = (n) => [1, 2, 3].forEach((i) => ($("ckP" + i).hidden = i !== n));
  const rodape = (...btns) => $("ckRodape").replaceChildren(...btns);
  const botao = (txt, classe, onclick, extra = {}) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = `btn ${classe}`; b.textContent = txt;
    Object.entries(extra).forEach(([k, v]) => b.setAttribute(k, v));
    if (onclick) b.addEventListener("click", onclick);
    return b;
  };

  // ---------- passo 1 ----------
  const qtd = () => {
    const max = Math.min(100, st.produto.estoque);
    const q = parseInt($("ckQtd").value, 10);
    return Number.isInteger(q) ? Math.max(1, Math.min(q, max)) : 1;
  };
  const total = () =>
    st.pedido ? st.pagamento?.valor_centavos ?? st.produto.preco_centavos * qtd()
              : st.produto.preco_centavos * qtd();
  const forma = () => document.querySelector('input[name="ckForma"]:checked').value;

  function montarParcelas() {
    const t = total();
    const sel = $("ckParcelas");
    const anterior = sel.value;
    sel.replaceChildren();
    for (let n = 1; n <= cfg.parcelas_max; n++) {
      if (n > 1 && Math.floor(t / n) < cfg.parcela_minima_centavos) break;
      const o = document.createElement("option");
      o.value = String(n);
      o.textContent = descreverParcelas(t, n);
      sel.append(o);
    }
    if ([...sel.options].some((o) => o.value === anterior)) sel.value = anterior;
  }

  // devolve { ok, entregue, troco } da forma atual (ok=false enquanto faltar dado)
  function dinheiro() {
    const entregue = reaisParaCentavos($("ckEntregue").value);
    const t = total();
    if (!Number.isFinite(entregue)) return { ok: false, msg: "" };
    if (entregue < t) return { ok: false, msg: `Faltam ${brl(t - entregue)} para cobrir o total.` };
    const troco = entregue - t;
    if (troco > cfg.troco_max_centavos)
      return { ok: false, msg: `Troco máximo de ${brl(cfg.troco_max_centavos)}. Entregue um valor mais próximo do total.` };
    return { ok: true, entregue, troco };
  }

  function atualizarValores() {
    const f = forma();
    $("ckDetPix").hidden = f !== "pix";
    $("ckDetDin").hidden = f !== "dinheiro";
    $("ckDetDeb").hidden = f !== "debito";
    $("ckDetCre").hidden = f !== "credito";
    $("ckTotal").textContent = brl(total());
    if (f === "credito") montarParcelas();
    if (f === "dinheiro") {
      const d = dinheiro();
      $("ckTroco").textContent = d.ok ? brl(d.troco) : "—";
      msg(d.ok ? "" : d.msg, "warning");
    } else msg("");
  }

  function abrir(produto, opcoes = {}) {
    aoAtualizar = opcoes.aoAtualizar || null;
    if (!modal) montar();
    st = novoEstado(produto);
    (cfg ? Promise.resolve() : api("/pagamentos/config").then((c) => { cfg = c; }))
      .then(() => {
        $("ckTitulo").textContent = "Finalizar compra";
        $("ckImg").src = produto.imagem || "";
        $("ckNome").textContent = produto.nome;
        $("ckUnit").textContent = `${brl(produto.preco_centavos)} cada • ${produto.estoque} em estoque`;
        $("ckQtd").max = Math.min(100, produto.estoque);
        $("ckQtd").value = 1;
        $("ckQtd").disabled = false;
        $("ckQtdNota").hidden = true;
        $("ckFPix").checked = true;
        $("ckEntregue").value = "";
        passo(1);
        atualizarValores();
        rodapePasso1();
        modal.show();
      })
      .catch((e) => alert(e.message || "Não foi possível abrir o checkout."));
  }

  function rodapePasso1() {
    rodape(
      botao("Cancelar", "btn-outline-secondary", null, { "data-bs-dismiss": "modal" }),
      botao("Continuar", "btn-danger", continuar, { id: "ckContinuar" }),
    );
  }

  async function continuar() {
    const btn = $("ckContinuar");
    const f = forma();
    const corpo = {};
    if (f === "pix") corpo.metodo = "pix";
    else if (f === "dinheiro") {
      const d = dinheiro();
      if (!d.ok) return msg(d.msg || "Informe o valor que você vai entregar.", "danger");
      Object.assign(corpo, { metodo: "dinheiro", valor_entregue_centavos: d.entregue });
    } else if (f === "debito") Object.assign(corpo, { metodo: "cartao", tipo_cartao: "debito" });
    else Object.assign(corpo, { metodo: "cartao", tipo_cartao: "credito", parcelas: parseInt($("ckParcelas").value, 10) });

    btn.disabled = true;       // evita clique duplo
    msg("");
    try {
      if (!st.pedido)
        st.pedido = await api("/pedidos", {
          method: "POST",
          body: JSON.stringify({
            itens: [{ produto_id: st.produto.id, quantidade: qtd() }],
            chave_idempotencia: st.chave, // se a API aceitar, evita pedido duplicado
          }),
        });
      st.pagamento = await api(`/pedidos/${st.pedido.id}/pagamento`, { method: "POST", body: JSON.stringify(corpo) });
      passo2();
    } catch (e) {
      msg(e.message);
      btn.disabled = false;
    }
  }

  // ---------- passo 2 ----------
  function nomeForma(p) {
    if (p.metodo === "pix") return "PIX";
    if (p.metodo === "dinheiro") return "Dinheiro";
    return p.tipo_cartao === "credito" ? `Cartão de crédito (${p.parcelas}x)` : "Cartão de débito";
  }

  function passo2() {
    const p = st.pagamento;
    passo(2);
    $("ckTitulo").textContent = `Pedido #${st.pedido.id}`;
    $("ckInfo").textContent = `${nomeForma(p)} • Total ${brl(p.valor_centavos)}`;
    $("ckBlocoPix").hidden = p.metodo !== "pix";
    $("ckBlocoEspera").hidden = p.metodo === "pix";
    $("ckCodigo").value = p.codigo || "";

    if (p.metodo === "pix") {
      $("ckNota").textContent = cfg.simulado
        ? "Modo de teste: use o botão abaixo para simular o pagamento."
        : "Pague o PIX com o código acima. Seu token é liberado quando o pagamento for confirmado.";
    } else {
      let det = "";
      if (p.metodo === "dinheiro")
        det = `Valor entregue ${brl(p.valor_entregue_centavos)} • Troco ${brl(p.troco_centavos)}. `;
      else if (p.tipo_cartao === "credito" && p.parcelas_valores)
        det = `${descreverParcelas(p.valor_centavos, p.parcelas)}. `;
      $("ckEsperaDet").textContent = det + "Dirija-se ao atendente da AAPM.";
      $("ckNota").textContent = "Você pode fechar esta janela: o token também aparece na tela “Meus tokens” quando for liberado.";
      iniciarPolling();
    }

    const bts = [
      botao("Cancelar pedido", "btn-outline-danger", cancelarPedido),
      botao("Alterar forma de pagamento", "btn-outline-secondary", voltarPasso1),
    ];
    if (p.metodo === "pix" && cfg.simulado) bts.push(botao("Simular pagamento (teste)", "btn-danger", simular, { id: "ckSimular" }));
    rodape(...bts);
  }

  function voltarPasso1() {
    pararPolling();
    passo(1);
    $("ckTitulo").textContent = "Finalizar compra";
    $("ckQtd").disabled = true;
    $("ckQtdNota").hidden = false;
    atualizarValores();
    rodapePasso1();
  }

  async function simular() {
    $("ckSimular").disabled = true;
    try {
      st.pagamento = await api(`/pagamentos/${st.pagamento.id}/confirmar-simulado`, { method: "POST" });
      await liberado();
    } catch (e) {
      msg(e.message);
      $("ckSimular").disabled = false;
    }
  }

  async function cancelarPedido() {
    pararPolling();
    try {
      await api(`/pedidos/${st.pedido.id}/cancelar`, { method: "POST" });
      st.pedido = null; // já cancelado: não cancelar de novo ao fechar
      modal.hide();
      aoAtualizar?.();
    } catch (e) { msg(e.message); iniciarPolling(); }
  }

  // ---------- espera pela confirmação do administrador ----------
  function iniciarPolling() {
    pararPolling();
    poll = setInterval(async () => {
      try {
        const p = await api(`/pedidos/${st.pedido.id}/pagamento`);
        if (p.status === "confirmado") { st.pagamento = p; await liberado(); }
        else if (p.status === "cancelado") {
          pararPolling();
          $("ckBlocoEspera").hidden = true;
          msg("O pagamento não foi confirmado e o pedido foi encerrado. Veja o motivo nas notificações.", "danger");
          rodape(botao("Fechar", "btn-danger", null, { "data-bs-dismiss": "modal" }));
          st.pedido = null;
          aoAtualizar?.();
        }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 5000);
  }
  function pararPolling() { if (poll) { clearInterval(poll); poll = null; } }

  // ---------- passo 3: token ----------
  async function liberado() {
    pararPolling();
    st.confirmado = true;
    passo(3);
    $("ckTitulo").textContent = `Pedido #${st.pedido.id}`;
    $("ckOk").textContent = "Pagamento confirmado!";
    msg("");
    try {
      const t = await api(`/pedidos/${st.pedido.id}/token`);
      $("ckToken").textContent = t.token;
      $("ckExpira").textContent = t.expiraEm
        ? `Válido até ${new Date(t.expiraEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Digite na máquina TechCampus.`
        : "Digite na máquina TechCampus.";
    } catch (e) {
      $("ckToken").textContent = "——";
      $("ckExpira").textContent = "Não foi possível exibir agora. Abra a tela “Meus tokens”.";
    }
    $("ckCopiarToken").hidden = !/^\d{6}$/.test($("ckToken").textContent);
    rodape(botao("Fechar", "btn-danger", null, { "data-bs-dismiss": "modal" }));
    aoAtualizar?.();
  }

  // ---------- ao fechar a janela ----------
  async function aoFechar() {
    pararPolling();
    // PIX não pago: devolve o estoque. Dinheiro/cartão ficam aguardando o administrador.
    if (st && st.pedido && !st.confirmado && st.pagamento && st.pagamento.metodo === "pix") {
      try { await api(`/pedidos/${st.pedido.id}/cancelar`, { method: "POST" }); } catch { /* já tratado no servidor */ }
      aoAtualizar?.();
    } else if (st && st.pedido && !st.pagamento) {
      // pedido criado mas sem forma de pagamento (falha no meio): não deixa estoque preso
      try { await api(`/pedidos/${st.pedido.id}/cancelar`, { method: "POST" }); } catch { /* idem */ }
      aoAtualizar?.();
    }
    st = null;
  }

  window.TCCheckout = { abrir };
})();