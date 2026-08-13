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

/**
 * How a plan's allowance behaves. This is not cosmetic — it changes what the
 * customer can do on day one.
 *
 *   daily — refills every midnight. Cannot be exhausted early, but there is a
 *           hard ceiling each day.
 *   fixed — one pot for the whole trip. Can be spent in an afternoon.
 */
export type DataType = 'daily' | 'fixed';

export interface EsimPlan {
  id: string;
  countrySlug: string;
  tier: 'basic' | 'standard' | 'premium';
  name: string;
  durationDays: number;
  dataType: DataType;
  /** Daily allowance. On a `fixed` plan this is the average, not a real cap. */
  dataGbDaily: number;
  /** Total data over the plan's life. The honest headline for a `fixed` plan. */
  dataGbTotal: number;
  /** '4G/5G', or a capped rate like '10Mbps' on unlimited plans. From the supplier. */
  speed: string;
  /** True only where the supplier confirms voice and SMS on this exact SKU. */
  callSms: boolean;
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
  dataType: DataType;
  dataGbDaily: number;
  dataGbTotal: number;
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

  // Money — every figure is computed server-side in lib/pricing.ts.
  subtotal_usd: number;
  discount_usd: number;
  price_usd: number;
  /** Supplier cost. null means unknown — never treat it as zero when reporting margin. */
  cost_usd: number | null;
  currency: string;
  discount_code: string | null;
  referral_code: string | null;

  status: OrderStatus;

  // Fulfilment — provider_* are filled by the eSIM supplier integration.
  qr_code_url: string | null;
  esim_iccid: string | null;
  esim_activation_code: string | null;
  provider_name: string | null;
  provider_order_id: string | null;

  payment_method: PaymentMethod | null;
  stripe_payment_id: string | null;
  aba_payment_id: string | null;
  idempotency_key: string | null;

  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  device_type: string | null;
  notes: string | null;

  created_at: string;
  updated_at: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  // Delivery — see docs/DELIVERY.md
  delivery_channel?: DeliveryChannel;
  customer_phone_country?: string | null;
  telegram_chat_id?: number | null;
  telegram_username?: string | null;
  delivered_email_at?: string | null;
  delivered_telegram_at?: string | null;
}

/** Where the customer wants their eSIM QR code sent. */
export type DeliveryChannel = 'email' | 'telegram' | 'both';

/** A priced line on an order, as stored in `order_items`. */
export interface OrderItem {
  id: string;
  order_id: string;
  plan_id: string;
  country_slug: string;
  country_name: string;
  plan_name: string;
  tier: string;
  duration_days: number;
  data_gb_daily: number;
  unit_price_usd: number;
  quantity: number;
  line_total_usd: number;
  created_at: string;
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
  /** true when schedule data is simulated (no AeroDataBox key configured) */
  demo?: boolean;
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
  // Khmer copy, all optional: a step with no Khmer yet falls back to the
  // English above rather than rendering blank. Travellers read this while
  // standing in a queue, so a missing translation must never hide the step.
  titleKm?: string;
  timingKm?: string;
  descriptionKm?: string;
  watchOutKm?: string;
}

export interface AirportGuide {
  code: string;
  name: string;
  city: string;
  country: string;
  flag: string;
  /** Link to the airport's official/interactive digital terminal map. */
  digitalMapUrl?: string;
  /** Short label describing the map source, e.g. "Official interactive map". */
  digitalMapLabel?: string;
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
  /** BCP-47 tag used for text-to-speech, e.g. 'vi-VN' */
  speechLang: string;
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
