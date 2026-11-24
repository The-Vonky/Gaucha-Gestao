# Desenvolvimento no Windows com WSL2

Use Windows com WSL2, uma distribuição Linux, Docker Desktop com backend WSL2 e Linux containers. Habilite a integração da distribuição escolhida no Docker Desktop. Instale Git, Node.js ≥ 22.12, npm e Python ≥ 3.11 **dentro da distribuição**, com acesso a Docker e Compose v2 ou superior. O Engine deve aceitar bridge com gateway `isolated`, e o Compose deve oferecer `up --wait`. [Integração WSL2 do Docker Desktop](https://docs.docker.com/desktop/features/wsl/)

## Preparar o checkout

Abra Docker Desktop, aguarde o Engine e use o terminal Bash da distribuição. Confira `docker context show`, `docker version`, `docker compose version` e `docker compose ls --all`. O destino deve ser o Engine local do Docker Desktop. Clone o repositório no filesystem Linux da distribuição, por exemplo em `~/projetos`. Use Bash para npm, scripts Python e Compose. O provisionador usa permissões e locking POSIX.

Na primeira instalação, abra o diretório de projetos e clone o repositório:

```bash
git clone https://github.com/The-Vonky/Gaucha-Gestao.git
cd Gaucha-Gestao
```

Siga o [procedimento compartilhado de instalação](DOCKER_LOCAL_STANDARDIZATION.md#instalação-inicial-em-máquina-nova) para `npm ci`, arquivos privados, migrations e configuração do frontend. Para instalação interrompida, siga a [retomada](DOCKER_LOCAL_STANDARDIZATION.md#retomada-de-instalação-interrompida). Para Identity, use o [runbook GG-05B](GG_05B_IDENTIDADE_DEV.md) na mesma distribuição.

## Uso diário, persistência e reboot

Abra o Docker Desktop e confira os healthchecks do projeto. Os dados persistem em volumes nomeados, e `restart: unless-stopped` permite a retomada quando o Engine fica disponível. Para uma parada explícita, consulte o [diagnóstico compartilhado](DOCKER_LOCAL_STANDARDIZATION.md#diagnóstico), incluindo a composição correta com ou sem Identity.

No WSL, execute `npm run dev` na raiz se o Vite estiver parado. O [runbook compartilhado](DOCKER_LOCAL_STANDARDIZATION.md#uso-diário) informa portas, flags e diagnóstico de API e Studio. Confira o acesso pelo navegador Windows usando os endereços loopback.

## Histórico de retomada

A [PR #121](https://github.com/The-Vonky/Gaucha-Gestao/pull/121) padronizou o Compose local. A [PR #122](https://github.com/The-Vonky/Gaucha-Gestao/pull/122) incorporou as configurações de PostgreSQL e Kong às imagens para remover a dependência dos bind mounts de arquivos WSL no boot. O Agendador de Tarefas foi um contorno anterior. O [registro do incidente e da recuperação](DOCKER_LOCAL_STANDARDIZATION.md#retomada-nativa-após-reboot-windowswsl2) explica quando a limpeza da tarefa antiga é pertinente.

DOC-01 usou a configuração versionada e os registros das PRs como referência para Windows. Esta revisão documental não incluiu uma nova validação física em Windows.
