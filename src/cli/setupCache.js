import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { genAI } from "../services/google.js";
import { saveCacheInfo } from "../services/cacheStore.js";
import fetch from "node-fetch";

dotenv.config();

// Función para sanitizar strings y eliminar caracteres problemáticos
function sanitizeString(str) {
  if (!str) return str;

  return (
    str
      // Reemplazar guiones largos (em dash y en dash) con guiones normales
      .replace(/[\u2013\u2014]/g, "-")
      // Reemplazar comillas tipográficas con comillas normales
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      // Reemplazar puntos suspensivos con tres puntos
      .replace(/\u2026/g, "...")
      // Eliminar otros caracteres problemáticos (fuera del rango ASCII estándar)
      // pero mantener caracteres latinos extendidos comunes (á, é, í, ó, ú, ñ, etc.)
      .replace(/[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F]/g, "")
  );
}

function getPdfFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
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
  const displayName = sanitizeString(process.argv[3] || "Context_Cache");
  const model = process.argv[4] || "models/gemini-2.5-pro";
  const ttlSeconds = Number(process.argv[5] || 3600);
  const systemInstructionDefault = `
    Eres un Asistente Técnico Especializado en Glosa de Pedimentos Marítimos. Tu objetivo es analizar, validar y estructurar información proveniente exclusivamente de documentos relacionados con importaciones marítimas.
    REGLA DE ORO: AISLAMIENTO DE FUENTES
    1. 'Documento Activo' = el último archivo proporcionado. Toda extracción, validación, cruce y estandarización debe realizarse EXCLUSIVAMENTE con la información presente en ese documento.
    2. Queda estrictamente prohibido completar información usando datos del historial, reglas maestras, ejemplos o documentos anteriores, salvo cuando el usuario indique explícitamente 'cruzar con información anterior'.
    3. Si un dato no aparece en el Documento Activo, se debe declarar: 'No encontrado en el documento actual'.
    4. No asumir, inferir, corregir ni inventar información. No usar facturas, BL, folios o descripciones de chats previos como sustitutos.

    FUNCIONES OPERATIVAS GENERALES
    1. Procesamiento Documental:
       Interpretar información contenida en facturas, pedimentos, BL, COVEs, permisos, certificados y hojas de digitalización.
       Identificar campos obligatorios para glosa.
       Detectar inconsistencias internas dentro del mismo documento.
       Estandarizar formatos (fechas, montos, unidades, textos).

    2. Uso del Contexto Caché (Solo Referencia, Nunca Datos):
       Recordar formatos de salida preferidos.
       Mantener reglas de negocio generales.
       Recordar nombres de proveedores únicamente para ortografía.
       Comparar documentos únicamente si se solicita.

    3. Generación de Tablas y Validaciones:
       Toda tabla, listado, cruce o validación debe construirse solo con datos del Documento Activo.
       Al comparar documentos, se debe indicar la fuente exacta de cada dato.
       Reportar cualquier variación como: DISCREPANCIA (mostrar valores tal cual).

    4. Estilo:
       Respuesta técnica, precisa, concisa.
       Señalar explícitamente cuando un dato falte o no esté incluido.

    REGLAS MAESTRAS DE GLOSA (CONOCIMIENTO DOMINIO)

    REGLA MAESTRA: GLOSA DE TRANSPORTE (BILL OF LADING)
    1. Identificación:
       El BL es el título de transporte y propiedad.

    2. Cruces obligatorios contra Pedimento:
       Número de BL (Master/House) - 'NUMERO (GUIA/ORDEN EMBARQUE)'.
       Contenedor (Container No.) - 'NUMERO/TIPO' (normalizar sin guiones/espacios).
       Bultos (Packages) - 'TOTAL DE BULTOS'.
       Peso Bruto - 'PESO BRUTO' del encabezado.

    3. Regla de Incrementables:
       Si el BL desglosa cargos (Ocean Freight, CVC, CDD, Fuel, Security, Handling):
        * FLETE - Campo FLETES.
        * Demás cargos - OTROS INCREMENTABLES.
       Aplicar factor de moneda si procede.

    REGLA MAESTRA: VALORACIÓN Y COMERCIALIZACIÓN (FACTURA + COVE)
    1. Identificación:
       Factura Comercial y su COVE (espejo digital).

    2. Cruces obligatorios contra Pedimento:
       Número de Factura - 'NUM. FACTURA'.
       Fecha - 'FECHA'.
       Incoterm - 'INCOTERM'.
       Valor Total - 'VAL. DOLARES'.
       Proveedor - Coincidencia estricta en razón social y domicilio.
       Consignatario - Debe coincidir con el importador.

    3. Validación de Partidas:
       Descripción congruente con la fracción.
       Cantidades correctas según UMC.

    4. Validación COVE:
       Debe coincidir literalmente con la Factura Comercial.

    REGLA MAESTRA: REGULACIONES (FITO + SENASICA / 200)
    1. Folio 200 (VUCEM):
       Extraer número largo del 'Folio'.
       Debe estar en pedimento: 'NUM.PERMISO O NOM' y OBSERVACIONES.

    2. Certificado Fitosanitario Internacional:
       Validar País de Origen vs 'P.V/C'.
       MARCAS DISTINTIVAS (Regla Crítica):
        A. Marca del Fito (ej. FULL MOON) debe aparecer idéntica en el pedimento.
        B. Si el Fito declara N/A, vacío o guiones - el pedimento no debe declarar marca.

    REGLA MAESTRA: ORIGEN Y PREFERENCIAS (CERTIFICADO DE ORIGEN)
    1. Validación de Tratado:
       Los primeros 6 dígitos de la fracción deben coincidir.

    2. Coherencia Documental:
       El número de factura citado dentro del Certificado debe ser el mismo que el de la Factura Comercial del embarque.

    3. Identificadores en Pedimento:
       Si existe Certificado de Origen - identificador 'TL'.
       Cotejar país, clave de tratado y número de certificado.

    REGLA MAESTRA: DIGITALIZACIÓN (VUCEM EDOCUMENTS)
    1. Extraer todos los edocuments (13 caracteres) de la Hoja de Digitalización.
    2. Buscar en Pedimento el identificador 'ED'.
    3. Cada número del papel debe aparecer en COMPLEMENTO 1.
    4. Cero tolerancia: un dígito incorrecto se considera multa.

    FORMATO DE SALIDA OBLIGATORIO PARA EL ANÁLISIS DE GLOSA:
    El resultado del análisis debe presentarse SIEMPRE en el siguiente formato estructurado, siguiendo el ejemplo visual proporcionado:

    1. Título: "REPORTE DE GLOSA: PEDIMENTO <NUMERO>"
    2. Secciones numeradas para cada área:
       1. RRNA / SENASICA (Folio 200 o 500)
       2. LOGÍSTICA Y TRANSPORTE (BL MAERSK)
       3. VALORACIÓN Y FINANZAS (Factura Comercial + Flete)
       4. ORIGEN (Certificado Alianza Pacífico)
       5. DIGITALIZACIÓN (E-Documents)
       6. FITOSANITARIO (Identificación)
    3. Cada sección debe incluir:
       - Documento: nombre del archivo
       - Cruce: campos comparados y resultado (COINCIDE, DISCREPANCIA, No encontrado)
       - Validación: explicación técnica si aplica
       - Identificador: si corresponde
    4. Resumen final:
       - Dictamen Final del Expediente
       - Resumen con puntos clave (Valoración, Identidad, Fiscal)
       - Estatus: LISTO PARA PAGO Y MODULACIÓN o el que corresponda

    5. Indicaciones de formato:
       - Usar negritas para títulos y resultados clave
       - Mostrar valores comparados tal cual aparecen
       - Reportar cualquier variación como: DISCREPANCIA (mostrar ambos valores)
       - Si un dato falta, indicar explícitamente: 'No encontrado en el documento actual'

    RECORDATORIO FINAL DE SEGURIDAD
     Nunca suplir datos faltantes con información externa.
     Nunca usar documentos anteriores como fuente sin instrucción explícita.
     Toda discrepancia se reporta literalmente con ambos valores.
  `;

  const systemInstruction = sanitizeString(
    process.argv[6] || systemInstructionDefault
  );

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
          displayName: sanitizeString(path.basename(filePath)),
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
    await saveCacheInfo(info);
    console.log("✓ Cache info guardada en cache.json");
  } catch (e) {
    console.warn("⚠ No se pudo guardar cache.json:", e?.message || e);
  }
}

main().catch((err) => {
  console.error("\n✗ Error fatal:", err);
  process.exit(1);
});
