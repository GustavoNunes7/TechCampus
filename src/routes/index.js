const express = require("express"),
  bcrypt = require("bcryptjs"),
  jwt = require("jsonwebtoken"),
  crypto = require("crypto");

const rateLimit = require("express-rate-limit"),
  multer = require("multer"),
  fs = require("fs"),
  path = require("path");
const { db, publicUser, validEmail, clean, positiveId } = require("../models");
const autenticar = require("../middlewares/auth"),
  { admin } = require("../middlewares/auth");
const r = express.Router(),
  wrap = (fn) => (req, res, next) =>
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
const bad = (res, msg = "Dados inválidos.") =>
  res.status(400).json({ erro: msg });
const get = (table, id) =>
  db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
const allowed = (value, values) => values.includes(value);

// Código de retirada separado do código PIX, persistido por pedido.
db.exec(`
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
// Migração segura para bancos que já tinham a tabela de tokens criada.
const colunasToken = db.prepare("PRAGMA table_info(tokens_retirada)").all().map((c) => c.name);
if (!colunasToken.includes("expira_em")) db.exec("ALTER TABLE tokens_retirada ADD COLUMN expira_em INTEGER");
if (!colunasToken.includes("usado")) db.exec("ALTER TABLE tokens_retirada ADD COLUMN usado INTEGER NOT NULL DEFAULT 0");
if (!colunasToken.includes("usado_em")) db.exec("ALTER TABLE tokens_retirada ADD COLUMN usado_em TEXT");

// Campo persistente para marcar eventos como ocorridos.
const colunasAvisos = db.prepare("PRAGMA table_info(avisos)").all().map((c) => c.name);
if (!colunasAvisos.includes("ocorrido")) db.exec("ALTER TABLE avisos ADD COLUMN ocorrido INTEGER NOT NULL DEFAULT 0 CHECK(ocorrido IN (0,1))");

// Caixa de notificações para aluno e administrador.
db.exec(`
  CREATE TABLE IF NOT EXISTS notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    lida INTEGER NOT NULL DEFAULT 0 CHECK(lida IN (0,1)),
    criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
const colunasUsuario = db.prepare("PRAGMA table_info(usuarios)").all().map((c) => c.name);
if (!colunasUsuario.includes("ativo")) db.exec("ALTER TABLE usuarios ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1");
if (!colunasUsuario.includes("foto_url")) db.exec("ALTER TABLE usuarios ADD COLUMN foto_url TEXT");
function notificarAdmins(titulo, mensagem) {
  const admins = db.prepare("SELECT id FROM usuarios WHERE papel='admin' AND ativo=1").all();
  const inserir = db.prepare("INSERT INTO notificacoes(usuario_id,titulo,mensagem) VALUES(?,?,?)");
  const tx = db.transaction(() => admins.forEach((u) => inserir.run(u.id, titulo, mensagem)));
  tx();
}

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { erro: "Muitas tentativas. Tente novamente mais tarde." },
});
r.get("/saude", (_req, res) => res.json({ status: "online" }));
// Cadastro público somente como aluno; admin criado por processo administrativo local.
r.post(
  "/auth/cadastro",
  loginLimit,
  wrap(async (req, res) => {
    const nome = clean(req.body.nome, 100),
      email = clean(req.body.email, 254).toLowerCase(),
      senha = req.body.senha;
    if (
      nome.length < 2 ||
      !validEmail(email) ||
      typeof senha !== "string" ||
      senha.length < 5 ||
      senha.length > 128
    )
      return bad(
        res,
        "Informe nome, e-mail válido e senha de 5 a 128 caracteres.",
      );
    if (db.prepare("SELECT id FROM usuarios WHERE email=?").get(email))
      return res.status(409).json({ erro: "E-mail já cadastrado." });
    const hash = await bcrypt.hash(senha, 12);
    const info = db
      .prepare("INSERT INTO usuarios(nome,email,senha_hash) VALUES(?,?,?)")
      .run(nome, email, hash);
    res
      .status(201)
      .json({ usuario: publicUser(get("usuarios", info.lastInsertRowid)) });
  }),
);
r.post(
  "/auth/login",
  loginLimit,
  wrap(async (req, res) => {
    const email = clean(req.body.email, 254).toLowerCase(),
      senha = req.body.senha;
    if (!validEmail(email) || typeof senha !== "string") return bad(res);
    const u = db.prepare("SELECT * FROM usuarios WHERE email=?").get(email);
    if (!u || u.ativo === 0 || !(await bcrypt.compare(senha, u.senha_hash)))
      return res.status(401).json({ erro: "Credenciais inválidas." });
    const token = jwt.sign(
      { id: u.id, papel: u.papel },
      process.env.JWT_SECRET,
      { expiresIn: "8h", algorithm: "HS256" },
    );
    res.json({ token, usuario: publicUser(u) });
  }),
);
r.post("/auth/recuperar", loginLimit, (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase(),
    u = db.prepare("SELECT id FROM usuarios WHERE email=?").get(email);
  if (u) {
    const token = crypto.randomBytes(32).toString("hex"),
      hash = crypto.createHash("sha256").update(token).digest("hex");
    db.prepare(
      "INSERT INTO recuperacoes(usuario_id,token_hash,expira_em) VALUES(?,?,?)",
    ).run(u.id, hash, Date.now() + 15 * 60 * 1000);
    // Integre um provedor de e-mail para enviar o token; nunca exponha o token na API ou nos logs.
  }
  res.json({
    mensagem:
      "Se o e-mail estiver cadastrado, você receberá instruções de recuperação quando o serviço de e-mail estiver configurado.",
  });
});
r.post(
  "/auth/redefinir",
  loginLimit,
  wrap(async (req, res) => {
    const token = req.body.token,
      senha = req.body.senha;
    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/.test(token) ||
      typeof senha !== "string" ||
      senha.length < 5 ||
      senha.length > 128
    )
      return bad(res);
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const rec = db
      .prepare(
        "SELECT * FROM recuperacoes WHERE token_hash=? AND usado=0 AND expira_em>?",
      )
      .get(hash, Date.now());
    if (!rec)
      return res.status(400).json({ erro: "Token inválido ou expirado." });
    const senhaHash = await bcrypt.hash(senha, 12);
    db.transaction(() => {
      db.prepare("UPDATE usuarios SET senha_hash=? WHERE id=?").run(
        senhaHash,
        rec.usuario_id,
      );
      db.prepare("UPDATE recuperacoes SET usado=1 WHERE usuario_id=?").run(
        rec.usuario_id,
      );
    })();
    res.json({ mensagem: "Senha redefinida." });
  }),
);
r.get("/perfil", autenticar, (req, res) => {
  const u = get("usuarios", req.usuario.id);
  if (!u) return res.sendStatus(401);
  res.json({ ...publicUser(u), foto_url: u.foto_url || null });
});
r.patch("/perfil", autenticar, (req, res) => {
  const u = get("usuarios", req.usuario.id);
  if (!u) return res.sendStatus(401);
  const nome = req.body.nome === undefined ? u.nome : clean(req.body.nome, 100),
    email = req.body.email === undefined ? u.email : clean(req.body.email, 254).toLowerCase(),
    turma = req.body.turma === undefined ? u.turma : clean(req.body.turma, 60),
    telefone = req.body.telefone === undefined ? u.telefone : clean(req.body.telefone, 25),
    fotoUrl = req.body.foto_url === undefined ? (u.foto_url || null) : clean(req.body.foto_url, 500);
  if (nome.length < 2) return bad(res, "Nome inválido.");
  if (!validEmail(email)) return bad(res, "E-mail inválido.");
  const outro = db.prepare("SELECT id FROM usuarios WHERE email=? AND id<>?").get(email, u.id);
  if (outro) return res.status(409).json({ erro: "Este e-mail já está em uso." });
  db.prepare("UPDATE usuarios SET nome=?,email=?,turma=?,telefone=?,foto_url=? WHERE id=?").run(
    nome, email, turma, telefone, fotoUrl, u.id,
  );
  res.json({ ...publicUser(get("usuarios", u.id)), foto_url: fotoUrl });
});
// Encerramento de conta: desativa o acesso sem apagar o histórico acadêmico/financeiro.
r.delete("/perfil", autenticar, wrap(async (req, res) => {
  const senha = req.body?.senha;
  const u = get("usuarios", req.usuario.id);
  if (!u || u.ativo === 0) return res.sendStatus(404);
  if (typeof senha !== "string" || !(await bcrypt.compare(senha, u.senha_hash)))
    return res.status(401).json({ erro: "Confirme sua senha para encerrar a conta." });
  db.prepare("UPDATE usuarios SET ativo=0,email=?,nome=?,telefone=NULL,foto_url=NULL WHERE id=?")
    .run(`encerrada+${u.id}+${Date.now()}@conta.invalid`, `Conta encerrada #${u.id}`, u.id);
  notificarAdmins("Encerramento de conta", `A conta de usuário #${u.id} solicitou encerramento.`);
  res.json({ ok: true, mensagem: "Conta encerrada. Sua sessão será finalizada." });
}));

r.get("/usuarios", autenticar, admin, (_req, res) =>
  res.json(
    db
      .prepare(
        "SELECT id,nome,email,papel,turma,telefone,ativo,foto_url,criado_em FROM usuarios ORDER BY id DESC",
      )
      .all(),
  ),
);

// Fotos dos usuários: acessíveis somente por administradores autenticados.
r.get("/usuarios/:id/foto", autenticar, admin, (req, res) => {
  const usuario = get("usuarios", positiveId(req.params.id));
  if (!usuario?.foto_url || !/^[a-f0-9-]+\.(jpg|jpeg|png)$/i.test(usuario.foto_url)) return res.sendStatus(404);
  const arquivo = path.join(uploadDir, path.basename(usuario.foto_url));
  if (!fs.existsSync(arquivo)) return res.sendStatus(404);
  res.type(path.extname(arquivo).toLowerCase() === ".png" ? "image/png" : "image/jpeg");
  res.set("Cache-Control", "private, max-age=300");
  res.sendFile(arquivo);
});
r.post("/usuarios", autenticar, admin, wrap(async (req, res) => {
  const nome = clean(req.body.nome, 100), email = clean(req.body.email, 254).toLowerCase();
  const senha = req.body.senha, papel = req.body.papel || "aluno";
  if (nome.length < 2 || !validEmail(email) || typeof senha !== "string" || senha.length < 5 || senha.length > 128 || !allowed(papel, ["aluno", "admin"])) return bad(res, "Informe nome, e-mail válido, senha de 5 a 128 caracteres e perfil válido.");
  if (db.prepare("SELECT id FROM usuarios WHERE email=?").get(email)) return res.status(409).json({ erro: "E-mail já cadastrado." });
  const hash = await bcrypt.hash(senha, 12);
  const info = db.prepare("INSERT INTO usuarios(nome,email,senha_hash,papel,turma,telefone) VALUES(?,?,?,?,?,?)").run(nome,email,hash,papel,clean(req.body.turma,60),clean(req.body.telefone,25));
  res.status(201).json(publicUser(get("usuarios", info.lastInsertRowid)));
}));
r.patch("/usuarios/:id", autenticar, admin, wrap(async (req, res) => {
  const id = positiveId(req.params.id), u = get("usuarios", id);
  if (!u) return res.sendStatus(404);
  const nome = req.body.nome === undefined ? u.nome : clean(req.body.nome, 100);
  const email = req.body.email === undefined ? u.email : clean(req.body.email, 254).toLowerCase();
  const turma = req.body.turma === undefined ? u.turma : clean(req.body.turma, 60);
  const telefone = req.body.telefone === undefined ? u.telefone : clean(req.body.telefone, 25);
  const papel = req.body.papel === undefined ? u.papel : req.body.papel;
  const ativo = req.body.ativo === undefined ? u.ativo : (req.body.ativo === false || req.body.ativo === 0 ? 0 : 1);
  if (nome.length < 2 || !validEmail(email) || !allowed(papel, ["aluno", "admin"])) return bad(res, "Dados de usuário inválidos.");
  if (db.prepare("SELECT id FROM usuarios WHERE email=? AND id<>?").get(email, id)) return res.status(409).json({ erro: "E-mail já cadastrado." });
  if (u.id === req.usuario.id && (papel !== "admin" || !ativo)) return bad(res, "Você não pode desativar ou rebaixar sua própria conta administrativa.");
  let sql = "UPDATE usuarios SET nome=?,email=?,turma=?,telefone=?,papel=?,ativo=? WHERE id=?";
  const args = [nome,email,turma,telefone,papel,ativo,id];
  if (req.body.senha) {
    if (typeof req.body.senha !== "string" || req.body.senha.length < 5 || req.body.senha.length > 128) return bad(res, "A senha deve ter de 5 a 128 caracteres.");
    const hash = await bcrypt.hash(req.body.senha, 12);
    sql = "UPDATE usuarios SET nome=?,email=?,turma=?,telefone=?,papel=?,ativo=?,senha_hash=? WHERE id=?";
    args.splice(6, 0, hash);
  }
  db.prepare(sql).run(...args);
  const atualizado = get("usuarios", id);
  res.json({ ...publicUser(atualizado), ativo: atualizado.ativo });
}));
// Endpoints específicos do painel de gerência (mantêm compatibilidade com a interface original).
r.get("/admin/produtos", autenticar, admin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM produtos WHERE excluido=0 ORDER BY id DESC").all());
});
r.get("/admin/pedidos", autenticar, admin, (req, res) => {
  const status = clean(req.query.status, 20);
  if (status && !allowed(status, ["pendente", "aprovado", "rejeitado", "entregue", "cancelado"])) return bad(res, "Filtro de status inválido.");
  const rows = db.prepare(`
    SELECT p.id, p.usuario_id, p.status, p.observacao, p.criado_em,
      u.nome AS cliente, u.email AS cliente_email,
      COALESCE(SUM(i.quantidade * i.preco_unitario_centavos),0) AS total_centavos,
      pg.status AS pagamento_status
    FROM pedidos p JOIN usuarios u ON u.id=p.usuario_id
    LEFT JOIN itens_pedido i ON i.pedido_id=p.id
    LEFT JOIN pagamentos pg ON pg.pedido_id=p.id
    ${status ? "WHERE p.status=?" : ""}
    GROUP BY p.id ORDER BY p.id DESC
  `);
  res.json(status ? rows.all(status) : rows.all());
});

// Consulta administrativa dos tokens de retirada e respectivos pedidos.
r.get("/admin/tokens", autenticar, admin, (_req, res) => {
  const rows = db.prepare(`
    SELECT t.id, t.pedido_id, t.token, t.expira_em, t.usado, t.usado_em, t.criado_em,
      p.status AS pedido_status, p.criado_em AS pedido_criado_em,
      u.nome AS cliente, u.email AS cliente_email,
      pg.status AS pagamento_status
    FROM tokens_retirada t
    JOIN pedidos p ON p.id=t.pedido_id
    JOIN usuarios u ON u.id=p.usuario_id
    LEFT JOIN pagamentos pg ON pg.pedido_id=p.id
    ORDER BY t.id DESC
  `).all();
  res.json(rows);
});

// Produtos
r.get("/produtos", (req, res) => {
  const categoria = clean(req.query.categoria, 50);
  res.json(
    categoria
      ? db
          .prepare(
            "SELECT * FROM produtos WHERE ativo=1 AND excluido=0 AND categoria=? ORDER BY id DESC",
          )
          .all(categoria)
      : db
          .prepare("SELECT * FROM produtos WHERE ativo=1 AND excluido=0 ORDER BY id DESC")
          .all(),
  );
});
r.post("/produtos", autenticar, admin, (req, res) => {
  const nome = clean(req.body.nome, 120),
    categoria = clean(req.body.categoria, 50),
    descricao = clean(req.body.descricao, 2000),
    preco = req.body.preco_centavos ?? 0,
    estoque = req.body.estoque ?? 0,
    imagem = clean(req.body.imagem, 300);
  if (
    !nome ||
    !categoria ||
    !Number.isSafeInteger(preco) ||
    preco < 0 ||
    !Number.isSafeInteger(estoque) ||
    estoque < 0
  )
    return bad(res);
  const info = db
    .prepare(
      "INSERT INTO produtos(nome,descricao,categoria,preco_centavos,estoque,imagem) VALUES(?,?,?,?,?,?)",
    )
    .run(nome, descricao, categoria, preco, estoque, imagem);
  res.status(201).json(get("produtos", info.lastInsertRowid));
});
r.patch("/produtos/:id", autenticar, admin, (req, res) => {
  const p = get("produtos", positiveId(req.params.id));
  if (!p) return res.sendStatus(404);
  const o = { ...p, ...req.body };
  o.nome = clean(o.nome, 120);
  o.categoria = clean(o.categoria, 50);
  o.descricao = clean(o.descricao, 2000);
  o.imagem = clean(o.imagem, 300);
  if (
    !o.nome ||
    !o.categoria ||
    !Number.isSafeInteger(o.preco_centavos) ||
    o.preco_centavos < 0 ||
    !Number.isSafeInteger(o.estoque) ||
    o.estoque < 0 ||
    ![0, 1].includes(o.ativo)
  )
    return bad(res);
  db.prepare(
    "UPDATE produtos SET nome=?,categoria=?,descricao=?,preco_centavos=?,estoque=?,imagem=?,ativo=? WHERE id=?",
  ).run(
    o.nome,
    o.categoria,
    o.descricao,
    o.preco_centavos,
    o.estoque,
    o.imagem,
    o.ativo,
    p.id,
  );
  res.json(get("produtos", p.id));
});
// Excluir é uma ação separada de ativar/desativar.
// Sem histórico, remove o registro; com pedidos antigos, oculta o produto sem quebrar o histórico.
r.delete("/produtos/:id", autenticar, admin, (req, res) => {
  const id = positiveId(req.params.id);
  const produto = get("produtos", id);
  if (!produto || produto.excluido === 1) {
    return res.status(404).json({ erro: "Produto não encontrado ou já excluído." });
  }

  const historico = db.prepare(
    "SELECT COUNT(*) AS total FROM itens_pedido WHERE produto_id=?"
  ).get(id);

  if (Number(historico.total) > 0) {
    db.prepare("UPDATE produtos SET excluido=1, ativo=0 WHERE id=?").run(id);
    return res.status(200).json({
      preservado: true,
      mensagem: "O produto foi removido da loja, mas seu registro foi preservado porque aparece em pedidos antigos."
    });
  }

  db.prepare("DELETE FROM produtos WHERE id=?").run(id);
  res.status(204).end();
});

// Pedidos: reserva atômica do estoque
r.post("/pedidos", autenticar, (req, res) => {
  if (req.usuario.papel === "admin")
    return res.status(403).json({ erro: "Contas administrativas não podem realizar compras." });
  const itens = req.body.itens;
  if (!Array.isArray(itens) || !itens.length || itens.length > 30)
    return bad(res, "Informe de 1 a 30 itens.");
  const ids = new Set();
  for (const item of itens) {
    if (
      !positiveId(item.produto_id) ||
      !Number.isSafeInteger(item.quantidade) ||
      item.quantidade < 1 ||
      item.quantidade > 100 ||
      ids.has(item.produto_id)
    )
      return bad(res, "Itens inválidos ou duplicados.");
    ids.add(item.produto_id);
  }
  try {
    const pedido = db.transaction(() => {
      const info = db
        .prepare("INSERT INTO pedidos(usuario_id,observacao) VALUES(?,?)")
        .run(req.usuario.id, clean(req.body.observacao, 1000));
      for (const item of itens) {
        const p = get("produtos", item.produto_id);
        if (!p || !p.ativo || p.estoque < item.quantidade)
          throw new Error(
            "Produto indisponível ou estoque insuficiente: " + item.produto_id,
          );
        db.prepare("UPDATE produtos SET estoque=estoque-? WHERE id=?").run(
          item.quantidade,
          p.id,
        );
        db.prepare(
          "INSERT INTO itens_pedido(pedido_id,produto_id,quantidade,preco_unitario_centavos) VALUES(?,?,?,?)",
        ).run(info.lastInsertRowid, p.id, item.quantidade, p.preco_centavos);
      }
      return info.lastInsertRowid;
    })();
    res.status(201).json(detalharPedido(pedido));
  } catch (e) {
    return bad(res, e.message);
  }
});
function detalharPedido(id) {
  const p = get("pedidos", id);
  if (!p) return null;
  return {
    ...p,
    itens: db
      .prepare(
        "SELECT i.*,p.nome FROM itens_pedido i JOIN produtos p ON p.id=i.produto_id WHERE i.pedido_id=?",
      )
      .all(id),
  };
}
r.get("/pedidos", autenticar, (req, res) => {
  const rows =
    req.usuario.papel === "admin"
      ? db.prepare("SELECT id FROM pedidos ORDER BY id DESC").all()
      : db
          .prepare("SELECT id FROM pedidos WHERE usuario_id=? ORDER BY id DESC")
          .all(req.usuario.id);
  res.json(rows.map((x) => detalharPedido(x.id)));
});
r.get("/pedidos/:id", autenticar, (req, res) => {
  const p = detalharPedido(positiveId(req.params.id));
  if (!p) return res.sendStatus(404);
  if (p.usuario_id !== req.usuario.id && req.usuario.papel !== "admin")
    return res.sendStatus(403);
  res.json(p);
});

// Código de retirada: disponível apenas após confirmação do pagamento.
r.get("/pedidos/:id/token", autenticar, (req, res) => {
  const pedido = get("pedidos", positiveId(req.params.id));
  if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
  if (pedido.usuario_id !== req.usuario.id && req.usuario.papel !== "admin")
    return res.sendStatus(403);

  const pagamento = db
    .prepare("SELECT status FROM pagamentos WHERE pedido_id=?")
    .get(pedido.id);
  if (!pagamento || pagamento.status !== "confirmado")
    return res.status(409).json({ erro: "O pagamento ainda não foi confirmado." });

  const registro = db
    .prepare("SELECT token, expira_em, usado FROM tokens_retirada WHERE pedido_id=?")
    .get(pedido.id);
  if (!registro)
    return res.status(404).json({ erro: "Código de retirada ainda não foi gerado." });
  if (registro.usado) return res.status(409).json({ erro: "Este código já foi utilizado." });
  if (registro.expira_em && registro.expira_em < Date.now())
    return res.status(410).json({ erro: "Código de retirada expirado." });

  res.json({ token: registro.token, expiraEm: registro.expira_em, status: "ativo" });
});
// Pagamentos
r.post("/pedidos/:id/pagamento", autenticar, (req, res) => {
  const pedidoId = positiveId(req.params.id);
  const metodo = req.body.metodo;

  if (!allowed(metodo, ["pix", "cartao", "dinheiro"]))
    return bad(res, "Forma de pagamento inválida.");

  const pedido = get("pedidos", pedidoId);

  if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });

  if (pedido.usuario_id !== req.usuario.id && req.usuario.papel !== "admin")
    return res.sendStatus(403);

  if (pedido.status !== "pendente")
    return bad(res, "Este pedido não pode receber pagamento.");

  const existente = db
    .prepare("SELECT * FROM pagamentos WHERE pedido_id=?")
    .get(pedidoId);

  if (existente) return res.json(existente);

  const total = db
    .prepare(
      "SELECT COALESCE(SUM(quantidade * preco_unitario_centavos), 0) AS total FROM itens_pedido WHERE pedido_id=?",
    )
    .get(pedidoId).total;

  const codigo =
    metodo === "pix" ? crypto.randomBytes(16).toString("hex") : null;

  const info = db
    .prepare(
      "INSERT INTO pagamentos(pedido_id,metodo,valor_centavos,codigo) VALUES(?,?,?,?)",
    )
    .run(pedidoId, metodo, total, codigo);

  notificarAdmins("Novo pagamento de aluno", `Foi iniciado um pagamento para o pedido #${pedido.id} (aluno #${pedido.usuario_id}).`);
  res.status(201).json(get("pagamentos", info.lastInsertRowid));
});

r.post("/pedidos/:id/cancelar", autenticar, (req, res) => {
  const pedido = get("pedidos", positiveId(req.params.id));

  if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });

  if (pedido.usuario_id !== req.usuario.id && req.usuario.papel !== "admin")
    return res.sendStatus(403);

  if (pedido.status !== "pendente")
    return bad(res, "Este pedido não pode ser cancelado.");

  db.transaction(() => {
    for (const item of db
      .prepare("SELECT * FROM itens_pedido WHERE pedido_id=?")
      .all(pedido.id)) {
      db.prepare("UPDATE produtos SET estoque=estoque+? WHERE id=?").run(
        item.quantidade,
        item.produto_id,
      );
    }

    db.prepare("UPDATE pedidos SET status='cancelado' WHERE id=?").run(
      pedido.id,
    );

    db.prepare(
      "UPDATE pagamentos SET status='cancelado' WHERE pedido_id=?",
    ).run(pedido.id);
  })();

  res.json(detalharPedido(pedido.id));
});

r.post("/pagamentos/:id/confirmar-simulado", autenticar, (req, res) => {
  // Esta rota é apenas para testes locais; não confirma pagamentos reais.
  if (process.env.PAGAMENTO_SIMULADO !== "true") {
    return res.status(404).json({
      erro: "O pagamento simulado está desativado.",
    });
  }

  const pagamento = get("pagamentos", positiveId(req.params.id));
  if (!pagamento)
    return res.status(404).json({ erro: "Pagamento não encontrado." });

  const pedido = get("pedidos", pagamento.pedido_id);
  if (!pedido)
    return res.status(404).json({ erro: "Pedido não encontrado." });

  if (pedido.usuario_id !== req.usuario.id && req.usuario.papel !== "admin")
    return res.sendStatus(403);

  if (pagamento.status !== "pendente")
    return bad(res, "Este pagamento já foi processado.");

  // Confirma o pagamento e cria um único código de retirada por pedido.
  db.transaction(() => {
    db.prepare("UPDATE pagamentos SET status='confirmado' WHERE id=?").run(
      pagamento.id,
    );
    const existente = db.prepare("SELECT id FROM tokens_retirada WHERE pedido_id=?").get(pedido.id);
    if (!existente) {
      let token;
      // Token numérico de 6 dígitos, no formato do projeto Demo.
      do {
        token = String(crypto.randomInt(100000, 1000000));
      } while (db.prepare("SELECT id FROM tokens_retirada WHERE token=?").get(token));
      db.prepare(
        "INSERT INTO tokens_retirada(pedido_id, token, expira_em) VALUES(?, ?, ?)",
      ).run(pedido.id, token, Date.now() + 15 * 60 * 1000);
    }
  })();
  db.prepare("INSERT INTO notificacoes(usuario_id,titulo,mensagem) VALUES(?,?,?)")
    .run(pedido.usuario_id, "Pagamento confirmado", `O pagamento do pedido #${pedido.id} foi confirmado. Seu token de retirada está disponível por 15 minutos.`);
  notificarAdmins("Pagamento de aluno confirmado", `Pagamento #${pagamento.id} do pedido #${pedido.id} (aluno #${pedido.usuario_id}) confirmado.`);

  res.json(get("pagamentos", pagamento.id));
});
r.patch("/pedidos/:id/status", autenticar, admin, (req, res) => {
  const p = get("pedidos", positiveId(req.params.id)),
    status = req.body.status;
  if (!p) return res.sendStatus(404);
  if (!allowed(status, ["aprovado", "rejeitado", "entregue", "cancelado"]))
    return bad(res);
  if (["rejeitado", "cancelado", "entregue"].includes(p.status))
    return bad(res, "Pedido já finalizado.");
  if (status === "entregue" && p.status !== "aprovado")
    return bad(res, "Aprove o pedido antes da entrega.");
  if (status === "aprovado") {
    const pg = db
      .prepare("SELECT status FROM pagamentos WHERE pedido_id=?")
      .get(p.id);
    if (!pg || pg.status !== "confirmado")
      return bad(res, "Pagamento não confirmado.");
  }
  db.transaction(() => {
    if (["rejeitado", "cancelado"].includes(status))
      for (const i of db
        .prepare("SELECT * FROM itens_pedido WHERE pedido_id=?")
        .all(p.id))
        db.prepare("UPDATE produtos SET estoque=estoque+? WHERE id=?").run(
          i.quantidade,
          i.produto_id,
        );
    db.prepare("UPDATE pedidos SET status=? WHERE id=?").run(status, p.id);
  })();
  res.json(detalharPedido(p.id));
});
// Renovação manual de token expirado, mantendo a regra de um token ativo por pedido.
r.post("/pedidos/:id/token/renovar", autenticar, (req, res) => {
  const pedido = get("pedidos", positiveId(req.params.id));
  if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
  if (pedido.usuario_id !== req.usuario.id && req.usuario.papel !== "admin") return res.sendStatus(403);
  const pagamento = db.prepare("SELECT status FROM pagamentos WHERE pedido_id=?").get(pedido.id);
  if (!pagamento || pagamento.status !== "confirmado") return res.status(409).json({ erro: "O pagamento ainda não foi confirmado." });
  const registro = db.prepare("SELECT * FROM tokens_retirada WHERE pedido_id=?").get(pedido.id);
  if (!registro) return res.status(404).json({ erro: "Token não encontrado." });
  if (registro.usado || pedido.status === "entregue") return res.status(409).json({ erro: "Este pedido já foi retirado." });
  if (["cancelado", "rejeitado"].includes(pedido.status)) return res.status(409).json({ erro: "Pedido cancelado ou rejeitado." });
  let novoToken;
  do { novoToken = String(crypto.randomInt(100000, 1000000)); }
  while (db.prepare("SELECT id FROM tokens_retirada WHERE token=? AND id<>?").get(novoToken, registro.id));
  db.prepare("UPDATE tokens_retirada SET token=?, expira_em=?, criado_em=CURRENT_TIMESTAMP WHERE id=?")
    .run(novoToken, Date.now() + 15 * 60 * 1000, registro.id);
  res.json({ token: novoToken, expiraEm: Date.now() + 15 * 60 * 1000, status: "ativo" });
});

// IoT: validação e confirmação de retirada usando token do pedido pago.
const iotLimit = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false });
r.post(["/iot/validar", "/iot/validate"], iotLimit, (req, res) => {
  const token = clean(req.body.token, 20);
  if (!/^\d{6}$/.test(token)) return res.status(400).json({ valido: false, erro: "Informe um token numérico de 6 dígitos." });
  const registro = db.prepare(`
    SELECT t.*, p.id pedido_id, p.usuario_id, p.status pedido_status,
           pg.status pagamento_status,
           GROUP_CONCAT(pr.nome || ' (x' || i.quantidade || ')', ', ') produtos
    FROM tokens_retirada t
    JOIN pedidos p ON p.id=t.pedido_id
    JOIN pagamentos pg ON pg.pedido_id=p.id
    JOIN itens_pedido i ON i.pedido_id=p.id
    JOIN produtos pr ON pr.id=i.produto_id
    WHERE t.token=? GROUP BY t.id
  `).get(token);
  if (!registro) return res.status(404).json({ valido: false, erro: "Token não encontrado." });
  if (registro.pagamento_status !== "confirmado") return res.status(409).json({ valido: false, erro: "Pagamento ainda não confirmado." });
  if (registro.usado || registro.pedido_status === "entregue") return res.status(409).json({ valido: false, erro: "Token já utilizado." });
  if (registro.pedido_status === "cancelado" || registro.pedido_status === "rejeitado") return res.status(409).json({ valido: false, erro: "Pedido cancelado ou rejeitado." });
  if (registro.expira_em && registro.expira_em < Date.now()) return res.status(410).json({ valido: false, erro: "Token expirado. Solicite ajuda à AAPM." });
  res.json({ valido: true, pedidoId: registro.pedido_id, produtos: registro.produtos, expiraEm: registro.expira_em });
});
r.post(["/iot/confirmar", "/iot/confirm"], iotLimit, (req, res) => {
  const token = clean(req.body.token, 20);
  const registro = db.prepare(`
    SELECT t.*, p.id pedido_id, p.status pedido_status, pg.status pagamento_status
    FROM tokens_retirada t JOIN pedidos p ON p.id=t.pedido_id
    JOIN pagamentos pg ON pg.pedido_id=p.id WHERE t.token=?
  `).get(token);
  if (!registro) return res.status(404).json({ erro: "Token não encontrado." });
  if (registro.pagamento_status !== "confirmado") return res.status(409).json({ erro: "Pagamento ainda não confirmado." });
  if (registro.usado || registro.pedido_status === "entregue") return res.status(409).json({ erro: "Token já utilizado." });
  if (["cancelado", "rejeitado"].includes(registro.pedido_status)) return res.status(409).json({ erro: "Pedido cancelado ou rejeitado." });
  if (registro.expira_em && registro.expira_em < Date.now()) return res.status(410).json({ erro: "Token expirado." });
  try {
    db.transaction(() => {
      const atualizado = db.prepare("UPDATE tokens_retirada SET usado=1, usado_em=CURRENT_TIMESTAMP WHERE id=? AND usado=0").run(registro.id);
      if (!atualizado.changes) throw new Error("Token já utilizado.");
      db.prepare("UPDATE pedidos SET status='entregue' WHERE id=?").run(registro.pedido_id);
      const pedido = get("pedidos", registro.pedido_id);
      db.prepare("INSERT INTO notificacoes(usuario_id,titulo,mensagem) VALUES(?,?,?)")
        .run(pedido.usuario_id, "Retirada confirmada", `O pedido #${pedido.id} foi retirado na máquina TechCampus.`);
    })();
    res.json({ ok: true, mensagem: "Retirada confirmada com sucesso." });
  } catch (e) { res.status(409).json({ erro: e.message || "Não foi possível confirmar a retirada." }); }
});

// Notificações privadas do usuário autenticado.
r.get("/notificacoes", autenticar, (req, res) => {
  res.json(db.prepare("SELECT * FROM notificacoes WHERE usuario_id=? ORDER BY id DESC LIMIT 100").all(req.usuario.id));
});
r.patch("/notificacoes/:id/lida", autenticar, (req, res) => {
  const result = db.prepare("UPDATE notificacoes SET lida=1 WHERE id=? AND usuario_id=?").run(positiveId(req.params.id), req.usuario.id);
  if (!result.changes) return res.sendStatus(404);
  res.json({ ok: true });
});

// Documentos: arquivos privados, acesso autenticado, PDF/JPG/PNG até 50 MB
const uploadDir = path.resolve(__dirname, "../../uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) =>
      cb(
        null,
        crypto.randomUUID() + path.extname(file.originalname).toLowerCase(),
      ),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(
      null,
      ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype),
    ),
});
const fotoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png"].includes(file.mimetype)),
});
// Foto de perfil privada, armazenada em uploads e acessível somente pelo próprio usuário.
r.post("/perfil/foto", autenticar, (req, res, next) => fotoUpload.single("foto")(req, res, (err) => {
  if (err) return res.status(400).json({ erro: "Envie uma imagem JPG ou PNG de até 20 MB." });
  if (!req.file) return bad(res, "Envie uma imagem JPG ou PNG de até 20 MB.");
  const header = Buffer.alloc(8), fd = fs.openSync(req.file.path, "r");
  fs.readSync(fd, header, 0, 8, 0); fs.closeSync(fd);
  const valido = req.file.mimetype === "image/png"
    ? header.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    : header[0] === 255 && header[1] === 216 && header[2] === 255;
  if (!valido) { fs.unlinkSync(req.file.path); return bad(res, "O conteúdo não corresponde a uma imagem válida."); }
  const anterior = get("usuarios", req.usuario.id)?.foto_url;
  db.prepare("UPDATE usuarios SET foto_url=? WHERE id=?").run(req.file.filename, req.usuario.id);
  if (anterior && /^[a-f0-9-]+\.(jpg|jpeg|png)$/i.test(anterior)) {
    const antigo = path.join(uploadDir, anterior);
    if (fs.existsSync(antigo)) fs.unlinkSync(antigo);
  }
  res.status(201).json({ foto_url: req.file.filename, mensagem: "Foto atualizada." });
}));
r.get("/perfil/foto", autenticar, (req, res) => {
  const u = get("usuarios", req.usuario.id);
  if (!u?.foto_url) return res.sendStatus(404);
  const arquivo = path.join(uploadDir, path.basename(u.foto_url));
  if (!fs.existsSync(arquivo)) return res.sendStatus(404);
  res.type(path.extname(arquivo).toLowerCase() === ".png" ? "image/png" : "image/jpeg");
  // A mesma URL é usada por contas diferentes; nunca reutilizar foto em cache
  // ao trocar de usuário no mesmo navegador.
  res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Vary", "Authorization, Cookie");
  res.sendFile(arquivo);
});

// Upload de imagem para produtos: apenas administradores, JPG/PNG até 20 MB.
r.post("/produtos/imagem", autenticar, admin, (req, res) => fotoUpload.single("foto")(req, res, (err) => {
  if (err) return res.status(400).json({ erro: "Envie uma imagem JPG ou PNG de até 20 MB." });
  if (!req.file) return bad(res, "Selecione uma imagem JPG ou PNG.");
  const header = Buffer.alloc(8), fd = fs.openSync(req.file.path, "r");
  fs.readSync(fd, header, 0, 8, 0); fs.closeSync(fd);
  const valido = req.file.mimetype === "image/png"
    ? header.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    : header[0] === 255 && header[1] === 216 && header[2] === 255;
  if (!valido) { fs.unlinkSync(req.file.path); return bad(res, "O arquivo não corresponde a uma imagem válida."); }
  res.status(201).json({ imagem: "/api/produtos/imagens/" + req.file.filename });
}));

// Imagens de produtos são públicas para que a vitrine possa exibi-las.
r.get("/produtos/imagens/:arquivo", (req, res) => {
  const nome = path.basename(req.params.arquivo);
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png)$/i.test(nome)) return res.sendStatus(404);
  const arquivo = path.join(uploadDir, nome);
  if (!fs.existsSync(arquivo)) return res.sendStatus(404);
  res.type(path.extname(arquivo).toLowerCase() === ".png" ? "image/png" : "image/jpeg");
  res.set("Cache-Control", "public, max-age=86400");
  res.sendFile(arquivo);
});

r.post("/documentos", autenticar, (req, res, next) =>
  upload.single("arquivo")(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message });
    if (!req.file) return bad(res, "Envie um PDF, JPG ou PNG de até 50 MB.");
    const signatures = {
      "application/pdf": (b) => b.subarray(0, 5).toString() === "%PDF-",
      "image/png": (b) =>
        b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
      "image/jpeg": (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
    };
    const header = Buffer.alloc(8),
      fd = fs.openSync(req.file.path, "r");
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);
    if (!signatures[req.file.mimetype](header)) {
      fs.unlinkSync(req.file.path);
      return bad(res, "Conteúdo do arquivo incompatível com o formato.");
    }
    const nome = clean(req.body.nome || req.file.originalname, 150);
    const info = db
      .prepare(
        "INSERT INTO documentos(usuario_id,nome,arquivo,mime,tamanho) VALUES(?,?,?,?,?)",
      )
      .run(
        req.usuario.id,
        nome,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
      );
    notificarAdmins("Novo documento recebido", `O usuário #${req.usuario.id} enviou o documento "${nome}" (#${info.lastInsertRowid}).`);
    res.status(201).json(get("documentos", info.lastInsertRowid));
  }),
);
r.get("/documentos", autenticar, (req, res) =>
  res.json(
    req.usuario.papel === "admin"
      ? db
          .prepare(
            "SELECT id,usuario_id,nome,mime,tamanho,status,observacao,criado_em FROM documentos ORDER BY id DESC",
          )
          .all()
      : db
          .prepare(
            "SELECT id,usuario_id,nome,mime,tamanho,status,observacao,criado_em FROM documentos WHERE usuario_id=? ORDER BY id DESC",
          )
          .all(req.usuario.id),
  ),
);
r.get("/documentos/:id/arquivo", autenticar, (req, res) => {
  const d = get("documentos", positiveId(req.params.id));
  if (!d) return res.sendStatus(404);
  if (d.usuario_id !== req.usuario.id && req.usuario.papel !== "admin")
    return res.sendStatus(403);
  res.type(d.mime);
  res.set(
    "Content-Disposition",
    'inline; filename="documento-' + d.id + path.extname(d.arquivo) + '"',
  );
  res.sendFile(path.join(uploadDir, d.arquivo));
});
r.delete("/documentos/:id", autenticar, (req, res) => {
  const d = get("documentos", positiveId(req.params.id));
  if (!d) return res.sendStatus(404);

  if (d.usuario_id !== req.usuario.id && req.usuario.papel !== "admin")
    return res.sendStatus(403);

  try {
    const arquivo = path.join(uploadDir, d.arquivo);
    if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo);

    db.prepare("DELETE FROM documentos WHERE id=?").run(d.id);
    res.json({ sucesso: true });
  } catch (erro) {
    console.error("Erro ao excluir documento:", erro);
    res.status(500).json({ erro: "Não foi possível excluir o documento." });
  }
});
r.patch("/documentos/:id/status", autenticar, admin, (req, res) => {
  const d = get("documentos", positiveId(req.params.id));
  if (!d) return res.sendStatus(404);
  if (!allowed(req.body.status, ["pendente", "aprovado", "rejeitado"]))
    return bad(res);
  db.prepare("UPDATE documentos SET status=?,observacao=? WHERE id=?").run(
    req.body.status,
    clean(req.body.observacao, 1000),
    d.id,
  );
  db.prepare("INSERT INTO notificacoes(usuario_id,titulo,mensagem) VALUES(?,?,?)")
    .run(d.usuario_id, "Atualização de documento", `O documento "${d.nome}" foi ${req.body.status}. ${clean(req.body.observacao, 500)}`.trim());
  res.json(get("documentos", d.id));
});
// Avisos: publicados são públicos; gerenciamento exige autenticação administrativa.
r.get("/avisos", (_req, res) => {
  res.json(db.prepare("SELECT * FROM avisos WHERE publicado=1 ORDER BY CASE WHEN data_evento IS NULL OR data_evento='' THEN 1 ELSE 0 END, data_evento ASC, id DESC").all());
});
r.get("/admin/avisos", autenticar, admin, (_req, res) => {
  // A lista "Avisos publicados" deve retornar somente avisos ativos.
  // Avisos despublicados pela rota DELETE ficam preservados no banco, mas não reaparecem na interface.
  res.json(db.prepare("SELECT * FROM avisos WHERE publicado=1 ORDER BY data_evento ASC, id DESC").all());
});
r.post("/avisos", autenticar, admin, (req, res) => {
  const titulo = clean(req.body.titulo, 150);
  const conteudo = clean(req.body.conteudo, 5000);
  const categoria = req.body.categoria || "importante";
  const dataEvento = clean(req.body.data_evento, 10);
  const horario = clean(req.body.horario, 5);
  const local = clean(req.body.local, 150);
  if (!titulo || !/^\d{4}-\d{2}-\d{2}$/.test(dataEvento) || !Number.isFinite(Date.parse(dataEvento + "T12:00:00")) || !allowed(categoria, ["evento", "academico", "reuniao", "importante"]) || (horario && !/^\d{2}:\d{2}$/.test(horario))) return bad(res, "Preencha título, categoria e uma data válida.");
  const info = db.prepare("INSERT INTO avisos(titulo,conteudo,categoria,data_evento,horario,local,publicado) VALUES(?,?,?,?,?,?,1)").run(titulo, conteudo, categoria, dataEvento, horario, local);
  const avisoCriado = get("avisos", info.lastInsertRowid);

  // Notifica cada aluno ativo uma única vez quando o aviso é publicado.
  // A edição do aviso não dispara novamente a notificação de criação.
  const alunos = db.prepare("SELECT id FROM usuarios WHERE papel='aluno' AND ativo=1").all();
  const inserirNotificacaoEvento = db.prepare(
    "INSERT INTO notificacoes(usuario_id,titulo,mensagem) VALUES(?,?,?)"
  );
  const dataLegivel = dataEvento.split("-").reverse().join("/");
  const detalhesEvento = [dataLegivel, horario || null, local || null].filter(Boolean).join(" • ");
  const mensagemEvento = [conteudo, detalhesEvento].filter(Boolean).join("\\n\\n");
  const notificarAlunos = db.transaction(() => {
    for (const aluno of alunos) {
      inserirNotificacaoEvento.run(
        aluno.id,
        "Novo evento: " + titulo,
        mensagemEvento
      );
    }
  });
  notificarAlunos();
  res.status(201).json(avisoCriado);
});
r.patch("/avisos/:id", autenticar, admin, (req, res) => {
  const aviso = get("avisos", positiveId(req.params.id));
  if (!aviso || Number(aviso.publicado) !== 1) return res.sendStatus(404);
  if (req.body.ocorrido !== undefined) {
    if (![0, 1, false, true].includes(req.body.ocorrido)) return bad(res, "Estado de ocorrência inválido.");
    db.prepare("UPDATE avisos SET ocorrido=? WHERE id=?").run(Number(req.body.ocorrido), aviso.id);
    return res.json(get("avisos", aviso.id));
  }
  const titulo = req.body.titulo === undefined ? aviso.titulo : clean(req.body.titulo, 150);
  const conteudo = req.body.conteudo === undefined ? aviso.conteudo : clean(req.body.conteudo, 5000);
  const categoria = req.body.categoria === undefined ? aviso.categoria : req.body.categoria;
  const dataEvento = req.body.data_evento === undefined ? aviso.data_evento : clean(req.body.data_evento, 10);
  const horario = req.body.horario === undefined ? aviso.horario : clean(req.body.horario, 5);
  const local = req.body.local === undefined ? aviso.local : clean(req.body.local, 150);
  if (!titulo || !/^\d{4}-\d{2}-\d{2}$/.test(dataEvento || "") || !Number.isFinite(Date.parse(dataEvento + "T12:00:00")) || !allowed(categoria, ["evento", "academico", "reuniao", "importante"]) || (horario && !/^\d{2}:\d{2}$/.test(horario))) return bad(res, "Dados do aviso inválidos.");
  db.prepare("UPDATE avisos SET titulo=?,conteudo=?,categoria=?,data_evento=?,horario=?,local=? WHERE id=?").run(titulo, conteudo, categoria, dataEvento, horario || null, local, aviso.id);
  res.json(get("avisos", aviso.id));
});
r.delete("/avisos/:id", autenticar, admin, (req, res) => {
  const id = positiveId(req.params.id);
  const aviso = get("avisos", id);
  if (!aviso) return res.sendStatus(404);

  // Exclusão lógica: remove do calendário público, mantendo o registro para auditoria.
  // Retorna sucesso também se o aviso já estava despublicado.
  db.prepare("UPDATE avisos SET publicado=0 WHERE id=?").run(id);
  res.status(204).end();
});

// Conteúdo informativo de formatura.
r.get("/formatura", (_req, res) => res.json(db.prepare("SELECT * FROM formatura WHERE publicado=1 ORDER BY id DESC").all()));
r.post("/formatura", autenticar, admin, (req, res) => {
  const titulo = clean(req.body.titulo, 150), descricao = clean(req.body.descricao, 5000), dataEvento = clean(req.body.data_evento, 40);
  if (!titulo || !descricao) return bad(res);
  const info = db.prepare("INSERT INTO formatura(titulo,descricao,data_evento) VALUES(?,?,?)").run(titulo, descricao, dataEvento);
  res.status(201).json(get("formatura", info.lastInsertRowid));
});
r.delete("/formatura/:id", autenticar, admin, (req, res) => {
  const info = db.prepare("UPDATE formatura SET publicado=0 WHERE id=?").run(positiveId(req.params.id));
  res.status(info.changes ? 204 : 404).end();
});

// Agendamentos
r.post("/agendamentos", autenticar, (req, res) => {
  const recurso = clean(req.body.recurso, 120),
    inicio = clean(req.body.inicio, 40),
    fim = clean(req.body.fim, 40);
  if (
    !allowed(recurso, ["Quadra", "Jogos de Tabuleiro"]) ||
    !Number.isFinite(Date.parse(inicio)) ||
    !Number.isFinite(Date.parse(fim)) ||
    Date.parse(inicio) >= Date.parse(fim) ||
    Date.parse(inicio) < Date.now()
  )
    return bad(res, "Recurso ou período inválido.");

  const ocupado = db
    .prepare(
      "SELECT id FROM agendamentos WHERE recurso=? AND status IN ('pendente','aprovado') AND inicio<? AND fim>?",
    )
    .get(recurso, fim, inicio);
  if (ocupado) return res.status(409).json({ erro: "Horário já reservado." });

  const info = db
    .prepare(
      "INSERT INTO agendamentos(usuario_id,recurso,inicio,fim) VALUES(?,?,?,?)",
    )
    .run(req.usuario.id, recurso, inicio, fim);
  res.status(201).json(get("agendamentos", info.lastInsertRowid));
});
// Ajuda / chamados
r.post("/chamados", autenticar, (req, res) => {
  const assunto = clean(req.body.assunto, 150),
    mensagem = clean(req.body.mensagem, 5000);
  if (!assunto || !mensagem) return bad(res);
  const info = db
    .prepare("INSERT INTO chamados(usuario_id,assunto,mensagem) VALUES(?,?,?)")
    .run(req.usuario.id, assunto, mensagem);
  notificarAdmins("Nova dúvida de aluno", `Chamado #${info.lastInsertRowid}: ${assunto}`);
  res.status(201).json(get("chamados", info.lastInsertRowid));
});
r.get("/chamados", autenticar, (req, res) =>
  res.json(
    req.usuario.papel === "admin"
      ? db.prepare("SELECT * FROM chamados ORDER BY id DESC").all()
      : db
          .prepare("SELECT * FROM chamados WHERE usuario_id=? ORDER BY id DESC")
          .all(req.usuario.id),
  ),
);
r.patch("/chamados/:id", autenticar, admin, (req, res) => {
  const c = get("chamados", positiveId(req.params.id));
  if (!c) return res.sendStatus(404);
  if (!allowed(req.body.status, ["aberto", "em_andamento", "resolvido"]))
    return bad(res);
  const resposta = clean(req.body.resposta, 5000);
  db.prepare("UPDATE chamados SET status=?,resposta=? WHERE id=?").run(
    req.body.status, resposta, c.id,
  );
  if (resposta) db.prepare("INSERT INTO notificacoes(usuario_id,titulo,mensagem) VALUES(?,?,?)")
    .run(c.usuario_id, "Resposta da AAPM", `Sua dúvida "${c.assunto}" recebeu uma resposta: ${resposta}`);
  res.json(get("chamados", c.id));
});

// TROCA DE SENHA
r.use(require("./senha"));

// ROTA 404
r.use((_req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
module.exports = r;
