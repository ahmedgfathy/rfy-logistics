export interface ErpDashboardData {
  totals: {
    customers: number;
    openQuotes: number;
    activeBookings: number;
    activeShipments: number;
    openCustoms: number;
    openTasks: number;
    overdueTasks: number;
    receivables: string | number;
    payables: string | number;
  };
  recentShipments: Array<{
    id: string;
    trackingNumber: string;
    status: string;
    originPort: string;
    destinationPort: string;
    updatedAt: string;
  }>;
  recentQuotes: Array<{
    id: string;
    number: string;
    status: string;
    customer: { nameEn: string };
    currency: string;
    updatedAt: string;
  }>;
  recentInvoices: Array<{
    id: string;
    number: string;
    status: string;
    customer: { nameEn: string };
    total: string | number;
    balance: string | number;
    currency: string;
    updatedAt: string;
  }>;
}

export interface Paginated<T> {
  data: T;
  meta?: { total: number; page: number; limit: number; pages: number };
}
