import "dotenv/config";

import { getCandles } from "./data/oanda-client.js";

async function main() {
  const data = await getCandles({
    instrument: "EUR_USD",
    granularity: "M1",
    count: 5,
  });

  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});