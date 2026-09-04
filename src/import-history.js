import "dotenv/config";

import {
  importHistory,
} from "./data/historical-importer.js";

const [
  instrument,
  granularity,
  from,
  to,
] = process.argv.slice(2);

if (
  !instrument ||
  !granularity ||
  !from ||
  !to
) {
  console.log("");
  console.log(
    "Usage:"
  );

  console.log(
    "node src/import-history.js <instrument> <granularity> <from> <to>"
  );

  console.log("");
  console.log(
    "Example:"
  );

  console.log(
    "node src/import-history.js EUR_USD M5 2021-01-03 2026-09-01"
  );

  process.exit(1);
}

importHistory({
  instrument,
  granularity,
  from,
  to,
}).catch((error) => {
  console.error(error);
  process.exit(1);
});