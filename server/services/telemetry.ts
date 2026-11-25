import {
  INDIAN_CITIES,
  calculateIndianAQI,
  getAQICategoryInfo,
  getDominantPollutant,
  haversineDistanceKm,
} from '../../src/utils/aqi';
import type {
  AQIForecastDay,
  AQIHourlyPoint,
  AQIResponse,
  FireAlert,
  FiresResponse,
  WeatherResponse,
} from '../../src/types/env';
import type { TtlCache } from '../cache';
import { fetchJsonWithTimeout, fetchWithTimeout } from './http';

/** Maps a WMO weather interpretation code to a concise human-readable condition label. */
export function weatherCodeToLabel(code: number): string {
  if (code === 0) return 'Clear Sky';
  if (code <= 3) return 'Partly Cloudy';
  if (code === 45 || code === 48) return 'Haze / Fog';
  if (code <= 57) return 'Light Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow / Hail';
  if (code <= 82) return 'Rain Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Overcast';
}

interface OpenMeteoAqiPayload {
  current?: {
    pm2_5?: number | null;
    pm10?: number | null;
    nitrogen_dioxide?: number | null;
    ozone?: number | null;
    sulphur_dioxide?: number | null;
    carbon_monoxide?: number | null;
    us_aqi?: number | null;
  };
  hourly?: {
    time?: string[];
    pm2_5?: (number | null)[];
    pm10?: (number | null)[];
    us_aqi?: (number | null)[];
  };
}

interface OpenMeteoWeatherPayload {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    weather_code?: number;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
    weather_code?: number[];
    uv_index_max?: number[];
  };
}

function roundNullable(val: number | null | undefined): number | null {
  return val !== undefined && val !== null && Number.isFinite(val) ? Number(val.toFixed(1)) : null;
}

function buildHourlyAndForecast(
  json: OpenMeteoAqiPayload,
  fallbackAqi: number,
): { hourly: AQIHourlyPoint[]; forecast: AQIForecastDay[] } {
  const times = json.hourly?.time || [];
  const pm25Arr = json.hourly?.pm2_5 || [];
  const pm10Arr = json.hourly?.pm10 || [];
  const usAqiArr = json.hourly?.us_aqi || [];

  const hourly: AQIHourlyPoint[] = [];
  const dailyMap = new Map<
    string,
    { pm25Max: number; pm10Max: number; aqiSum: number; count: number }
  >();

  for (let i = 0; i < times.length; i += 1) {
    const t = times[i];
    const p25 = pm25Arr[i] ?? null;
    const p10 = pm10Arr[i] ?? null;
    const ind = calculateIndianAQI({ pm25: p25, pm10: p10, no2: null, o3: null });
    const ptAqi = ind > 0 ? ind : Math.round(usAqiArr[i] ?? fallbackAqi);

    if (i < 48) {
      hourly.push({ time: t, aqi: ptAqi, pm25: p25 });
    }
    const dayKey = t.slice(0, 10);
    const bucket = dailyMap.get(dayKey) || { pm25Max: 0, pm10Max: 0, aqiSum: 0, count: 0 };
    if (p25 !== null && p25 > bucket.pm25Max) bucket.pm25Max = p25;
    if (p10 !== null && p10 > bucket.pm10Max) bucket.pm10Max = p10;
    bucket.aqiSum += ptAqi;
    bucket.count += 1;
    dailyMap.set(dayKey, bucket);
  }

  const forecast: AQIForecastDay[] = Array.from(dailyMap.entries())
    .slice(0, 7)
    .map(([date, d]) => {
      const dayAqi = Math.round(d.aqiSum / Math.max(1, d.count));
      return {
        date,
        aqi: dayAqi,
        category: getAQICategoryInfo(dayAqi).category,
        pm25Max: Number(d.pm25Max.toFixed(1)),
        pm10Max: Number(d.pm10Max.toFixed(1)),
      };
    });

  return { hourly, forecast };
}

async function enrichOpenAqStations(
  lat: number,
  lon: number,
  city: string,
  aqi: number,
  baseSource: string,
): Promise<NonNullable<AQIResponse['stations']>> {
  const stations: NonNullable<AQIResponse['stations']> = [
    {
      name: `${city} Central (CAMS Grid)`,
      aqi,
      latitude: lat,
      longitude: lon,
      source: baseSource,
    },
  ];
  const openAqKey = process.env.OPENAQ_API_KEY;
  if (!openAqKey) return stations;

  try {
    const oaqJson = await fetchJsonWithTimeout<{
      results?: Array<{
        name?: string;
        coordinates?: { latitude?: number; longitude?: number };
      }>;
    }>(
      `https://api.openaq.org/v3/locations?coordinates=${lat},${lon}&radius=25000&limit=5`,
      { headers: { 'X-API-Key': openAqKey } },
      5000,
    );
    for (const st of oaqJson.results || []) {
      if (st.coordinates?.latitude && st.coordinates?.longitude && st.name) {
        stations.push({
          name: st.name,
          aqi,
          latitude: st.coordinates.latitude,
          longitude: st.coordinates.longitude,
          source: 'OpenAQ v3',
        });
      }
    }
  } catch {
    // Non-fatal ground station enrichment
  }
  return stations;
}

async function fetchWaqiFallback(
  lat: number,
  lon: number,
  city: string,
): Promise<AQIResponse | null> {
  const waqiKey = process.env.WAQI_API_KEY;
  if (!waqiKey) return null;
  try {
    const waqiJson = await fetchJsonWithTimeout<{
      status?: string;
      data?: {
        aqi?: number;
        iaqi?: Record<string, { v?: number }>;
        time?: { iso?: string };
      };
    }>(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=${waqiKey}`, {}, 6000);

    if (waqiJson.status === 'ok' && waqiJson.data?.aqi) {
      const aqi = Number(waqiJson.data.aqi);
      const pollutants = {
        pm25: waqiJson.data.iaqi?.pm25?.v ?? null,
        pm10: waqiJson.data.iaqi?.pm10?.v ?? null,
        no2: waqiJson.data.iaqi?.no2?.v ?? null,
        o3: waqiJson.data.iaqi?.o3?.v ?? null,
      };
      return {
        location: city,
        latitude: lat,
        longitude: lon,
        aqi,
        category: getAQICategoryInfo(aqi).category,
        dominantPollutant: getDominantPollutant(pollutants),
        pollutants,
        pollenStatus: 'Coming Soon',
        source: 'WAQI Fallback Feed',
        fallbackUsed: true,
        timestamp: waqiJson.data.time?.iso || new Date().toISOString(),
        forecast: [],
        hourly: [],
      };
    }
  } catch {
    // Proceed to stale cache fallback
  }
  return null;
}

function parseFirmsCsv(csv: string, lat: number, lon: number): FireAlert[] {
  const alerts: FireAlert[] = [];
  const lines = csv.trim().split('\n').slice(1, 30);
  lines.forEach((line, idx) => {
    const cols = line.split(',');
    const fLat = Number(cols[0]);
    const fLon = Number(cols[1]);
    const brightness = Number(cols[2]);
    const acqDate = cols[5] || new Date().toISOString().slice(0, 10);
    const confidence = cols[9] || 'nominal';
    if (Number.isFinite(fLat) && Number.isFinite(fLon)) {
      alerts.push({
        id: `firms-${idx}-${fLat.toFixed(2)}`,
        title: `VIIRS Thermal Hotspot (${brightness ? `${Math.round(brightness)}K` : 'Active'})`,
        latitude: fLat,
        longitude: fLon,
        distanceKm: haversineDistanceKm(lat, lon, fLat, fLon),
        confidence,
        brightness: Number.isFinite(brightness) ? brightness : undefined,
        timestamp: acqDate,
        source: 'NASA FIRMS VIIRS',
      });
    }
  });
  return alerts;
}

/**
 * Creates environmental telemetry fetchers backed by a bounded TTL cache.
 */
export function createTelemetryService(cache: TtlCache) {
  async function fetchRealAQI(lat: number, lon: number, city: string): Promise<AQIResponse> {
    const cacheKey = `aqi:${lat.toFixed(2)}:${lon.toFixed(2)}`;
    const cached = cache.get<AQIResponse>(cacheKey);
    if (cached && cached.isFresh) {
      return cached.entry.data;
    }

    const source = 'Open-Meteo Air Quality (CAMS Copernicus)';
    try {
      const omUrl =
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        `&current=pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,us_aqi,european_aqi` +
        `&hourly=pm10,pm2_5,nitrogen_dioxide,ozone,us_aqi&forecast_days=7&timezone=auto`;

      const json = await fetchJsonWithTimeout<OpenMeteoAqiPayload>(omUrl, {}, 8000);
      const cur = json.current || {};
      const pollutants = {
        pm25: roundNullable(cur.pm2_5),
        pm10: roundNullable(cur.pm10),
        no2: roundNullable(cur.nitrogen_dioxide),
        o3: roundNullable(cur.ozone),
        so2: roundNullable(cur.sulphur_dioxide),
        co: roundNullable(cur.carbon_monoxide),
      };

      const indianAqi = calculateIndianAQI(pollutants);
      const aqi = indianAqi > 0 ? indianAqi : Math.round(cur.us_aqi ?? 0);
      const stations = await enrichOpenAqStations(lat, lon, city, aqi, source);
      const { hourly, forecast } = buildHourlyAndForecast(json, aqi);
      const catInfo = getAQICategoryInfo(aqi);

      const result: AQIResponse = {
        location: city,
        latitude: lat,
        longitude: lon,
        aqi,
        category: catInfo.category,
        dominantPollutant: getDominantPollutant(pollutants),
        pollutants,
        pollenStatus: 'Coming Soon (Indian regional pollen network integration in progress)',
        source,
        fallbackUsed: false,
        timestamp: new Date().toISOString(),
        forecast,
        hourly,
        stations,
      };
      cache.set(cacheKey, result, 30 * 60 * 1000);
      return result;
    } catch (primaryErr) {
      const waqiResult = await fetchWaqiFallback(lat, lon, city);
      if (waqiResult) {
        cache.set(cacheKey, waqiResult, 30 * 60 * 1000);
        return waqiResult;
      }
      if (cached) {
        return {
          ...cached.entry.data,
          fallbackUsed: true,
          source: `${cached.entry.data.source} (Stale Cache)`,
        };
      }
      throw primaryErr;
    }
  }

  async function fetchRealWeather(lat: number, lon: number): Promise<WeatherResponse> {
    const cacheKey = `weather:${lat.toFixed(2)}:${lon.toFixed(2)}`;
    const cached = cache.get<WeatherResponse>(cacheKey);
    if (cached && cached.isFresh) {
      return cached.entry.data;
    }

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,weather_code,uv_index_max` +
        `&forecast_days=7&timezone=auto`;

      const json = await fetchJsonWithTimeout<OpenMeteoWeatherPayload>(url, {}, 8000);
      const cur = json.current || {};
      const daily = json.daily || {};
      const weatherCode = cur.weather_code ?? 0;

      const forecast = (daily.time || []).slice(0, 7).map((date, idx) => ({
        date,
        tempMax: Math.round(daily.temperature_2m_max?.[idx] ?? 28),
        tempMin: Math.round(daily.temperature_2m_min?.[idx] ?? 18),
        precipitationProb: Math.round(daily.precipitation_probability_max?.[idx] ?? 0),
        windSpeedMax: Math.round(daily.wind_speed_10m_max?.[idx] ?? 10),
        weatherCode: daily.weather_code?.[idx] ?? 0,
      }));

      const result: WeatherResponse = {
        latitude: lat,
        longitude: lon,
        temperature: Number((cur.temperature_2m ?? 25).toFixed(1)),
        humidity: Math.round(cur.relative_humidity_2m ?? 50),
        windSpeed: Number((cur.wind_speed_10m ?? 8).toFixed(1)),
        windDirection: Math.round(cur.wind_direction_10m ?? 0),
        uvIndex: Number((daily.uv_index_max?.[0] ?? 5).toFixed(1)),
        weatherCode,
        conditionLabel: weatherCodeToLabel(weatherCode),
        source: 'Open-Meteo Weather API',
        timestamp: new Date().toISOString(),
        forecast,
      };
      cache.set(cacheKey, result, 60 * 60 * 1000);
      return result;
    } catch (err) {
      if (cached) {
        return {
          ...cached.entry.data,
          source: `${cached.entry.data.source} (Cached)`,
        };
      }
      throw err;
    }
  }

  async function fetchRealFires(lat: number, lon: number): Promise<FiresResponse> {
    const cacheKey = `fires:${lat.toFixed(1)}:${lon.toFixed(1)}`;
    const cached = cache.get<FiresResponse>(cacheKey);
    if (cached && cached.isFresh) {
      return cached.entry.data;
    }

    const firmsKey = process.env.NASA_FIRMS_API_KEY;
    let alerts: FireAlert[] = [];
    let source = 'NASA EONET Live Satellite';

    try {
      if (firmsKey) {
        const west = Math.max(-180, lon - 2.5).toFixed(2);
        const south = Math.max(-90, lat - 2.5).toFixed(2);
        const east = Math.min(180, lon + 2.5).toFixed(2);
        const north = Math.min(90, lat + 2.5).toFixed(2);
        const firmsUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/${west},${south},${east},${north}/2`;
        const resp = await fetchWithTimeout(firmsUrl, {}, 8000);
        if (resp.ok) {
          const csv = await resp.text();
          alerts = parseFirmsCsv(csv, lat, lon);
          source = 'NASA FIRMS VIIRS_SNPP_NRT';
        }
      }

      if (alerts.length === 0) {
        const eonetJson = await fetchJsonWithTimeout<{
          events?: Array<{
            id: string;
            title: string;
            link?: string;
            geometry?: Array<{ date?: string; coordinates?: [number, number] }>;
          }>;
        }>(
          'https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=40',
          {},
          8000,
        );
        for (const ev of eonetJson.events || []) {
          const geom = ev.geometry?.[ev.geometry.length - 1];
          const coords = geom?.coordinates;
          if (coords && coords.length >= 2) {
            const fLon = Number(coords[0]);
            const fLat = Number(coords[1]);
            alerts.push({
              id: ev.id,
              title: ev.title,
              latitude: fLat,
              longitude: fLon,
              distanceKm: haversineDistanceKm(lat, lon, fLat, fLon),
              confidence: 'NASA Satellite Verified',
              timestamp: geom?.date || new Date().toISOString(),
              source: 'NASA EONET v3',
              link: ev.link,
            });
          }
        }
      }

      alerts.sort((a, b) => a.distanceKm - b.distanceKm);
      const nearbyCount = alerts.filter((a) => a.distanceKm <= 150).length;
      const result: FiresResponse = {
        alerts: alerts.slice(0, 12),
        nearbyCount,
        source,
        timestamp: new Date().toISOString(),
        firmsKeyConfigured: Boolean(firmsKey),
      };
      cache.set(cacheKey, result, 6 * 60 * 60 * 1000);
      return result;
    } catch (err) {
      if (cached) return cached.entry.data;
      throw err;
    }
  }

  async function geocodeCity(rawQuery: string) {
    const q = rawQuery.trim().slice(0, 100);
    if (q.length < 2) {
      return INDIAN_CITIES.slice(0, 6);
    }

    const cacheKey = `geo:${q.toLowerCase()}`;
    const cached = cache.get<unknown[]>(cacheKey);
    if (cached && cached.isFresh) {
      return cached.entry.data;
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&limit=6&q=${encodeURIComponent(q)}`;
      const raw = await fetchJsonWithTimeout<
        Array<{ display_name: string; lat: string; lon: string }>
      >(url, { headers: { 'User-Agent': 'VayuShieldAI/1.0 (environmental-health-pwa)' } }, 5000);
      const mapped = raw.map((item) => ({
        name: item.display_name.split(',')[0].trim(),
        state: item.display_name.split(',').slice(1, 3).join(',').trim() || 'India',
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        source: 'OpenStreetMap Nominatim',
      }));
      cache.set(cacheKey, mapped, 24 * 60 * 60 * 1000);
      return mapped;
    } catch {
      return INDIAN_CITIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q.toLowerCase()) ||
          c.state.toLowerCase().includes(q.toLowerCase()),
      ).map((c) => ({ ...c, source: 'Indian Cities Directory' }));
    }
  }

  return { fetchRealAQI, fetchRealWeather, fetchRealFires, geocodeCity };
}
