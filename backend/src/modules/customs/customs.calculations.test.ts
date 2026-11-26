import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateDeclarationLine, calculateDeclarationTotals } from './customs.calculations';

test('calculates CIF, duty, tax, fees and payable without binary floating point', () => {
  const line = calculateDeclarationLine({
    customsValue: '1000',
    exchangeRate: '30.5',
    dutyRatePercent: '10',
    taxRatePercent: '14',
    otherAmount: '2.25',
  });
  const totals = calculateDeclarationTotals([line], '100');

  assert.equal(line.cifValueEgp.toString(), '30500');
  assert.equal(line.dutyAmount.toString(), '3050');
  assert.equal(line.taxAmount.toString(), '4270');
  assert.equal(line.totalAmount.toString(), '37822.25');
  assert.equal(totals.totalPayable.toString(), '7322.25');
  assert.equal(totals.balance.toString(), '7222.25');
});

test('clamps overpayment to a zero balance but preserves the recorded payment', () => {
  const line = calculateDeclarationLine({
    customsValue: '100',
    exchangeRate: '1',
    dutyRatePercent: '0',
    taxRatePercent: '14',
    otherAmount: '0',
  });
  const totals = calculateDeclarationTotals([line], '20');

  assert.equal(totals.totalPayable.toString(), '14');
  assert.equal(totals.balance.toString(), '0');
});

test('rejects negative or out-of-range recorded payments', () => {
  assert.throws(() => calculateDeclarationTotals([], '-1'), /outside the supported decimal range/);
  assert.throws(() => calculateDeclarationTotals([], '10000000000000000'), /outside the supported decimal range/);
});
