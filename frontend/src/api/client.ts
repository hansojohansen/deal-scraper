const BASE = "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Car {
  id: number;
  url: string;
  title: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  fuel_type: string | null;
  transmission: string | null;
  price: number | null;
  location: string | null;
  status: string;
  eu_inspected_at: string | null;
  eu_next_deadline: string | null;
  is_norwegian_reg: boolean | null;
  listing_type: string | null;
  first_seen_at: string;
  outlier_score: OutlierScore | null;
}

export interface OutlierScore {
  id: number;
  car_id: number;
  score: number;
  reason: string;
  peer_group_size: number;
  peer_avg_price: number;
  detected_at: string;
}

export interface Outlier extends OutlierScore {
  brand: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  price: number | null;
  url: string;
  title: string | null;
}

export interface CursorPage<T> {
  items: T[];
  next_cursor: number | null;
}

export interface StatsSummary {
  total_listings: number;
  avg_price: number;
  median_price: number;
  new_today: number;
  price_by_km_buckets: { label: string; avg_price: number; count: number }[];
  price_trend_30d: { date: string; avg_price: number }[];
}

export interface BrandStat {
  brand: string;
  count: number;
  avg_price: number;
}

export interface ModelStats {
  model: string;
  count: number;
  avg_price: number;
  min_price: number;
  max_price: number;
}

export interface Alert {
  id: number;
  notify_email: string;
  brand: string | null;
  model: string | null;
  year_min: number | null;
  year_max: number | null;
  price_max: number | null;
  mileage_max: number | null;
  fuel_type: string | null;
  is_active: boolean;
  min_discount_pct: number | null;
  created_at: string;
}

export interface AlertCreate {
  notify_email: string;
  brand?: string;
  model?: string;
  year_min?: number;
  year_max?: number;
  price_max?: number;
  mileage_max?: number;
  fuel_type?: string;
  min_discount_pct?: number;
}

export interface CarFilters {
  brand?: string;
  model?: string;
  title?: string;
  year_min?: string;
  year_max?: string;
  price_min?: string;
  price_max?: string;
  mileage_max?: string;
  fuel_type?: string;
  listing_type?: string;
}

export const api = {
  getCars: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v != null && v !== "" && q.set(k, String(v)));
    return request<CursorPage<Car>>(`/api/v1/cars?${q}`);
  },
  getModelsByBrand: (brand: string) =>
    request<string[]>(`/api/v1/cars/brands/${encodeURIComponent(brand)}/models`),
  getStatsSummary: () => request<StatsSummary>("/api/v1/stats/summary"),
  getBrands: () => request<BrandStat[]>("/api/v1/stats/brands"),
  getModelStats: (brand: string) =>
    request<ModelStats[]>(`/api/v1/stats/models?brand=${encodeURIComponent(brand)}`),
  getOutliers: (limit = 50) => request<Outlier[]>(`/api/v1/outliers?limit=${limit}`),
  getAlerts: () => request<Alert[]>("/api/v1/alerts"),
  createAlert: (body: AlertCreate) =>
    request<Alert>("/api/v1/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  toggleAlert: (id: number, is_active: boolean) =>
    request<Alert>(`/api/v1/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active }),
    }),
  deleteAlert: (id: number) => request<void>(`/api/v1/alerts/${id}`, { method: "DELETE" }),
};
