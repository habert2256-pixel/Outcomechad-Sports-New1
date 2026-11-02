export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "SPORTMONKS_API_TOKEN is not configured" });
  }

  try {
    const types = ["pre-match", "post-match"];

    const results = await Promise.all(
      types.map(async (type) => {
        const url = new URL(
          `https://api.sportmonks.com/v3/football/news/${type}`
        );

        url.searchParams.set("api_token", token);
        url.searchParams.set("include", "lines;fixture;league");
        url.searchParams.set("per_page", "25");
        url.searchParams.set("order", "desc");

        const response = await fetch(url);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload.message || `Sportmonks News API returned ${response.status}`
          );
        }

        return Array.isArray(payload.data) ? payload.data : [];
      })
    );

    const articles = results
      .flat()
      .sort((a, b) => new Date(b.created_at || b.updated_at || 0) -
                      new Date(a.created_at || a.updated_at || 0));

    return res.status(200).json({ data: articles });
  } catch (error) {
    console.error("Sportmonks News API error:", error);
    return res.status(502).json({
      error: "Could not load football news",
      message: error.message
    });
  }
}