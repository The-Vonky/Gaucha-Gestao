/** Conversão explícita BR → API, sem arredondamento ou ponto flutuante. */
export function parseAmount(value: string): string {
  const input = value.trim();
  if (!/^(?:[0-9]+|[1-9][0-9]{0,2}(?:\.[0-9]{3})+)(?:,[0-9]{1,2})?$/.test(input))
    throw new Error("Informe valor positivo em reais com até duas casas decimais, como 1.250,30.");
  const [whole, fraction = ""] = input.replaceAll(".", "").split(",");
  const integer = whole.replace(/^0+(?=\d)/, "");
  const cents = fraction.padEnd(2, "0");
  if (integer.length > 12 || (integer === "0" && cents === "00"))
    throw new Error("Informe valor entre R$ 0,01 e R$ 999.999.999.999,99.");
  return `${integer}.${cents}`;
}

export function amountInput(value: string): string {
  if (!/^(0|[1-9][0-9]*)\.[0-9]{2}$/.test(value))
    throw new Error("Valor monetário incompatível.");
  const [integer, fraction] = value.split(".");
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction}`;
}
export const money = (value: string) => `R$ ${amountInput(value)}`;
export const civilDate = (value: string) => value.split("-").reverse().join("/");
export function today() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)!.value).join("-");
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
