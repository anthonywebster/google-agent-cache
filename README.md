# 🚀 Google Generative AI Chat API — Context Cache

[![Express](https://img.shields.io/badge/Express-5-black?logo=express)](#)
[![Google Generative AI](https://img.shields.io/badge/Google%20Generative%20AI-Gemini-4285F4?logo=google)](#)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#)

Un servidor Express listo para chatear con Gemini usando Context Cache: sube tus fuentes una vez, crea un caché remoto y úsalo como contexto base en tus conversaciones. ✨

---

## 📚 Tabla de contenidos

- 🧠 Qué es y cómo funciona
- ⚙️ Instalación rápida
- 🔐 Configuración (.env)
- 🧪 Healthcheck
- 🧩 API (endpoints)
- 🛠️ CLI (comandos)
- 📦 Estructura sugerida
- 📘 Ejemplos
- ❓ FAQ y tips

---

## 🧠 Qué es y cómo funciona

1. Entrena un Context Cache subiendo tus archivos. 2) El nombre del caché se guarda localmente. 3) Cada chat reutiliza ese contexto y puedes añadir contexto y archivos adicionales por request.

---

## ⚙️ Instalación rápida

```bash
npm install
# Crea .env con tu GEMINI_API_KEY (o copia .env.example si existe)
# Coloca tus fuentes en data/cache_sources/
```

Arranque del servidor:

```bash
npm run start
```

Configurar el caché por CLI (opciones):

```bash
npm run setup-cache -- [sourcesDir] [displayName] [model] [ttlSeconds] [systemInstruction]
# Ejemplo:
npm run setup-cache -- data/cache_sources "Cache_Experto" models/gemini-2.5-pro 3600 "Eres experto en aduanas..."
```

---

## 🔐 Configuración (.env)

- GEMINI_API_KEY=tu_api_key
- CACHE_NAME=tu_nombre_de_cache
- MODEL_NAME=models/gemini-2.5-pro
- PORT=3000

Modelos: usa uno que soporte createCachedContent (por ejemplo models/gemini-2.5-pro).

---

## 🧪 Healthcheck

GET /health → { status: 'ok' }

---

## 🧩 API (endpoints)

### 1) Context Cache

- POST /api/cache/setup
  - body: { filePath: string, mimeType: string, displayName?, model?, ttlSeconds?, systemInstruction?, cacheDisplayName? }
  - Sube el archivo, espera el procesamiento, crea el caché remoto y guarda el nombre en cache.json
- GET /api/cache → Información del caché guardado
- DELETE /api/cache → Elimina la referencia local (no borra el caché remoto)

### 2) Chat

- POST /api/chat
  - body: { question: string, context?: string, files?: [{ path: string, mimeType: string, displayName?: string }] }
  - Usa el caché como contexto base + contexto/archivos opcionales
- POST /api/chat/upload (multipart/form-data)
  - fields: question (requerido), context (opcional)
  - files: múltiples PDFs/TXT/MD en el campo files; se suben a Gemini y se añaden al prompt

---

## 🛠️ CLI (comandos)

| Comando      | Descripción                           | Uso                                                                            |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------ |
| list-models  | Lista modelos y métodos soportados    | `npm run list-models`                                                          |
| setup-cache  | Sube fuentes y crea un Context Cache  | `npm run setup-cache -- [dir] [displayName] [model] [ttl] [systemInstruction]` |
| list-caches  | Lista cachés remotos                  | `npm run list-caches`                                                          |
| delete-cache | Elimina un caché remoto por name o ID | `npm run delete-cache -- cachedContents/XXX` o `npm run delete-cache -- XXX`   |

Tip: usa `npm run list-caches` para copiar el campo name exacto.

---

## 📦 Estructura sugerida

```
.
├─ data/
│  └─ cache_sources/      # Tus fuentes (.pdf, .txt, .md, ...)
├─ src/
│  ├─ cli/                # Scripts CLI
│  └─ server.js           # Servidor Express
├─ cache.json             # Nombre del caché guardado
└─ .env                   # GEMINI_API_KEY
```

---

## 📘 Ejemplos

JSON (ruta local en el servidor):

```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "¿Qué documentos faltan?",
    "context": "Embarque MX-001",
    "files": [{
      "path": "data/cache_sources/mi-archivo.pdf",
      "mimeType": "application/pdf",
      "displayName": "mi-archivo.pdf"
    }]
  }'
```

Subiendo PDFs desde el cliente (multipart/form-data):

```bash
curl -X POST http://localhost:3000/api/chat/upload \
  -F "question=¿Qué BL aplica?" \
  -F "context=Embarque MX-001" \
  -F "files=@data/cache_sources/ejemplo1.pdf;type=application/pdf" \
  -F "files=@data/cache_sources/ejemplo2.pdf;type=application/pdf"
```

---

## ❓ FAQ y tips

- Asegúrate de que el modelo soporte createCachedContent.
- Si no tienes .env.example, crea .env y añade GEMINI_API_KEY.
- Puedes recrear el caché cuando caduque usando la CLI.

---

Hecho con ❤️ para desarrolladores que necesitan respuestas con contexto persistente. ✨
