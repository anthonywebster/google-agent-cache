import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) console.warn("Missing GEMINI_API_KEY in .env");

export const genAI = new GoogleGenAI({ apiKey });

/**
 * Waits for a file to be processed and become active.
 *
 * @param {*} fileName // file name returned on upload
 * @param {*} options // { intervalMs, maxAttempts }
 * @returns
 */
export async function waitForFileReady(
  fileName,
  { intervalMs = 2000, maxAttempts = 60 } = {}
) {
  let attempts = 0;
  let file = await genAI.files.get(fileName);
  while (file.state === "PROCESSING") {
    if (attempts++ >= maxAttempts)
      throw new Error("Timeout waiting for file to be processed");
    await new Promise((r) => setTimeout(r, intervalMs));
    file = await genAI.files.get(fileName);
  }
  if (file.state !== "ACTIVE")
    throw new Error(`File not active. State: ${file.state}`);
  return file;
}
