import type { Prisma } from '@prisma/client';
import { money, roundMoney, sumMoney } from '../../lib/money';
import { ApiError } from '../../middleware/error';

const MAX_EGP = money('9999999999999999.99');

function toEgp(value: Prisma.Decimal.Value) {
  const rounded = roundMoney(value, 'EGP');
  if (rounded.gt(MAX_EGP)) {
    throw ApiError.badRequest('A calculated customs amount exceeds the supported decimal range');
  }
  return rounded;
}

export interface DeclarationLineCalculationInput {
  customsValue: Prisma.Decimal.Value;
  exchangeRate: Prisma.Decimal.Value;
  dutyRatePercent: Prisma.Decimal.Value;
  taxRatePercent: Prisma.Decimal.Value;
  otherAmount: Prisma.Decimal.Value;
}

export function calculateDeclarationLine(input: DeclarationLineCalculationInput) {
  const cifValueEgp = toEgp(money(input.customsValue).times(input.exchangeRate));
  const dutyAmount = toEgp(cifValueEgp.times(input.dutyRatePercent).div(100));
  const taxAmount = toEgp(cifValueEgp.times(input.taxRatePercent).div(100));
  const otherAmount = toEgp(input.otherAmount);
  const totalAmount = toEgp(sumMoney([cifValueEgp, dutyAmount, taxAmount, otherAmount]));

  return {
    cifValueEgp,
    dutyAmount,
    taxAmount,
    otherAmount,
    totalAmount,
  };
}

export function calculateDeclarationTotals(
  lines: Array<ReturnType<typeof calculateDeclarationLine>>,
  paidAmount: Prisma.Decimal.Value,
) {
  const paid = money(paidAmount);
  if (paid.isNegative() || paid.gt(MAX_EGP)) {
    throw ApiError.badRequest('Paid amount is outside the supported decimal range');
  }

  const totalCifEgp = toEgp(sumMoney(lines.map((line) => line.cifValueEgp)));
  const totalDuty = toEgp(sumMoney(lines.map((line) => line.dutyAmount)));
  const totalTax = toEgp(sumMoney(lines.map((line) => line.taxAmount)));
  const totalFees = toEgp(sumMoney(lines.map((line) => line.otherAmount)));
  const totalPayable = toEgp(sumMoney([totalDuty, totalTax, totalFees]));
  const rawBalance = totalPayable.minus(paid);
  const balance = toEgp(rawBalance.isNegative() ? money(0) : rawBalance);

  return {
    totalCifEgp,
    totalDuty,
    totalTax,
    totalFees,
    totalPayable,
    balance,
  };
}
