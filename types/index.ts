// ─── Core domain types for Domner App ────────────────────────────────────────

export type Language = 'en' | 'km';

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  passport_country: string;
  preferred_language: Language;
  telegram_username: string | null;
  avatar_url: string | null;
  created_at: string;
}

// ─── eSIM ────────────────────────────────────────────────────────────────────

export type NetworkQuality = 'Excellent' | 'Good';
export type NetworkTech = '4G LTE' | '4G/5G' | '5G';

export interface Destination {
  slug: string;
  name: string;
  nameKm: string;
  flag: string;
  region: 'Asia' | 'East Asia' | 'Southeast Asia' | 'Europe' | 'Americas' | 'Middle East' | 'Oceania';
  fromPriceUsd: number;
  networkQuality: NetworkQuality;
  networkTech: NetworkTech;
  networks: string[];
  currency: string;
  usdRate: number;
  popular: boolean;
}

export interface EsimPlan {
  id: string;
  countrySlug: string;
  tier: 'basic' | 'standard' | 'premium';
  name: string;
  durationDays: number;
  dataGbDaily: number;
  priceUsd: number;
  network: NetworkTech;
  features: string[];
  popular: boolean;
}

export interface CartItem {
  planId: string;
  countrySlug: string;
  countryName: string;
  flag: string;
  planName: string;
  durationDays: number;
  dataGbDaily: number;
  priceUsd: number;
  quantity: number;
}

export type OrderStatus = 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';
export type PaymentMethod = 'stripe' | 'aba';

export interface EsimOrder {
  id: string;
  user_id: string | null;
  order_number: string;
  country: string;
  plan_name: string;
  duration_days: number;
  data_gb_daily: number;
  price_usd: number;
  status: OrderStatus;
  qr_code_url: string | null;
  payment_method: PaymentMethod | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  device_type: string | null;
  notes: string | null;
  created_at: string;
  fulfilled_at: string | null;
}

// ─── Flights ─────────────────────────────────────────────────────────────────

export type FlightStatusKind =
  | 'scheduled'
  | 'on-time'
  | 'delayed'
  | 'boarding'
  | 'active'
  | 'landed'
  | 'cancelled'
  | 'diverted';

export interface FlightEndpoint {
  airport: string;
  airportName: string;
  city: string;
  scheduledTime: string;
  actualTime?: string;
  estimatedTime?: string;
  gate?: string;
  terminal?: string;
  checkInCounter?: string;
  baggageBelt?: string;
  timezone: string;
}

export interface FlightStatus {
  flightNumber: string;
  airline: string;
  status: FlightStatusKind;
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  aircraft?: string;
  registration?: string;
  delayMinutes?: number;
  progress?: number; // 0-100
  trackerCount?: number;
}

export interface SavedFlight {
  id: string;
  user_id: string;
  flight_number: string;
  flight_date: string;
  departure_airport: string | null;
  arrival_airport: string | null;
  notify_gate_change: boolean;
  notify_delay: boolean;
  notify_boarding: boolean;
  notify_landing: boolean;
  share_token: string;
  created_at: string;
}

// ─── Trips & checklist ───────────────────────────────────────────────────────

export interface TripPlan {
  id: string;
  user_id: string;
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  travelers: number;
  budget: string | null;
  interests: string[];
  cover_image_url: string | null;
  is_public: boolean;
  share_token: string;
  created_at: string;
}

export type ChecklistCategory = 'urgent' | 'important' | 'pack' | 'day-of';

export interface ChecklistItem {
  id: string;
  category: ChecklistCategory;
  item: string;
  itemKm?: string;
  isCompleted: boolean;
  isRequired: boolean;
  dueBeforeHours?: number;
  link?: string;
}

export interface TripMemory {
  id: string;
  trip_id: string;
  photo_url: string | null;
  caption: string | null;
  location: string | null;
  taken_at: string | null;
}

// ─── Airport guide ───────────────────────────────────────────────────────────

export interface AirportStep {
  title: string;
  timing?: string;
  description: string;
  phrases?: { label: string; phrase: string }[];
  watchOut?: string;
}

export interface AirportGuide {
  code: string;
  name: string;
  city: string;
  country: string;
  flag: string;
  departureSteps: AirportStep[];
  arrivalSteps: AirportStep[];
}

// ─── Emergency phrases ───────────────────────────────────────────────────────

export interface EmergencyPhrase {
  en: string;
  km: string;
  translation: string;
  phonetic?: string;
}

export interface PhraseCategory {
  id: string;
  title: string;
  titleKm: string;
  icon: string;
  phrases: EmergencyPhrase[];
}

export interface PhraseLanguage {
  code: string;
  name: string;
  flag: string;
  categories: PhraseCategory[];
}

// ─── Affiliates ──────────────────────────────────────────────────────────────

export interface Affiliate {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  telegram: string | null;
  referral_code: string;
  commission_rate: number;
  total_clicks: number;
  total_orders: number;
  total_earned_usd: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

// ─── Misc data types ─────────────────────────────────────────────────────────

export interface CustomsRule {
  countrySlug: string;
  maxCashUsd: number;
  visaInfo: string;
  maxStayDays: number;
  notes: string[];
}

export interface ScamAlert {
  countrySlug: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}
