import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { ApiError } from '../../middleware/error';
import type { FreightMode, ShipmentStatus } from '@prisma/client';

export interface TrackingEventDto {
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
  /** true when the record comes from the seeded demonstration dataset */
  isDemo: boolean;
  provider: string;
  events: TrackingEventDto[];
}

export interface TrackingProvider {
  readonly name: string;
  lookup(trackingNumber: string): Promise<TrackingResult | null>;
}

/**
 * Reads shipment and shipment-event records from our own database.
 * This is the "control tower" model: the operations team maintains the data
 * and the public site only reflects what was actually recorded.
 */
class DatabaseTrackingProvider implements TrackingProvider {
  readonly name = 'database';

  async lookup(trackingNumber: string): Promise<TrackingResult | null> {
    const shipment = await prisma.shipment.findFirst({
      where: { trackingNumber: trackingNumber.toUpperCase(), isPublic: true },
      include: { events: { orderBy: { occurredAt: 'desc' } } },
    });
    if (!shipment) return null;

    return {
      trackingNumber: shipment.trackingNumber,
      reference: shipment.reference,
      status: shipment.status,
      mode: shipment.mode,
      carrier: shipment.carrier,
      vesselOrFlight: shipment.vesselOrFlight,
      containerType: shipment.containerType,
      originPort: shipment.originPort,
      destinationPort: shipment.destinationPort,
      pieces: shipment.pieces,
      weightKg: shipment.weightKg === null ? null : Number(shipment.weightKg),
      etd: shipment.etd?.toISOString() ?? null,
      eta: shipment.eta?.toISOString() ?? null,
      deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
      lastLocation: shipment.lastLocation,
      updatedAt: shipment.updatedAt.toISOString(),
      isDemo: shipment.isDemo,
      provider: this.name,
      events: shipment.events.map((event) => ({
        status: event.status,
        location: event.location,
        description: event.description,
        occurredAt: event.occurredAt.toISOString(),
      })),
    };
  }
}

/**
 * Minimal adapter for a carrier / visibility-platform HTTP API.
 * The response contract below must be mapped per provider before going live;
 * it exists so the integration point is explicit instead of invented data.
 */
class HttpCarrierTrackingProvider implements TrackingProvider {
  readonly name = 'carrier-api';

  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  async lookup(trackingNumber: string): Promise<TrackingResult | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${encodeURIComponent(trackingNumber)}`, {
        headers: { authorization: `Bearer ${this.apiKey}`, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      logger.error('Carrier tracking request failed', { message: (error as Error).message });
      throw new ApiError(503, 'TRACKING_UNAVAILABLE', 'Shipment tracking is temporarily unavailable');
    }

    if (response.status === 404) return null;
    if (!response.ok) {
      logger.error('Carrier tracking returned an error status', { status: response.status });
      throw new ApiError(503, 'TRACKING_UNAVAILABLE', 'Shipment tracking is temporarily unavailable');
    }

    const payload = (await response.json()) as Record<string, unknown>;
    // Contract: { trackingNumber, status, mode, origin, destination, events[] }
    return {
      trackingNumber: String(payload.trackingNumber ?? trackingNumber),
      reference: (payload.reference as string) ?? null,
      status: (payload.status as ShipmentStatus) ?? 'IN_TRANSIT',
      mode: (payload.mode as FreightMode) ?? 'SEA',
      carrier: (payload.carrier as string) ?? null,
      vesselOrFlight: (payload.vesselOrFlight as string) ?? null,
      containerType: (payload.containerType as string) ?? null,
      originPort: String(payload.origin ?? '-'),
      destinationPort: String(payload.destination ?? '-'),
      pieces: null,
      weightKg: null,
      etd: (payload.etd as string) ?? null,
      eta: (payload.eta as string) ?? null,
      deliveredAt: null,
      lastLocation: (payload.lastLocation as string) ?? null,
      updatedAt: new Date().toISOString(),
      isDemo: false,
      provider: this.name,
      events: Array.isArray(payload.events)
        ? (payload.events as TrackingEventDto[])
        : [],
    };
  }
}

export const trackingProvider: TrackingProvider =
  env.CARRIER_API_URL && env.CARRIER_API_KEY
    ? new HttpCarrierTrackingProvider(env.CARRIER_API_URL, env.CARRIER_API_KEY)
    : new DatabaseTrackingProvider();
