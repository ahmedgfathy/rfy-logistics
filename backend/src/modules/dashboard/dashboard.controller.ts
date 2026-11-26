import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { defaultCompanyId } from '../../lib/company';

export async function erpDashboard(_req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const now = new Date();
  const [
    customers,
    openQuotes,
    activeBookings,
    activeShipments,
    openCustoms,
    openTasks,
    overdueTasks,
    receivables,
    payables,
    recentShipments,
    recentQuotes,
    recentInvoices,
  ] = await Promise.all([
    prisma.businessPartner.count({ where: { companyId, type: { in: ['CUSTOMER', 'BOTH'] }, status: 'ACTIVE' } }),
    prisma.quote.count({ where: { companyId, status: { in: ['DRAFT', 'SENT'] } } }),
    prisma.booking.count({ where: { companyId, status: { in: ['CONFIRMED', 'OPERATIONAL'] } } }),
    prisma.shipment.count({ where: { companyId, status: { notIn: ['DELIVERED', 'CANCELLED'] } } }),
    prisma.customsFile.count({ where: { companyId, status: { notIn: ['RELEASED', 'CLOSED', 'CANCELLED'] } } }),
    prisma.task.count({ where: { companyId, status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] } } }),
    prisma.task.count({ where: { companyId, dueDate: { lt: now }, status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] } } }),
    prisma.invoice.aggregate({ where: { companyId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, _sum: { balance: true } }),
    prisma.bill.aggregate({ where: { companyId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, _sum: { balance: true } }),
    prisma.shipment.findMany({ where: { companyId }, orderBy: { updatedAt: 'desc' }, take: 5, select: { id: true, trackingNumber: true, status: true, originPort: true, destinationPort: true, updatedAt: true } }),
    prisma.quote.findMany({ where: { companyId }, orderBy: { updatedAt: 'desc' }, take: 5, select: { id: true, number: true, status: true, customer: { select: { nameEn: true } }, currency: true, updatedAt: true } }),
    prisma.invoice.findMany({ where: { companyId }, orderBy: { updatedAt: 'desc' }, take: 5, select: { id: true, number: true, status: true, customer: { select: { nameEn: true } }, total: true, balance: true, currency: true, updatedAt: true } }),
  ]);

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    data: {
      totals: {
        customers,
        openQuotes,
        activeBookings,
        activeShipments,
        openCustoms,
        openTasks,
        overdueTasks,
        receivables: receivables._sum.balance ?? 0,
        payables: payables._sum.balance ?? 0,
      },
      recentShipments,
      recentQuotes,
      recentInvoices,
    },
  });
}
