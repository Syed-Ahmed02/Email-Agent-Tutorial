import { streamText, UIMessage, convertToModelMessages, stepCountIs } from 'ai';
import { openrouter } from '@/lib/openrouter';

import { tool } from 'ai';
import { z } from 'zod';

/** WMO Weather interpretation codes (Open-Meteo). https://open-meteo.com/en/docs */
function describeWeatherCode(code: number): string {
  const map: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return map[code] ?? `Weather code ${code}`;
}

const weatherTool = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  execute: async ({ location }) => {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location.trim())}&count=1`,
    );
    if (!geoRes.ok) {
      return { error: 'Geocoding service unavailable.' };
    }
    const geo = (await geoRes.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string; country?: string }>;
    };
    const place = geo.results?.[0];
    if (!place) {
      return { error: `No location found for "${location}".` };
    }

    const { latitude, longitude, name, country } = place;
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`,
    );
    if (!weatherRes.ok) {
      return { error: 'Weather service unavailable.' };
    }
    const data = (await weatherRes.json()) as {
      current?: { temperature_2m: number; weather_code: number };
    };
    const current = data.current;
    if (!current) {
      return { error: 'No current weather data returned.' };
    }

    const c = current.temperature_2m;
    const f = Math.round((c * 9) / 5 + 32);
    const conditions = describeWeatherCode(current.weather_code);
    const label = country ? `${name}, ${country}` : name;

    return {
      location: label,
      temperatureC: Math.round(c * 10) / 10,
      temperatureF: f,
      conditions,
    };
  },
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openrouter('openrouter/free'),
    messages: await convertToModelMessages(messages),
    tools: {
      weather: weatherTool,
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
