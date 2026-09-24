import { Notice, PageTitle } from "../../shared/ui";
export function AuditEntry() {
  return (
    <>
      <PageTitle
        title="Auditorias"
        description="Qualidade · Auditorias operacionais"
      />
      <Notice>
        Seu acesso ao módulo está reconhecido. A migração das inspeções e
        checklists será realizada em uma etapa posterior.
      </Notice>
    </>
  );
}
