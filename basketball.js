export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "s-maxage=30, stale-while-revalidate=60"
  );

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const apiKey = process.env.ISPORTS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      message: "ISPORTS_API_KEY is missing from Vercel."
    });
  }

  try {
    const endpoint = new URL(
      "https://api.isportsapi.com/sport/basketball/livescores"
    );

    endpoint.searchParams.set("api_key", apiKey);

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: "iSports returned an HTTP error.",
        providerStatus: response.status
      });
    }

    const result = await response.json();

    if (result.code !== 0) {
      return res.status(502).json({
        success: false,
        message: "iSports rejected the basketball request.",
        providerCode: result.code,
        providerMessage: result.message || "Unknown provider error"
      });
    }

    return res.status(200).json({
      success: true,
      source: "iSports Basketball API",
      data: result.data
    });

  } catch (error) {
    console.error("Basketball API error:", error.message);

    return res.status(502).json({
      success: false,
      message: "Unable to retrieve basketball matches."
    });
  }
}