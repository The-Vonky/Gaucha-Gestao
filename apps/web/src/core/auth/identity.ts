export const identityEnabled = import.meta.env.VITE_GG_IDENTITY_ENABLED === "true";
export const MIN_EMPLOYEE_PASSWORD_LENGTH = 8;
export const MAX_EMPLOYEE_PASSWORD_BYTES = 72;

export type IdentityStatus = {
  passwordChangeRequired: boolean;
  provision: boolean;
  resetPassword: boolean;
};

type CredentialResult = { userId: string; temporaryPassword: string };

const errors: Record<string, string> = {
  invalid_password: `Confira a senha temporária e informe duas senhas definitivas iguais, com pelo menos ${MIN_EMPLOYEE_PASSWORD_LENGTH} caracteres.`,
  password_rejected: "O serviço de autenticação recusou a troca. Confira a senha temporária e escolha outra senha definitiva.",
  reconciliation_required: "O resultado precisa de conferência pela administração. Preserve o protocolo e não repita a operação.",
  operator_login_required: "Para redefinir uma senha, saia e entre novamente com sua senha.",
  operation_conflict: "A operação está indisponível para esta conta ou os dados mudaram. Atualize a página e confira o cadastro.",
};

class IdentityError extends Error {}
export const identityErrorMessage = (error: unknown) => error instanceof IdentityError
  ? error.message
  : "Não foi possível concluir a operação de identidade. Verifique a conexão e consulte a situação do cadastro.";

async function request<T>(token: string, path: string, body?: object): Promise<T> {
  const response = await fetch(`/auth/v1/identity${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const protocol = typeof error.operation === "string" && /^[0-9a-f-]{36}$/i.test(error.operation)
      ? ` Protocolo ${error.operation}.`
      : "";
    const message = typeof error.code === "string" && Object.hasOwn(errors, error.code)
      ? errors[error.code]
      : "Operação de identidade indisponível.";
    throw new IdentityError(message + protocol);
  }
  return response.json();
}

export const identityStatus = (token: string) => request<IdentityStatus>(token, "/me");

export function createEmployee(token: string, input: {
  name: string;
  email: string;
  roleId: string | null;
  unitId: string | null;
  sectorId: string | null;
  verified: boolean;
}) {
  return request<CredentialResult>(token, "/users", { ...input, operation: crypto.randomUUID() });
}

export function resetEmployeePassword(token: string, userId: string, version: number) {
  return request<CredentialResult>(token, `/users/${userId}/password-reset`, {
    operation: crypto.randomUUID(),
    version,
    verified: true,
  });
}

export async function defineEmployeePassword(token: string, currentPassword: string, password: string, confirmation: string) {
  const encoder = new TextEncoder();
  if ([currentPassword, password].some((value) => encoder.encode(value).length > MAX_EMPLOYEE_PASSWORD_BYTES)) {
    throw new IdentityError(`Cada senha pode ter até ${MAX_EMPLOYEE_PASSWORD_BYTES} bytes. Caracteres com acento e outros símbolos podem ocupar mais de um byte.`);
  }
  if (!currentPassword || [currentPassword, password].some((value) => value.includes("\0"))
      || [...password].length < MIN_EMPLOYEE_PASSWORD_LENGTH || password !== confirmation || password === currentPassword) {
    throw new IdentityError(errors.invalid_password);
  }
  return request<{ loginRequired: true }>(token, "/me/password", {
    operation: crypto.randomUUID(),
    currentPassword,
    password,
    confirmation,
  });
}
