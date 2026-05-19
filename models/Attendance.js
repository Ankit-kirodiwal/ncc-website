const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  regNo: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: String, // "2026-04-04"
    required: true
  },
  status: {
    type: String,
    enum: ["present", "absent", "leave"],
    required: true
  },
  remarks: {
    type: String,
    default: ""
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  markedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index for efficient queries
attendanceSchema.index({ regNo: 1, date: 1 });
attendanceSchema.index({ studentId: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);