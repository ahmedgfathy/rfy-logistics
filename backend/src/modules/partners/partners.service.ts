import type { Prisma } from '@prisma/client';
import type { BusinessPartner } from '@prisma/client';
import { nextNumber } from '../../lib/numbers';

export interface LeadCustomerInput {
  reference: string;
  fullName: string;
  companyName: string | null;
  email: string;
  phone: string;
  destinationCity: string;
  destinationCountry: string;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function findOrCreateLeadCustomer(
  tx: Prisma.TransactionClient,
  companyId: string,
  lead: LeadCustomerInput,
): Promise<{ partner: BusinessPartner; created: boolean; upgraded: boolean }> {
  const normalizedEmail = normalizeEmail(lead.email);
  const existing = await tx.businessPartner.findFirst({
    where: { companyId, email: normalizedEmail, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    if (existing.type === 'VENDOR') {
      const partner = await tx.businessPartner.update({
        where: { id: existing.id },
        data: { type: 'BOTH' },
      });
      return { partner, created: false, upgraded: true };
    }
    return { partner: existing, created: false, upgraded: false };
  }

  const countryCode = lead.destinationCountry.trim().toUpperCase();
  const partner = await tx.businessPartner.create({
    data: {
      companyId,
      code: await nextNumber(tx, companyId, 'PARTNER', 'BP'),
      type: 'CUSTOMER',
      nameEn: lead.companyName?.trim() || lead.fullName.trim(),
      legalName: lead.companyName?.trim() || null,
      email: normalizedEmail,
      phone: lead.phone,
      countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : 'EG',
      shippingAddress: [lead.destinationCity, lead.destinationCountry].filter(Boolean).join(', '),
      notes: `Created from quote request ${lead.reference}`,
      contacts: {
        create: [{ name: lead.fullName, email: normalizedEmail, phone: lead.phone, isPrimary: true }],
      },
    },
  });

  return { partner, created: true, upgraded: false };
}
