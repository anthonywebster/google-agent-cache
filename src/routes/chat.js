import express from "express";
import { genAI } from "../services/google.js";
import { saveMarkdownAnswer, urlToBase64 } from "../utilities/utils.js";

const router = express.Router();

/**
 * Endpoint: /api/chat
 * metodo: POST
 * Descripción: Permite subir archivos (PDFs u otros) junto con una pregunta.
 * Utiliza el caché configurado para generar una respuesta basada en los archivos subidos y la pregunta.
 *
 * campos de formulario esperados
 * @param {string} question (requerido)
 * @param {string} cache (opcional)
 * @param {string} model (opcional) modelo a usar, por defecto "models/gemini-2.5-pro"
 * @param {File[]} files archivos: uno o más PDFs u otras URLs de documentos
 */
router.post("/", async (req, res) => {
  try {
    const question = req.body?.question;
    const cache = req.body?.cache || process.env.CACHE_NAME; // valor por defecto para pruebas
    const files = req.body?.files || [];
    const chosenModel = req.body?.model || process.env.MODEL_NAME;

    // validar si existe la pregunta
    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }

    // validar si el caché existe
    if (!cache) {
      return res.status(400).json({ error: "Invalid cache specified" });
    }

    const parts = [];

    // Si hay URLs de archivos proporcionadas, pasarlas a base64
    for (const url of files) {
      try {
        const base64Content = await urlToBase64(url);
        const fileContent = {
          inlineData: {
            mimeType: "application/pdf",
            data: base64Content,
          },
        };
        parts.push(fileContent);
      } catch (err) {
        console.error(`Error descargando archivo desde URL ${url}:`, err);
      }
    }

    const promptArmored = `
      Analiza EXCLUSIVAMENTE los documentos adjuntos via inlineData.

      Tu tarea específica es: ${question}
    `;

    parts.push({ text: promptArmored });

    const response = await genAI.models.generateContent({
      model: chosenModel,
      contents: [{ role: "user", parts }],
      config: { cachedContent: cache },
    });

    const text = response.text || "";

    // solo para previsualización en modo test, guardar la respuesta en markdown
    await saveMarkdownAnswer(text);

    return res.json({ answer: text });
  } catch (err) {
    console.error("Chat upload error:", err);
    const status = err?.status || 500;
    return res.status(status).json({ error: "Failed to generate answer" });
  }
});

export default router;
