# TechCampus — AAPM

Sistema web da Associação de Alunos, Ex-alunos, Pais e Mestres (AAPM).

## Como executar

Na pasta do projeto, execute:

```bash
npm install
npm start
```

Depois, acesse **http://localhost:3022/** no navegador.


## Recuperação de senha por e-mail

A recuperação utiliza a API de envio da Resend. Configure estas variáveis no arquivo `.env` (nunca publique suas chaves):

```env
RESEND_API_KEY=re_sua_chave
EMAIL_FROM=TechCampus <contato@seudominio.com>
APP_URL=http://localhost:3022
```

O remetente precisa estar autorizado/verificado na Resend. Em ambiente local, mantenha `APP_URL` apontando para o endereço e a porta do TechCampus. O link expira em 15 minutos e só pode ser usado uma vez. Sem essas variáveis, a interface informa que a recuperação por e-mail ainda não está configurada; nenhum token é exibido no navegador.

## Encerramento da conta do aluno

O aluno pode encerrar a própria conta em **Configurações → Segurança → Encerrar minha conta**, confirmando sua senha. O acesso é desativado, sessões emitidas pelo sistema são invalidadas e dados pessoais do perfil são removidos. Pedidos e pagamentos permanecem vinculados ao registro anonimizado para preservar o histórico financeiro.
