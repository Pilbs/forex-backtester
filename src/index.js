import "dotenv/config";

import { getCandles } from "./data/oanda-client.js";

async function main() {
  const data = await getCandles({
    instrument: "EUR_USD",
    granularity: "M1",
    from: "2021-01-04T00:00:00Z",
    to: "2021-01-05T00:00:00Z",
  });

  console.log(`Candles returned: ${data.candles.length}`);

  console.log("First candle:");
  console.log(JSON.stringify(data.candles[0], null, 2));

  console.log("Last candle:");
  console.log(
    JSON.stringify(data.candles[data.candles.length - 1], null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});