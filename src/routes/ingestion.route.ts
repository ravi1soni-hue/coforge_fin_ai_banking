import express, { Request, Response } from "express";
import Busboy from "busboy";
import { Readable } from "stream";

import {
  ingestStringStream,
  ingestJsonStream,
} from "../services/ingestion.service.js";

const router = express.Router();

/* ============================================
 * Helper: extract metadata from headers
 * ============================================ */
function extractMetaFromHeaders(req: Request) {
  return {
    user_id: req.headers["x-user-id"] as string,
    domain: req.headers["x-domain"] as string | undefined,
    facet: req.headers["x-facet"] as string | undefined,
    source: req.headers["x-source"] as string | undefined,
    currency: req.headers["x-currency"] as string | undefined,
    streamName: req.headers["x-stream-name"] as string | undefined,
    period_from: req.headers["x-period-from"] as string | undefined,
    period_to: req.headers["x-period-to"] as string | undefined,
  };
}

/* ============================================
 * TEXT STREAM INGESTION
 * Content-Type: text/plain
 * Metadata via headers
 * ============================================ */
router.post("/upload/text", async (req: Request, res: Response) => {
  try {
    const meta = extractMetaFromHeaders(req);

    if (!meta.user_id) {
      return res.status(400).json({
        error: "x-user-id header is required",
      });
    }

    await ingestStringStream(req, meta);

    res.json({ status: "Text ingestion completed" });
  } catch (err: unknown) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

/* ============================================
 * JSON STREAM INGESTION
 * Content-Type: application/json
 * ============================================ */
router.post("/upload/json", async (req: Request, res: Response) => {
  try {
    const meta = extractMetaFromHeaders(req);

    if (!meta.user_id) {
      return res.status(400).json({
        error: "x-user-id header is required",
      });
    }

    await ingestJsonStream(req, meta);

    res.json({ status: "JSON ingestion completed" });
  } catch (err: unknown) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// /* ============================================
//  * FILE / MULTIPART INGESTION
//  * Content-Type: multipart/form-data
//  * ============================================ */
// router.post("/upload/file", async (req: Request, res: Response) => {
//   try {
//     const busboy = Busboy({ headers: req.headers });

//     let meta: any = null;
//     let processing: Promise<void>[] = [];

//     busboy.on("field", (name, value) => {
//       if (name === "metadata") {
//         meta = JSON.parse(value);
//       }
//     });

//     busboy.on(
//       "file",
//       (
//         _fieldname,
//         file: NodeJS.ReadableStream,
//         filename,
//         _encoding,
//         mimetype
//       ) => {
//         if (!meta?.user_id) {
//           file.resume();
//           throw new Error("metadata.user_id is required");
//         }

//         // Convert Node stream → Readable
//         const readable = Readable.from(file);

//         processing.push(
//           ingestStringStream(readable, {
//             ...meta,
//             filename,
//             mimetype,
//           })
//         );
//       }
//     );

//     busboy.on("finish", async () => {
//       await Promise.all(processing);
//       res.json({ status: "File ingestion completed" });
//     });

//     req.pipe(busboy);
//   } catch (err: unknown) {
//     res.status(400).json({
//       error: err instanceof Error ? err.message : "Unknown error",
//     });
//   }
// });

export default router;