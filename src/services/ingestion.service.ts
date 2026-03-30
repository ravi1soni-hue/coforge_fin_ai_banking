import { Transform } from "stream";
import crypto from "crypto";
import type { Readable } from "stream";

import { splitTextByLines } from "../utils/text.resizer.js";
import { getEmbeddingForText } from "./embedding/embedding.helper.js";
import { VectorDocument } from "../models/vector.document.js";
import { container } from "../config/di.container.js";
import type { VectorRepository } from "../repo/vector.repo.js";

/* ---------------- Types ---------------- */

export interface IngestionMeta {
  [key: string]: unknown;
}

/* ---------------- Resolve Awilix Singleton ---------------- */

const vectorRepo = container.resolve<VectorRepository>("vectorRepo");

/* ---------------- JSON STREAM ---------------- */

export const ingestJsonStream = async (
  readableStream: Readable,
  meta: IngestionMeta = {}
): Promise<void> => {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const transformer = new Transform({
      transform(chunk, _encoding, callback) {
        buffer += chunk.toString("utf8");

        try {
          const parsed = JSON.parse(buffer);

          // ✅ Successfully parsed full JSON
          buffer = "";
          handleParsedJson(parsed, meta);
        } catch (err) {
          if (!isRecoverableJsonError(err)) {
            return callback(err as Error);
          }
        }

        callback();
      },

      flush(callback) {
        if (buffer.trim().length > 0) {
          callback(new Error("Incomplete JSON payload"));
        } else {
          callback();
        }
      },
    });

    readableStream
      .pipe(transformer)
      .on("finish", resolve)
      .on("error", reject);
  });
};

/* ---------------- STRING STREAM ---------------- */

export const ingestStringStream = async (
  readableStream: Readable,
  meta: IngestionMeta = {}
): Promise<void> => {
  return new Promise((resolve, reject) => {
    let buffer = "";

    readableStream.setEncoding("utf8");

    readableStream.on("data", (chunk: string) => {
      buffer += chunk;
    });

    readableStream.on("end", async () => {
      try {
        await processString(buffer, meta);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    readableStream.on("error", reject);
  });
};

/* ---------------- CORE PROCESSING ---------------- */

/**
 * Ingest text -> chunk -> embed -> store vectors
 */
export const processString = async (
  text: string,
  metaData: IngestionMeta = {}
): Promise<void> => {
  if (!text || !text.trim()) return;

  const textChunks = splitTextByLines(text, 10);

  for (let i = 0; i < textChunks.length; i++) {
    const chunk = textChunks[i];

    if (!chunk || !chunk.trim()) continue;

    console.log(`📌 Processing chunk ${i + 1}/${textChunks.length}`);

    try {
      // 1️⃣ Generate embedding
      const embedding = await getEmbeddingForText(chunk);

      if (!Array.isArray(embedding) || embedding.length === 0) {
        console.warn("⚠️ Empty embedding, skipping chunk");
        continue;
      }

      // 2️⃣ Create vector document
      const vectorDoc = new VectorDocument({
        id: crypto.randomUUID(),
        text: chunk,
        embedding,
        metadata: {
          ...metaData,
          chunkIndex: i,
          chunkCount: textChunks.length,
        },
      });

      // 3️⃣ Store in vector repository
      vectorRepo.addDocument(vectorDoc);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      console.error(`❌ Failed to process chunk ${i}`, message);
    }
  }
};

/* ---------------- Helpers ---------------- */

const handleParsedJson = (
  json: unknown,
  meta: IngestionMeta
): void => {
  console.log("[JSON RECEIVED]", meta);

  if (Array.isArray(json)) {
    json.forEach(item => processJsonItem(item, meta));
  } else {
    processJsonItem(json, meta);
  }
};

const processJsonItem = (
  item: unknown,
  meta: IngestionMeta
): void => {
  // Hook for:
  // - data normalization
  // - field extraction
  // - re-routing to processString
  console.log("Processed JSON item:", item, meta);
};

const isRecoverableJsonError = (error: unknown): boolean => {
  return (
    error instanceof SyntaxError &&
    /Unexpected end of JSON input/.test(error.message)
  );
};