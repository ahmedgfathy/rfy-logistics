import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { defaultCompanyId } from '../../lib/company';
import { nextNumber } from '../../lib/numbers';
import { ApiError } from '../../middleware/error';
import { currentUser } from '../../middleware/auth';
import { recordAuditTx } from '../../services/audit.service';
import { parsePagination, paginationMeta } from '../../utils/pagination';
import type { PartnerCreateBody, PartnerQuery, PartnerUpdateBody } from './partners.schemas';

const partnerInclude = {
  contacts: { orderBy: [{ name: 'asc' }] },
  addresses: { orderBy: [{ label: 'asc' }] },
} satisfies Prisma.BusinessPartnerInclude;

export async function listPartners(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = res.locals.query as PartnerQuery;
  const pagination = parsePagination(query);
  const search = query.search;
  const where: Prisma.BusinessPartnerWhereInput = {
    companyId,
    deletedAt: null,
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { nameEn: { contains: search, mode: 'insensitive' } },
            { nameAr: { contains: search, mode: 'insensitive' } },
            { legalName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { taxNumber: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, partners] = await Promise.all([
    prisma.businessPartner.count({ where }),
    prisma.businessPartner.findMany({
      where,
      orderBy: [{ nameEn: 'asc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: partnerInclude,
    }),
  ]);

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: partners, meta: paginationMeta(total, pagination) });
}

export async function getPartner(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const partner = await prisma.businessPartner.findFirst({
    where: { id: req.params.id, companyId, deletedAt: null },
    include: partnerInclude,
  });
  if (!partner) throw ApiError.notFound('Partner not found');

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: partner });
}

export async function createPartner(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as PartnerCreateBody;

  const partner = await prisma.$transaction(async (tx) => {
    const created = await tx.businessPartner.create({
      data: {
        companyId,
        code: await nextNumber(tx, companyId, 'PARTNER', 'BP'),
        type: body.type,
        status: body.status,
        nameEn: body.nameEn,
        nameAr: body.nameAr ?? null,
        legalName: body.legalName ?? null,
        taxNumber: body.taxNumber ?? null,
        registrationNumber: body.registrationNumber ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        website: body.website ?? null,
        billingAddress: body.billingAddress ?? null,
        shippingAddress: body.shippingAddress ?? null,
        countryCode: body.countryCode,
        currency: body.currency,
        creditLimit: body.creditLimit ?? null,
        paymentTermDays: body.paymentTermDays,
        notes: body.notes ?? null,
        contacts: {
          create: body.contacts.map((contact) => ({
            name: contact.name,
            title: contact.title ?? null,
            email: contact.email ?? null,
            phone: contact.phone ?? null,
            isPrimary: contact.isPrimary,
          })),
        },
        addresses: {
          create: body.addresses.map((address) => ({
            label: address.label,
            address: address.address,
            city: address.city ?? null,
            countryCode: address.countryCode,
            isDefault: address.isDefault,
          })),
        },
      },
      include: partnerInclude,
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'partner.created',
      entity: 'BusinessPartner',
      entityId: created.id,
      metadata: { code: created.code, type: created.type },
      ip: req.ip,
    });
    return created;
  });

  res.setHeader('Cache-Control', 'private, no-store');
  res.status(201).json({ data: partner });
}

export async function updatePartner(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as PartnerUpdateBody;

  const partner = await prisma.$transaction(async (tx) => {
    const existing = await tx.businessPartner.findFirst({
      where: { id: req.params.id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Partner not found');

    const updated = await tx.businessPartner.update({
      where: { id: existing.id },
      data: {
        type: body.type,
        status: body.status,
        nameEn: body.nameEn,
        nameAr: body.nameAr,
        legalName: body.legalName,
        taxNumber: body.taxNumber,
        registrationNumber: body.registrationNumber,
        email: body.email,
        phone: body.phone,
        website: body.website,
        billingAddress: body.billingAddress,
        shippingAddress: body.shippingAddress,
        countryCode: body.countryCode,
        currency: body.currency,
        creditLimit: body.creditLimit,
        paymentTermDays: body.paymentTermDays,
        notes: body.notes,
        ...(body.contacts !== undefined
          ? {
              contacts: {
                deleteMany: {},
                create: body.contacts.map((contact) => ({
                  name: contact.name,
                  title: contact.title ?? null,
                  email: contact.email ?? null,
                  phone: contact.phone ?? null,
                  isPrimary: contact.isPrimary,
                })),
              },
            }
          : {}),
        ...(body.addresses !== undefined
          ? {
              addresses: {
                deleteMany: {},
                create: body.addresses.map((address) => ({
                  label: address.label,
                  address: address.address,
                  city: address.city ?? null,
                  countryCode: address.countryCode,
                  isDefault: address.isDefault,
                })),
              },
            }
          : {}),
      },
      include: partnerInclude,
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'partner.updated',
      entity: 'BusinessPartner',
      entityId: updated.id,
      metadata: { fields: Object.keys(body) },
      ip: req.ip,
    });
    return updated;
  });

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: partner });
}
