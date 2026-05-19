const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const Note = require("../models/Note");
const authMiddleware = require("../middleware/authMiddleware");
const {
  uploadBufferToCloudinary,
  deleteFromCloudinary
} = require("../services/cloudinaryService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});
const localNotesDir = path.join(__dirname, "..", "public", "uploads", "notes");
fs.mkdirSync(localNotesDir, { recursive: true });

function getCloudinaryResourceType(extension) {
  const normalized = String(extension || "").toLowerCase();
  if (normalized === ".pdf") {
    return "local-pdf";
  }

  const documentExtensions = new Set([
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".txt",
    ".csv"
  ]);

  return documentExtensions.has(normalized) ? "raw" : "auto";
}

async function saveLocalNoteFile(buffer, fileName) {
  const extension = path.extname(fileName || "").toLowerCase();
  const safeBaseName = path
    .basename(fileName || "note-file", extension)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "note-file";

  const finalFileName = `${Date.now()}-${safeBaseName}${extension}`;
  const absoluteFilePath = path.join(localNotesDir, finalFileName);

  await fs.promises.writeFile(absoluteFilePath, buffer);

  return {
    fileLink: `/uploads/notes/${finalFileName}`,
    fileName: fileName || finalFileName
  };
}

async function deleteLocalNoteFile(fileLink) {
  if (!fileLink || !fileLink.startsWith("/uploads/notes/")) {
    return;
  }

  const absoluteFilePath = path.join(__dirname, "..", "public", fileLink.replace(/^\//, ""));

  try {
    await fs.promises.unlink(absoluteFilePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Delete local note file error:", error);
    }
  }
}

// Get all notes
router.get("/", authMiddleware, async (req, res) => {
  try {
    const notes = await Note.find().sort({ createdAt: -1 });
    res.status(200).json(notes);
  } catch (error) {
    console.error("Fetch Notes Error:", error);
    res.status(500).json({ message: "Error fetching notes" });
  }
});

// Add note
router.post("/", authMiddleware, upload.single("noteFile"), async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { title, description } = req.body;
    const normalizedTitle = String(title || "").trim();
    const normalizedDescription = String(description || "").trim();

    if (!normalizedTitle || !req.file) {
      return res.status(400).json({ message: "Title and note file are required" });
    }

    const originalName = req.file.originalname || "note-file";
    const extension = path.extname(originalName).toLowerCase();
    const safeBaseName = path
      .basename(originalName, extension)
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "note-file";

    const resourceType = getCloudinaryResourceType(extension);
    let fileLink = "";
    let cloudinaryPublicId = "";
    let storageType = "cloudinary";

    if (resourceType === "local-pdf") {
      const localFile = await saveLocalNoteFile(req.file.buffer, originalName);
      fileLink = localFile.fileLink;
      storageType = "local";
    } else {
      const uploadResult = await uploadBufferToCloudinary(req.file.buffer, {
        folder: "ncc-notes",
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
        filename_override: originalName,
        public_id: `note-${Date.now()}-${safeBaseName}${extension}`
      });

      fileLink = uploadResult.secure_url;
      cloudinaryPublicId = uploadResult.public_id;
    }

    const newNote = new Note({
      title: normalizedTitle,
      description: normalizedDescription,
      fileLink,
      cloudinaryPublicId,
      fileName: originalName,
      storageType,
      uploadedBy: req.user.name || "Admin",
    });

    await newNote.save();

    res.status(201).json({
      message: "Note added successfully",
      note: newNote,
    });
  } catch (error) {
    console.error("Add Note Error:", error);
    res.status(500).json({ message: "Error adding note" });
  }
});
// DELETE note
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can delete notes" });
    }

    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    if (note.storageType === "local") {
      await deleteLocalNoteFile(note.fileLink);
    } else {
      await deleteFromCloudinary(note.cloudinaryPublicId);
    }
    await Note.findByIdAndDelete(req.params.id);

    res.json({ message: "Note deleted successfully" });
  } catch (error) {
    console.error("Delete Note Error:", error);
    res.status(500).json({ message: "Error deleting note" });
  }
});
module.exports = router;
