/** Single source of truth for company/brand data shown on the public site.
 *  Values are placeholders until the client supplies verified information. */
export const SITE = {
  brand: 'RFY Logistics',
  brandAr: 'RFY للخدمات اللوجستية',
  legalName: 'RFY Logistics — Freight Forwarding & Customs Clearance',
  url: import.meta.env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'),
  phone: '+20 100 000 0000',
  phoneHref: '+201000000000',
  whatsapp: '+201000000000',
  email: 'info@rfy-demo.local',
  operationsEmail: 'operations@rfy-demo.local',
  addressEn: '14 El Horreya Avenue, Alexandria, Egypt',
  addressAr: '14 شارع الحرية، الإسكندرية، مصر',
  hoursEn: 'Saturday – Thursday, 08:30 – 17:00',
  hoursAr: 'السبت – الخميس، 08:30 – 17:00',
  offices: [
    { en: 'Alexandria — head office & port operations', ar: 'الإسكندرية — المكتب الرئيسي وعمليات الميناء' },
    { en: 'Cairo — commercial & air freight desk', ar: 'القاهرة — المكتب التجاري ومكتب الشحن الجوي' },
  ],
  ports: ['Alexandria', 'El Dekheila', 'Damietta', 'Port Said', 'Sokhna', 'Adabiya', 'Safaga', 'Cairo Airport'],
  social: {
    linkedin: 'https://www.linkedin.com/',
    facebook: 'https://www.facebook.com/',
    instagram: 'https://www.instagram.com/',
    youtube: 'https://www.youtube.com/',
    x: 'https://x.com/',
  },
} as const;

export const QUOTE_STATUSES = [
  'NEW',
  'UNDER_REVIEW',
  'QUOTATION_SENT',
  'APPROVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export const SHIPMENT_STATUSES = [
  'BOOKED',
  'ORIGIN_PICKUP',
  'DEPARTED_ORIGIN',
  'IN_TRANSIT',
  'CUSTOMS_CLEARANCE',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELAYED',
  'CANCELLED',
] as const;

export const FREIGHT_MODES = ['SEA', 'AIR', 'ROAD', 'RAIL', 'MULTIMODAL'] as const;

export const SHIPMENT_TYPES = [
  'FCL',
  'LCL',
  'Break bulk',
  'Reefer',
  'Oversized / project',
  'Air general cargo',
  'Express / courier',
  'Land / cross-border',
  'Other',
] as const;

export const CONTAINER_TYPES = ["20' DV", "40' DV", "40' HC", "20' RF", "40' RF", "20' OT", "40' FR", 'ISO tank'] as const;

export const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'] as const;
