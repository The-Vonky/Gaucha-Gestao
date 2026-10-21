# ADR-002 — Propriedade do Core e dos módulos

**Status: Aceito**  
**Data: 24/09/2026**

## Contexto

Sistemas legados independentes podem conter versões próprias de unidades, usuários, arquivos, navegação e outros conceitos compartilhados.

Copiar esses conceitos para a plataforma integrada manteria a fragmentação dentro de um único repositório.

Mover tudo que parece comum para um Core gigante causaria o problema oposto: um domínio compartilhado excessivamente acoplado.

## Decisão

O **Core** detém apenas conceitos e capacidades corporativas/de plataforma **estáveis**.

Candidatos iniciais ao Core:
- identidade/perfil;
- autorização;
- unidades organizacionais;
- setores;
- escopo organizacional do usuário;
- auditoria sistêmica;
- capacidade comum de arquivos/anexos, quando o desenho de Storage estiver aprovado.

Cada módulo de negócio detém seus registros, regras e jornadas específicos.

A direção de dependência é **unidirecional**: módulos podem depender do Core; o Core nunca depende de módulos de negócio.

## Consequências

- módulos compartilham identidades corporativas canônicas, sem cópias privadas;
- migração de módulos requer mapear os cadastros mestres legados para o Core;
- aliases e mapeamentos de importação específicos continuam dentro dos módulos;
- relatórios executivos devem consumir contratos públicos dos módulos, não transformar o Core em uma cópia de todos os dados de negócio.

## Regra de proteção

Um campo, tabela ou componente não pertence ao Core apenas porque dois módulos têm necessidades semelhantes. Movê-lo para Core/Shared somente quando sua semântica for estável e realmente transversal à plataforma.
