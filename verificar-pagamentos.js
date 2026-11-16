/* Auditoria de pagamentos e tokens (somente leitura).
   Uso:  node verificar-pagamentos.js            -> só relata
         node verificar-pagamentos.js --corrigir -> também gera o token que faltar
   Faça uma cópia do techcampus.db antes de usar --corrigir. */
require("dotenv").config();
const crypto = require("crypto");
const { db } = require("./src/database/sqlite");

const corrigir = process.argv.includes("--corrigir");
let problemas = 0;

function checar(titulo, sql, { critico = true } = {}) {
  const linhas = db.prepare(sql).all();
  const marca = linhas.length === 0 ? "OK " : critico ? "ERRO" : "AVISO";
  console.log(`[${marca}] ${titulo}${linhas.length ? ` (${linhas.length})` : ""}`);
  if (linhas.length) {
    if (critico) problemas += linhas.length;
    for (const l of linhas.slice(0, 15)) console.log("       ", JSON.stringify(l));
    if (linhas.length > 15) console.log(`        ... e mais ${linhas.length - 15}`);
  }
  return linhas;
}

console.log("== Duplicidades ==");
checar("Pedidos com mais de um pagamento",
  "SELECT pedido_id, COUNT(*) qtd FROM pagamentos GROUP BY pedido_id HAVING COUNT(*)>1");
checar("Pedidos com mais de um token",
  "SELECT pedido_id, COUNT(*) qtd FROM tokens_retirada GROUP BY pedido_id HAVING COUNT(*)>1");
checar("Mesmo código de token usado em mais de um pedido",
  "SELECT token, COUNT(*) qtd FROM tokens_retirada GROUP BY token HAVING COUNT(*)>1");

console.log("\n== Consistência pagamento x token ==");
const semToken = checar("Pagamento confirmado, pedido pendente e SEM token",
  `SELECT pg.id AS pagamento_id, pg.pedido_id FROM pagamentos pg JOIN pedidos p ON p.id=pg.pedido_id
   WHERE pg.status='confirmado' AND p.status='pendente'
     AND NOT EXISTS (SELECT 1 FROM tokens_retirada t WHERE t.pedido_id=p.id)`);
checar("Token existente SEM pagamento confirmado",
  `SELECT t.id AS token_id, t.pedido_id FROM tokens_retirada t
   WHERE NOT EXISTS (SELECT 1 FROM pagamentos g WHERE g.pedido_id=t.pedido_id AND g.status='confirmado')`);
checar("Pedido entregue sem pagamento confirmado",
  `SELECT p.id AS pedido_id FROM pedidos p WHERE p.status='entregue'
   AND NOT EXISTS (SELECT 1 FROM pagamentos g WHERE g.pedido_id=p.id AND g.status='confirmado')`);
checar("Pagamento confirmado de pedido cancelado/rejeitado (fora da receita; verificar estorno)",
  `SELECT pg.id AS pagamento_id, pg.pedido_id, p.status AS pedido_status, pg.valor_centavos
   FROM pagamentos pg JOIN pedidos p ON p.id=pg.pedido_id
   WHERE pg.status='confirmado' AND p.status IN ('cancelado','rejeitado')`, { critico: false });

console.log("\n== Valores ==");
checar("Dinheiro com troco inconsistente (troco ≠ entregue − total, ou entregue < total)",
  `SELECT id AS pagamento_id, pedido_id, valor_centavos, valor_entregue_centavos, troco_centavos FROM pagamentos
   WHERE metodo='dinheiro' AND (valor_entregue_centavos IS NULL OR valor_entregue_centavos < valor_centavos
         OR troco_centavos IS NULL OR troco_centavos <> valor_entregue_centavos - valor_centavos)
     AND status <> 'cancelado'`);
checar("Cartão com parcelas inválidas (débito deve ser 1x; crédito ≥ 1x)",
  `SELECT id AS pagamento_id, pedido_id, tipo_cartao, parcelas FROM pagamentos
   WHERE metodo='cartao' AND (parcelas IS NULL OR parcelas < 1 OR (tipo_cartao='debito' AND parcelas <> 1))`);
checar("Valor do pagamento diferente do total do pedido",
  `SELECT pg.id AS pagamento_id, pg.pedido_id, pg.valor_centavos,
          (SELECT COALESCE(SUM(quantidade*preco_unitario_centavos),0) FROM itens_pedido WHERE pedido_id=pg.pedido_id) AS total_itens
   FROM pagamentos pg WHERE pg.status <> 'cancelado'
     AND pg.valor_centavos <> (SELECT COALESCE(SUM(quantidade*preco_unitario_centavos),0) FROM itens_pedido WHERE pedido_id=pg.pedido_id)`);

if (corrigir && semToken.length) {
  console.log("\n== Correção ==");
  db.transaction(() => {
    for (const x of semToken) {
      let t;
      do { t = String(crypto.randomInt(100000, 1000000)); }
      while (db.prepare("SELECT 1 FROM tokens_retirada WHERE token=?").get(t));
      db.prepare("INSERT INTO tokens_retirada(pedido_id,token,expira_em) VALUES(?,?,?)")
        .run(x.pedido_id, t, Date.now() + 15 * 60 * 1000);
      console.log(`  token gerado para o pedido #${x.pedido_id}`);
    }
  })();
  problemas -= semToken.length;
} else if (semToken.length) {
  console.log("\nDica: rode com --corrigir para gerar os tokens que faltam.");
}

console.log(problemas === 0 ? "\nTudo certo: nenhum problema crítico encontrado." : `\n${problemas} problema(s) crítico(s) encontrado(s).`);
process.exitCode = problemas === 0 ? 0 : 1;