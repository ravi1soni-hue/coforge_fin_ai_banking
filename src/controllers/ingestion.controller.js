import { ingestStream, ingestJsonStream } from "../services/ingestion.service.js";
import Busboy from "busboy";

/* ---------------- TEXT STREAM ---------------- */
export const ingestTextStream = async (req, res) => {
  try {
    await ingestStream(req);
    res.json({ status: "Text ingestion started" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ---------------- JSON STREAM ---------------- */
export const ingestJsonStreamController = async (req, res) => {
  try {
    await ingestJsonStream(req);
    res.json({ status: "JSON ingestion started" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ---------------- FILE STREAM ---------------- */
export const ingestFileStream = async (req, res) => {
  const busboy = new Busboy({ headers: req.headers });

  busboy.on("file", async (fieldname, file, filename) => {
    await ingestStream(file, {
      filename,
      mimetype: file.mimetype,
    });
  });

  busboy.on("finish", () => {
    res.json({ status: "File ingestion completed" });
  });

  req.pipe(busboy);
};
