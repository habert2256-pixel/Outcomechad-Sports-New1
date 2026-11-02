export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "SPORTMONKS_API_TOKEN is not configured"
    });
  }

  try {
    const url = new URL(
      "https://api.sportmonks.com/v3/football/transfer-rumours"
    );

    url.searchParams.set("api_token", token);
    url.searchParams.set(
      "include",
      "player;fromTeam;toTeam;type"
    );
    url.searchParams.set("per_page", "50");
    url.searchParams.set("order", "desc");

    const response = await fetch(url);
    const payload = await response.json();

    if (!response.ok) {
      console.error("Sportmonks response:", payload);

      return res.status(response.status).json({
        error: "Could not load transfer rumours",
        message:
          payload.message ||
          `Sportmonks returned ${response.status}`
      });
    }

    return res.status(200).json({
      data: Array.isArray(payload.data) ? payload.data : []
    });
  } catch (error) {
    console.error("Sportmonks Transfers API error:", error);

    return res.status(502).json({
      error: "Could not load transfer rumours",
      message: error.message
    });
  }
}