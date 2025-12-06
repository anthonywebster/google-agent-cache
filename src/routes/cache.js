import express from "express";
import { genAI } from "../services/google.js";
import {
  saveCacheInfo,
  loadCacheInfo,
  clearCacheInfo,
} from "../services/cacheStore.js";

const router = express.Router();

/**
 * Endpoint: /api/cache/setup
 * metodo: POST
 * Descripción: Configura un caché de contexto subiendo un archivo y creando el caché en Google Generative AI.
 *
 * @param {string} filePath (requerido) - Ruta local del archivo a subir
 * @param {string} mimeType (requerido) - Tipo MIME del archivo
 * @param {string} displayName (opcional) - Nombre para el archivo subido
 * @param {string} model (opcional) - Modelo generativo a usar (default: "models/gemini-2.5-flash-001")
 * @param {number} ttlSeconds (opcional) - Tiempo de vida del caché en segundos (default: 3600)
 * @param {string} systemInstruction (opcional) - Instrucción del sistema para el caché
 * @param {string} cacheDisplayName (opcional) - Nombre para el caché creado
 */
router.post("/setup", async (req, res) => {
  try {
    const {
      filePath,
      mimeType,
      displayName,
      model,
      ttlSeconds,
      systemInstruction,
      cacheDisplayName,
    } = req.body || {};
    if (!filePath || !mimeType)
      return res
        .status(400)
        .json({ error: "filePath and mimeType are required" });

    const chosenModel = model || "models/gemini-2.5-flash-001";
    const sysInstr =
      systemInstruction ||
      "Eres un experto en el dominio del documento. Responde basándote exclusivamente en el documento proporcionado.";

    // 1) Upload file
    const upload = await genAI.files.upload({
      file: filePath,
      config: {
        mimeType,
        displayName: displayName || "source-file",
      },
    });

    // 2) Create cache
    const cache = await genAI.caches.create({
      model: chosenModel,
      config: {
        displayName: cacheDisplayName || "Context_Cache",
        systemInstruction: sysInstr,
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: {
                  mimeType: upload.mimeType,
                  fileUri: upload.uri,
                },
              },
            ],
          },
        ],
        ttlSeconds: ttlSeconds ?? 3600,
      },
    });

    // Persist cache info
    const info = {
      cacheName: cache.name,
      model: chosenModel,
      createdAt: new Date().toISOString(),
      ttlSeconds: ttlSeconds ?? 3600,
    };
    await saveCacheInfo(info);

    res.json({ message: "Cache creado", cacheName: cache.name, info });
  } catch (err) {
    console.error("Cache setup error:", err);
    res.status(500).json({ error: "Failed to setup cache" });
  }
});

/**
 * Endpoint: /api/cache
 * metodo: GET
 * Descripción: Obtiene la información del caché configurado.
 */
router.get("/", async (_req, res) => {
  const list = await loadCacheInfo();
  if (!Array.isArray(list) || list.length === 0)
    return res.status(404).json({ error: "No cache configured" });
  res.json(list);
});

/**
 * Endpoint: /api/cache
 * metodo: DELETE
 * Descripción: Elimina la referencia almacenada del caché (no elimina el caché remoto)
 */
router.delete("/", async (_req, res) => {
  await clearCacheInfo();
  res.json({ message: "Cache info cleared" });
});

export default router;
