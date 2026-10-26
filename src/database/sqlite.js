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
CREATE TABLE IF NOT EXISTS pagamentos (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
 metodo TEXT NOT NULL CHECK(metodo IN ('pix','cartao')),
 valor_centavos INTEGER NOT NULL CHECK(valor_centavos >= 0),
 status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','confirmado','cancelado')),
 codigo TEXT,
 criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
// Migração compatível: metadados usados pelo painel administrativo e pelo calendário de avisos.
const colunasAvisos = db.prepare("PRAGMA table_info(avisos)").all().map((c) => c.name);
if (!colunasAvisos.includes("categoria")) db.exec("ALTER TABLE avisos ADD COLUMN categoria TEXT NOT NULL DEFAULT 'importante'");
if (!colunasAvisos.includes("data_evento")) db.exec("ALTER TABLE avisos ADD COLUMN data_evento TEXT");
if (!colunasAvisos.includes("horario")) db.exec("ALTER TABLE avisos ADD COLUMN horario TEXT");
if (!colunasAvisos.includes("local")) db.exec("ALTER TABLE avisos ADD COLUMN local TEXT");

// Avisos antigos foram criados antes de existir data_evento. Para que não
// desapareçam do calendário, usar a data de criação como data inicial.
// O administrador ainda pode ajustar a data pelo formulário de edição.
db.exec("UPDATE avisos SET data_evento = substr(criado_em, 1, 10) WHERE (data_evento IS NULL OR trim(data_evento) = '') AND criado_em IS NOT NULL AND length(criado_em) >= 10");

// Migração compatível: a interface da loja oferece PIX, cartão e dinheiro.
const pagamentosSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pagamentos'").get()?.sql || "";
if (!pagamentosSql.includes("'dinheiro'")) {
  db.exec(`
    BEGIN;
    CREATE TABLE pagamentos_novo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
      metodo TEXT NOT NULL CHECK(metodo IN ('pix','cartao','dinheiro')),
      valor_centavos INTEGER NOT NULL CHECK(valor_centavos >= 0),
      status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','confirmado','cancelado')),
      codigo TEXT,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO pagamentos_novo (id,pedido_id,metodo,valor_centavos,status,codigo,criado_em)
      SELECT id,pedido_id,metodo,valor_centavos,status,codigo,criado_em FROM pagamentos;
    DROP TABLE pagamentos;
    ALTER TABLE pagamentos_novo RENAME TO pagamentos;
    COMMIT;
  `);
}

// Migrações compatíveis com bancos existentes da versão original.
// Exclusão lógica de produtos: separa remover da loja de ativar/desativar e preserva pedidos antigos.
const colunasProdutos = db.prepare("PRAGMA table_info(produtos)").all().map((c) => c.name);
if (!colunasProdutos.includes("excluido")) db.exec("ALTER TABLE produtos ADD COLUMN excluido INTEGER NOT NULL DEFAULT 0 CHECK(excluido IN (0,1))");

const colunasUsuarios = db.prepare("PRAGMA table_info(usuarios)").all().map((c) => c.name);
if (!colunasUsuarios.includes("ativo")) db.exec("ALTER TABLE usuarios ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1");
if (!colunasUsuarios.includes("foto_url")) db.exec("ALTER TABLE usuarios ADD COLUMN foto_url TEXT");
module.exports = { db, ready: Promise.resolve() };
