function getDatabaseId(instrument) {
  if (!instrument) {
    throw new Error(
      "instrument is required for D1"
    );
  }

  const normalizedInstrument =
    instrument.toUpperCase();

  const envName =
    `CLOUDFLARE_D1_${normalizedInstrument}_DATABASE_ID`;

  const databaseId =
    process.env[envName];

  if (!databaseId) {
    throw new Error(
      `Missing ${envName}`
    );
  }

  return databaseId;
}

export async function queryD1(
  instrument,
  sql,
  params = []
) {
  return callD1({
    instrument,
    body: {
      sql,
      params,
    },
  });
}

export async function queryD1Batch(
  instrument,
  statements
) {
  return callD1({
    instrument,
    body: {
      batch: statements,
    },
  });
}

async function callD1({
  instrument,
  body,
}) {
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID;

  const token =
    process.env.CLOUDFLARE_API_TOKEN;

  const databaseId =
    getDatabaseId(instrument);

  if (!accountId) {
    throw new Error(
      "Missing CLOUDFLARE_ACCOUNT_ID"
    );
  }

  if (!token) {
    throw new Error(
      "Missing CLOUDFLARE_API_TOKEN"
    );
  }

  const url =
    `https://api.cloudflare.com/client/v4/accounts/${accountId}` +
    `/d1/database/${databaseId}/query`;

  const response =
    await fetch(url, {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${token}`,

        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify(body),
    });

  const responseBody =
    await response.json();

  if (
    !response.ok ||
    responseBody.success === false
  ) {
    throw new Error(
      `D1 request failed: ${response.status}\n` +
      JSON.stringify(
        responseBody,
        null,
        2
      )
    );
  }

  return responseBody.result;
}