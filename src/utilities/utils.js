import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";

/**
 * Elimina archivos subidos temporalmente
 * @param {Array} files - Array de archivos con propiedad path
 */
export async function cleanupFiles(files) {
  try {
    await Promise.all(
      (files || []).map((f) => fs.unlink(f.path).catch(() => {}))
    );
  } catch {}
}

/**
 * Guarda una respuesta en formato markdown en el directorio data/answer
 * @param {string} text - Texto a guardar
 */
export async function saveMarkdownAnswer(text) {
  // Limpiar escapes para Markdown legible
  const cleanMarkdown = text
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, "\t");
  // Generar nombre de archivo único y ruta segura
  const timestamp = Date.now();
  const fileName = `answer-${timestamp}.md`;
  const answerDir = path.join(process.cwd(), "data", "answer");
  const answerPath = path.join(answerDir, fileName);
  try {
    await fs.mkdir(answerDir, { recursive: true });
    console.log("Intentando guardar respuesta en:", answerPath);
    await fs.writeFile(answerPath, String(cleanMarkdown), "utf8");
    console.log("Archivo markdown guardado correctamente:", answerPath);
  } catch (err) {
    console.error("Error guardando respuesta markdown:", err);
  }
}

/**
 * Descarga un documento desde una URL y retorna su contenido en Base64.
 * @param {string} url - Enlace del documento a convertir
 * @returns {Promise<string>} Base64 del contenido del archivo
 */
export async function urlToBase64(url) {
  if (!url || typeof url !== "string") throw new Error("URL inválida");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL inválida");
  }
  if (!/^https?:$/.test(parsed.protocol))
    throw new Error("Protocolo no permitido");
  const res = await fetch(parsed.toString());
  if (!res.ok)
    throw new Error(`Fallo al descargar: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}

/**
 * Recursivamente obtiene todos los archivos PDF en un directorio
 * @param {string} dir - Directorio raíz para buscar
 * @returns {string[]} Array de rutas de archivos PDF
 */
export function getPdfFiles(dir) {
  const entries = fsSync.readdirSync(dir, { withFileTypes: true });
  const pdfs = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pdfs.push(...getPdfFiles(fullPath));
    } else if (
      entry.isFile() &&
      path.extname(entry.name).toLowerCase() === ".pdf"
    ) {
      pdfs.push(fullPath);
    }
  }
  return pdfs;
}
