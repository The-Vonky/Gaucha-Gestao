# Claude Code Instructions

Read and follow `AGENTS.md` at the repository root as the shared source of implementation rules.

Claude-specific guidance:
- Keep repository exploration narrow; do not read unrelated modules or architecture documents.
- Prefer one focused task per session.
- Use the task brief and Git state as the handoff source of truth rather than relying on prior chat history.
- When continuing work started by another agent, inspect `git status`, the current diff and recent focused commits before editing.
- Do not create extra documentation or summaries unless requested.
