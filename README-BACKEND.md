# Backend e Login do TechCampus

O backend do TechCampus usa o mesmo padrão de autenticação do Projeto-Pizzaria:

- Express para a API
- SQLite para persistência
- bcryptjs para hash/comparação de senhas
- JSON Web Token (JWT) para autenticação
- middleware para validar o token nas rotas protegidas
- `sessionStorage` no front-end para manter a sessão durante a navegação

## Instalação

Na raiz do projeto:

```bash
npm install
npm start
```

Configure `JWT_SECRET` com pelo menos 32 caracteres no `.env`.

## Usuário de teste

Execute:

```bash
node seed.js
```

Depois use:

- E-mail: `teste@techcampus.com`
- Senha: `Teste123456!`

## Fluxo do login

1. A landing abre `/frontend/login.html`.
2. `login.js` envia e-mail e senha para `POST /api/auth/login`.
3. O backend compara a senha com o hash usando bcrypt.
4. O backend gera um JWT.
5. O front-end salva o token e os dados do usuário na sessão.
6. O navegador redireciona para `/frontend/sistema.html`.
7. `auth.js` consulta `/api/perfil` com `Authorization: Bearer <token>`.
8. Se o token for válido, o sistema permanece aberto; se não for, volta para o login.
