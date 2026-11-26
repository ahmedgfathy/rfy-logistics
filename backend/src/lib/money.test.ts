import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateLineTotals, roundMoney, sumMoney } from './money';

test('rounds currency amounts with decimal-safe half-up rounding', () => {
  assert.equal(roundMoney('1.005', 'EGP').toString(), '1.01');
  assert.equal(roundMoney('1.2345', 'KWD').toString(), '1.235');
  assert.equal(sumMoney(['0.1', '0.2']).toString(), '0.3');
});

test('calculates discounted and taxed line totals in currency minor units', () => {
  const totals = calculateLineTotals({
    quantity: '2.5',
    unitPrice: '10.005',
    discountPercent: '10',
    taxPercent: '14',
    currency: 'EGP',
  });

  assert.equal(totals.subtotal.toString(), '22.51');
  assert.equal(totals.discount.toString(), '2.5');
  assert.equal(totals.tax.toString(), '3.15');
  assert.equal(totals.total.toString(), '25.66');
});
