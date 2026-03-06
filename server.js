const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const archiver = require("archiver");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

const visited = new Set();

async function crawl(url, baseUrl, dir) {
    if (visited.has(url)) return;
    visited.add(url);

    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        const fileName =
            url === baseUrl
                ? "index.html"
                : url.replace(baseUrl, "").replace(/\//g, "_") + ".html";

        await fs.writeFile(path.join(dir, fileName), data);

        // Assets
        $("img, script[src], link[rel='stylesheet']").each(async (i, el) => {
            let src =
                $(el).attr("src") ||
                $(el).attr("href");

            if (!src) return;

            if (!src.startsWith("http"))
                src = baseUrl + src;

            const assetName = path.basename(src);
            const assetPath = path.join(dir, "assets", assetName);

            try {
                const res = await axios.get(src, { responseType: "arraybuffer" });
                await fs.writeFile(assetPath, res.data);
            } catch {}
        });

        // Internal links
        $("a[href]").each((i, el) => {
            let link = $(el).attr("href");
            if (!link) return;

            if (link.startsWith("/") && !link.startsWith("//")) {
                crawl(baseUrl + link, baseUrl, dir);
            }
        });
    } catch {}
}

app.post("/clone", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });

    visited.clear();

    const baseUrl = new URL(url).origin;
    const dir = "cloned_site";

    await fs.remove(dir);
    await fs.ensureDir(dir);
    await fs.ensureDir(path.join(dir, "assets"));

    await crawl(url, baseUrl, dir);

    const zipPath = "site.zip";
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip");

    archive.pipe(output);
    archive.directory(dir, false);
    await archive.finalize();

    output.on("close", () => {
        res.download(zipPath);
    });
});

app.listen(process.env.PORT || 3000, () =>
    console.log("Ultra Web Mirror Running 🚀")
);
