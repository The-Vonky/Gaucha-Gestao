import { useCallback, useState } from "react";
import { createEmployee, identityErrorMessage } from "../auth/identity";
import { useResource } from "../../shared/useResource";
import { Form, Modal, Notice } from "../../shared/ui";
import * as api from "./api";

export function EmployeeRegistration({ token, onClose, onCreated }: {
  token: string;
  onClose: () => void;
  onCreated: (password: string) => void;
}) {
  const options = useResource(useCallback(async () => {
    const [roles, permissions, units, sectors, links] = await Promise.all([
      api.all("roles"), api.all("role_permissions"), api.all("units"),
      api.all("sectors"), api.all("unit_sectors"),
    ]);
    const administrative = new Set(permissions.filter((permission) => permission.permission_key.startsWith("admin."))
      .map((permission) => permission.role_id));
    return {
      roles: roles.filter((role) => role.active && !role.global_only && !administrative.has(role.id)),
      units: units.filter((unit) => unit.active),
      sectors: sectors.filter((sector) => sector.active),
      links,
    };
  }, []));
  const [role, setRole] = useState("");
  const [unit, setUnit] = useState("");
  const [sector, setSector] = useState("");
  const data = options.data;
  return (
    <Modal title="Novo usuário" onClose={onClose}>
      {options.loading && <p>Carregando papéis e escopos…</p>}
      {options.error && <Notice error>{options.error}</Notice>}
      {data && <Form formatError={identityErrorMessage} onCancel={onClose} onSave={async (fields) => {
        const result = await createEmployee(token, {
          name: String(fields.get("name")),
          email: String(fields.get("email")),
          roleId: role || null,
          unitId: unit || null,
          sectorId: sector || null,
          verified: fields.get("verified") === "on",
        });
        onCreated(result.temporaryPassword);
      }}>
        <label>Nome completo<input required maxLength={160} name="name" autoComplete="off" /></label>
        <label>E-mail individual<input required maxLength={254} name="email" type="email" autoComplete="off" /></label>
        <label>Papel institucional
          <select value={role} onChange={(event) => {
            setRole(event.target.value);
            setUnit("");
            setSector("");
          }}>
            <option value="">Sem papel operacional</option>
            {data.roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {role && <label>Unidade
          <select required value={unit} onChange={(event) => {
            setUnit(event.target.value);
            setSector("");
          }}>
            <option value="">Selecione a unidade</option>
            {data.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        {unit && <label>Setor
          <select value={sector} onChange={(event) => setSector(event.target.value)}>
            <option value="">Toda a unidade</option>
            {data.sectors.filter((item) => data.links.some((link) => link.unit_id === unit && link.sector_id === item.id))
              .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        <label className="check">
          <input type="checkbox" name="verified" required />
          Confirmei a identidade do funcionário e o endereço de e-mail.
        </label>
      </Form>}
    </Modal>
  );
}

export function TemporaryPassword({ password, onClose }: { password: string; onClose: () => void }) {
  return (
    <Modal title="Senha temporária" onClose={onClose}>
      <p>Entregue a senha ao funcionário por um canal privado. Ela será exibida somente nesta tela.</p>
      <label>Senha temporária<input value={password} readOnly onFocus={(event) => event.target.select()} /></label>
      <div className="actions"><button className="primary" type="button" onClick={onClose}>Concluir</button></div>
    </Modal>
  );
}
