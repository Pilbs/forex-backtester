export async function queryD1(sql, params = []) {
  const result = await callD1({
    sql,
    params,
  });

  return result;
}

export async function queryD1Batch(statements) {
  return callD1({
    batch: statements,
  });
}

async function callD1(body) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID");
  }

  if (!databaseId) {
    throw new Error("Missing CLOUDFLARE_D1_DATABASE_ID");
  }

  if (!token) {
    throw new Error("Missing CLOUDFLARE_API_TOKEN");
  }

  const url =
    `https://api.cloudflare.com/client/v4/accounts/${accountId}` +
    `/d1/database/${databaseId}/query`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.json();

  if (!response.ok || responseBody.success === false) {
    throw new Error(
      `D1 request failed: ${response.status}\n` +
      JSON.stringify(responseBody, null, 2)
    );
  }

  return responseBody.result;
}