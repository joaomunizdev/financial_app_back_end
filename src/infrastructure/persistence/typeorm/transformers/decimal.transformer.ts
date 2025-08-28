import { ValueTransformer } from "typeorm";

export const DecimalAsStringTransformer: ValueTransformer = {
  to: (value: string | number | null) => {
    if (value === null || value === undefined) return null;
    return typeof value === "number" ? value.toFixed(2) : value;
  },
  from: (value: unknown) => {
    if (value === null || value === undefined) return null as unknown as string;
    return String(value);
  },
};
