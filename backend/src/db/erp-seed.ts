import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const COMPANY_CODE = 'RFY';
const BASE_CURRENCY = 'EGP';
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const permissionModules = [
  { key: 'partners', label: 'business partners' },
  { key: 'sales', label: 'sales documents' },
  { key: 'shipments', label: 'shipments' },
  { key: 'customs', label: 'customs files and declarations' },
  { key: 'documents', label: 'documents' },
  { key: 'tasks', label: 'tasks' },
  { key: 'accounting', label: 'accounting records' },
] as const;

const permissionActions = [
  { key: 'read', label: 'Read' },
  { key: 'write', label: 'Write' },
  { key: 'post', label: 'Post' },
  { key: 'approve', label: 'Approve' },
] as const;

const permissionSeeds = [
  ...permissionModules.flatMap((module) =>
    permissionActions.map((action) => ({
      key: `${module.key}.${action.key}`,
      description: `${action.label} access for ${module.label}.`,
    })),
  ),
  { key: 'shipments.publish', description: 'Publish shipments to public tracking.' },
  { key: 'customs.release', description: 'Release customs declarations.' },
  { key: 'accounting.period.lock', description: 'Lock and reopen accounting periods.' },
];

const allPermissions = permissionSeeds.map((permission) => permission.key);

const roleSeeds = [
  {
    code: 'OPERATIONS',
    name: 'Operations',
    description: 'Manages partners, sales workflow, shipments, documents and tasks.',
    permissions: [
      'partners.read',
      'partners.write',
      'sales.read',
      'sales.write',
      'shipments.read',
      'shipments.write',
      'shipments.publish',
      'customs.read',
      'documents.read',
      'documents.write',
      'tasks.read',
      'tasks.write',
    ],
  },
  {
    code: 'CUSTOMS',
    name: 'Customs',
    description: 'Prepares and submits customs files and declarations for review.',
    permissions: [
      'partners.read',
      'shipments.read',
      'customs.read',
      'customs.write',
      'customs.post',
      'customs.release',
      'documents.read',
      'documents.write',
      'tasks.read',
      'tasks.write',
    ],
  },
  {
    code: 'FINANCE',
    name: 'Finance',
    description: 'Manages accounting, invoicing, bills, payments and reconciliation.',
    permissions: [
      'partners.read',
      'sales.read',
      'shipments.read',
      'customs.read',
      'documents.read',
      'tasks.read',
      'accounting.read',
      'accounting.write',
      'accounting.post',
      'accounting.approve',
      'accounting.period.lock',
    ],
  },
  {
    code: 'MANAGER',
    name: 'Manager',
    description: 'Full access to operational and financial workflows.',
    permissions: allPermissions,
  },
] as const;

const chargeItemSeeds = [
  {
    code: 'FREIGHT',
    nameEn: 'Freight',
    nameAr: 'الشحن',
    type: 'FREIGHT',
  },
  {
    code: 'ORIGIN',
    nameEn: 'Origin Charges',
    nameAr: 'رسوم المنشأ',
    type: 'ORIGIN',
  },
  {
    code: 'DESTINATION',
    nameEn: 'Destination Charges',
    nameAr: 'رسوم الوجهة',
    type: 'DESTINATION',
  },
  {
    code: 'CUSTOMS',
    nameEn: 'Customs Clearance',
    nameAr: 'التخليص الجمركي',
    type: 'CUSTOMS',
  },
  {
    code: 'HANDLING',
    nameEn: 'Cargo Handling',
    nameAr: 'مناولة البضائع',
    type: 'HANDLING',
  },
  {
    code: 'STORAGE',
    nameEn: 'Storage',
    nameAr: 'التخزين',
    type: 'STORAGE',
  },
  {
    code: 'INSURANCE',
    nameEn: 'Cargo Insurance',
    nameAr: 'تأمين البضائع',
    type: 'INSURANCE',
  },
] as const;

const accountSeeds = [
  {
    code: '1000',
    systemCode: 'CASH',
    nameEn: 'Cash on Hand',
    nameAr: 'النقد بالخزينة',
    type: 'ASSET',
    normalBalance: 'DEBIT',
  },
  {
    code: '1010',
    systemCode: 'BANK',
    nameEn: 'Bank Accounts',
    nameAr: 'الحسابات البنكية',
    type: 'ASSET',
    normalBalance: 'DEBIT',
  },
  {
    code: '1100',
    systemCode: 'AR',
    nameEn: 'Accounts Receivable',
    nameAr: 'العملاء والمدينون',
    type: 'ASSET',
    normalBalance: 'DEBIT',
  },
  {
    code: '1150',
    systemCode: 'INPUT_VAT',
    nameEn: 'Input VAT',
    nameAr: 'ضريبة القيمة المضافة على المشتريات',
    type: 'ASSET',
    normalBalance: 'DEBIT',
  },
  {
    code: '2000',
    systemCode: 'AP',
    nameEn: 'Accounts Payable',
    nameAr: 'الموردون والدائنون',
    type: 'LIABILITY',
    normalBalance: 'CREDIT',
  },
  {
    code: '2050',
    systemCode: 'OUTPUT_VAT',
    nameEn: 'Output VAT',
    nameAr: 'ضريبة القيمة المضافة على المبيعات',
    type: 'LIABILITY',
    normalBalance: 'CREDIT',
  },
  {
    code: '3000',
    systemCode: 'OPENING_BALANCE',
    nameEn: 'Opening Balance Equity',
    nameAr: 'رصيد افتتاحي',
    type: 'EQUITY',
    normalBalance: 'CREDIT',
  },
  {
    code: '3200',
    systemCode: 'RETAINED_EARNINGS',
    nameEn: 'Retained Earnings',
    nameAr: 'الأرباح المحتجزة',
    type: 'EQUITY',
    normalBalance: 'CREDIT',
  },
  {
    code: '4000',
    systemCode: 'SALES_REVENUE',
    nameEn: 'Sales Revenue',
    nameAr: 'إيرادات المبيعات',
    type: 'REVENUE',
    normalBalance: 'CREDIT',
  },
  {
    code: '4100',
    systemCode: 'FREIGHT_REVENUE',
    nameEn: 'Freight Revenue',
    nameAr: 'إيرادات الشحن',
    type: 'REVENUE',
    normalBalance: 'CREDIT',
  },
  {
    code: '4200',
    systemCode: 'CUSTOMS_REVENUE',
    nameEn: 'Customs Clearance Revenue',
    nameAr: 'إيرادات التخليص الجمركي',
    type: 'REVENUE',
    normalBalance: 'CREDIT',
  },
  {
    code: '5000',
    systemCode: 'PURCHASE_FREIGHT',
    nameEn: 'Purchased Freight',
    nameAr: 'مصروفات الشحن المشترى',
    type: 'EXPENSE',
    normalBalance: 'DEBIT',
  },
  {
    code: '5100',
    systemCode: 'CUSTOMS_EXPENSE',
    nameEn: 'Customs Charges and Duties',
    nameAr: 'مصروفات ورسوم التخليص الجمركي',
    type: 'EXPENSE',
    normalBalance: 'DEBIT',
  },
] as const;

const journalSeeds = [
  {
    code: 'SALES',
    nameEn: 'Sales Invoices',
    nameAr: 'فواتير المبيعات',
    type: 'SALES',
  },
  {
    code: 'PURCHASE',
    nameEn: 'Purchase Bills',
    nameAr: 'فواتير المشتريات',
    type: 'PURCHASE',
  },
  {
    code: 'CASH',
    nameEn: 'Cash Receipts and Payments',
    nameAr: 'المقبوضات والمدفوعات النقدية',
    type: 'CASH',
  },
  {
    code: 'BANK',
    nameEn: 'Bank Receipts and Payments',
    nameAr: 'المقبوضات والمدفوعات البنكية',
    type: 'BANK',
  },
  {
    code: 'GENERAL',
    nameEn: 'General Journal',
    nameAr: 'اليومية العامة',
    type: 'GENERAL',
  },
  {
    code: 'CUSTOMS',
    nameEn: 'Customs Journal',
    nameAr: 'يومية التخليص الجمركي',
    type: 'CUSTOMS',
  },
  {
    code: 'OPENING',
    nameEn: 'Opening Balances',
    nameAr: 'الأرصدة الافتتاحية',
    type: 'OPENING',
  },
] as const;

const numberSequenceSeeds = [
  { key: 'PARTNER', prefix: 'BP' },
  { key: 'QUOTE', prefix: 'QT' },
  { key: 'BOOKING', prefix: 'BK' },
  { key: 'SHIPMENT', prefix: 'TRK' },
  { key: 'INVOICE', prefix: 'INV' },
  { key: 'BILL', prefix: 'BILL' },
  { key: 'PAYMENT', prefix: 'PAY' },
  { key: 'JOURNAL', prefix: 'JV' },
  { key: 'CUSTOMS_FILE', prefix: 'CF' },
  { key: 'DECLARATION', prefix: 'DEC' },
] as const;

const hsReferenceNoticeEn =
  'Configurable reference only; seeded zero duty and tax defaults are placeholders, not authoritative Egyptian customs rates. Verify classification and the current tariff before use.';
const hsReferenceNoticeAr =
  'بيان مرجعي قابل للتعديل؛ نسب الرسوم والضرائب الصفرية المضافة افتراضيًا هي قيم أولية وليست أسعارًا جمركية مصرية رسمية. يرجى التحقق من التصنيف والتعريفة الحالية قبل الاستخدام.';

const hsCodeSeeds = [
  { code: '090111', descriptionEn: 'Coffee, not roasted', descriptionAr: 'قهوة غير محمصة' },
  { code: '100114', descriptionEn: 'Wheat and meslin', descriptionAr: 'قمح وخلطه' },
  { code: '080510', descriptionEn: 'Oranges, fresh or dried', descriptionAr: 'برتقال طازج أو مجفف' },
  {
    code: '610910',
    descriptionEn: 'Cotton T-shirts, singlets and other vests',
    descriptionAr: 'قمصان تيشيرت وصدريات قطنية',
  },
  {
    code: '620342',
    descriptionEn: "Men's or boys' cotton trousers and shorts",
    descriptionAr: 'بناطيل وشنط رجالية أو أولاد قطنية',
  },
  {
    code: '640399',
    descriptionEn: 'Footwear with leather uppers, other',
    descriptionAr: 'أحذية بوجه جلدي، أخرى',
  },
  {
    code: '847130',
    descriptionEn: 'Portable data-processing machines weighing 10 kg or less',
    descriptionAr: 'أجهزة معالجة بيانات آلية محمولة وزنها 10 كجم أو أقل',
  },
  { code: '851713', descriptionEn: 'Smartphones', descriptionAr: 'هواتف ذكية' },
] as const;

/**
 * Seeds ERP reference defaults without creating transactional or demo records.
 * Existing records are preserved, sequence counters are never reset, and only
 * missing system-role grants are added.
 */
export async function seedErpReferenceData(): Promise<void> {
  const year = new Date().getUTCFullYear();

  await prisma.$transaction(
    async (tx) => {
      const company = await tx.company.upsert({
        where: { code: COMPANY_CODE },
        update: {},
        create: {
          code: COMPANY_CODE,
          nameEn: 'RFY Logistics',
          nameAr: 'RFY للخدمات اللوجستية',
          legalNameEn: 'RFY Logistics',
          legalNameAr: 'RFY للخدمات اللوجستية',
          baseCurrency: BASE_CURRENCY,
          countryCode: 'EG',
          isActive: true,
        },
      });
      const companyId = company.id;

      await tx.branch.upsert({
        where: { companyId_code: { companyId, code: 'MAIN' } },
        update: {},
        create: {
          companyId,
          code: 'MAIN',
          nameEn: 'Head Office',
          nameAr: 'الفرع الرئيسي',
          isActive: true,
        },
      });

      const permissionIds = new Map<string, string>();
      for (const permission of permissionSeeds) {
        const record = await tx.permission.upsert({
          where: { key: permission.key },
          update: {},
          create: permission,
        });
        permissionIds.set(permission.key, record.id);
      }

      const operationsRole = roleSeeds.find((role) => role.code === 'OPERATIONS')!;
      for (const role of roleSeeds) {
        const record = await tx.accessRole.upsert({
          where: { companyId_code: { companyId, code: role.code } },
          update: {},
          create: {
            companyId,
            code: role.code,
            name: role.name,
            description: role.description,
            isSystem: true,
          },
        });

        await tx.accessRolePermission.createMany({
          data: role.permissions.map((key) => ({
            roleId: record.id,
            permissionId: permissionIds.get(key)!,
          })),
          skipDuplicates: true,
        });
        if (role.code === operationsRole.code) {
          const editors = await tx.user.findMany({ where: { role: 'EDITOR', isActive: true }, select: { id: true } });
          await tx.userAccessRole.createMany({
            data: editors.map((user) => ({ userId: user.id, roleId: record.id })),
            skipDuplicates: true,
          });
        }
      }

      const accountIds = new Map<string, string>();
      for (const account of accountSeeds) {
        const record = await tx.account.upsert({
          where: { companyId_code: { companyId, code: account.code } },
          update: {},
          create: {
            companyId,
            ...account,
            currency: BASE_CURRENCY,
            isPostable: true,
            isActive: true,
          },
        });
        accountIds.set(account.systemCode, record.id);
      }

      await tx.taxCode.upsert({
        where: { companyId_code: { companyId, code: 'VAT14' } },
        update: {},
        create: {
          companyId,
          code: 'VAT14',
          nameEn: 'Egyptian VAT - Standard Output Rate',
          nameAr: 'ضريبة القيمة المضافة - السعر الأساسي على المبيعات',
          ratePercent: 14,
          accountId: accountIds.get('OUTPUT_VAT')!,
          isActive: true,
        },
      });

      await tx.taxCode.upsert({
        where: { companyId_code: { companyId, code: 'VAT14-INPUT' } },
        update: {},
        create: {
          companyId,
          code: 'VAT14-INPUT',
          nameEn: 'Egyptian VAT - Standard Input Rate',
          nameAr: 'ضريبة القيمة المضافة - السعر الأساسي على المشتريات',
          ratePercent: 14,
          accountId: accountIds.get('INPUT_VAT')!,
          isActive: true,
        },
      });

      await tx.taxCode.upsert({
        where: { companyId_code: { companyId, code: 'ZERO' } },
        update: {},
        create: {
          companyId,
          code: 'ZERO',
          nameEn: 'Zero Rate',
          nameAr: 'نسبة صفرية',
          ratePercent: 0,
          isActive: true,
        },
      });

      await tx.bankAccount.upsert({
        where: { companyId_code: { companyId, code: 'BANK-MAIN' } },
        update: {},
        create: {
          companyId,
          code: 'BANK-MAIN',
          name: 'Primary Operating Bank Account',
          accountId: accountIds.get('BANK')!,
          currency: BASE_CURRENCY,
          isActive: true,
        },
      });

      for (const journal of journalSeeds) {
        await tx.journal.upsert({
          where: { companyId_code: { companyId, code: journal.code } },
          update: {},
          create: {
            companyId,
            ...journal,
            isSystem: true,
            isActive: true,
          },
        });
      }

      // Prices and tax treatment are intentionally unset; configure them per transaction.
      for (const chargeItem of chargeItemSeeds) {
        await tx.chargeItem.upsert({
          where: { companyId_code: { companyId, code: chargeItem.code } },
          update: {},
          create: {
            companyId,
            ...chargeItem,
            currency: BASE_CURRENCY,
            isActive: true,
          },
        });
      }

      const fiscalYear = await tx.fiscalYear.upsert({
        where: { companyId_code: { companyId, code: String(year) } },
        update: {},
        create: {
          companyId,
          code: String(year),
          nameEn: `Fiscal Year ${year}`,
          startDate: new Date(Date.UTC(year, 0, 1)),
          endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
          isClosed: false,
        },
      });

      for (let month = 0; month < 12; month += 1) {
        await tx.accountingPeriod.upsert({
          where: { fiscalYearId_number: { fiscalYearId: fiscalYear.id, number: month + 1 } },
          update: {},
          create: {
            fiscalYearId: fiscalYear.id,
            number: month + 1,
            name: `${MONTH_NAMES[month]} ${year}`,
            startDate: new Date(Date.UTC(year, month, 1)),
            endDate: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
            status: 'OPEN',
          },
        });
      }

      for (const sequence of numberSequenceSeeds) {
        await tx.numberSequence.upsert({
          where: {
            companyId_key_year: { companyId, key: sequence.key, year },
          },
          // Never reset an allocated production counter.
          update: {},
          create: {
            companyId,
            ...sequence,
            year,
            current: 0,
          },
        });
      }

      // No DutyRule rows are seeded: the zero defaults above are not tariff advice.
      for (const hsCode of hsCodeSeeds) {
        await tx.hsCode.upsert({
          where: { code: hsCode.code },
          update: {},
          create: {
            ...hsCode,
            descriptionEn: `${hsCode.descriptionEn}. ${hsReferenceNoticeEn}`,
            descriptionAr: `${hsCode.descriptionAr}. ${hsReferenceNoticeAr}`,
            defaultDutyRate: 0,
            defaultTaxRate: 0,
            isActive: true,
          },
        });
      }
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  logger.info('Seed: ERP reference data ready', {
    companyCode: COMPANY_CODE,
    fiscalYear: year,
    permissions: permissionSeeds.length,
    roles: roleSeeds.length,
    hsCodes: hsCodeSeeds.length,
  });
}
