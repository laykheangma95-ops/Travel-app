// Predictive Delay Intelligence — "where's my aircraft coming from?"
//
// Real airlines rotate the same physical aircraft through several flight
// numbers a day. Most delays are inherited from the inbound leg, not caused
// by the outbound one. We find the aircraft's inbound flight (same airline,
// flight number ± 1, landing at our departure airport), track it live over
// the open ADS-B network, and turn "still 340km away" into a plain-language
// delay estimate — the same rotation-analysis trick apps like Flighty use.

import { fetchFlightStatus } from './aeroDataBox';
import { fetchLiveFlight, haversineKm } from './liveFlight';
import { getAirportCoords } from './airportCoords';

const MIN_TURNAROUND_MINUTES = 45;

export interface DelayPrediction {
  available: boolean;
  confidence: 'high' | 'medium' | 'low';
  predictedDelayMinutes: number;
  reasoning: string;
  reasoningKm: string;
  inboundFlightNumber?: string;
  inboundOrigin?: string;
  inboundEtaMinutes?: number;
  demo?: boolean;
}

function seedFrom(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 997;
  return h;
}

function splitFlightNumber(flightNumber: string): { code: string; num: number } | null {
  const cleaned = flightNumber.replace(/\s+/g, '').toUpperCase();
  const match = cleaned.match(/^([A-Z0-9]{2,3})(\d+)$/);
  if (!match) return null;
  return { code: match[1], num: Number(match[2]) };
}

function getMockPrediction(flightNumber: string, date: string): DelayPrediction {
  const seed = seedFrom(flightNumber.replace(/\s+/g, '').toUpperCase() + date);
  const parsed = splitFlightNumber(flightNumber);
  const inboundNum = parsed ? parsed.num - 1 : 0;
  const inboundFlightNumber = parsed ? `${parsed.code}${inboundNum}` : undefined;
  const etaMinutes = 15 + (seed % 60);
  const delay = Math.max(0, etaMinutes + MIN_TURNAROUND_MINUTES - 90);

  return {
    available: true,
    confidence: 'low',
    predictedDelayMinutes: delay,
    reasoning:
      delay > 0
        ? `Your aircraft's inbound flight ${inboundFlightNumber} is still about ${etaMinutes} min out. After a ${MIN_TURNAROUND_MINUTES}-min turnaround, boarding could run ~${delay} min behind schedule. (Simulated — connect a RapidAPI key for real rotation data.)`
        : `Your aircraft's inbound flight ${inboundFlightNumber} has plenty of buffer before your scheduled departure — on-time looks likely. (Simulated data.)`,
    reasoningKm:
      delay > 0
        ? `យន្តហោះរបស់អ្នកមកពីជើងហោះហើរ ${inboundFlightNumber} នៅឆ្ងាយប្រហែល ${etaMinutes} នាទី។ បន្ថែមរយៈពេលត្រៀមខ្លួន ${MIN_TURNAROUND_MINUTES} នាទី ការឡើងយន្តហោះអាចយឺតជាងកាលវិភាគប្រហែល ${delay} នាទី។ (ទិន្នន័យសាកល្បង)`
        : `ជើងហោះហើរចូល ${inboundFlightNumber} មានពេលវេលាគ្រប់គ្រាន់មុនម៉ោងចេញរបស់អ្នក — ទំនងជាទាន់ពេលវេលា។ (ទិន្នន័យសាកល្បង)`,
    inboundFlightNumber,
    inboundEtaMinutes: etaMinutes,
    demo: true,
  };
}

export async function predictDelay(flightNumber: string, date: string): Promise<DelayPrediction> {
  const parsed = splitFlightNumber(flightNumber);
  if (!parsed) {
    return {
      available: false,
      confidence: 'low',
      predictedDelayMinutes: 0,
      reasoning: "Couldn't parse this flight number.",
      reasoningKm: 'មិនអាចវិភាគលេខជើងហោះហើរនេះបានទេ។',
    };
  }

  const outbound = await fetchFlightStatus(flightNumber, date);
  if (outbound.demo) return getMockPrediction(flightNumber, date);

  const depAirport = outbound.departure.airport;
  const scheduledDepMs = new Date(outbound.departure.scheduledTime).getTime();

  // The same tail number usually flies the previous or next numbered
  // service for that airline — try -1 first (the common convention),
  // then +1, and keep only a candidate that actually lands at our
  // departure airport before we're due to leave.
  const candidateNums = [parsed.num - 1, parsed.num + 1];
  let inbound: Awaited<ReturnType<typeof fetchFlightStatus>> | null = null;
  let inboundFlightNumber = '';

  for (const num of candidateNums) {
    if (num <= 0) continue;
    const candidateFlightNumber = `${parsed.code}${num}`;
    try {
      const candidate = await fetchFlightStatus(candidateFlightNumber, date);
      if (candidate.demo) continue;
      if (candidate.arrival.airport !== depAirport) continue;
      inbound = candidate;
      inboundFlightNumber = candidateFlightNumber;
      break;
    } catch {
      continue;
    }
  }

  if (!inbound) {
    // No confirmed inbound rotation — fall back to whatever delay the
    // outbound leg itself is already reporting.
    const known = outbound.delayMinutes ?? 0;
    return {
      available: known > 0,
      confidence: 'low',
      predictedDelayMinutes: known,
      reasoning:
        known > 0
          ? `We couldn't confirm the inbound aircraft's rotation, but ${flightNumber} is already showing a ${known}-min delay.`
          : "We couldn't confirm this aircraft's inbound rotation yet — no delay signal detected so far.",
      reasoningKm:
        known > 0
          ? `មិនអាចបញ្ជាក់ជើងហោះហើរចូលបានទេ ប៉ុន្តែ ${flightNumber} កំពុងបង្ហាញការយឺតយ៉ាវប្រហែល ${known} នាទីរួចហើយ។`
          : 'មិនអាចបញ្ជាក់ជើងហោះហើរចូលរបស់យន្តហោះនេះនៅឡើយទេ — មិនទាន់មានសញ្ញានៃការយឺតយ៉ាវនោះទេ។',
    };
  }

  // Estimate when the inbound aircraft actually lands at our airport.
  const depCoords = getAirportCoords(depAirport);
  const scheduledInboundArrMs = new Date(inbound.arrival.estimatedTime ?? inbound.arrival.scheduledTime).getTime();
  let inboundArrivalMs = scheduledInboundArrMs;
  let confidence: DelayPrediction['confidence'] = 'medium';
  let inboundEtaMinutes = Math.max(0, Math.round((scheduledInboundArrMs - Date.now()) / 60000));

  const live = await fetchLiveFlight(inboundFlightNumber);
  if (live.live && !live.onGround && depCoords && live.groundSpeedKt && live.groundSpeedKt > 20) {
    const distanceKm = haversineKm([live.lat, live.lon], depCoords);
    const distanceNm = distanceKm / 1.852;
    const etaMinutes = Math.round((distanceNm / live.groundSpeedKt) * 60);
    inboundArrivalMs = Date.now() + etaMinutes * 60000;
    inboundEtaMinutes = Math.max(0, etaMinutes);
    confidence = 'high';
  } else if (live.live && live.onGround) {
    inboundArrivalMs = Date.now();
    inboundEtaMinutes = 0;
    confidence = 'high';
  }

  const readyMs = inboundArrivalMs + MIN_TURNAROUND_MINUTES * 60000;
  const predictedDelayMinutes = Math.max(0, Math.round((readyMs - scheduledDepMs) / 60000));
  const originCity = inbound.departure.city || inbound.departure.airport;

  const reasoning =
    predictedDelayMinutes > 0
      ? `Your aircraft is flying in as ${inboundFlightNumber} from ${originCity}, about ${inboundEtaMinutes} min from landing${confidence === 'high' ? ' (live position)' : ''}. With a ${MIN_TURNAROUND_MINUTES}-min turnaround, expect boarding to run roughly ${predictedDelayMinutes} min behind schedule.`
      : `Your aircraft (inbound as ${inboundFlightNumber} from ${originCity}) has enough buffer before your scheduled departure — on-time departure looks likely.`;

  const reasoningKm =
    predictedDelayMinutes > 0
      ? `យន្តហោះរបស់អ្នកកំពុងហោះមកជា ${inboundFlightNumber} ពី ${originCity} នៅសល់ប្រហែល ${inboundEtaMinutes} នាទីទៀតនឹងចុះចត។ បន្ថែមរយៈពេលត្រៀមខ្លួន ${MIN_TURNAROUND_MINUTES} នាទី ការឡើងយន្តហោះអាចយឺតជាងកាលវិភាគប្រហែល ${predictedDelayMinutes} នាទី។`
      : `យន្តហោះរបស់អ្នក (មកជា ${inboundFlightNumber} ពី ${originCity}) មានពេលវេលាគ្រប់គ្រាន់មុនម៉ោងចេញ — ទំនងជានឹងចេញដំណើរទាន់ពេលវេលា។`;

  return {
    available: true,
    confidence,
    predictedDelayMinutes,
    reasoning,
    reasoningKm,
    inboundFlightNumber,
    inboundOrigin: originCity,
    inboundEtaMinutes,
  };
}
