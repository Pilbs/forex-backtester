const BASE_URLS = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};

export async function getCandles({
  instrument,
  granularity,
  count,
  from,
  to,
  price = "MBA",
}) {
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const token = process.env.OANDA_API_TOKEN;
  const environment = process.env.OANDA_ENV ?? "practice";

  if (!accountId) {
    throw new Error("Missing OANDA_ACCOUNT_ID");
  }

  if (!token) {
    throw new Error("Missing OANDA_API_TOKEN");
  }

  const baseUrl = BASE_URLS[environment];

  if (!baseUrl) {
    throw new Error(`Unknown OANDA environment: ${environment}`);
  }

  const url = new URL(
    `/v3/accounts/${accountId}/instruments/${instrument}/candles`,
    baseUrl
  );

  url.searchParams.set("granularity", granularity);
  url.searchParams.set("price", price);

  if (count) {
    url.searchParams.set("count", count);
  }

  if (from) {
    url.searchParams.set("from", from);
  }

  if (to) {
    url.searchParams.set("to", to);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `OANDA request failed: ${response.status} ${response.statusText}\n${body}`
    );
  }

  return JSON.parse(body);
}