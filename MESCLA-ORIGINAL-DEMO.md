# Integração TechCampus Original + Demo IoT

Esta versão mantém a estrutura e a interface da versão Original e incorpora o token de retirada inspirado na Demo.

## O que foi integrado

- Token de retirada numérico de 6 dígitos, gerado no servidor somente após o pagamento ser confirmado.
- Token associado a um pedido no SQLite, com validade de 15 minutos e controle de uso único.
- Tela de teste da máquina IoT em `/Iot/retirada.html`.
- API para validar e confirmar a retirada; ao confirmar, o pedido passa para `entregue`, o token é marcado como usado e o aluno recebe uma notificação.
- Endpoints de compatibilidade para os nomes em português (`/api/iot/validar`, `/api/iot/confirmar`) e da Demo (`/api/iot/validate`, `/api/iot/confirm`).
- Renovação autenticada de token expirado em `POST /api/pedidos/:id/token/renovar`.
- Correção do status de pagamento: o banco original usa `confirmado`, não `pago`.
- Notificações persistentes dentro do sistema para pagamento, documentos, encerramento de conta, retirada e chamados.
- Foto de perfil JPG/PNG até 5 MB, atualização de nome/e-mail/telefone e encerramento de conta com confirmação de senha.
- Gestão de usuários no perfil administrativo: criar, editar, trocar perfil, redefinir senha e ativar/desativar contas.
- Painel de gerência da loja conectado às rotas `/api/admin/produtos` e `/api/admin/pedidos`.
- O login encaminha ambos os perfis para a tela integrada; o painel de gerência aparece para administradores.

## Configuração local

1. Instale o Node.js LTS.
2. Copie `.env.example` para `.env`.
3. Configure `JWT_SECRET` com um segredo aleatório de pelo menos 32 caracteres.
4. Para testes locais, configure `PAGAMENTO_SIMULADO=true`. Isso é apenas simulação; não processa dinheiro real.
5. Execute `npm ci`.
6. Execute `npm run seed` para criar produtos e um aluno de teste, se desejar.
7. Para criar uma conta administrativa, defina `ADMIN_EMAIL`, `ADMIN_PASSWORD` (mínimo 12 caracteres) e opcionalmente `ADMIN_NAME` no `.env`, depois execute `npm run admin:create`.
8. Execute `npm run dev` e abra `http://localhost:3001`.
9. Após uma compra de teste, o aluno verá o token na tela de sucesso. Abra `/Iot/retirada.html` em outra aba/dispositivo, informe o token, valide e confirme a retirada.

Conta de aluno de teste criada por `npm run seed`: `teste@techcampus.com` / `123456!`. Use apenas em ambiente local e altere/remova essa conta antes de publicar.

## Endpoints IoT

- `POST /api/iot/validar` ou `POST /api/iot/validate` — corpo JSON: `{ "token": "123456" }`.
- `POST /api/iot/confirmar` ou `POST /api/iot/confirm` — corpo JSON: `{ "token": "123456" }`.
- `GET /api/pedidos/:id/token` — devolve o token do pedido do próprio aluno (ou de qualquer pedido para admin), se pago e ainda válido.
- `POST /api/pedidos/:id/token/renovar` — emite um token novo de 15 minutos para pedido pago ainda não retirado.

## Observações importantes

- O arquivo `.env` e o banco SQLite com dados locais não são distribuídos neste ZIP. A aplicação cria o banco a partir do esquema ao iniciar. Se você já possui dados, faça backup e mantenha seu `techcampus.db` antes de substituir os arquivos.
- O modo de pagamento deste projeto é simulado. Integração com PIX/cartão real exige um provedor de pagamento e confirmação por webhook.
- A preferência de notificações por e-mail fica salva na interface, mas o envio real de e-mails precisa de um provedor SMTP/API.
- A página IoT incluída é uma interface de teste para a API. Antes de ligar a uma máquina real, proteja o dispositivo, a rede e o processo de confirmação.
