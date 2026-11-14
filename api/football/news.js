// OutcomeChad Sports
// Enhanced Football News API
// Provider: TheNewsAPI
// Endpoint: /api/football/news?page=1

const CACHE_SECONDS = 180;
const STALE_SECONDS = 300;

const DEFAULT_LIMIT = 30;
const MAX_PAGE = 100;

const SEARCH_TERMS =
  'soccer | "association football" | "Premier League" | "Champions League" | "La Liga" | "Serie A" | Bundesliga | "World Cup" | UEFA | FIFA';

function getDateDaysAgo(days) {
  const date = new Date();

  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString().slice(0, 10);
}

function getArticles(payload) {
  return Array.isArray(payload?.data)
    ? payload.data
    : [];
}

function normalizeArticle(article) {

  return {
    id: article.uuid || article.url || null,

    title:
      article.title ||
      "Football News",

    description:
      article.description ||
      article.snippet ||
      "",

    image:
      article.image_url ||
      null,

    source:
      article.source ||
      "Football News",

    publishedAt:
      article.published_at ||
      null,

    url:
      article.url ||
      null,

    category:
      Array.isArray(article.categories)
        ? article.categories
        : [],

    language:
      article.language ||
      "en"
  };
}

export default async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {

    res.setHeader("Allow", "GET, OPTIONS");

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

  const requestedPage = parseInt(
    req.query?.page || "1",
    10
  );

  const page = Math.min(
    MAX_PAGE,
    Math.max(
      1,
      Number.isFinite(requestedPage)
        ? requestedPage
        : 1
    )
  );

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    15000
  );

  try {

    const url = new URL(
      "https://api.thenewsapi.com/v1/news/top"
    );

    url.searchParams.set(
      "api_token",
      token
    );

    url.searchParams.set(
      "search",
      SEARCH_TERMS
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
      String(DEFAULT_LIMIT)
    );

    url.searchParams.set(
      "page",
      String(page)
    );

    url.searchParams.set(
      "sort",
      "published_on"
    );

    url.searchParams.set(
      "published_after",
      getDateDaysAgo(14)
    );

    const response = await fetch(
      url.toString(),
      {
        method: "GET",

        headers: {
          Accept: "application/json"
        },

        signal: controller.signal
      }
    );

    const payload = await response
      .json()
      .catch(() => null);

    if (!response.ok) {

      console.error(
        "TheNewsAPI error:",
        payload
      );

      return res.status(response.status).json({

        success: false,

        message:
          payload?.message ||
          payload?.error?.message ||
          "Unable to retrieve football news."

      });

    }

    const articles = getArticles(payload);

    const meta = payload?.meta || {};

    const normalized = articles
      .map(normalizeArticle)
      .filter(article =>
        article.title &&
        article.url
      );

    const returned = Number(
      meta.returned ?? normalized.length
    );

    const providerLimit = Number(
      meta.limit ?? DEFAULT_LIMIT
    );

    const totalFound = Number(
      meta.found ?? 0
    );

    const hasMore =
      returned >= providerLimit &&
      page * providerLimit < totalFound;

    return res.status(200).json({

      success: true,

      provider: "TheNewsAPI",

      page,

      limit: providerLimit,

      totalFound,

      totalReturned: normalized.length,

      hasMore,

      data: normalized

    });

  } catch (error) {

    console.error(
      "OutcomeChad News API error:",
      error.message
    );

    return res.status(
      error.name === "AbortError"
        ? 504
        : 502
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