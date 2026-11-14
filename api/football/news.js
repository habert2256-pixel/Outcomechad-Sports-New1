// OutcomeChad Sports
// External Football News API
// Provider: TheNewsAPI
// Endpoint: /api/football/news

const CACHE_SECONDS = 300;

export default async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`
  );

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const token = process.env.THENEWSAPI_TOKEN;

  if (!token) {
    return res.status(500).json({
      success: false,
      message: "THENEWSAPI_TOKEN is missing in Vercel."
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    15000
  );

  try {

    const url = new URL(
      "https://api.thenewsapi.com/v1/news/top"
    );

    url.searchParams.set("api_token", token);

    url.searchParams.set(
      "search",
      'soccer | "Premier League" | "Champions League" | "La Liga" | "Serie A" | Bundesliga | Celtic'
    );

    url.searchParams.set(
      "search_fields",
      "title,description,keywords"
    );

    url.searchParams.set(
      "categories",
      "sports"
    );

    url.searchParams.set(
      "language",
      "en"
    );

    url.searchParams.set(
      "limit",
      "30"
    );

    url.searchParams.set(
      "sort",
      "published_on"
    );

    const response = await fetch(
      url.toString(),
      {
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      }
    );

    const payload = await response.json();

    if (!response.ok) {

      console.error(
        "TheNewsAPI error:",
        payload
      );

      return res.status(response.status).json({
        success: false,
        message:
          payload.message ||
          "Unable to retrieve football news."
      });
    }

    const articles = Array.isArray(payload.data)
      ? payload.data
      : [];

    const normalized = articles.map(article => ({
      id: article.uuid,

      title: article.title || "Football News",

      description:
        article.description ||
        article.snippet ||
        "",

      image: article.image_url || null,

      source: article.source || "News publisher",

      publishedAt: article.published_at || null,

      url: article.url || null,

      category: article.categories || []
    }));

    return res.status(200).json({
      success: true,
      provider: "TheNewsAPI",
      total: normalized.length,
      data: normalized
    });

  } catch (error) {

    console.error(
      "OutcomeChad News API error:",
      error.message
    );

    return res.status(
      error.name === "AbortError" ? 504 : 502
    ).json({
      success: false,
      message:
        error.name === "AbortError"
          ? "Football news request timed out."
          : "Could not connect to the news provider."
    });

  } finally {

    clearTimeout(timeout);

  }
}