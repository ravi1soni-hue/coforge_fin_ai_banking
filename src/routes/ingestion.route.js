import express from "express";
import {
  ingestTextStream,
  ingestJsonStreamController,
  ingestFileStream,
} from "../controllers/ingestion.controller.js";

const router = express.Router();

/**
 * Content-Type: text/plain
 */
router.post("/upload/text", ingestTextStream);

/**
 * Content-Type: application/json
 */
router.post("/upload/json", ingestJsonStreamController);

/**
 * Content-Type: multipart/form-data
 */
router.post("/upload/file", ingestFileStream);

export default router;