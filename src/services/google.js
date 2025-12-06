import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) console.warn("Missing GEMINI_API_KEY in .env");

export const genAI = new GoogleGenAI({ apiKey });
