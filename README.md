# TechCampus — AAPM

Sistema web da Associação de Alunos, Ex-alunos, Pais e Mestres (AAPM).

## Como executar

No Windows, a inicialização do TechCampus deve ser feita pelo arquivo **`INICIAR.bat`**.

1. Verifique se o **Node.js** está instalado no computador.
2. Certifique-se de que o arquivo **`.env`** esteja configurado na pasta principal do projeto.
3. Abra a pasta do TechCampus.
4. Dê dois cliques em **`INICIAR.bat`**.
5. Aguarde a verificação do ambiente e a inicialização do servidor. Quando estiver pronto, a Landing Page será aberta no navegador.

O arquivo `INICIAR.bat` é o inicializador oficial do projeto no Windows. **Não é necessário iniciar o projeto manualmente pelos comandos `npm install` e `npm start` quando estiver utilizando esse arquivo.**

> **Importante:** mantenha a janela do servidor aberta enquanto estiver utilizando o TechCampus. Se ocorrer algum erro na inicialização, consulte a mensagem exibida no terminal. O arquivo `.env` contém configurações locais e não deve ser publicado com chaves ou senhas reais.

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
