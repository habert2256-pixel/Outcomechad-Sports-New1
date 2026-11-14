// OutcomeChad Sports — Football News
// Provider: TheNewsAPI
// Endpoint: /api/football/news?page=1

const CACHE_SECONDS = 180;

const PAGE_SIZE = 30;

const MAX_PAGES = 5;

const SEARCH_TERMS = [
  'soccer',
  '"Premier League"',
  '"Champions League"',
  '"Europa League"',
  '"La Liga"',
  '"Serie A"',
  'Bundesliga',
  '"Ligue 1"',
  'Celtic',
  '"international football"',
  '"football transfers"'
];

function normalizeArticle(article) {

  return {
    id: article.uuid || article.url,

    title: article.title || "Football News",

    description:
      article.description ||
      article.snippet ||
      "",

    image: article.image_url || null,

    source: article.source || "Football News",

    publishedAt: article.published_at || null,

    url: article.url || null,

    category: article.categories || [],

    language: article.language || "en"
  };

}

function uniqueArticles(articles) {

  const seen = new Set();

  return articles.filter(article => {

    const key = article.id || article.url || article.title;

    if (!key || seen.has(key)) return false;

    seen.add(key);

    return true;

  });

}

export default async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`
  );

  res.setHeader("Access-Control-Allow-Origin", "*");

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

  const requestedPage = Number(req.query?.page || 1);

  const page = Number.isInteger(requestedPage)
    ? Math.max(1, Math.min(requestedPage, MAX_PAGES))
    : 1;

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    20000
  );

  try {

    const url = new URL(
      "https://api.thenewsapi.com/v1/news/top"
    );

    url.searchParams.set("api_token", token);

    url.searchParams.set(
      "search",
      SEARCH_TERMS.join(" | ")
    );

    url.searchParams.set(
      "search_fields",
      "title,description,keywords"
    );

    url.searchParams.set("categories", "sports");

    url.searchParams.set("language", "en");

    url.searchParams.set("limit", String(PAGE_SIZE));

    url.searchParams.set("page", String(page));

    url.searchParams.set("sort", "published_on");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {

      console.error("TheNewsAPI error:", payload);

      return res.status(response.status).json({
        success: false,
        message:
          payload?.message ||
          "Unable to retrieve football news."
      });

    }

    const articles = Array.isArray(payload?.data)
      ? payload.data
      : [];

    const normalized = uniqueArticles(
      articles.map(normalizeArticle)
    );

    const meta = payload?.meta || {};

    const returned = Number(
      meta.returned ?? normalized.length
    );

    const limit = Number(
      meta.limit ?? PAGE_SIZE
    );

    const hasMore = returned >= limit &&
      page < MAX_PAGES;

    return res.status(200).json({

      success: true,

      provider: "TheNewsAPI",

      page,

      limit,

      totalFound: Number(meta.found || 0),

      totalReturned: normalized.length,

      hasMore,

      data: normalized

    });

  } catch (error) {

    console.error(
      "OutcomeChad News error:",
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