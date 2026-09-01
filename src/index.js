import "dotenv/config";

import { getCandles } from "./data/oanda-client.js";
import { normalizeCandles } from "./data/normalize-candle.js";
import { validateCandles } from "./data/validate-candles.js";

async function main() {
  const data = await getCandles({
    instrument: "EUR_USD",
    granularity: "M1",
    from: "2026-05-04T00:00:00Z",
    to: "2026-05-05T00:00:00Z",
  });

  const candles = normalizeCandles(data.candles);
  const quality = validateCandles(candles);

  console.log(quality);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});