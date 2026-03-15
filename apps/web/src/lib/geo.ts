import { apiRequest } from "./api";

interface CountriesResponse {
  countries: string[];
}

interface StatesResponse {
  states: string[];
}

interface CitiesResponse {
  cities: string[];
}

export async function fetchCountries(): Promise<string[]> {
  const response = await apiRequest<CountriesResponse>("/meta/countries");
  return response.countries;
}

export async function fetchStates(country: string): Promise<string[]> {
  const response = await apiRequest<StatesResponse>(`/meta/states?country=${encodeURIComponent(country)}`);
  return response.states;
}

export async function fetchCities(country: string, state: string): Promise<string[]> {
  const response = await apiRequest<CitiesResponse>(
    `/meta/cities?country=${encodeURIComponent(country)}&state=${encodeURIComponent(state)}`
  );
  return response.cities;
}
