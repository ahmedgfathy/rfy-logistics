import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { seedErpReferenceData } from './erp-seed';

interface ServiceSeed {
  slug: string;
  icon: string;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  bodyEn: string;
  bodyAr: string;
  featuresEn: string[];
  featuresAr: string[];
  isFeatured: boolean;
}

const services: ServiceSeed[] = [
  {
    slug: 'sea-freight',
    icon: 'Ship',
    titleEn: 'Sea Freight',
    titleAr: 'الشحن البحري',
    excerptEn: 'FCL and LCL ocean freight through Alexandria, Dekheila, Damietta, Port Said and Sokhna.',
    excerptAr: 'شحن بحري كامل وجزئي عبر الإسكندرية والدخيلة ودمياط وبورسعيد والسخنة.',
    bodyEn:
      'We book, document and monitor full and less-than-container loads with contracted ocean carriers, covering dry, reefer, open-top, flat-rack and ISO-tank equipment. Every booking is matched to the vessel schedule that keeps your commitment date, not just the cheapest sailing.\n\nConsolidation is handled through established co-loaders for LCL cargo, with weekly sailings to and from the main Mediterranean, Gulf, Far East, European and American trade lanes. Rates, surcharges and free time are confirmed in writing before cargo is released.',
    bodyAr:
      'نقوم بالحجز وإعداد المستندات ومتابعة الشحنات الكاملة والجزئية مع خطوط ملاحية متعاقد عليها، ونغطي الحاويات الجافة والمبردة والمفتوحة والمسطحة وحاويات الـ ISO Tank. يتم اختيار الرحلة بما يحافظ على موعدك الالتزامي وليس فقط على أقل سعر.\n\nيتم تجميع شحنات LCL من خلال شركاء تجميع معتمدين مع رحلات أسبوعية إلى ومن أهم خطوط التجارة المتوسطية والخليجية والآسيوية والأوروبية والأمريكية. ويتم تأكيد الأسعار والرسوم الإضافية ومدة السماح مجانًا كتابيًا قبل الإفراج عن البضاعة.',
    featuresEn: ['FCL 20′ / 40′ / 40′ HC', 'LCL consolidation', 'Reefer and OOG equipment', 'Weekly sailings'],
    featuresAr: ['حاويات كاملة 20 و40 و40 عالي', 'تجميع شحنات LCL', 'حاويات مبردة وشحنات خارج المقاس', 'رحلات أسبوعية'],
    isFeatured: true,
  },
  {
    slug: 'air-freight',
    icon: 'Plane',
    titleEn: 'Air Freight',
    titleAr: 'الشحن الجوي',
    excerptEn: 'Time-critical air cargo through Cairo International and Alexandria airports.',
    excerptAr: 'شحن جوي عاجل عبر مطار القاهرة الدولي ومطارات الإسكندرية.',
    bodyEn:
      'Air freight is the right answer when the cost of waiting exceeds the cost of flying. We arrange direct and consolidated air cargo, airport-to-airport or door-to-door, with pre-booked capacity on scheduled and charter services.\n\nDangerous goods, temperature-controlled and high-value shipments are handled with the documentation and handling instructions they require, and every milestone is reported to you as it happens.',
    bodyAr:
      'الشحن الجوي هو الحل الصحيح عندما تتجاوز تكلفة الانتظار تكلفة الطيران. نرتب شحنات جوية مباشرة أو مجمعة، من مطار إلى مطار أو من الباب إلى الباب، مع حجز مسبق للسعة على رحلات منتظمة أو عارضة.\n\nيتم التعامل مع المواد الخطرة والشحنات المبردة وعالية القيمة بكافة المستندات وتعليمات المناولة المطلوبة، ويتم إبلاغك بكل مرحلة فور حدوثها.',
    featuresEn: ['Direct and consolidated options', 'Door-to-door delivery', 'Express clearance support', 'Temperature-controlled cargo'],
    featuresAr: ['خيارات مباشرة ومجمعة', 'توصيل من الباب إلى الباب', 'دعم الإفراج السريع', 'شحنات مبردة'],
    isFeatured: true,
  },
  {
    slug: 'road-freight',
    icon: 'Truck',
    titleEn: 'Road Freight & Trucking',
    titleAr: 'النقل البري',
    excerptEn: 'Cross-border trucking to Libya, Sudan and the Gulf, plus domestic distribution.',
    excerptAr: 'نقل بري عبر الحدود إلى ليبيا والسودان والخليج، وتوزيع داخل مصر.',
    bodyEn:
      'Our road freight service connects Egyptian ports and industrial zones with inland destinations and cross-border markets. Trailers are selected for the cargo: curtainsider, flatbed, low-bed for heavy machinery, and refrigerated units for cold chain.\n\nWe do not own a fleet. Instead we work with a vetted carrier panel that is audited for insurance, driver standards and tracking, which keeps capacity flexible and pricing honest. Every movement is covered by a signed waybill and confirmed cargo insurance.',
    bodyAr:
      'يربط خدمة النقل البري لدينا الموانئ والمناطق الصناعية المصرية بالوجهات الداخلية والأسواق العابرة للحدود. يتم اختيار المقطورة حسب البضاعة: ستائرية، مسطحة، منخفضة للمعدات الثقيلة، ومبردة لسلسلة التبريد.\n\nنحن لا نمتلك أسطولًا، بل نعمل مع مجموعة ناقلين معتمدين يتم تدقيقهم من حيث التأمين ومستوى السائقين والتتبع، مما يحافظ على مرونة السعة ومصداقية السعر. كل حركة مغطاة ببوليصة شحن موقعة وتأمين بضائع مؤكد.',
    featuresEn: ['Cross-border corridors', 'Heavy and low-bed trailers', 'Cold chain units', 'Vetted carrier panel'],
    featuresAr: ['ممرات عبور حدودي', 'مقطورات ثقيلة ومنخفضة', 'وحدات سلسلة تبريد', 'قائمة ناقلين معتمدين'],
    isFeatured: true,
  },
  {
    slug: 'customs-clearance',
    icon: 'ShieldCheck',
    titleEn: 'Customs Clearance',
    titleAr: 'التخليص الجمركي',
    excerptEn: 'Import and export clearance at all Egyptian sea ports, dry ports and Cairo Airport.',
    excerptAr: 'تخليص الواردات والصادرات في جميع الموانئ البحرية والجافة ومطار القاهرة.',
    bodyEn:
      'Clearing Egyptian customs is a documentation discipline. Our brokers prepare the entry, classify the goods, calculate duties and taxes up front, and coordinate inspection where required, so surprises are found before cargo arrives rather than after demurrage starts.\n\nWe work with ACI / Nafeza pre-registration, certificates of origin, exemptions and free-zone movements, and we tell you the landed cost before you commit to the shipment.',
    bodyAr:
      'التخليص الجمركي في مصر هو في الأساس انضباط في المستندات. يقوم مخلصونا بإعداد البيان الجمركي وتصنيف البضاعة وحساب الرسوم والضرائب مقدمًا والتنسيق للمعاينة عند الحاجة، حتى تُكتشف المفاجآت قبل وصول البضاعة وليس بعد بدء غرامات التأخير.\n\nنعمل مع التسجيل المسبق ACI / نافذة وشهادات المنشأ والإعفاءات وحركات المناطق الحرة، ونخبرك بالتكلفة النهائية للبضاعة قبل التعهد بالشحنة.',
    featuresEn: ['ACI / Nafeza registration', 'Duty and tax estimation', 'Inspection coordination', 'Free zone and temporary release'],
    featuresAr: ['التسجيل المسبق ACI / نافذة', 'تقدير الرسوم والضرائب', 'تنسيق المعاينة', 'المناطق الحرة والإفراج المؤقت'],
    isFeatured: true,
  },
  {
    slug: 'freight-forwarding',
    icon: 'Globe2',
    titleEn: 'International Freight Forwarding',
    titleAr: 'وكالة الشحن الدولية',
    excerptEn: 'One accountable partner from supplier door to final destination.',
    excerptAr: 'شريك واحد مسؤول من باب المورد حتى الوجهة النهائية.',
    bodyEn:
      'As a freight forwarder we do not move the cargo ourselves; we take responsibility for the whole movement. That means one booking, one set of documents, one contact, and one party accountable for the outcome across carriers, agents, customs and truckers.\n\nOur overseas agent network covers the main sourcing regions, so a factory collection in Asia, a consolidation in Europe and a delivery in Egypt are managed as a single file with a single reference number.',
    bodyAr:
      'بصفتنا وكيل شحن، نحن لا ننقل البضاعة بأنفسنا، بل نتحمل مسؤولية الحركة بالكامل. أي حجز واحد ومجموعة مستندات واحدة وجهة اتصال واحدة وطرف واحد مسؤول عن النتيجة عبر الناقلين والوكلاء والجمارك والشاحنات.\n\nتغطي شبكة وكلائنا الخارجيين أهم مناطق التوريد، sehingga يتم إدارة التحصيل من المصنع في آسيا والتجميع في أوروبا والتسليم في مصر كملف واحد برقم مرجعي واحد.',
    featuresEn: ['Single point of accountability', 'Overseas agent network', 'End-to-end documentation', 'Multimodal routing'],
    featuresAr: ['مسؤولية من نقطة واحدة', 'شبكة وكلاء بالخارج', 'مستندات من البداية للنهاية', 'مسارات متعددة الوسائط'],
    isFeatured: false,
  },
  {
    slug: 'inland-haulage',
    icon: 'Container',
    titleEn: 'Inland Haulage',
    titleAr: 'النقل الداخلي من وإلى الموانئ',
    excerptEn: 'Port-to-door container haulage across Egypt, with demurrage control.',
    excerptAr: 'نقل الحاويات من الميناء إلى الباب في كل أنحاء مصر مع ضبط غرامات التأخير.',
    bodyEn:
      'Inland haulage is where most avoidable costs appear: container detention, missed empty returns and re-handling. We plan the truck against the actual release time, monitor the free days and return the empty equipment before the clock runs out.\n\nCoverage includes Alexandria, Dekheila, Damietta, Port Said, Sokhna, Adabiya, Safaga and Cairo dry port, with delivery to factories, projects and distribution centres nationwide.',
    bodyAr:
      'النقل الداخلي هو المكان الذي تظهر فيه معظم التكاليف القابلة للتجنب: غرامات تأخير الحاويات وإرجاع الحاويات الفارغة المتأخر وإعادة المناولة. نخطط الشاحنة بناءً على وقت الإفراج الفعلي ونراقب أيام السماح ونعيد المعدات الفارغة قبل انتهاء المدة.\n\nتشمل التغطية الإسكندرية والدخيلة ودمياط وبورسعيد والسخنة والعضبية وسفاجا والميناء الجاف بالقاهرة، مع التوصيل للمصانع والمشروعات ومراكز التوزيع في جميع أنحاء الجمهورية.',
    featuresEn: ['Port-to-door delivery', 'Detention and demurrage control', 'National coverage', 'Live truck coordination'],
    featuresAr: ['توصيل من الميناء إلى الباب', 'ضبط غرامات التأخير', 'تغطية على مستوى الجمهورية', 'تنسيق مباشر للشاحنات'],
    isFeatured: false,
  },
  {
    slug: 'packing-handling',
    icon: 'Package',
    titleEn: 'Packing & Cargo Handling',
    titleAr: 'التغليف ومناولة البضائع',
    excerptEn: 'Export packing, palletisation and crating through approved partner facilities.',
    excerptAr: 'تغليف التصدير والتكتيل والصناديق الخشبية عبر منشآت شريكة معتمدة.',
    bodyEn:
      'Correct packing is cheaper than damaged cargo. We advise on export-grade packing, palletisation, shrink wrapping, marking and wooden crating for machinery, and we supervise loading and lashing at the supplier or at a partner facility.\n\nSince we do not operate our own warehouses, storage is arranged with vetted third-party facilities next to the ports and industrial zones, always quoted transparently per pallet or per square metre with a defined free period.',
    bodyAr:
      'التغليف الصحيح أرخص من البضاعة التالفة. نقدم المشورة في تغليف التصدير والتكتيل والتغليف الحراري والعلامات والصناديق الخشبية للمعدات، ونشرف على التحميل والتثبيت لدى المورد أو في منشأة شريكة.\n\nولأننا لا نمتلك مخازن خاصة، يتم ترتيب التخزين في منشآت معتمدة من أطراف ثالثة بجوار الموانئ والمناطق الصناعية، ويُسعَّر دائمًا بشفافية لكل طبلية أو متر مربع مع فترة سماح محددة.',
    featuresEn: ['Export-grade packing advice', 'Crating and palletisation', 'Loading supervision', 'Partner storage near ports'],
    featuresAr: ['استشارات تغليف بمواصفات التصدير', 'صناديق خشبية وتكتيل', 'الإشراف على التحميل', 'تخزين لدى شركاء قرب الموانئ'],
    isFeatured: false,
  },
  {
    slug: 'documentation-compliance',
    icon: 'FileCheck2',
    titleEn: 'Trade Documentation & Compliance',
    titleAr: 'مستندات التجارة والامتثال',
    excerptEn: 'ACD, certificates of origin, legalisation and pre-shipment inspection support.',
    excerptAr: 'البيان الجمركي وشهادات المنشأ والتصديق ودعم الفحص قبل الشحن.',
    bodyEn:
      'A missing certificate can cost more than the freight. We prepare and review the commercial invoice, packing list, bill of lading, certificate of origin and any required inspection certificates before the shipment sails.\n\nWe also support advance cargo information filings, legalisation through the chambers of commerce and consular requirements, and we keep a copy of every document on file for your audit trail.',
    bodyAr:
      'شهادة ناقصة قد تكلف أكثر من الشحن نفسه. نقوم بإعداد ومراجعة الفاتورة التجارية وقائمة التعبئة وبوليصة الشحن وشهادة المنشأ وأي شهادات فحص مطلوبة قبل إبحار الشحنة.\n\nكما ندعم تسجيل بيانات الشحنة المسبقة والتصديق من الغرف التجارية والمتطلبات القنصلية، ونحتفظ بنسخة من كل مستند لملف التدقيق الخاص بك.',
    featuresEn: ['Document preparation and review', 'Certificate of origin', 'Chamber and consular legalisation', 'Digital document archive'],
    featuresAr: ['إعداد ومراجعة المستندات', 'شهادة المنشأ', 'التصديق من الغرف والقنصليات', 'أرشيف مستندات رقمي'],
    isFeatured: false,
  },
  {
    slug: 'project-cargo',
    icon: 'Forklift',
    titleEn: 'Project & Oversized Cargo',
    titleAr: 'شحنات المشروعات والبضائع كبيرة الحجم',
    excerptEn: 'Route surveys, permits and heavy-lift planning for industrial projects.',
    excerptAr: 'دراسات المسار والتصاريح وتخطيط الأحمال الثقيلة للمشروعات الصناعية.',
    bodyEn:
      'Project cargo fails on the details: a bridge height, a permit window, a crane capacity. We start with a route survey and a lift plan, then match equipment, escorts and permits to the actual constraints of the cargo.\n\nOpen-top, flat-rack, break-bulk and low-bed solutions are combined with customs and site-delivery coordination so the equipment arrives when the installation team is ready for it.',
    bodyAr:
      'شحنات المشروعات تفشل في التفاصيل: ارتفاع كوبري، نافذة تصريح، سعة ونش. نبدأ بدراسة المسار وخطة الرفع، ثم نطابق المعدات والمرافقة والتصاريح مع القيود الفعلية للبضاعة.\n\nيتم الجمع بين حلول الحاويات المفتوحة والمسطحة والبضائع السائبة والمقطورات المنخفضة مع تنسيق جمركي وتسليم بالموقع، حتى تصل المعدات في الوقت الذي يكون فيه فريق التركيب مستعدًا لها.',
    featuresEn: ['Route survey and permits', 'Heavy-lift planning', 'Break-bulk and flat-rack', 'Site delivery coordination'],
    featuresAr: ['دراسة المسار والتصاريح', 'تخطيط الأحمال الثقيلة', 'بضائع سائبة وحاويات مسطحة', 'تنسيق التسليم بالموقع'],
    isFeatured: false,
  },
];

const settings: Record<string, string> = {
  company_name: 'RFY Logistics',
  company_name_ar: 'RFY للخدمات اللوجستية',
  phone: '+20 100 000 0000',
  whatsapp: '+201000000000',
  email: 'info@rfy-demo.local',
  operations_email: 'operations@rfy-demo.local',
  address_en: '14 El Horreya Avenue, Alexandria, Egypt',
  address_ar: '14 شارع الحرية، الإسكندرية، مصر',
  hours_en: 'Saturday – Thursday, 08:30 – 17:00',
  hours_ar: 'السبت – الخميس، 08:30 – 17:00',
};

const demoShipments = [
  {
    trackingNumber: 'DEMO-SEA-1001',
    reference: 'MSQ-2026-A1B2',
    status: 'IN_TRANSIT' as const,
    mode: 'SEA' as const,
    carrier: 'Demo Carrier Line',
    vesselOrFlight: 'MV SAMPLE TRADER / 042E',
    containerType: "40' HC",
    originPort: 'Shanghai, CN',
    destinationPort: 'Alexandria, EG',
    pieces: 420,
    weightKg: 12800,
    etd: new Date('2026-11-02T00:00:00.000Z'),
    eta: new Date('2026-12-04T00:00:00.000Z'),
    lastLocation: 'Suez Canal anchorage',
    events: [
      { status: 'BOOKED' as const, location: 'Shanghai, CN', description: 'Booking confirmed and container released for loading', occurredAt: new Date('2026-10-21T09:00:00.000Z') },
      { status: 'DEPARTED_ORIGIN' as const, location: 'Shanghai, CN', description: 'Vessel departed from origin terminal', occurredAt: new Date('2026-11-02T18:30:00.000Z') },
      { status: 'IN_TRANSIT' as const, location: 'Suez Canal anchorage', description: 'Vessel waiting for canal transit slot', occurredAt: new Date('2026-11-16T06:15:00.000Z') },
    ],
  },
  {
    trackingNumber: 'DEMO-AIR-1002',
    reference: 'MSQ-2026-C3D4',
    status: 'CUSTOMS_CLEARANCE' as const,
    mode: 'AIR' as const,
    carrier: 'Demo Air Cargo',
    vesselOrFlight: 'MS 812',
    containerType: null,
    originPort: 'Frankfurt, DE',
    destinationPort: 'Cairo, EG',
    pieces: 6,
    weightKg: 185.5,
    etd: new Date('2026-11-14T00:00:00.000Z'),
    eta: new Date('2026-11-17T00:00:00.000Z'),
    lastLocation: 'Cairo Airport cargo village',
    events: [
      { status: 'BOOKED' as const, location: 'Frankfurt, DE', description: 'Air waybill issued and cargo accepted', occurredAt: new Date('2026-11-13T11:20:00.000Z') },
      { status: 'DEPARTED_ORIGIN' as const, location: 'Frankfurt, DE', description: 'Flight departed', occurredAt: new Date('2026-11-14T22:10:00.000Z') },
      { status: 'CUSTOMS_CLEARANCE' as const, location: 'Cairo, EG', description: 'Import entry lodged, awaiting inspection slot', occurredAt: new Date('2026-11-16T08:45:00.000Z') },
    ],
  },
  {
    trackingNumber: 'DEMO-ROAD-1003',
    reference: 'MSQ-2026-E5F6',
    status: 'DELIVERED' as const,
    mode: 'ROAD' as const,
    carrier: 'Demo Transport Partner',
    vesselOrFlight: null,
    containerType: 'Curtainsider',
    originPort: 'Alexandria, EG',
    destinationPort: '10th of Ramadan City, EG',
    pieces: 48,
    weightKg: 9600,
    etd: new Date('2026-11-05T00:00:00.000Z'),
    eta: new Date('2026-11-06T00:00:00.000Z'),
    lastLocation: '10th of Ramadan City, EG',
    deliveredAt: new Date('2026-11-06T13:40:00.000Z'),
    events: [
      { status: 'ORIGIN_PICKUP' as const, location: 'Alexandria, EG', description: 'Cargo loaded at consignee warehouse', occurredAt: new Date('2026-11-05T07:10:00.000Z') },
      { status: 'IN_TRANSIT' as const, location: 'Cairo ring road', description: 'In transit to destination', occurredAt: new Date('2026-11-05T12:00:00.000Z') },
      { status: 'DELIVERED' as const, location: '10th of Ramadan City, EG', description: 'Delivered and signed for by consignee', occurredAt: new Date('2026-11-06T13:40:00.000Z') },
    ],
  },
];

async function main(): Promise<void> {
  const adminEmail = env.ADMIN_EMAIL.toLowerCase();
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: env.ADMIN_NAME,
        passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12),
        role: 'ADMIN',
      },
    });
    logger.info('Seed: administrator account created', { email: adminEmail });
  } else {
    logger.info('Seed: administrator already exists', { email: adminEmail });
  }

  for (const [index, service] of services.entries()) {
    await prisma.service.upsert({
      where: { slug: service.slug },
      // Content edited in the dashboard must survive re-seeding.
      update: {},
      create: {
        ...service,
        position: index,
      },
    });
  }
  logger.info('Seed: service catalogue ready', { count: services.length });

  for (const [key, value] of Object.entries(settings)) {
    await prisma.companySetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  await seedErpReferenceData();

  if (env.SEED_DEMO_DATA !== 'false') {
    for (const shipment of demoShipments) {
      const { events, ...record } = shipment;
      await prisma.shipment.upsert({
        where: { trackingNumber: record.trackingNumber },
        update: { isPublic: env.NODE_ENV === 'development' },
        create: {
          ...record,
          isDemo: true,
          isPublic: env.NODE_ENV === 'development',
          events: { create: events },
        },
      });
    }
    logger.info('Seed: demonstration shipments ready (clearly labelled as demo data)');
  }

  logger.info('Seed complete');
}

main()
  .catch((error) => {
    logger.error('Seed failed', { message: (error as Error).message });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
