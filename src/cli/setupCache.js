import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { genAI } from "../services/google.js";
import { saveCacheInfo } from "../services/cacheStore.js";
import fetch from "node-fetch";

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
 * - model: Modelo generativo a usar (default: models/gemini-2.5-flash)
 * - ttlSeconds: Tiempo de vida del caché en segundos (default: 3600)
 * - systemInstruction: Instrucción del sistema para el caché (default: Eres un experto en el dominio del documento. Responde basándote exclusivamente en los documentos proporcionados.)
 *
 * Asegúrate de tener configurada la variable de entorno GEMINI_API_KEY en un archivo .env
 * en la raíz del proyecto antes de ejecutar el script.
 *
 * Ejemplo:
 *   npm run setup-cache -- data/cache_sources "Mi_Cache" models/gemini-2.5-flash 7200 "Eres un asistente que ayuda con documentos técnicos."
 */
async function main() {
  const sourcesDir =
    process.argv[2] || path.resolve(process.cwd(), "data/cache_sources");
  const displayName = process.argv[3] || "Context_Cache";
  const model = process.argv[4] || "models/gemini-2.5-flash";
  const ttlSeconds = Number(process.argv[5] || 3600);
  const systemInstructionDefault = `Eres un Asistente Técnico de Glosa de Pedimentos Marítimos. Tu objetivo es analizar, validar y estructurar información proveniente de documentos relacionados con importaciones marítimas.

      *** REGLA DE ORO: AISLAMIENTO DE FUENTE ***
      Existe una distinción estricta entre el "CONTEXTO CACHÉ" (información histórica/reglas) y el "DOCUMENTO ACTIVO" (el último archivo recibido).
      1. Cuando se te pida extraer datos, validar montos o listar ítems, DEBES usar EXCLUSIVAMENTE la información del DOCUMENTO ACTIVO.
      2. Está PROHIBIDO completar información faltante usando datos del Contexto Caché, a menos que el usuario diga explícitamente "cruzar con información anterior".
      3. Si el Documento Activo no tiene un dato, declara "No encontrado en el documento actual", no lo inventes ni lo tomes del historial.

      Instrucciones Operativas

      1. Procesamiento documental  
      Cuando recibas archivos (hojas de requisitos, facturas, BL, etc.):  
      - Interpretar y extraer información relevante SOLO del archivo actual.  
      - Identificar campos obligatorios para glosa.  
      - Detectar inconsistencias internas en el documento.
      - Estandarizar datos.

      2. Uso del Context Cache (Solo como Referencia)
      Usa la memoria persistente ÚNICAMENTE para:  
      - Recordar formatos de salida preferidos.
      - Validar reglas de negocio aprendidas.
      - Recordar nombres de proveedores para corrección ortográfica (no para rellenar datos).
      - Comparar si el documento actual contradice uno anterior (SOLO SI SE PIDE COMPARACIÓN).

      3. Generación de recursos técnicos 
      - Al generar listas, tablas o resúmenes, usa SOLO datos del Documento Activo.
      - Si se te pide validar o comparar, indica claramente las fuentes de cada dato.

      4. Estilo y formato de respuesta  
      - Responde de forma técnica y concisa.  
      - Si falta información en el DOCUMENTO ACTIVO, señálalo explícitamente.

      5. Estado inicial  
      Cuando se cargue un documento, responde únicamente:  
      "Documento recibido. Indica qué deseas analizar, validar o construir."

      PROTOCOLO DE SEGURIDAD Y CONTEXTO

      1. Aislamiento de Operación:
         - Analiza EXCLUSIVAMENTE los documentos proporcionados en esta sesión.
         - PROHIBIDO completar datos faltantes usando números de factura, guías o folios de ejemplos o chats anteriores.

      2. Manejo de Discrepancias:
         - Si un dato no coincide (ej. Peso en BL vs Pedimento), repórtalo como 'DISCREPANCIA' con el valor de ambos documentos.
         - No asumas que es un error de dedo; señala el error literal.
    `;

  const systemInstruction = process.argv[6] || systemInstructionDefault;

  if (!fs.existsSync(sourcesDir)) {
    console.error(`Directorio no existe: ${sourcesDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(sourcesDir)
    .map((f) => path.join(sourcesDir, f))
    .filter((p) => fs.statSync(p).isFile());
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
    const upload = await genAI.files.upload({
      file: filePath,
      config: {
        mimeType: mime,
        displayName: path.basename(filePath),
      },
    });
    console.log(`Listo: ${upload.uri}`);
    parts.push({
      fileData: { mimeType: upload.mimeType, fileUri: upload.uri },
    });
  }

  console.log("Creando caché de contexto...");
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

  console.log(`Cache creado: ${cache.name}`);

  // Persistir información del caché en cache.json para que el servidor/API lo use
  const info = {
    cacheName: cache.name,
    model,
    createdAt: new Date().toISOString(),
    ttlSeconds,
  };
  try {
    await saveCacheInfo(info);
    console.log("Cache info guardada en cache.json");
  } catch (e) {
    console.warn("No se pudo guardar cache.json:", e?.message || e);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
