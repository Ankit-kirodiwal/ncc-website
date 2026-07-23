const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

function extractEnrollmentYear(regimentalNo) {
  if (!regimentalNo || typeof regimentalNo !== "string") {
    return null;
  }

  // Cap regimentalNo length at 30 characters to prevent ReDoS CPU exhaustion
  const normalized = regimentalNo.trim().toUpperCase().slice(0, 30);

  const fourDigitMatch = normalized.match(/[A-Z]+(\d{4})(?=[A-Z])/);
  if (fourDigitMatch) {
    return Number(fourDigitMatch[1]);
  }

  const twoDigitMatch = normalized.match(/[A-Z]+(\d{2})(?=[A-Z])/);
  if (!twoDigitMatch) {
    return null;
  }

  const shortYear = Number(twoDigitMatch[1]);
  return shortYear >= 50 ? 1900 + shortYear : 2000 + shortYear;
}

function getAcademicYear(referenceDate = new Date()) {
  return referenceDate.getMonth() >= 3
    ? referenceDate.getFullYear()
    : referenceDate.getFullYear() - 1;
}

function calculateYearFromEnrollment(enrollmentYear, referenceDate = new Date()) {
  if (!Number.isInteger(enrollmentYear)) {
    return 1;
  }

  const academicYear = getAcademicYear(referenceDate);
  const calculatedYear = academicYear - enrollmentYear + 1;

  if (calculatedYear < 1) {
    return 1;
  }

  if (calculatedYear > 3) {
    return 3;
  }

  return calculatedYear;
}

function shouldAutoPassout(enrollmentYear, referenceDate = new Date()) {
  if (!Number.isInteger(enrollmentYear)) {
    return false;
  }

  const academicYear = getAcademicYear(referenceDate);
  return academicYear - enrollmentYear + 1 > 3;
}

const promotionHistorySchema = new mongoose.Schema(
  {
    fromYear: { type: Number, required: true },
    toYear: { type: Number, required: true },
    promotionDate: {
      type: Date,
      default: Date.now
    },
    promotedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    remarks: {
      type: String,
      default: ""
    }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    regimentalNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    fatherName: {
      type: String,
      required: true,
      trim: true
    },
    dob: {
      type: Date,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["admin", "student"],
      default: "student"
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "passout"],
      default: "pending"
    },
    attendance: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    year: {
      type: Number,
      enum: [1, 2, 3],
      default: 1
    },
    enrollmentYear: {
      type: Number,
      default: () => new Date().getFullYear(),
      index: true
    },
    isPassout: {
      type: Boolean,
      default: false,
      index: true
    },
    graduationDate: {
      type: Date,
      default: null
    },
    dataExpiryDate: {
      type: Date,
      default: null,
      index: true
    },
    graduationNotes: {
      type: String,
      default: ""
    },
    promotionHistory: {
      type: [promotionHistorySchema],
      default: []
    },
    manualPromotionAcademicYear: {
      type: Number,
      default: null
    },
    passwordResetOtpHash: {
      type: String,
      default: null
    },
    passwordResetOtpExpiresAt: {
      type: Date,
      default: null
    },
    passwordResetOtpSentAt: {
      type: Date,
      default: null
    },
    tokenVersion: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

userSchema.statics.extractEnrollmentYear = extractEnrollmentYear;
userSchema.statics.getAcademicYear = getAcademicYear;
userSchema.statics.calculateYearFromEnrollment = calculateYearFromEnrollment;
userSchema.statics.shouldAutoPassout = shouldAutoPassout;

userSchema.pre("save", async function preSave() {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  const shouldRefreshDerivedYear =
    this.isNew || this.isModified("regimentalNo") || !this.enrollmentYear;

  if (
    this.role === "student" &&
    this.regimentalNo &&
    shouldRefreshDerivedYear
  ) {
    const parsedEnrollmentYear = extractEnrollmentYear(this.regimentalNo);
    if (parsedEnrollmentYear) {
      this.enrollmentYear = parsedEnrollmentYear;

      if (shouldAutoPassout(parsedEnrollmentYear)) {
        this.year = 3;
        this.isPassout = true;
        this.status = "passout";
        this.manualPromotionAcademicYear = null;
        this.graduationDate = this.graduationDate || new Date();
        this.dataExpiryDate = null;
        this.graduationNotes =
          this.graduationNotes || "Auto-marked as passout from enrollment year";
      } else {
        const calculatedYear = calculateYearFromEnrollment(parsedEnrollmentYear);
        const currentAcademicYear = getAcademicYear();

        if (
          this.manualPromotionAcademicYear === currentAcademicYear &&
          Number.isInteger(this.year) &&
          this.year >= calculatedYear
        ) {
          this.year = this.year;
        } else {
          this.year = calculatedYear;
        }
      }
    }
  }

  if (this.isPassout) {
    this.status = "passout";
    this.year = 3;
  }
});

userSchema.methods.comparePassword = function comparePassword(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.refreshAcademicYear = function refreshAcademicYear(referenceDate = new Date()) {
  if (this.role !== "student") {
    return this.year;
  }

  const parsedEnrollmentYear =
    extractEnrollmentYear(this.regimentalNo) || this.enrollmentYear;

  if (parsedEnrollmentYear) {
    this.enrollmentYear = parsedEnrollmentYear;

    if (shouldAutoPassout(parsedEnrollmentYear, referenceDate)) {
      this.year = 3;
      this.isPassout = true;
      this.status = "passout";
      this.manualPromotionAcademicYear = null;
      this.graduationDate = this.graduationDate || new Date();
      this.dataExpiryDate = null;
      this.graduationNotes =
        this.graduationNotes || "Auto-marked as passout from enrollment year";
    } else if (!this.isPassout) {
      const calculatedYear = calculateYearFromEnrollment(parsedEnrollmentYear, referenceDate);
      const currentAcademicYear = getAcademicYear(referenceDate);

      if (
        this.manualPromotionAcademicYear === currentAcademicYear &&
        Number.isInteger(this.year) &&
        this.year >= calculatedYear
      ) {
        this.year = this.year;
      } else {
        this.year = calculatedYear;
      }
    }
  }

  return this.year;
};

userSchema.methods.promoteStudent = function promoteStudent(promotedById, remarks = "") {
  if (this.role !== "student") {
    return {
      success: false,
      message: "Only student records can be promoted."
    };
  }

  if (this.isPassout) {
    return {
      success: false,
      message: "Passout students cannot be promoted."
    };
  }

  if (this.year >= 3) {
    return {
      success: false,
      message: "Year 3 students must be marked as passout."
    };
  }

  const fromYear = this.year;
  const toYear = this.year + 1;

  this.year = toYear;
  this.status = "approved";
  this.manualPromotionAcademicYear = getAcademicYear();
  this.promotionHistory.push({
    fromYear,
    toYear,
    promotedBy: promotedById || null,
    remarks: remarks || "Promoted to next academic year"
  });

  return {
    success: true,
    message: `Promoted from Year ${fromYear} to Year ${toYear}.`,
    fromYear,
    toYear
  };
};

userSchema.methods.passoutStudent = function passoutStudent(promotedById, remarks = "") {
  if (this.role !== "student") {
    return {
      success: false,
      message: "Only student records can be marked as passout."
    };
  }

  if (this.isPassout) {
    return {
      success: false,
      message: "Student is already marked as passout."
    };
  }

  const graduationDate = new Date();

  this.year = 3;
  this.isPassout = true;
  this.status = "passout";
  this.manualPromotionAcademicYear = null;
  this.graduationDate = graduationDate;
  this.dataExpiryDate = null;
  this.graduationNotes = remarks || "Successfully completed NCC course";
  this.promotionHistory.push({
    fromYear: 3,
    toYear: 3,
    promotedBy: promotedById || null,
    remarks: `PASSOUT: ${remarks || "Successfully completed NCC course"}`
  });

  return {
    success: true,
    message: "Student marked as passout successfully.",
    graduationDate,
    dataExpiryDate: null
  };
};

module.exports = mongoose.model("User", userSchema);
