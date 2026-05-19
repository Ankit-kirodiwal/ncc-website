const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const PublicContent = require("../models/PublicContent");
const authMiddleware = require("../middleware/authMiddleware");
const {
  uploadBufferToCloudinary,
  deleteFromCloudinary
} = require("../services/cloudinaryService");

const router = express.Router();

const allowedSections = new Set(["achievements", "national-camps", "gallery"]);
const localUploadDir = path.join(__dirname, "..", "public", "uploads", "homepage-content");
fs.mkdirSync(localUploadDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      callback(null, true);
      return;
    }

    callback(new Error("Only image uploads are allowed."));
  }
});

function ensureAdmin(req, res) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ message: "Access denied. Admin only." });
    return false;
  }

  return true;
}

function getActorId(req) {
  return req.user?.userId || req.user?.id || req.user?._id || null;
}

function normalizeFacts(rawFacts) {
  if (!rawFacts) {
    return [];
  }

  let parsedFacts = rawFacts;
  if (typeof rawFacts === "string") {
    try {
      parsedFacts = JSON.parse(rawFacts);
    } catch (_error) {
      parsedFacts = [];
    }
  }

  if (!Array.isArray(parsedFacts)) {
    return [];
  }

  return parsedFacts
    .map((fact) => ({
      label: String(fact?.label || "").trim(),
      value: String(fact?.value || "").trim()
    }))
    .filter((fact) => fact.label && fact.value);
}

function buildPayload(req, existingItem = null) {
  const body = req.body || {};
  const section = String(body.section || existingItem?.section || "").trim();
  const imageUrlFromBody = String(body.imageUrl || "").trim();

  return {
    section,
    title: String(body.title || existingItem?.title || "").trim(),
    subtitle: String(body.subtitle || existingItem?.subtitle || "").trim(),
    description: String(body.description || existingItem?.description || "").trim(),
    altText: String(body.altText || existingItem?.altText || "").trim(),
    highlightText: String(body.highlightText || existingItem?.highlightText || "").trim(),
    imageUrl: imageUrlFromBody || existingItem?.imageUrl || "",
    sortOrder: Number.isFinite(Number(body.sortOrder))
      ? Number(body.sortOrder)
      : Number(existingItem?.sortOrder || 0),
    facts: normalizeFacts(body.facts || existingItem?.facts || [])
  };
}

function validatePayload(payload, options = {}) {
  const hasUploadedFile = Boolean(options.hasUploadedFile);

  if (!allowedSections.has(payload.section)) {
    return "Please choose a valid homepage section.";
  }

  if (!payload.title && payload.section !== "gallery") {
    return "Title is required for achievements and national camps.";
  }

  if (!payload.imageUrl && !hasUploadedFile) {
    return "Please upload an image or provide an image URL.";
  }

  if (!Number.isFinite(payload.sortOrder)) {
    return "Sort order must be a valid number.";
  }

  return null;
}

async function removeLocalFile(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("/uploads/homepage-content/")) {
    return;
  }

  const absolutePath = path.join(__dirname, "..", "public", imageUrl.replace(/^\//, ""));

  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Delete image file error:", error);
    }
  }
}

async function removePreviousImageAsset(item) {
  if (!item) {
    return;
  }

  await deleteFromCloudinary(item.cloudinaryPublicId);
  await removeLocalFile(item.imageUrl);
}

async function uploadImageIfProvided(req, section) {
  if (!req.file) {
    return null;
  }

  const originalName = req.file.originalname || "image";
  const extension = path.extname(originalName).toLowerCase();
  const safeBaseName = path
    .basename(originalName, extension)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "image";

  const result = await uploadBufferToCloudinary(req.file.buffer, {
    folder: "ncc-homepage-content",
    resource_type: "image",
    public_id: `${section}-${Date.now()}-${safeBaseName}`
  });

  return {
    imageUrl: result.secure_url,
    cloudinaryPublicId: result.public_id
  };
}

router.get("/", async (req, res) => {
  try {
    const section = req.query.section ? String(req.query.section).trim() : "";
    const query = section && allowedSections.has(section) ? { section } : {};

    const items = await PublicContent.find(query).sort({ section: 1, sortOrder: 1, createdAt: -1 });
    res.json(items);
  } catch (error) {
    console.error("Fetch public content error:", error);
    res.status(500).json({ message: "Error fetching homepage content." });
  }
});

router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const payload = buildPayload(req);
    const validationError = validatePayload(payload, { hasUploadedFile: Boolean(req.file) });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const uploadedAsset = await uploadImageIfProvided(req, payload.section);

    if (uploadedAsset) {
      payload.imageUrl = uploadedAsset.imageUrl;
    }

    const finalValidationError = validatePayload(payload);
    if (finalValidationError) {
      if (uploadedAsset?.cloudinaryPublicId) {
        await deleteFromCloudinary(uploadedAsset.cloudinaryPublicId);
      }
      return res.status(400).json({ message: finalValidationError });
    }

    const item = new PublicContent({
      ...payload,
      cloudinaryPublicId: uploadedAsset?.cloudinaryPublicId || "",
      createdBy: getActorId(req),
      updatedBy: getActorId(req)
    });

    await item.save();

    res.status(201).json({
      message: "Homepage content added successfully.",
      item
    });
  } catch (error) {
    console.error("Add public content error:", error);
    res.status(500).json({
      message: error.message?.includes("Cloudinary")
        ? error.message
        : "Error adding homepage content."
    });
  }
});

router.put("/:id", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const item = await PublicContent.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Homepage content item not found." });
    }

    const previousImageUrl = item.imageUrl;
    const previousCloudinaryPublicId = item.cloudinaryPublicId;
    const payload = buildPayload(req, item);
    const validationError = validatePayload(payload, { hasUploadedFile: Boolean(req.file) });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const uploadedAsset = await uploadImageIfProvided(req, payload.section);

    if (uploadedAsset) {
      payload.imageUrl = uploadedAsset.imageUrl;
      item.cloudinaryPublicId = uploadedAsset.cloudinaryPublicId;
    } else if (String(req.body.imageUrl || "").trim() && item.cloudinaryPublicId) {
      item.cloudinaryPublicId = "";
    }

    const finalValidationError = validatePayload(payload);
    if (finalValidationError) {
      if (uploadedAsset?.cloudinaryPublicId) {
        await deleteFromCloudinary(uploadedAsset.cloudinaryPublicId);
      }
      return res.status(400).json({ message: finalValidationError });
    }

    Object.assign(item, payload, { updatedBy: getActorId(req) });
    await item.save();

    if (req.file && previousCloudinaryPublicId && previousCloudinaryPublicId !== item.cloudinaryPublicId) {
      await deleteFromCloudinary(previousCloudinaryPublicId);
    }

    if (
      (req.file || String(req.body.imageUrl || "").trim() || item.cloudinaryPublicId !== previousCloudinaryPublicId) &&
      previousImageUrl &&
      previousImageUrl !== item.imageUrl
    ) {
      await removeLocalFile(previousImageUrl);
    }

    if (!req.file && String(req.body.imageUrl || "").trim() && previousCloudinaryPublicId) {
      await deleteFromCloudinary(previousCloudinaryPublicId);
    }

    res.json({
      message: "Homepage content updated successfully.",
      item
    });
  } catch (error) {
    console.error("Update public content error:", error);
    res.status(500).json({
      message: error.message?.includes("Cloudinary")
        ? error.message
        : "Error updating homepage content."
    });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const item = await PublicContent.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Homepage content item not found." });
    }

    await removePreviousImageAsset(item);
    await PublicContent.findByIdAndDelete(item._id);

    res.json({ message: "Homepage content deleted successfully." });
  } catch (error) {
    console.error("Delete public content error:", error);
    res.status(500).json({ message: "Error deleting homepage content." });
  }
});

module.exports = router;
