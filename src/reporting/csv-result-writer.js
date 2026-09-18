import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function safeFileName(value) {
    return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function escapeCsv(value) {
    if (value === null || value === undefined) {
        return "";
    }

    const text = typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

    return /[",\n\r]/.test(text)
        ? `"${text.replaceAll('"', '""')}"`
        : text;
}

function primitiveSummaryEntries(summary = {}) {
    return Object.entries(summary).filter(([, value]) =>
        value === null
        || value === undefined
        || ["string", "number", "boolean"].includes(typeof value)
    );
}

export async function writeExperimentCsv(result, {
    directory = "output/local-experiments",
    fileName = `${safeFileName(result.experiment.id)}.csv`,
} = {}) {
    await mkdir(directory, { recursive: true });

    const parameterNames = Object.keys(result.experiment.parameterGrid ?? {});

    const summaryNames = [];
    const seenSummaryNames = new Set();

    for (const run of result.runs) {
        for (const [name] of primitiveSummaryEntries(run.summary)) {
            if (!seenSummaryNames.has(name)) {
                seenSummaryNames.add(name);
                summaryNames.push(name);
            }
        }
    }

    const header = [
        "run",
        "status",
        ...parameterNames.map((name) => `param_${name}`),
        ...summaryNames,
        "elapsedMs",
        "error",
    ];

    const rows = result.runs.map((run) => {
        const values = {
            run: run.runNumber,
            status: run.status,
            elapsedMs: run.elapsedMs,
            error: run.error?.message ?? "",
        };

        for (const name of parameterNames) {
            values[`param_${name}`] = (
                run.parameterValues?.[name]
                ?? run.strategyConfig?.[name]
                ?? ""
            );
        }

        for (const [name, value] of primitiveSummaryEntries(run.summary)) {
            values[name] = value;
        }

        return header.map((name) => escapeCsv(values[name])).join(",");
    });

    const filePath = path.join(directory, fileName);

    await writeFile(
        filePath,
        [header.map(escapeCsv).join(","), ...rows].join("\n") + "\n",
        "utf8"
    );

    return filePath;
}
