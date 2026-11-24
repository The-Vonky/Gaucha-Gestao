# Desenvolvimento no Ubuntu nativo

Ubuntu 26.04 LTS é a referência principal do mantenedor. Use Git, Node.js ≥ 22.12, npm, Python ≥ 3.11, Docker Engine nativo e Docker Compose v2 ou superior. O Engine deve aceitar bridge com gateway `isolated`, e o Compose deve oferecer `up --wait`. NVM pode gerenciar o Node. Escolha um diretório com espaço para o checkout e as dependências.

## Preparar e conferir o Docker

Use o Engine Linux local, com acesso do seu usuário ao daemon. Confira as ferramentas e o contexto antes de instalar ou retomar:

```bash
git --version
node --version
npm --version
python3 --version
docker context show
docker version
docker compose version
docker compose ls --all
```

Confirme que o contexto aponta para o Engine local esperado. Se o daemon não responder e a instalação usar systemd, consulte `systemctl status docker` e resolva a partida do daemon antes de operar no projeto. Em caso de porta ocupada, identifique o processo antes de alterar qualquer configuração.

## Instalação e retomada

Na primeira instalação, abra o diretório de projetos e clone o repositório:

```bash
git clone https://github.com/The-Vonky/Gaucha-Gestao.git
cd Gaucha-Gestao
```

Execute o [procedimento compartilhado](DOCKER_LOCAL_STANDARDIZATION.md#instalação-inicial-em-máquina-nova) em Bash na raiz do checkout. Ele cobre dependências, arquivo privado, migrations e configuração do Vite. Para uma instalação incompleta, consulte a [retomada por revisão Git](DOCKER_LOCAL_STANDARDIZATION.md#retomada-de-instalação-interrompida). Para acrescentar Identity, siga o [runbook GG-05B](GG_05B_IDENTIDADE_DEV.md).

## Uso diário e após reboot

Com o Engine disponível, o Compose usa `restart: unless-stopped`. Confira os serviços do projeto antes de subir o Vite. Se houve parada explícita ou algum serviço continua indisponível, use o [diagnóstico compartilhado](DOCKER_LOCAL_STANDARDIZATION.md#diagnóstico) para escolher a ação adequada ao perfil em uso.

Execute `npm run dev` na raiz, se o Vite estiver parado. Consulte o [runbook compartilhado](DOCKER_LOCAL_STANDARDIZATION.md#uso-diário) para portas, configuração local e acesso ao Studio.
