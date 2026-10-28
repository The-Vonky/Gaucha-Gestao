/** Dinheiro atravessa a API como string; nunca converter para Number/parseFloat. */
export type DecimalAmount = string;
export type PaymentMethod = "Stone" | "PIX";

export type SalesEntry = {
  id: string;
  sale_date: string;
  unit_id: string;
  payment_method: PaymentMethod;
  amount: DecimalAmount;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type EntryInput = {
  sale_date: string;
  unit_id: string;
  payment_method: PaymentMethod;
  amount: DecimalAmount;
};

export type EntryFilters = {
  from?: string;
  to?: string;
  unit_id?: string;
  payment_method?: PaymentMethod;
  limit?: number;
  offset?: number;
};
