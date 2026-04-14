import Busboy from "busboy";
import { ingestStringStream, ingestJsonStream, } from "../services/ingestion.service.js";
/* ---------------- TEXT STREAM ---------------- */
export const ingestTextStream = async (req, res) => {
    try {
        await ingestStringStream(req);
        res.json({ status: "Text ingestion started" });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(400).json({ error: message });
    }
};
/* ---------------- JSON STREAM ---------------- */
export const ingestJsonStreamController = async (req, res) => {
    try {
        await ingestJsonStream(req);
        res.json({ status: "JSON ingestion started" });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(400).json({ error: message });
    }
};
/* ---------------- FILE STREAM ---------------- */
export const ingestFileStream = async (req, res) => {
    const busboy = Busboy({ headers: req.headers });
    busboy.on("file", async (fieldname, file, filename, _encoding, mimetype) => {
        // Example for later:
        // await ingestStream(file, { filename, mimetype });
    });
    busboy.on("finish", () => {
        res.json({ status: "File ingestion completed" });
    });
    req.pipe(busboy);
};
