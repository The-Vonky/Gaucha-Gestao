# Instruções para Claude Code — Gaúcha Gestão

Este arquivo contém apenas orientações específicas para o Claude. A **fonte comum e obrigatória** para qualquer agente é [AGENTS.md](AGENTS.md). Em conflito, siga o brief/issue autorizados e os ADRs aceitos, conforme a hierarquia do `AGENTS.md`.

- Trabalhe e responda em **português brasileiro (pt-BR)**. Preserve nomes de comandos, arquivos, funções, schemas e identificadores técnicos.
- Restrinja a exploração ao módulo da tarefa e aos documentos relevantes; evite varreduras integrais sem motivo.
- Prefira **uma tarefa focalizada por sessão**, com critérios de aceite claros.
- Use brief/issue e estado Git como fonte de continuidade, **não** o histórico de conversas com modelos.
- Ao assumir a tarefa de outro agente, verifique `git status`, branch, diff e commits recentes **antes** de modificar arquivos. Não sobrescreva trabalho paralelo.
- Não produza documentos extras nem resumos redundantes sem necessidade da tarefa; **documentação solicitada ou exigida por mudança de contrato é parte do escopo**, não material extra.
- Execute verificações pertinentes e relate as que não foram executadas; não confunda CI com homologação produtiva.
- Não execute merges, operações destrutivas ou ações em ambientes persistentes sem autorização aplicável.

Leitura inicial: [README](README.md) → [AGENTS](AGENTS.md) → brief/issue → contratos/ADRs e arquivos afetados.
