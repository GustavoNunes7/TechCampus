const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const dbPath = path.resolve(
  process.env.DB_PATH || path.join(__dirname, "../../techcampus.db"),
);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
 id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 senha_hash TEXT NOT NULL, papel TEXT NOT NULL DEFAULT 'aluno' CHECK(papel IN ('aluno','admin')),
 turma TEXT, telefone TEXT, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS recuperacoes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, expira_em INTEGER NOT NULL, usado INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS produtos (
 id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, descricao TEXT DEFAULT '',
 categoria TEXT NOT NULL, preco_centavos INTEGER NOT NULL DEFAULT 0 CHECK(preco_centavos >= 0),
 estoque INTEGER NOT NULL DEFAULT 0 CHECK(estoque >= 0), imagem TEXT, ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS pedidos (
 id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
 status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','aprovado','rejeitado','entregue','cancelado')),
 observacao TEXT DEFAULT '', criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS itens_pedido (
 id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
 produto_id INTEGER NOT NULL REFERENCES produtos(id), quantidade INTEGER NOT NULL CHECK(quantidade > 0),
 preco_unitario_centavos INTEGER NOT NULL CHECK(preco_unitario_centavos >= 0)
);
CREATE TABLE IF NOT EXISTS documentos (
 id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
 nome TEXT NOT NULL, arquivo TEXT NOT NULL, mime TEXT NOT NULL, tamanho INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','aprovado','rejeitado')),
 observacao TEXT DEFAULT '', criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS avisos (
 id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, conteudo TEXT NOT NULL,
 publicado INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS agendamentos (
 id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
 recurso TEXT NOT NULL, inicio TEXT NOT NULL, fim TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','aprovado','rejeitado','cancelado')),
 criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chamados (
 id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
 assunto TEXT NOT NULL, mensagem TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto','em_andamento','resolvido')),
 resposta TEXT DEFAULT '', criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS formatura (
 id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, descricao TEXT NOT NULL,
 data_evento TEXT, publicado INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
module.exports = { db, ready: Promise.resolve() };
