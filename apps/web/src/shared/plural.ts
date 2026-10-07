/** "1 plano" / "2 planos": Portuguese count + noun, without "(s)" placeholders. */
export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}
