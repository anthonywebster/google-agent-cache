import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { genAI, waitForFileReady } from "../services/google.js";
import { saveCacheInfo } from "../services/cacheStore.js";

dotenv.config();

// Ruta al archivo de reglas maestro
const rulesPath = path.resolve(process.cwd(), "src/prompts/master-rules.json");
// Directorio base para las fuentes de datos
const baseDir = path.resolve(process.cwd(), "data/cache_sources");
const model = process.argv[2] || "models/gemini-2.5-flash";
const ttlSeconds = Number(process.argv[3] || 3600);

/**
 * Adivina el tipo MIME basado en la extensión del archivo.
 * @param {string} ext
 * @returns {string}
 */
function guessMime(ext) {
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".txt") return "text/plain";
  if (ext === ".md") return "text/markdown";
  return "application/octet-stream";
}

/**
 * Recopila todos los archivos en los directorios dados.
 * @param {string[]} dirPaths
 * @returns {string[]}
 */
function collectFiles(dirPaths) {
  const files = [];
  for (const dir of dirPaths) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isFile()) files.push(full);
    }
  }
  return files;
}

/**
 * Crea un cache basado en una regla dada.
 *
 * @param {object} rule
 * @returns {Promise<object|null>}
 */
async function createCacheFromRule(rule) {
  const sources = (rule.source || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const sourceDirs = sources.map((name) => path.join(baseDir, name));
  const files = collectFiles(sourceDirs);
  if (files.length === 0) {
    console.warn(`Sin archivos para la regla ${rule.id}; se omite.`);
    return null;
  }

  const parts = [];
  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = guessMime(ext);
    const upload = await genAI.files.upload({
      file: filePath,
      config: {
        mimeType: mime,
        displayName: path.basename(filePath),
      },
    });
    const ready = await waitForFileReady(upload.file.name);
    parts.push({ fileData: { mimeType: ready.mimeType, fileUri: ready.uri } });
  }

  const displayName = rule.id || "Context_Cache";
  const systemInstruction = rule.prompt || "";

  const cache = await genAI.caches.create({
    model,
    config: {
      contents: [{ role: "user", parts }],
      displayName,
      systemInstruction,
      ttlSeconds,
    },
  });

  genAI.models.generateContent({
    model,
    config: { cachedContent: cache },
  });

  const info = {
    cacheName: cache.name,
    model,
    createdAt: new Date().toISOString(),
    ttlSeconds,
    ruleId: rule.id,
    sources,
  };
  await saveCacheInfo(info);
  console.log(`Cache creado para ${rule.id}: ${cache.name}`);
  return info;
}

/**
 * Función principal para configurar caches desde reglas.
 *
 * @returns {Promise<void>}
 */
async function main() {
  if (!fs.existsSync(rulesPath)) {
    console.error(`No se encontró master-rules.json en ${rulesPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(rulesPath, "utf-8");
  const rules = JSON.parse(raw);
  if (!Array.isArray(rules) || rules.length === 0) {
    console.error("master-rules.json no contiene reglas.");
    process.exit(1);
  }

  const created = [];
  for (const rule of rules) {
    try {
      const info = await createCacheFromRule(rule);
      if (info) created.push(info);
    } catch (e) {
      console.warn(`Falló la regla ${rule.id}:`, e?.message || e);
    }
  }

  console.log(`Listo. Caches creados: ${created.length}`);
  if (created.length) console.log(created.map((c) => c.cacheName).join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
