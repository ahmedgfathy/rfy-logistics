export type Locale = 'en' | 'ar';

export type FreightMode = 'SEA' | 'AIR' | 'ROAD' | 'RAIL' | 'MULTIMODAL';

export interface Service {
  slug: string;
  icon: string;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  featuresEn: string[];
  featuresAr: string[];
  isFeatured: boolean;
  position: number;
  bodyEn?: string;
  bodyAr?: string;
}

export type ShipmentStatus =
  | 'BOOKED'
  | 'ORIGIN_PICKUP'
  | 'DEPARTED_ORIGIN'
  | 'IN_TRANSIT'
  | 'CUSTOMS_CLEARANCE'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELAYED'
  | 'CANCELLED';

export interface TrackingEvent {
  status: ShipmentStatus;
  location: string | null;
  description: string;
  occurredAt: string;
}

export interface TrackingResult {
  trackingNumber: string;
  reference: string | null;
  status: ShipmentStatus;
  mode: FreightMode;
  carrier: string | null;
  vesselOrFlight: string | null;
  containerType: string | null;
  originPort: string;
  destinationPort: string;
  pieces: number | null;
  weightKg: number | null;
  etd: string | null;
  eta: string | null;
  deliveredAt: string | null;
  lastLocation: string | null;
  updatedAt: string;
  isDemo: boolean;
  provider: string;
  events: TrackingEvent[];
}

export interface QuoteFormValues {
  fullName: string;
  companyName: string;
  email: string;
  phone: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  shipmentType: string;
  freightMode: FreightMode;
  cargoDescription: string;
  cargoWeightKg: string;
  cargoVolumeCbm: string;
  packageCount: string;
  containerType: string;
  incoterms: string;
  expectedShipDate: string;
  additionalNotes: string;
  consent: boolean;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'EDITOR';
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export type QuoteStatus =
  | 'NEW'
  | 'UNDER_REVIEW'
  | 'QUOTATION_SENT'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface QuoteSummary {
  id: string;
  reference: string;
  fullName: string;
  companyName: string | null;
  email: string;
  phone: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  freightMode: FreightMode;
  status: QuoteStatus;
  createdAt: string;
  _count?: { attachments: number };
}

export interface QuoteDetail extends QuoteSummary {
  shipmentType: string;
  cargoDescription: string;
  cargoWeightKg: string | null;
  cargoVolumeCbm: string | null;
  packageCount: number | null;
  containerType: string | null;
  incoterms: string | null;
  expectedShipDate: string | null;
  additionalNotes: string | null;
  adminNotes: string | null;
  locale: string;
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }[];
}

export interface ContactMessage {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  company: string | null;
  subject: string;
  message: string;
  status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
}

export interface AdminShipment {
  id: string;
  trackingNumber: string;
  reference: string | null;
  status: ShipmentStatus;
  mode: FreightMode;
  carrier: string | null;
  originPort: string;
  destinationPort: string;
  etd: string | null;
  eta: string | null;
  lastLocation: string | null;
  isDemo: boolean;
  updatedAt: string;
  events?: TrackingEvent[];
}

export interface DashboardStats {
  totals: { totalQuotes: number; newQuotes: number; openContacts: number; shipmentsInTransit: number; last30: number };
  quotesByStatus: { status: QuoteStatus; count: number }[];
  recentQuotes: {
    id: string;
    reference: string;
    fullName: string;
    companyName: string | null;
    destinationCountry: string;
    freightMode: FreightMode;
    status: QuoteStatus;
    createdAt: string;
  }[];
  recentContacts: { id: string; fullName: string; subject: string; status: string; createdAt: string }[];
}

export interface AdminService extends Service {
  id: string;
  isActive: boolean;
  bodyEn: string;
  bodyAr: string;
}
