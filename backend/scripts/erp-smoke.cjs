const fs = require('node:fs/promises');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const base = 'http://127.0.0.1:3000/api/v1';
const marker = `smoke-${Date.now()}`;
const ids = {};
let cookie;
let storedName;

async function request(step, url, options = {}, expected = 200) {
  const response = await fetch(`${base}${url}`, { ...options, headers: { ...(cookie ? { cookie } : {}), ...(options.headers ?? {}) } });
  const payload = await response.json().catch(() => null);
  if (response.status !== expected) {
    throw new Error(`${step}: expected ${expected}, received ${response.status}: ${JSON.stringify(payload)}`);
  }
  console.log(`${step}: ${response.status}`);
  return payload;
}

async function cleanup() {
  if (storedName) await fs.rm(path.join(process.env.UPLOAD_DIR, 'documents', path.basename(storedName)), { force: true });
  const none = '00000000-0000-0000-0000-000000000000';
  const hsCodeId = ids.hsCodeId ?? none;
  const shipmentId = ids.shipmentId ?? none;
  const customsFileId = ids.customsFileId ?? none;
  const declarationIds = [ids.declarationId, ids.draftDeclarationId].filter(Boolean);
  const quoteId = ids.quoteId ?? none;
  const partnerIds = [ids.customerId, ids.vendorId].filter(Boolean);
  const entityIds = Object.values(ids).filter((value) => typeof value === 'string');
  await prisma.$transaction([
    prisma.shipmentDocument.deleteMany({ where: { shipmentId } }),
    prisma.declarationDocument.deleteMany({ where: { declarationId: { in: declarationIds } } }),
    prisma.quoteDocument.deleteMany({ where: { quoteId } }),
    prisma.document.deleteMany({ where: { id: ids.documentId ?? none } }),
    prisma.task.deleteMany({ where: { id: ids.taskId ?? none } }),
    prisma.shipmentVendor.deleteMany({ where: { shipmentId } }),
    prisma.cargoPackage.deleteMany({ where: { shipmentId } }),
    prisma.container.deleteMany({ where: { shipmentId } }),
    prisma.shipmentEvent.deleteMany({ where: { shipmentId } }),
    prisma.customsStatusEvent.deleteMany({ where: { customsFileId } }),
    prisma.declarationCharge.deleteMany({ where: { declarationId: { in: declarationIds } } }),
    prisma.declarationLine.deleteMany({ where: { declarationId: { in: declarationIds } } }),
    prisma.customsDeclaration.deleteMany({ where: { id: { in: declarationIds } } }),
    prisma.aciFiling.deleteMany({ where: { customsFileId } }),
    prisma.customsFile.deleteMany({ where: { id: customsFileId } }),
    prisma.shipment.deleteMany({ where: { id: shipmentId } }),
    prisma.booking.deleteMany({ where: { id: ids.bookingId ?? none } }),
    prisma.quoteLine.deleteMany({ where: { quoteId } }),
    prisma.quote.deleteMany({ where: { id: quoteId } }),
    prisma.partnerContact.deleteMany({ where: { partnerId: { in: partnerIds } } }),
    prisma.partnerAddress.deleteMany({ where: { partnerId: { in: partnerIds } } }),
    prisma.businessPartner.deleteMany({ where: { id: { in: partnerIds } } }),
    prisma.hsCode.deleteMany({ where: { id: hsCodeId } }),
    prisma.idempotencyRecord.deleteMany({ where: { key: ids.idempotencyKey ?? `__none_${marker}` } }),
    prisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } }),
  ]);
  console.log('cleanup: complete');
}

(async () => {
  try {
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
    });
    cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!login.ok || !cookie) throw new Error(`login failed: ${login.status}`);
    console.log('login: 200');

    const customer = await request('create customer', '/erp/partners', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'CUSTOMER', nameEn: `${marker} Customer`, email: `${marker}@example.test`, countryCode: 'EG', currency: 'EGP', paymentTermDays: 15, contacts: [{ name: 'Smoke Test', email: `${marker}@example.test`, isPrimary: true }] }),
    }, 201);
    ids.customerId = customer.data.id;

    const vendor = await request('create vendor', '/erp/partners', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'VENDOR', nameEn: `${marker} Vendor`, email: `${marker}-vendor@example.test`, countryCode: 'EG', currency: 'EGP', paymentTermDays: 0 }),
    }, 201);
    ids.vendorId = vendor.data.id;

    const quote = await request('create quote', '/erp/quotes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customerId: ids.customerId, currency: 'EGP', exchangeRate: '1', lines: [{ descriptionEn: 'Sea freight smoke test', quantity: '2', unitPrice: '100.50', discountPercent: '5', taxPercent: '14' }] }),
    }, 201);
    ids.quoteId = quote.data.id;
    if (quote.data.totals.total.toString() !== '217.68') throw new Error(`unexpected quote total ${quote.data.totals.total}`);

    await request('accept quote', `/erp/quotes/${ids.quoteId}/accept`, { method: 'POST' });
    ids.idempotencyKey = `smoke-${marker}`;
    const conversionBody = JSON.stringify({ mode: 'SEA', origin: 'Alexandria, EG', destination: 'Jeddah, SA' });
    const converted = await request('convert quote', `/erp/quotes/${ids.quoteId}/convert`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': ids.idempotencyKey }, body: conversionBody,
    }, 201);
    ids.bookingId = converted.data.booking.id;
    const replay = await request('replay quote conversion', `/erp/quotes/${ids.quoteId}/convert`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': ids.idempotencyKey }, body: conversionBody,
    }, 201);
    if (replay.data.booking.id !== ids.bookingId) throw new Error('idempotent conversion returned a different booking');
    await request('reject duplicate conversion', `/erp/quotes/${ids.quoteId}/convert`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': `${ids.idempotencyKey}-other` }, body: conversionBody,
    }, 409);

    await request('advance booking', `/erp/bookings/${ids.bookingId}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'OPERATIONAL' }),
    });

    const shipment = await request('create shipment', '/erp/shipments', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingId: ids.bookingId, mode: 'SEA', originPort: 'Alexandria, EG', destinationPort: 'Jeddah, SA', carrier: 'Smoke Carrier', weightKg: '1250.5' }),
    }, 201);
    ids.shipmentId = shipment.data.id;
    await request('edit shipment header', `/erp/shipments/${ids.shipmentId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: shipment.data.version, reference: `${marker}-updated`, eta: '2027-01-15T00:00:00.000Z' }),
    });
    await request('add shipment event', `/erp/shipments/${ids.shipmentId}/events`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'IN_TRANSIT', location: 'Suez, EG', description: 'Smoke test departure event', updateShipmentStatus: true, version: shipment.data.version + 1 }),
    }, 201);
    const cargoPackage = await request('add package', `/erp/shipments/${ids.shipmentId}/packages`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ packageNumber: 'PKG-1', description: 'Smoke test cargo', quantity: 2, weightKg: '1250.5', version: shipment.data.version + 2 }),
    }, 201);
    await request('edit package', `/erp/shipments/${ids.shipmentId}/packages/${cargoPackage.data.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Updated smoke test cargo', version: shipment.data.version + 3 }),
    });
    const container = await request('add container', `/erp/shipments/${ids.shipmentId}/containers`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ containerNumber: `SMOKE${Date.now()}`, equipmentType: '40HC', version: shipment.data.version + 4 }),
    }, 201);
    await request('edit container', `/erp/shipments/${ids.shipmentId}/containers/${container.data.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sealNumber: 'SMOKE-SEAL', version: shipment.data.version + 5 }),
    });
    await request('delete container', `/erp/shipments/${ids.shipmentId}/containers/${container.data.id}?version=${shipment.data.version + 6}`, {
      method: 'DELETE',
    });
    const vendorCost = await request('add vendor cost', `/erp/shipments/${ids.shipmentId}/vendors`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vendorId: ids.vendorId, service: 'Origin handling', amount: '250.00', currency: 'EGP', version: shipment.data.version + 7 }),
    }, 201);
    await request('edit vendor cost', `/erp/shipments/${ids.shipmentId}/vendors/${vendorCost.data.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: '275.00', version: shipment.data.version + 8 }),
    });
    await request('publish tracking', `/erp/shipments/${ids.shipmentId}/publication`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isPublic: true, version: shipment.data.version + 9 }),
    });
    await request('cancel vendor cost', `/erp/shipments/${ids.shipmentId}/vendors/${vendorCost.data.id}/cancel`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Smoke test cancellation', version: shipment.data.version + 10 }),
    });

    const hsCode = await request('create HS code', '/erp/customs/hs-codes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: `SMOKE${Date.now()}`, descriptionEn: `${marker} HS code`, defaultDutyRate: '5', defaultTaxRate: '14' }),
    }, 201);
    ids.hsCodeId = hsCode.data.id;
    await request('edit HS code', `/erp/customs/hs-codes/${ids.hsCodeId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ descriptionEn: `${marker} updated HS code`, defaultDutyRate: '6' }),
    });

    const customsFile = await request('create customs file', '/erp/customs/files', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shipmentId: ids.shipmentId, importerId: ids.customerId, direction: 'IMPORT', portCode: 'EGALX', customsOffice: 'Smoke test office' }),
    }, 201);
    ids.customsFileId = customsFile.data.id;
    await request('edit customs file', `/erp/customs/files/${ids.customsFileId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customsOffice: 'Updated smoke test office', notes: marker }),
    });
    const aci = await request('create ACI filing', `/erp/customs/files/${ids.customsFileId}/aci`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acidNumber: `ACID-${marker}`, nafezaRequestNumber: `NFZ-${marker}`, status: 'DRAFT' }),
    }, 201);
    ids.aciId = aci.data.id;
    await request('submit ACI filing', `/erp/customs/aci/${ids.aciId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'SUBMITTED' }),
    });
    await request('accept ACI filing', `/erp/customs/aci/${ids.aciId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'ACCEPTED', responseReference: `RESP-${marker}` }),
    });

    const declarationLines = [{ hsCodeSnapshot: '090111', description: 'Coffee, not roasted', originCountry: 'EG', quantity: '100', customsValue: '1000', currency: 'USD', exchangeRate: '30.5', dutyRatePercent: '10', taxRatePercent: '14', otherAmount: '0' }];
    const draftDeclaration = await request('create draft declaration', '/erp/customs/declarations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customsFileId: ids.customsFileId, lines: declarationLines }),
    }, 201);
    ids.draftDeclarationId = draftDeclaration.data.id;
    await request('edit draft declaration', `/erp/customs/declarations/${ids.draftDeclarationId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [{ ...declarationLines[0], description: 'Corrected draft coffee' }] }),
    });
    await request('cancel draft declaration', `/erp/customs/declarations/${ids.draftDeclarationId}/cancel`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Smoke test cancellation' }),
    });
    const declaration = await request('create declaration', '/erp/customs/declarations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customsFileId: ids.customsFileId, lines: declarationLines }),
    }, 201);
    ids.declarationId = declaration.data.id;
    if (declaration.data.totalPayable.toString() !== '7320') throw new Error(`unexpected customs payable ${declaration.data.totalPayable}`);
    const assessed = await request('assess declaration', `/erp/customs/declarations/${ids.declarationId}/assess`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    });
    if (assessed.data.status !== 'ASSESSED') throw new Error('declaration was not assessed');
    await request('reject assessed declaration edit', `/erp/customs/declarations/${ids.declarationId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paidAmount: '0' }),
    }, 400);
    await request('reject assessed declaration cancellation', `/erp/customs/declarations/${ids.declarationId}/cancel`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Must be rejected' }),
    }, 400);
    await request('reject linked shipment edit', `/erp/shipments/${ids.shipmentId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: shipment.data.version + 11, reference: 'Must be rejected' }),
    }, 409);
    await request('reject underpaid release', `/erp/customs/declarations/${ids.declarationId}/release`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paidAmount: '100', paymentReference: 'SMOKE' }),
    }, 400);
    const released = await request('release declaration', `/erp/customs/declarations/${ids.declarationId}/release`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paidAmount: '7320', paymentReference: 'SMOKE' }),
    });
    if (released.data.status !== 'RELEASED' || released.data.balance.toString() !== '0') throw new Error('declaration release invariants failed');
    await request('close customs file', `/erp/customs/files/${ids.customsFileId}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'CLOSED' }),
    });

    const task = await request('create task', '/erp/tasks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: `${marker} follow-up`, relatedType: 'SHIPMENT', relatedId: ids.shipmentId, priority: 'HIGH' }),
    }, 201);
    ids.taskId = task.data.id;
    await request('edit task', `/erp/tasks/${ids.taskId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: `${marker} updated follow-up`, assignedToId: null, priority: 'MEDIUM' }),
    });
    await request('complete task', `/erp/tasks/${ids.taskId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }),
    });

    const form = new FormData();
    form.append('file', new Blob(['%PDF-1.4\nsmoke test\n%%EOF'], { type: 'application/pdf' }), `${marker}.pdf`);
    form.append('category', 'BILL_OF_LADING');
    form.append('relatedType', 'SHIPMENT');
    form.append('relatedId', ids.shipmentId);
    const document = await request('upload document', '/erp/documents', { method: 'POST', body: form }, 201);
    ids.documentId = document.data.id;
    storedName = document.data.storedName;
    const download = await fetch(`${base}/erp/documents/${ids.documentId}/download`, { headers: { cookie } });
    if (download.status !== 200 || !(await download.arrayBuffer()).byteLength) throw new Error(`document download failed: ${download.status}`);
    console.log('download document: 200');
    await request('correct document', `/erp/documents/${ids.documentId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: `${marker}-corrected.pdf`, relatedType: 'DECLARATION', relatedId: ids.declarationId }),
    });
    await request('archive document', `/erp/documents/${ids.documentId}/archive`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    });
    const archivedDownload = await fetch(`${base}/erp/documents/${ids.documentId}/download`, { headers: { cookie } });
    if (archivedDownload.status !== 404) throw new Error(`archived document download should be 404, received ${archivedDownload.status}`);
    console.log('reject archived document download: 404');
    await request('restore document', `/erp/documents/${ids.documentId}/restore`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    });

    console.log('ERP workflow smoke test: passed');
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
