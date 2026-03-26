import { Transform } from "stream";


export const ingestJsonStream = async (readableStream, meta = {}) => {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const transformer = new Transform({
      transform(chunk, encoding, callback) {
        buffer += chunk.toString("utf8");

        try {
          /**
           * Attempt JSON parse
           * If incomplete, JSON.parse will throw — we ignore
           */
          const parsed = JSON.parse(buffer);

          // ✅ Successfully parsed full JSON
          buffer = "";

          handleParsedJson(parsed, meta);
        } catch (err) {
          // ❗ Ignore parsing errors caused by partial streams
          if (!isRecoverableJsonError(err)) {
            return callback(err);
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

/* ---------------- Helpers ---------------- */

const handleParsedJson = (json, meta) => {
  console.log("[JSON RECEIVED]", meta);

  if (Array.isArray(json)) {
    json.forEach((item) => processJsonItem(item, meta));
  } else {
    processJsonItem(json, meta);
  }
};

const processJsonItem = (item, meta) => {
  // ✅ This is where YOU plug your logic

  // Examples:
  // - extract text fields
  // - normalize financial data
  // - generate embeddings
  // - persist to Firestore
  // - send progress via WebSocket

  console.log("Processed JSON item:", item);
};

const isRecoverableJsonError = (error) => {
  return (
    error instanceof SyntaxError &&
    /Unexpected end of JSON input/.test(error.message)
  );
};

/**
 * Generic streaming ingestion
 * Supports: text, json, files
 */
export const ingestStream = async (readableStream, meta = {}) => {
  return new Promise((resolve, reject) => {
    const transformer = new Transform({
      transform(chunk, encoding, callback) {
        const content = chunk.toString("utf8");

        // ✅ Here you can:
        // - chunk text
        // - generate embeddings
        // - save to DB
        // - send progress via WebSocket

        console.log("Chunk received:", content.slice(0, 50));

        callback(null, chunk);
      },
    });

    readableStream
      .pipe(transformer)
      .on("finish", resolve)
      .on("error", reject);
  });
};