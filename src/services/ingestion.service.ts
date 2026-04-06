import { Transform, type Readable } from "stream";
import crypto from "crypto";

import { splitTextByLines } from "../utils/text.resizer.js";
import { getEmbeddingForText } from "./embedding/embedding.helper.js";
import { container } from "../config/di.container.js";
import type { VectorRepository } from "../repo/vector.repo.js";

/* -------------------------------------------------
 * Types
 * ------------------------------------------------- */

export interface IngestionMeta {
  user_id: string;            // REQUIRED
  domain?: string;
  facet?: string;
  source?: string;
  [key: string]: unknown;
}

/* -------------------------------------------------
 * Resolve repository once (DB-backed)
 * ------------------------------------------------- */

const vectorRepo = container.resolve<VectorRepository>("vectorRepo");

/* -------------------------------------------------
 * JSON STREAM INGESTION
 * ------------------------------------------------- */

export const ingestJsonStream = async (
  readableStream: Readable,
  meta: IngestionMeta
): Promise<void> => {
  if (!meta?.user_id) {
    throw new Error("user_id is required for vector ingestion");
  }

  return new Promise((resolve, reject) => {
    let buffer = "";

    const transformer = new Transform({
      async transform(chunk, _encoding, callback) {
        buffer += chunk.toString("utf8");

        try {
          const parsed = JSON.parse(buffer);
          buffer = "";
          await handleParsedJson(parsed, meta);
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

/* -------------------------------------------------
 * STRING STREAM INGESTION
 * ------------------------------------------------- */

export const ingestStringStream = async (
  readableStream: Readable,
  meta: IngestionMeta
): Promise<void> => {
  if (!meta?.user_id) {
    throw new Error("user_id is required for vector ingestion");
  }

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

/* -------------------------------------------------
 * CORE INGESTION LOGIC (DB ONLY)
 * ------------------------------------------------- */

export const processString = async (
  text: string,
  metaData: IngestionMeta
): Promise<void> => {
  if (!text || !text.trim()) return;

  const textChunks = splitTextByLines(text, 10);

  for (let i = 0; i < textChunks.length; i++) {
    const chunk = textChunks[i];
    if (!chunk || !chunk.trim()) continue;

    console.log(`📌 Processing chunk ${i + 1}/${textChunks.length}`);

    try {
      /* 1️⃣ Generate embedding */
      const embedding = await getEmbeddingForText(chunk);
      if (!Array.isArray(embedding) || embedding.length === 0) {
        console.warn("⚠️ Empty embedding, skipping chunk");
        continue;
      }

      /* 2️⃣ Persist to database */
      await vectorRepo.insertDb({
        user_id: metaData.user_id,
        content: chunk,
        embedding,
        domain: metaData.domain ?? null,
        facet: metaData.facet ?? null,
        source: metaData.source ?? "string_ingestion",
        metadata: {
          ...metaData,
          chunkIndex: i,
          chunkCount: textChunks.length,
        },
        embedding_model: "text-embedding-3-large",
        embedding_version: 1,
      });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Failed to process chunk ${i}`, message);
    }
  }
};

/* -------------------------------------------------
 * Helpers
 * ------------------------------------------------- */

const handleParsedJson = async (
  json: unknown,
  meta: IngestionMeta
): Promise<void> => {
  if (Array.isArray(json)) {
    for (const item of json) {
      await processJsonItem(item, meta);
    }
  } else {
    await processJsonItem(json, meta);
  }
};

const processJsonItem = async (
  item: unknown,
  meta: IngestionMeta
): Promise<void> => {
  // You can normalize JSON here and call processString
  // Example:
  if (typeof item === "string") {
    await processString(item, meta);
  }
};

const isRecoverableJsonError = (error: unknown): boolean => {
  return (
    error instanceof SyntaxError &&
    /Unexpected end of JSON input/.test(error.message)
  );
};