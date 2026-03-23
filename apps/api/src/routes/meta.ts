import { Router } from "express";
import { z } from "zod";

const GEO_API_BASE = "https://countriesnow.space/api/v0.1";

const countryQuerySchema = z.object({
  country: z.string().trim().min(1)
});

const cityQuerySchema = z.object({
  country: z.string().trim().min(1),
  state: z.string().trim().min(1)
});

const countriesCache = {
  values: [] as string[],
  loaded: false
};

const statesCache = new Map<string, string[]>();
const citiesCache = new Map<string, string[]>();

function normalizeStringList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geo API request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export const metaRouter = Router();

metaRouter.get("/countries", async (_req, res) => {
  try {
    if (countriesCache.loaded) {
      res.json({ countries: countriesCache.values });
      return;
    }

    const payload = await fetchJson<{
      error: boolean;
      data: Array<{ name: string }>;
    }>(`${GEO_API_BASE}/countries/positions`);

    if (payload.error || !Array.isArray(payload.data)) {
      res.status(502).json({ message: "Unable to load countries" });
      return;
    }

    countriesCache.values = normalizeStringList(payload.data.map((entry) => entry.name));
    countriesCache.loaded = true;

    res.json({ countries: countriesCache.values });
  } catch (error) {
    console.error("meta.countries error", error);
    res.status(502).json({ message: "Unable to load countries" });
  }
});

metaRouter.get("/states", async (req, res) => {
  const parsed = countryQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ message: "country query parameter is required" });
    return;
  }

  const country = parsed.data.country;

  try {
    if (statesCache.has(country)) {
      res.json({ states: statesCache.get(country) });
      return;
    }

    const payload = await fetchJson<{
      error: boolean;
      data: { states: Array<{ name: string }> };
    }>(`${GEO_API_BASE}/countries/states/q?country=${encodeURIComponent(country)}`);

    if (payload.error || !payload.data || !Array.isArray(payload.data.states)) {
      res.status(502).json({ message: "Unable to load states" });
      return;
    }

    const states = normalizeStringList(payload.data.states.map((entry) => entry.name));
    statesCache.set(country, states);

    res.json({ states });
  } catch (error) {
    console.error("meta.states error", error);
    res.status(502).json({ message: "Unable to load states" });
  }
});

metaRouter.get("/cities", async (req, res) => {
  const parsed = cityQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ message: "country and state query parameters are required" });
    return;
  }

  const { country, state } = parsed.data;
  const cacheKey = `${country}::${state}`;

  try {
    if (citiesCache.has(cacheKey)) {
      res.json({ cities: citiesCache.get(cacheKey) });
      return;
    }

    const payload = await fetchJson<{
      error: boolean;
      data: string[];
    }>(
      `${GEO_API_BASE}/countries/state/cities/q?country=${encodeURIComponent(country)}&state=${encodeURIComponent(
        state
      )}`
    );

    if (payload.error || !Array.isArray(payload.data)) {
      res.status(502).json({ message: "Unable to load cities" });
      return;
    }

    const cities = normalizeStringList(payload.data);
    citiesCache.set(cacheKey, cities);

    res.json({ cities });
  } catch (error) {
    console.error("meta.cities error", error);
    res.status(502).json({ message: "Unable to load cities" });
  }
});

metaRouter.get("/detect-location", async (_req, res) => {
  try {
    // Try ip-api.com first (no API key needed, 45 req/min for non-commercial)
    const primary = await fetch("http://ip-api.com/json/?fields=city,regionName,country");
    if (primary.ok) {
      const data = (await primary.json()) as { city?: string; regionName?: string; country?: string };
      res.json({
        city: data.city ?? null,
        state: data.regionName ?? null,
        country: data.country ?? null,
      });
      return;
    }

    // Fallback to ipapi.co
    const fallback = await fetch("https://ipapi.co/json/");
    if (fallback.ok) {
      const data = (await fallback.json()) as { city?: string; region?: string; country_name?: string };
      res.json({
        city: data.city ?? null,
        state: data.region ?? null,
        country: data.country_name ?? null,
      });
      return;
    }

    console.error("meta.detect-location: both services returned non-OK", primary.status, fallback.status);
    res.status(502).json({ message: "Address detection service unavailable" });
  } catch (error) {
    console.error("meta.detect-location error", error);
    res.status(502).json({ message: "Address detection service unavailable" });
  }
});