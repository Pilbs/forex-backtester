import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function safeFileName(value) {
    return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function writeExperimentResult(result, {
    directory = "output/experiments",
    fileName = `${safeFileName(result.experiment.id)}.json`,
} = {}) {
    await mkdir(directory, {
        recursive: true,
    });

    const filePath = path.join(directory, fileName);
    await writeFile(filePath, JSON.stringify(result, null, 2), "utf8");
    return filePath;
}
