import express from "express";
import multer from "multer";
import os from "os";
import { promises as fs } from "fs";
import { genAI } from "../services/google.js";
import { loadCacheInfo } from "../services/cacheStore.js";

const router = express.Router();
const upload = multer({ dest: os.tmpdir() });

/**
 * Endpoint: /api/chat
 * metodo: POST
 * Descripción: Permite hacer una pregunta utilizando el caché configurado.
 *
 * @param {string} question (requerido)
 * @param {string} context (opcional)
 * @param {Array} files (opcional) - Array de objetos con { path, mimeType }
 */
router.post("/", async (req, res) => {
  try {
    const { question, context, files } = req.body || {};
    if (!question)
      return res.status(400).json({ error: "question is required" });

    const cacheList = await loadCacheInfo();
    const cacheInfo = Array.isArray(cacheList)
      ? cacheList[cacheList.length - 1]
      : cacheList;
    if (!cacheInfo?.cacheName)
      return res.status(400).json({
        error: "Cache not configured. Run POST /api/cache/setup first.",
      });

    // Resolve cached content by name
    const model = genAI.models.generateContent({
      model: chosenModel,
      config: { cachedContent: cacheInfo.cacheName },
    });

    const parts = [];
    if (context) parts.push({ text: context });

    // Optional per-request files: [{ path, mimeType, displayName? }]
    if (Array.isArray(files)) {
      for (const f of files) {
        if (!f?.path || !f?.mimeType) continue;
        const upload = await genAI.files.upload({
          file: f.path,
          config: {
            mimeType: f.mimeType,
            displayName: f.displayName || "chat-file",
          },
        });
        parts.push({
          fileData: { mimeType: upload.mimeType, fileUri: upload.uri },
        });
      }
    }

    parts.push({ text: question });

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });
    const text = result?.response?.text?.() || "";
    return res.json({ answer: text });
  } catch (err) {
    console.error("Chat error:", err);
    const status = err?.status || 500;
    return res.status(status).json({ error: "Failed to generate answer" });
  }
});

/**
 * Endpoint: /api/chat/upload
 * metodo: POST
 * Descripción: Permite subir archivos (PDFs u otros) junto con una pregunta.
 * Utiliza el caché configurado para generar una respuesta basada en los archivos subidos y la pregunta.
 *
 * campos de formulario esperados
 * @param {string} question (requerido)
 * @param {string} context (opcional)
 * @param {string} model (opcional) modelo a usar, por defecto "models/gemini-2.5-flash-001"
 * @param {File[]} files archivos: uno o más PDFs u otros tipos compatibles, nombre de campo "files"
 */
router.post("/upload", upload.array("files", 10), async (req, res) => {
  const cleanupFiles = async () => {
    try {
      await Promise.all(
        (req.files || []).map((f) => fs.unlink(f.path).catch(() => {}))
      );
    } catch {}
  };
  try {
    const question = req.body?.question;
    const context = req.body?.context;
    const chosenModel = req.body?.model || "models/gemini-2.5-flash-001";
    if (!question) {
      await cleanupFiles();
      return res.status(400).json({ error: "question is required" });
    }

    const cacheList = await loadCacheInfo();
    const cacheInfo = Array.isArray(cacheList)
      ? cacheList[cacheList.length - 1]
      : cacheList;
    if (!cacheInfo?.cacheName) {
      await cleanupFiles();
      return res.status(400).json({
        error: "Cache not configured. Run POST /api/cache/setup first.",
      });
    }

    const model = genAI.models.generateContent({
      model: chosenModel,
      config: { cachedContent: cacheInfo.cacheName },
    });

    const parts = [];
    if (context) parts.push({ text: context });

    for (const f of req.files || []) {
      const uploadRes = await genAI.files.upload({
        file: f.path,
        config: {
          mimeType: f.mimetype || "application/octet-stream",
          displayName: f.originalname || "chat-file",
        },
      });
      parts.push({
        fileData: { mimeType: uploadRes.mimeType, fileUri: uploadRes.uri },
      });
    }

    const promptArmored = `
      Analiza EXCLUSIVAMENTE este documento adjunto (ignora datos de facturas, pedimentos o documentos anteriores que estén en el caché).

      Tu tarea específica es: ${question}
    `;

    parts.push({ text: promptArmored });

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });
    const text = result?.response?.text?.() || "";
    await cleanupFiles();
    return res.json({ answer: text });
  } catch (err) {
    console.error("Chat upload error:", err);
    await cleanupFiles();
    const status = err?.status || 500;
    return res.status(status).json({ error: "Failed to generate answer" });
  }
});

export default router;
