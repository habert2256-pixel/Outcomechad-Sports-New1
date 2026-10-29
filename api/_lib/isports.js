// OutcomeChad Sports — Shared iSports API helper
// The API key is only used on the server.

export async function fetchISports(path, params = {}) {
  const apiKey = process.env.ISPORTS_API_KEY;

  if (!apiKey) {
    throw new Error("ISPORTS_API_KEY is missing in Vercel.");
  }

  const url = new URL(`https://api.isportsapi.com${path}`);
  url.searchParams.set("api_key", apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("iSports returned invalid JSON.");
  }

  if (!response.ok) {
    throw new Error(`iSports request failed with HTTP ${response.status}.`);
  }

  if (data.code !== undefined && Number(data.code) !== 0) {
    throw new Error(
      `iSports rejected the request. Provider code: ${data.code}`
    );
  }

  return data;
}

export function requireMatchId(req) {
  const matchId = req.query?.matchId;

  if (!matchId || typeof matchId !== "string") {
    return null;
  }

  return matchId.trim();
}

export function setMatchCentreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "s-maxage=15, stale-while-revalidate=30"
  );
}