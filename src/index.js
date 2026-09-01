import "dotenv/config";

import { getCandles } from "./data/oanda-client.js";
import { normalizeCandles } from "./data/normalize-candle.js";
import { insertCandles } from "./data/candle-repository.js";
import { queryD1 } from "./data/d1-client.js";

async function main() {
  const instrument = "EUR_USD";
  const granularity = "M1";

  const data = await getCandles({
    instrument,
    granularity,
    from: "2022-05-03T12:00:00Z",
    to: "2022-05-03T12:05:00Z",
  });

  const candles = normalizeCandles(data.candles);

  console.log(`Pulled ${candles.length} candles from OANDA`);

  await insertCandles({
    instrument,
    granularity,
    candles,
  });

  console.log(`Inserted ${candles.length} candles into D1`);

  const result = await queryD1(
    `
      SELECT *
      FROM candles
      WHERE instrument = ?
        AND granularity = ?
      ORDER BY time
    `,
    [instrument, granularity]
  );

  console.dir(result, { depth: null });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});