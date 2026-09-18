import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { getCandles } from "../src/data/candle-reader.js";

const [instrument, granularity, from, to, outputPath] = process.argv.slice(2);

if (!instrument || !granularity || !from || !to || !outputPath) {
  console.error(
    "Usage: node quant-research/export-candles.js <instrument> <granularity> <from> <to> <output.csv>"
  );
  process.exit(1);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const candles = await getCandles({
  instrument,
  granularity,
  from,
  to,
});

const header = [
  "time",
  "time_iso",
  "volume",
  "bid_open",
  "bid_high",
  "bid_low",
  "bid_close",
  "ask_open",
  "ask_high",
  "ask_low",
  "ask_close",
  "mid_open",
  "mid_high",
  "mid_low",
  "mid_close",
];

const rows = candles.map((candle) => [
  candle.time,
  new Date(candle.time).toISOString(),
  candle.volume,
  candle.bid.open,
  candle.bid.high,
  candle.bid.low,
  candle.bid.close,
  candle.ask.open,
  candle.ask.high,
  candle.ask.low,
  candle.ask.close,
  candle.mid.open,
  candle.mid.high,
  candle.mid.low,
  candle.mid.close,
]);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const csv = [
  header.join(","),
  ...rows.map((row) => row.map(escapeCsv).join(",")),
].join("\n");

fs.writeFileSync(outputPath, csv + "\n", "utf8");

console.log(
  `Exported ${candles.length} ${instrument} ${granularity} candles to ${outputPath}`
);
