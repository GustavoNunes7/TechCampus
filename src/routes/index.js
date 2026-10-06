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
    if (!u || !(await bcrypt.compare(senha, u.senha_hash)))
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
  res.json(publicUser(u));
});
r.patch("/perfil", autenticar, (req, res) => {
  const u = get("usuarios", req.usuario.id);
  if (!u) return res.sendStatus(401);
  const nome = req.body.nome === undefined ? u.nome : clean(req.body.nome, 100),
    turma = req.body.turma === undefined ? u.turma : clean(req.body.turma, 60),
    telefone =
      req.body.telefone === undefined
        ? u.telefone
        : clean(req.body.telefone, 25);
  if (nome.length < 2) return bad(res, "Nome inválido.");
  db.prepare("UPDATE usuarios SET nome=?,turma=?,telefone=? WHERE id=?").run(
    nome,
    turma,
    telefone,
    u.id,
  );
  res.json(publicUser(get("usuarios", u.id)));
});
r.get("/usuarios", autenticar, admin, (_req, res) =>
  res.json(
    db
      .prepare(
        "SELECT id,nome,email,papel,turma,telefone,criado_em FROM usuarios ORDER BY id DESC",
      )
      .all(),
  ),
);
// Produtos
r.get("/produtos", (req, res) => {
  const categoria = clean(req.query.categoria, 50);
  res.json(
    categoria
      ? db
          .prepare(
            "SELECT * FROM produtos WHERE ativo=1 AND categoria=? ORDER BY id DESC",
          )
          .all(categoria)
      : db
          .prepare("SELECT * FROM produtos WHERE ativo=1 ORDER BY id DESC")
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
// Pedidos: reserva atômica do estoque
r.post("/pedidos", autenticar, (req, res) => {
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
// Pagamentos
r.post("/pedidos/:id/pagamento", autenticar, (req, res) => {
  const pedidoId = positiveId(req.params.id);
  const metodo = req.body.metodo;

  if (!allowed(metodo, ["pix", "cartao"]))
    return bad(res, "Forma de pagamento inválida.");

  const pedido = get("pedidos", pedidoId);

  if (!pedido)
    return res.status(404).json({ erro: "Pedido não encontrado." });

  if (pedido.usuario_id !== req.usuario.id && req.usuario.papel !== "admin")
    return res.sendStatus(403);

  if (pedido.status !== "pendente")
    return bad(res, "Este pedido não pode receber pagamento.");

  const existente = db
    .prepare("SELECT * FROM pagamentos WHERE pedido_id=?")
    .get(pedidoId);

  if (existente)
    return res.json(existente);

  const total = db
    .prepare(
      "SELECT COALESCE(SUM(quantidade * preco_unitario_centavos), 0) AS total FROM itens_pedido WHERE pedido_id=?",
    )
    .get(pedidoId).total;

  const codigo =
    metodo === "pix"
      ? crypto.randomBytes(16).toString("hex")
      : null;

  const info = db
    .prepare(
      "INSERT INTO pagamentos(pedido_id,metodo,valor_centavos,codigo) VALUES(?,?,?,?)",
    )
    .run(pedidoId, metodo, total, codigo);

  res.status(201).json(get("pagamentos", info.lastInsertRowid));
});

r.post("/pedidos/:id/cancelar", autenticar, (req, res) => {
  const pedido = get("pedidos", positiveId(req.params.id));

  if (!pedido)
    return res.status(404).json({ erro: "Pedido não encontrado." });

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

  db.prepare("UPDATE pagamentos SET status='pago' WHERE id=?").run(pagamento.id);
    if (process.env.PAGAMENTO_SIMULADO !== "true") return res.sendStatus(404);


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
    const pg = db.prepare("SELECT status FROM pagamentos WHERE pedido_id=?").get(p.id);
    if (!pg || pg.status !== "pago") return bad(res, "Pagamento não confirmado.");
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
// Documentos: arquivos privados, acesso autenticado, PDF/JPG/PNG até 10 MB
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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(
      null,
      ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype),
    ),
});
r.post("/documentos", autenticar, (req, res, next) =>
  upload.single("arquivo")(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message });
    if (!req.file) return bad(res, "Envie um PDF, JPG ou PNG de até 10 MB.");
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
  res.json(get("documentos", d.id));
});
// Conteúdo informativo (avisos e formatura)
for (const table of ["avisos", "formatura"]) {
  r.get("/" + table, (req, res) =>
    res.json(
      db
        .prepare(`SELECT * FROM ${table} WHERE publicado=1 ORDER BY id DESC`)
        .all(),
    ),
  );
  r.post("/" + table, autenticar, admin, (req, res) => {
    const titulo = clean(req.body.titulo, 150),
      conteudo = clean(
        req.body[table === "avisos" ? "conteudo" : "descricao"],
        5000,
      );
    if (!titulo || !conteudo) return bad(res);
    const info =
      table === "avisos"
        ? db
            .prepare("INSERT INTO avisos(titulo,conteudo) VALUES(?,?)")
            .run(titulo, conteudo)
        : db
            .prepare(
              "INSERT INTO formatura(titulo,descricao,data_evento) VALUES(?,?,?)",
            )
            .run(titulo, conteudo, clean(req.body.data_evento, 40));
    res.status(201).json(get(table, info.lastInsertRowid));
  });
  r.delete("/" + table + "/:id", autenticar, admin, (req, res) => {
    const info = db
      .prepare(`UPDATE ${table} SET publicado=0 WHERE id=?`)
      .run(positiveId(req.params.id));
    res.status(info.changes ? 204 : 404).end();
  });
}

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
    .prepare("INSERT INTO agendamentos(usuario_id,recurso,inicio,fim) VALUES(?,?,?,?)")
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
  db.prepare("UPDATE chamados SET status=?,resposta=? WHERE id=?").run(
    req.body.status,
    clean(req.body.resposta, 5000),
    c.id,
  );
  res.json(get("chamados", c.id));
});

// TROCA DE SENHA
r.use(require("./senha"));

// ROTA 404 
r.use((_req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
module.exports = r;
