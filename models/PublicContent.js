const mongoose = require("mongoose");

const factSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true
    },
    value: {
      type: String,
      required: true,
      trim: true
    }
  },
  { _id: false }
);

const publicContentSchema = new mongoose.Schema(
  {
    section: {
      type: String,
      enum: ["achievements", "national-camps", "gallery"],
      required: true,
      index: true
    },
    title: {
      type: String,
      trim: true,
      default: ""
    },
    subtitle: {
      type: String,
      trim: true,
      default: ""
    },
    description: {
      type: String,
      trim: true,
      default: ""
    },
    imageUrl: {
      type: String,
      trim: true,
      default: ""
    },
    cloudinaryPublicId: {
      type: String,
      trim: true,
      default: ""
    },
    altText: {
      type: String,
      trim: true,
      default: ""
    },
    highlightText: {
      type: String,
      trim: true,
      default: ""
    },
    facts: {
      type: [factSchema],
      default: []
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PublicContent", publicContentSchema);
