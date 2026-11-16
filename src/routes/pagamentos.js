/* =====================================================
   TECHCAMPUS - PAGAMENTOS (fluxos completos)

   PIX      : cria -> aluno simula (modo teste) ------------> confirma -> TOKEN
   Dinheiro : aluno informa valor -> troco calculado -> Admin confirma -> TOKEN
   Débito   : cria -> Admin confirma ------------------------------> TOKEN
   Crédito  : aluno escolhe parcelas -> Admin confirma ------------> TOKEN

   COMO MONTAR (src/routes/index.js):
   coloque esta linha ANTES da primeira rota (logo após os helpers
   wrap/bad/get e ANTES de r.get("/saude")), para que estas rotas
   substituam as antigas de mesmo caminho:

       r.use(require("./pagamentos"));

   Garantias contra duplicidade:
   - pagamentos.pedido_id e tokens_retirada.pedido_id são UNIQUE (banco)
   - confirmação em UMA transação, com UPDATE ... WHERE status='pendente'
   - o token só é criado se o pedido ainda não tiver um
===================================================== */
const express = require("express");
const crypto = require("crypto");
const { db, positiveId, clean } = require("../models");
const autenticar = require("../middlewares/auth");
const { admin } = require("../middlewares/auth");

const r = express.Router();

// ---------- configuração (pode ser ajustada no .env) ----------
const PARCELAS_MAX = Math.max(1, Math.min(12, Number(process.env.PARCELAS_MAX) || 3));
const PARCELA_MINIMA_CENTAVOS = Number(process.env.PARCELA_MINIMA_CENTAVOS) || 500; // R$ 5,00
const TROCO_MAX_CENTAVOS = Number(process.env.TROCO_MAX_CENTAVOS) || 20000;         // R$ 200,00
const TOKEN_VALIDADE_MIN = 15;
const simulado = () => process.env.PAGAMENTO_SIMULADO === "true";

// ---------- esquema (idempotente) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS pagamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
  metodo TEXT NOT NULL CHECK(metodo IN ('pix','cartao','dinheiro')),
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos >= 0),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','confirmado','cancelado')),
  codigo TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo_cartao TEXT, parcelas INTEGER NOT NULL DEFAULT 1,
  valor_entregue_centavos INTEGER, troco_centavos INTEGER
);
CREATE TABLE IF NOT EXISTS tokens_retirada (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expira_em INTEGER,
  usado INTEGER NOT NULL DEFAULT 0 CHECK(usado IN (0,1)),
  usado_em TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
// Auditoria: quando e por quem o pagamento foi confirmado (usado pelo Controle Financeiro)
{
  const cols = db.prepare("PRAGMA table_info(pagamentos)").all().map((c) => c.name);
  if (!cols.includes("confirmado_em")) db.exec("ALTER TABLE pagamentos ADD COLUMN confirmado_em TEXT");
  if (!cols.includes("confirmado_por")) db.exec("ALTER TABLE pagamentos ADD COLUMN confirmado_por INTEGER");
}

// ---------- utilidades ----------
class HttpErro extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const tentar = (fn) => (req, res, next) => {
  try { fn(req, res); }
  catch (e) {
    if (e instanceof HttpErro) return res.status(e.status).json({ erro: e.message });
    next(e);
  }
};
const get = (tabela, id) => db.prepare(`SELECT * FROM ${tabela} WHERE id=?`).get(id);
const brl = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const totalPedido = (pedidoId) =>
  db.prepare("SELECT COALESCE(SUM(quantidade*preco_unitario_centavos),0) AS t FROM itens_pedido WHERE pedido_id=?")
    .get(pedidoId).t;

// Divide em n parcelas sem perder centavos (a 1ª absorve o resto)
function valoresParcelas(total, n) {
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? resto : 0));
}
function parcelasPermitidas(total) {
  const ok = [];
  for (let n = 1; n <= PARCELAS_MAX; n++)
    if (n === 1 || Math.floor(total / n) >= PARCELA_MINIMA_CENTAVOS) ok.push(n);
  return ok;
}
const detalhar = (pg) =>
  pg && { ...pg, parcelas_valores: pg.tipo_cartao === "credito" ? valoresParcelas(pg.valor_centavos, pg.parcelas || 1) : null };

function notificar(usuarioId, titulo, mensagem) {
  db.prepare("INSERT INTO notificacoes(usuario_id,titulo,mensagem) VALUES(?,?,?)").run(usuarioId, titulo, mensagem);
}
function notificarAdmins(titulo, mensagem) {
  for (const a of db.prepare("SELECT id FROM usuarios WHERE papel='admin' AND ativo=1").all())
    notificar(a.id, titulo, mensagem);
}
function gerarToken() {
  let t;
  do { t = String(crypto.randomInt(100000, 1000000)); }
  while (db.prepare("SELECT 1 FROM tokens_retirada WHERE token=?").get(t));
  return t;
}

// Valida a forma de pagamento escolhida e calcula troco/parcelas NO SERVIDOR
function validarForma(body, total) {
  const metodo = body && body.metodo;
  if (metodo === "pix")
    return { metodo, tipo_cartao: null, parcelas: 1, entregue: null, troco: null, precisaAdmin: false };

  if (metodo === "dinheiro") {
    const entregue = body.valor_entregue_centavos;
    if (!Number.isSafeInteger(entregue) || entregue < total)
      throw new HttpErro(400, "O valor entregue deve ser igual ou maior que o total do pedido.");
    const troco = entregue - total;
    if (troco > TROCO_MAX_CENTAVOS)
      throw new HttpErro(400, `Troco máximo permitido: ${brl(TROCO_MAX_CENTAVOS)}. Entregue um valor mais próximo do total.`);
    return { metodo, tipo_cartao: null, parcelas: 1, entregue, troco, precisaAdmin: true };
  }

  if (metodo === "cartao") {
    const tipo = body.tipo_cartao;
    if (tipo !== "debito" && tipo !== "credito")
      throw new HttpErro(400, "Informe se o cartão é de débito ou de crédito.");
    let parcelas = 1;
    if (tipo === "credito") {
      parcelas = body.parcelas === undefined ? 1 : body.parcelas;
      if (!Number.isInteger(parcelas) || !parcelasPermitidas(total).includes(parcelas))
        throw new HttpErro(400, "Número de parcelas inválido para o valor deste pedido.");
    }
    return { metodo, tipo_cartao: tipo, parcelas, entregue: null, troco: null, precisaAdmin: true };
  }
  throw new HttpErro(400, "Forma de pagamento inválida.");
}

const rotulo = (pg) =>
  pg.metodo === "pix" ? "PIX"
  : pg.metodo === "dinheiro" ? "dinheiro"
  : pg.tipo_cartao === "credito" ? `cartão de crédito (${pg.parcelas}x)` : "cartão de débito";

// ---------- núcleo: confirmar pagamento + gerar token (tudo ou nada) ----------
const confirmarTx = db.transaction((pagamentoId, adminId) => {
  const pg = get("pagamentos", pagamentoId);
  if (!pg) throw new HttpErro(404, "Pagamento não encontrado.");
  const pedido = get("pedidos", pg.pedido_id);
  if (!pedido) throw new HttpErro(404, "Pedido não encontrado.");
  if (pedido.status !== "pendente") throw new HttpErro(409, "O pedido não está mais pendente.");

  // Só confirma quem ainda está pendente: impede confirmação dupla
  const upd = db
    .prepare("UPDATE pagamentos SET status='confirmado', confirmado_em=CURRENT_TIMESTAMP, confirmado_por=? WHERE id=? AND status='pendente'")
    .run(adminId ?? null, pg.id);
  if (!upd.changes) throw new HttpErro(409, "Este pagamento já foi processado.");

  // Um único token por pedido
  let tokenCriado = false;
  if (!db.prepare("SELECT 1 FROM tokens_retirada WHERE pedido_id=?").get(pedido.id)) {
    db.prepare("INSERT INTO tokens_retirada(pedido_id,token,expira_em) VALUES(?,?,?)")
      .run(pedido.id, gerarToken(), Date.now() + TOKEN_VALIDADE_MIN * 60 * 1000);
    tokenCriado = true;
  }
  return { pagamento: get("pagamentos", pg.id), pedido, tokenCriado };
});

function aposConfirmar(out) {
  const { pagamento, pedido } = out;
  notificar(pedido.usuario_id, "Pagamento confirmado",
    `O pagamento do pedido #${pedido.id} (${rotulo(pagamento)}) foi confirmado. Seu token de retirada está disponível por ${TOKEN_VALIDADE_MIN} minutos.`);
}

const devolverEstoque = (pedidoId) => {
  for (const i of db.prepare("SELECT * FROM itens_pedido WHERE pedido_id=?").all(pedidoId))
    db.prepare("UPDATE produtos SET estoque=estoque+? WHERE id=?").run(i.quantidade, i.produto_id);
};

// =====================================================
// ALUNO
// =====================================================

// Parâmetros que a tela precisa para montar o checkout
r.get("/pagamentos/config", autenticar, (_req, res) => {
  res.json({
    parcelas_max: PARCELAS_MAX,
    parcela_minima_centavos: PARCELA_MINIMA_CENTAVOS,
    troco_max_centavos: TROCO_MAX_CENTAVOS,
    simulado: simulado(),
    token_validade_min: TOKEN_VALIDADE_MIN,
  });
});

// Cria (ou atualiza, enquanto pendente) o pagamento do pedido
r.post("/pedidos/:id/pagamento", autenticar, tentar((req, res) => {
  const pedido = get("pedidos", positiveId(req.params.id));
  if (!pedido) throw new HttpErro(404, "Pedido não encontrado.");
  if (pedido.usuario_id !== req.usuario.id) throw new HttpErro(403, "Este pedido pertence a outro usuário.");
  if (pedido.status !== "pendente") throw new HttpErro(409, "Este pedido não pode receber pagamento.");

  const total = totalPedido(pedido.id);
  if (total <= 0) throw new HttpErro(400, "Pedido sem valor a pagar. Defina o preço dos produtos.");
  const forma = validarForma(req.body, total);

  const existente = db.prepare("SELECT * FROM pagamentos WHERE pedido_id=?").get(pedido.id);
  if (existente) {
    if (existente.status === "confirmado") throw new HttpErro(409, "Este pedido já foi pago.");
    if (existente.status === "cancelado") throw new HttpErro(409, "O pagamento deste pedido foi cancelado.");
    // pendente: permite trocar a forma de pagamento (continua 1 pagamento por pedido)
    const codigo = forma.metodo === "pix"
      ? (existente.metodo === "pix" && existente.codigo ? existente.codigo : crypto.randomBytes(16).toString("hex"))
      : null;
    db.prepare(`UPDATE pagamentos SET metodo=?, tipo_cartao=?, parcelas=?, valor_entregue_centavos=?,
                troco_centavos=?, codigo=?, valor_centavos=? WHERE id=? AND status='pendente'`)
      .run(forma.metodo, forma.tipo_cartao, forma.parcelas, forma.entregue, forma.troco, codigo, total, existente.id);
    const atualizado = get("pagamentos", existente.id);
    if (forma.precisaAdmin)
      notificarAdmins("Pagamento aguardando confirmação", `Pedido #${pedido.id}: ${rotulo(atualizado)} de ${brl(total)} aguarda confirmação.`);
    return res.json(detalhar(atualizado));
  }

  const codigo = forma.metodo === "pix" ? crypto.randomBytes(16).toString("hex") : null;
  const info = db.prepare(`INSERT INTO pagamentos(pedido_id,metodo,valor_centavos,codigo,tipo_cartao,parcelas,valor_entregue_centavos,troco_centavos)
                           VALUES(?,?,?,?,?,?,?,?)`)
    .run(pedido.id, forma.metodo, total, codigo, forma.tipo_cartao, forma.parcelas, forma.entregue, forma.troco);
  const criado = get("pagamentos", info.lastInsertRowid);
  if (forma.precisaAdmin)
    notificarAdmins("Pagamento aguardando confirmação", `Pedido #${pedido.id}: ${rotulo(criado)} de ${brl(total)} aguarda confirmação.`);
  res.status(201).json(detalhar(criado));
}));

// Situação do pagamento (aluno dono ou admin)
r.get("/pedidos/:id/pagamento", autenticar, tentar((req, res) => {
  const pedido = get("pedidos", positiveId(req.params.id));
  if (!pedido) throw new HttpErro(404, "Pedido não encontrado.");
  if (pedido.usuario_id !== req.usuario.id && req.usuario.papel !== "admin") throw new HttpErro(403, "Acesso negado.");
  const pg = db.prepare("SELECT * FROM pagamentos WHERE pedido_id=?").get(pedido.id);
  if (!pg) throw new HttpErro(404, "Este pedido ainda não tem pagamento.");
  res.json(detalhar(pg));
}));

// Simulação (somente PIX e somente com PAGAMENTO_SIMULADO=true)
r.post("/pagamentos/:id/confirmar-simulado", autenticar, tentar((req, res) => {
  if (!simulado()) throw new HttpErro(404, "O pagamento simulado está desativado.");
  const pg = get("pagamentos", positiveId(req.params.id));
  if (!pg) throw new HttpErro(404, "Pagamento não encontrado.");
  const pedido = get("pedidos", pg.pedido_id);
  if (!pedido) throw new HttpErro(404, "Pedido não encontrado.");
  if (pedido.usuario_id !== req.usuario.id && req.usuario.papel !== "admin") throw new HttpErro(403, "Acesso negado.");
  if (pg.metodo !== "pix")
    throw new HttpErro(403, "Só o PIX pode ser simulado. Dinheiro e cartão aguardam a confirmação do administrador.");
  const out = confirmarTx(pg.id, req.usuario.papel === "admin" ? req.usuario.id : null);
  aposConfirmar(out);
  notificarAdmins("Pagamento PIX confirmado", `Pagamento #${pg.id} do pedido #${pedido.id} confirmado (simulação).`);
  res.json(detalhar(out.pagamento));
}));

// Cancelamento do pedido pelo dono (ou admin) enquanto NÃO estiver pago
r.post("/pedidos/:id/cancelar", autenticar, tentar((req, res) => {
  const pedido = get("pedidos", positiveId(req.params.id));
  if (!pedido) throw new HttpErro(404, "Pedido não encontrado.");
  if (pedido.usuario_id !== req.usuario.id && req.usuario.papel !== "admin") throw new HttpErro(403, "Acesso negado.");
  if (pedido.status !== "pendente") throw new HttpErro(409, "Este pedido não pode ser cancelado.");
  const pg = db.prepare("SELECT status FROM pagamentos WHERE pedido_id=?").get(pedido.id);
  if (pg && pg.status === "confirmado")
    throw new HttpErro(409, "Pedido já pago. Procure a AAPM para tratar o estorno.");
  db.transaction(() => {
    devolverEstoque(pedido.id);
    db.prepare("UPDATE pedidos SET status='cancelado' WHERE id=?").run(pedido.id);
    db.prepare("UPDATE pagamentos SET status='cancelado' WHERE pedido_id=? AND status='pendente'").run(pedido.id);
  })();
  res.json(get("pedidos", pedido.id));
}));

// =====================================================
// ADMINISTRADOR
// =====================================================

// Fila de pagamentos (padrão: pendentes)
r.get("/admin/pagamentos", autenticar, admin, tentar((req, res) => {
  const st = clean(req.query.status ?? "pendente", 20);
  if (st && !["pendente", "confirmado", "cancelado"].includes(st)) throw new HttpErro(400, "Status inválido.");
  const rows = db.prepare(`
    SELECT pg.*, p.status AS pedido_status, p.criado_em AS pedido_criado_em,
           u.nome AS aluno, u.email AS aluno_email,
           (SELECT GROUP_CONCAT(pr.nome || ' (x' || i.quantidade || ')', ', ')
              FROM itens_pedido i JOIN produtos pr ON pr.id=i.produto_id WHERE i.pedido_id=p.id) AS itens
    FROM pagamentos pg
    JOIN pedidos p ON p.id=pg.pedido_id
    JOIN usuarios u ON u.id=p.usuario_id
    WHERE (? = '' OR pg.status = ?)
    ORDER BY pg.id DESC LIMIT 200`).all(st, st);
  res.json(rows.map(detalhar));
}));

// Admin confirma (dinheiro/cartão/PIX conferido no banco) -> gera o token
r.post("/admin/pagamentos/:id/confirmar", autenticar, admin, tentar((req, res) => {
  const id = positiveId(req.params.id);
  if (!id || !get("pagamentos", id)) throw new HttpErro(404, "Pagamento não encontrado.");
  const out = confirmarTx(id, req.usuario.id);
  aposConfirmar(out);
  res.json(detalhar(out.pagamento));
}));

// Admin recusa: cancela o pagamento, rejeita o pedido e devolve o estoque
r.post("/admin/pagamentos/:id/recusar", autenticar, admin, tentar((req, res) => {
  const pg = get("pagamentos", positiveId(req.params.id));
  if (!pg) throw new HttpErro(404, "Pagamento não encontrado.");
  const pedido = get("pedidos", pg.pedido_id);
  if (pg.status !== "pendente") throw new HttpErro(409, "Só é possível recusar pagamentos pendentes.");
  if (!pedido || pedido.status !== "pendente") throw new HttpErro(409, "O pedido não está mais pendente.");
  const motivo = clean(req.body && req.body.motivo, 200);
  db.transaction(() => {
    devolverEstoque(pedido.id);
    db.prepare("UPDATE pagamentos SET status='cancelado' WHERE id=? AND status='pendente'").run(pg.id);
    db.prepare("UPDATE pedidos SET status='rejeitado' WHERE id=?").run(pedido.id);
  })();
  notificar(pedido.usuario_id, "Pagamento não confirmado",
    `O pagamento do pedido #${pedido.id} não foi confirmado e o pedido foi encerrado.${motivo ? " Motivo: " + motivo : ""}`);
  res.json(detalhar(get("pagamentos", pg.id)));
}));

// =====================================================
// CONTROLE FINANCEIRO
// Receita = pagamentos CONFIRMADOS de pedidos que não foram cancelados/rejeitados.
// Nada é copiado para outra tabela (fonte única => sem lançamentos duplicados).
// =====================================================
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
function periodo(req) {
  const de = req.query.de ? String(req.query.de) : "";
  const ate = req.query.ate ? String(req.query.ate) : "";
  if ((de && !DATA_RE.test(de)) || (ate && !DATA_RE.test(ate)))
    throw new HttpErro(400, "Use datas no formato AAAA-MM-DD.");
  return { de, ate };
}
function receitas({ de, ate }) {
  const rows = db.prepare(`
    SELECT pg.id, pg.pedido_id, pg.metodo, pg.tipo_cartao, pg.parcelas, pg.valor_centavos,
           pg.valor_entregue_centavos, pg.troco_centavos,
           COALESCE(pg.confirmado_em, pg.criado_em) AS data_ref,
           u.nome AS aluno
    FROM pagamentos pg
    JOIN pedidos p ON p.id=pg.pedido_id
    JOIN usuarios u ON u.id=p.usuario_id
    WHERE pg.status='confirmado' AND p.status NOT IN ('cancelado','rejeitado')
      AND (? = '' OR date(COALESCE(pg.confirmado_em, pg.criado_em),'localtime') >= ?)
      AND (? = '' OR date(COALESCE(pg.confirmado_em, pg.criado_em),'localtime') <= ?)
    ORDER BY data_ref DESC`).all(de, de, ate, ate);
  const porForma = { pix: 0, dinheiro: 0, debito: 0, credito: 0 };
  for (const x of rows) {
    const k = x.metodo === "cartao" ? (x.tipo_cartao === "credito" ? "credito" : "debito") : x.metodo;
    porForma[k] += x.valor_centavos;
  }
  const total = rows.reduce((s, x) => s + x.valor_centavos, 0);
  return { rows, porForma, total };
}
function despesas({ de, ate }) {
  try {
    return db.prepare(`SELECT COALESCE(SUM(valor_centavos),0) AS t FROM despesas_financeiras
                       WHERE (? = '' OR data_despesa >= ?) AND (? = '' OR data_despesa <= ?)`)
      .get(de, de, ate, ate).t;
  } catch { return 0; } // tabela ainda não criada
}

r.get("/admin/financeiro/receitas", autenticar, admin, tentar((req, res) => {
  const p = periodo(req);
  const rc = receitas(p);
  res.json({
    periodo: p,
    total_centavos: rc.total,
    por_forma_centavos: rc.porForma,
    quantidade: rc.rows.length,
    lancamentos: rc.rows.map((x) => ({
      tipo: "receita",
      pagamento_id: x.id,
      pedido_id: x.pedido_id,
      aluno: x.aluno,
      forma: x.metodo === "cartao" ? `cartao_${x.tipo_cartao || "debito"}` : x.metodo,
      parcelas: x.parcelas,
      valor_centavos: x.valor_centavos,
      troco_centavos: x.troco_centavos,
      data: x.data_ref,
    })),
  });
}));

r.get("/admin/financeiro/resumo", autenticar, admin, tentar((req, res) => {
  const p = periodo(req);
  const rc = receitas(p);
  const desp = despesas(p);
  res.json({
    periodo: p,
    receitas_centavos: rc.total,
    despesas_centavos: desp,
    saldo_centavos: rc.total - desp,
    por_forma_centavos: rc.porForma,
    pagamentos_confirmados: rc.rows.length,
  });
}));

module.exports = r;
module.exports._interno = { valoresParcelas, parcelasPermitidas, validarForma, confirmarTx, HttpErro };