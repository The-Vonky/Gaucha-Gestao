export function message(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (code === "PGRST116")
    return "Não foi possível concluir a operação. O registro pode ter sido alterado, estar indisponível ou seu acesso pode ter mudado. Atualize a página e tente novamente.";
  if (code === "40001")
    return "Este registro foi alterado ou não está mais disponível. Atualize a página e tente novamente.";
  if (code === "23505")
    return "Já existe um registro com esse código ou atribuição.";
  if (code === "23503")
    return "Este vínculo possui referências. Preserve-o para manter o histórico.";
  if (code === "23514" || code === "22P02")
    return "Confira os campos e o escopo. Usuário, perfil, unidade e setor precisam estar ativos.";
  if (code === "55000")
    return "Esta operação não é permitida no estado atual do registro.";
  if (code === "42501")
    return "Você não tem permissão para esta operação. Atualize seu acesso.";
  return "Não foi possível concluir a operação. Verifique sua conexão e tente novamente.";
}
