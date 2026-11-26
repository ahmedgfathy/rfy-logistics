import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;

export function money(value: Prisma.Decimal.Value): Money {
  return new Prisma.Decimal(value);
}

export function sumMoney(values: Prisma.Decimal.Value[]): Money {
  return values.reduce<Money>((total, value) => total.plus(value), money(0));
}

export function currencyScale(currency: string): number {
  return ['KWD', 'BHD', 'OMR'].includes(currency.toUpperCase()) ? 3 : 2;
}

export function roundMoney(value: Prisma.Decimal.Value, currency: string): Money {
  const decimal = money(value);
  const factor = new Prisma.Decimal(10).pow(currencyScale(currency));
  return decimal.mul(factor).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).div(factor);
}

export function calculateLineTotals(input: {
  quantity: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  discountPercent?: Prisma.Decimal.Value;
  taxPercent?: Prisma.Decimal.Value;
  currency: string;
}) {
  const quantity = money(input.quantity);
  const unitPrice = money(input.unitPrice);
  const discountPercent = money(input.discountPercent ?? 0);
  const taxPercent = money(input.taxPercent ?? 0);
  const gross = roundMoney(quantity.mul(unitPrice), input.currency);
  const discount = roundMoney(gross.mul(discountPercent).div(100), input.currency);
  const subtotal = roundMoney(gross.minus(discount), input.currency);
  const tax = roundMoney(subtotal.mul(taxPercent).div(100), input.currency);
  const total = roundMoney(subtotal.plus(tax), input.currency);
  return { subtotal, discount, tax, total };
}
