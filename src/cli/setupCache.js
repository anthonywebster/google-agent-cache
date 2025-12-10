import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { genAI } from "../services/google.js";
import { saveCacheInfo } from "../services/cacheStore.js";
import { getPdfFiles, systemInstructionDefault } from "../utilities/utils.js";

dotenv.config();

/**
 * Script para crear un caché de contexto a partir de archivos en un directorio dentro de data/cache_sources.
 *
 * Uso:
 *
 *   npm run setup-cache -- [sourcesDir] [displayName] [model] [ttlSeconds] [systemInstruction]
 *
 * - sourcesDir: Directorio con archivos para subir (default: data/cache_sources)
 * - displayName: Nombre para el caché (default: Context_Cache)
 * - model: Modelo generativo a usar (default: models/gemini-2.5-pro)
 * - ttlSeconds: Tiempo de vida del caché en segundos (default: 3600)
 * - systemInstruction: Instrucción del sistema para el caché (default: Eres un experto en el dominio del documento. Responde basándote exclusivamente en los documentos proporcionados.)
 *
 * Asegúrate de tener configurada la variable de entorno GEMINI_API_KEY en un archivo .env
 * en la raíz del proyecto antes de ejecutar el script.
 *
 * Ejemplo:
 *   npm run setup-cache -- data/cache_sources "Mi_Cache" models/gemini-2.5-pro 7200 "Eres un asistente que ayuda con documentos técnicos."
 */
async function main() {
  const sourcesDir =
    process.argv[2] || path.resolve(process.cwd(), "data/rules");
  const displayName = process.argv[3] || "Context_Cache";
  const model = process.argv[4] || process.env.MODEL_NAME;
  const ttlSeconds = Number(process.argv[5] || 3600);

  const systemInstruction = process.argv[6] || systemInstructionDefault;

  if (!fs.existsSync(sourcesDir)) {
    console.error(`Directorio no existe: ${sourcesDir}`);
    process.exit(1);
  }

  const files = getPdfFiles(sourcesDir);
  if (files.length === 0) {
    console.error(`No hay archivos en ${sourcesDir}`);
    process.exit(1);
  }

  console.log(`Subiendo ${files.length} archivos desde ${sourcesDir}...`);
  const parts = [];
  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".txt"
        ? "text/plain"
        : ext === ".md"
        ? "text/markdown"
        : "application/octet-stream";

    console.log(`Subiendo: ${path.basename(filePath)}...`);

    try {
      const upload = await genAI.files.upload({
        file: filePath,
        config: {
          mimeType: mime,
          displayName: path.basename(filePath),
        },
      });
      console.log(`✓ Listo: ${upload.uri}`);
      parts.push({
        fileData: { mimeType: upload.mimeType, fileUri: upload.uri },
      });
    } catch (uploadErr) {
      console.error(
        `✗ Error subiendo ${path.basename(filePath)}:`,
        uploadErr?.message || uploadErr
      );
      throw uploadErr;
    }
  }

  console.log("\nCreando caché de contexto...");
  let cache;
  try {
    cache = await genAI.caches.create({
      model,
      config: {
        displayName,
        systemInstruction,
        contents: [{ role: "user", parts }],
        ttlSeconds,
      },
    });
  } catch (err) {
    console.error(
      "Error al crear el caché. Verifica que el modelo soporte createCachedContent.",
      err?.message || err
    );
    process.exit(1);
  }

  console.log(`\n✓ Cache creado exitosamente: ${cache.name}`);

  // Persistir información del caché en cache.json para que el servidor/API lo use
  const info = {
    cacheName: cache.name,
    model,
    createdAt: new Date().toISOString(),
    ttlSeconds,
  };
  try {
    await saveCacheInfo([info]);
    console.log("✓ Cache info guardada en cache.json");
  } catch (e) {
    console.warn("⚠ No se pudo guardar cache.json:", e?.message || e);
  }
}

main().catch((err) => {
  console.error("\n✗ Error fatal:", err);
  process.exit(1);
});
