const express = require("express");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

function getActorId(req) {
  return req.user?.userId || req.user?.id || req.user?._id || null;
}

function ensureAdmin(req, res) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ message: "Access denied. Admin only." });
    return false;
  }

  return true;
}

function toSafeString(val, maxLen = 255) {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLen);
}

function buildStudentFilter({ year, status }) {
  const query = { role: "student" };
  const safeYear = toSafeString(year, 20);
  const safeStatus = toSafeString(status, 20);

  if (safeYear === "passout") {
    query.isPassout = true;
    if (!safeStatus || safeStatus === "all") {
      query.status = "passout";
    }
  } else if (safeYear) {
    const numericYear = Number(safeYear);
    if (Number.isInteger(numericYear) && numericYear >= 1 && numericYear <= 3) {
      query.year = numericYear;
      query.isPassout = false;
    }
  }

  if (safeStatus && safeStatus !== "all") {
    query.status = safeStatus;
  }

  return query;
}

async function deleteStudentCascade(student) {
  await Attendance.deleteMany({
    $or: [{ studentId: student._id }, { regNo: student.regimentalNo }]
  });
  await User.findByIdAndDelete(student._id);
}

async function normalizeStudentState(student) {
  if (!student || student.role !== "student") {
    return student;
  }

  const before = {
    year: student.year,
    status: student.status,
    isPassout: student.isPassout
  };

  student.refreshAcademicYear();

  if (
    before.year !== student.year ||
    before.status !== student.status ||
    before.isPassout !== student.isPassout
  ) {
    await student.save();
  }

  return student;
}

router.get("/pending-students", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const students = await User.find({
      role: "student",
      status: "pending"
    })
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(students);
  } catch (error) {
    console.error("Pending students error:", error);
    res.status(500).json({ message: "Server error while fetching pending students." });
  }
});

router.put("/approve/:id", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const student = await User.findById(req.params.id);
    if (!student || student.role !== "student") {
      return res.status(404).json({ message: "Student not found." });
    }

    student.status = "approved";
    if (student.isPassout) {
      student.isPassout = false;
      student.graduationDate = null;
      student.dataExpiryDate = null;
      student.graduationNotes = "";
    }
    student.refreshAcademicYear();
    await student.save();

    res.json({
      message: "Student approved successfully.",
      student: {
        id: student._id,
        regimentalNo: student.regimentalNo,
        name: student.name,
        year: student.year,
        status: student.status
      }
    });
  } catch (error) {
    console.error("Approve student error:", error);
    res.status(500).json({ message: "Server error while approving student." });
  }
});

router.get("/students", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const query = buildStudentFilter(req.query);
    const students = await User.find(query)
      .select("-password")
      .sort({ isPassout: 1, year: 1, createdAt: -1 });

    const normalizedStudents = [];
    for (const student of students) {
      const normalized = await normalizeStudentState(student);

      if (query.status && normalized.status !== query.status) {
        continue;
      }

      if (query.isPassout === true && !normalized.isPassout) {
        continue;
      }

      if (query.isPassout === false && normalized.isPassout) {
        continue;
      }

      normalizedStudents.push(normalized);
    }

    res.json(normalizedStudents);
  } catch (error) {
    console.error("Fetch students error:", error);
    res.status(500).json({ message: "Server error while fetching students." });
  }
});

router.post("/students", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const regimentalNo = toSafeString(req.body.regimentalNo, 50).toUpperCase();
    const name = toSafeString(req.body.name, 100);
    const fatherName = toSafeString(req.body.fatherName, 100);
    const dob = toSafeString(req.body.dob, 30);
    const email = toSafeString(req.body.email, 150).toLowerCase();
    const password = req.body.password;

    if (!regimentalNo || !name || !fatherName || !dob || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (typeof password !== "string" || password.length < 6 || password.length > 72) {
      return res.status(400).json({ message: "Password must be between 6 and 72 characters." });
    }

    const existingUser = await User.findOne({
      $or: [{ regimentalNo }, { email }]
    });

    if (existingUser) {
      return res.status(400).json({
        message: "A user already exists with this regimental number or email."
      });
    }

    const student = new User({
      regimentalNo,
      name,
      fatherName,
      dob,
      email,
      password,
      role: "student",
      status: "approved"
    });

    student.refreshAcademicYear();
    await student.save();

    res.status(201).json({
      message: "Student added successfully.",
      student: {
        id: student._id,
        regimentalNo: student.regimentalNo,
        name: student.name,
        year: student.isPassout ? "Passout" : student.year,
        enrollmentYear: student.enrollmentYear,
        status: student.status,
        isPassout: student.isPassout
      }
    });
  } catch (error) {
    console.error("Add student error:", error);
    res.status(500).json({ message: "Server error while adding student." });
  }
});

router.put("/students/:id", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const student = await User.findById(req.params.id);
    if (!student || student.role !== "student") {
      return res.status(404).json({ message: "Student not found." });
    }

    const regimentalNo = toSafeString(req.body.regimentalNo, 50).toUpperCase();
    const name = toSafeString(req.body.name, 100);
    const fatherName = toSafeString(req.body.fatherName, 100);
    const dob = toSafeString(req.body.dob, 30);
    const email = toSafeString(req.body.email, 150).toLowerCase();
    const status = toSafeString(req.body.status, 20);

    if (email && email !== student.email) {
      const emailOwner = await User.findOne({
        email,
        _id: { $ne: student._id }
      });

      if (emailOwner) {
        return res.status(400).json({ message: "Email already in use." });
      }
    }

    if (regimentalNo && regimentalNo !== student.regimentalNo) {
      const regOwner = await User.findOne({
        regimentalNo,
        _id: { $ne: student._id }
      });

      if (regOwner) {
        return res.status(400).json({ message: "Regimental number already in use." });
      }
    }

    if (regimentalNo) {
      student.regimentalNo = regimentalNo;
    }
    if (name) {
      student.name = name;
    }
    if (fatherName) {
      student.fatherName = fatherName;
    }
    if (dob) {
      student.dob = dob;
    }
    if (email) {
      student.email = email;
    }
    if (status) {
      student.status = status;
    }

    if (!student.isPassout) {
      student.refreshAcademicYear();
    }

    await student.save();

    res.json({
      message: "Student updated successfully.",
      student: {
        id: student._id,
        regimentalNo: student.regimentalNo,
        name: student.name,
        email: student.email,
        year: student.isPassout ? "Passout" : student.year,
        status: student.status
      }
    });
  } catch (error) {
    console.error("Update student error:", error);
    res.status(500).json({ message: "Server error while updating student." });
  }
});

router.delete("/student/:id", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const student = await User.findById(req.params.id);
    if (!student || student.role !== "student") {
      return res.status(404).json({ message: "Student not found." });
    }

    await deleteStudentCascade(student);

    res.json({
      message: "Student deleted successfully along with attendance records."
    });
  } catch (error) {
    console.error("Delete student error:", error);
    res.status(500).json({ message: "Server error while deleting student." });
  }
});

router.put("/attendance/:id", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const attendance = Number(req.body.attendance);
    if (!Number.isFinite(attendance) || attendance < 0 || attendance > 100) {
      return res.status(400).json({ message: "Attendance must be between 0 and 100." });
    }

    const student = await User.findById(req.params.id);
    if (!student || student.role !== "student") {
      return res.status(404).json({ message: "Student not found." });
    }

    student.attendance = attendance;
    await student.save();

    res.json({
      message: "Attendance updated successfully.",
      student: {
        id: student._id,
        regimentalNo: student.regimentalNo,
        name: student.name,
        attendance: student.attendance
      }
    });
  } catch (error) {
    console.error("Update attendance error:", error);
    res.status(500).json({ message: "Server error while updating attendance." });
  }
});

router.put("/promote/:id", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const student = await User.findById(req.params.id);
    if (!student || student.role !== "student") {
      return res.status(404).json({ message: "Student not found." });
    }

    const remarks = req.body.remarks || "";
    const result =
      student.year >= 3 || student.isPassout
        ? student.passoutStudent(getActorId(req), remarks)
        : student.promoteStudent(getActorId(req), remarks);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    await student.save();

    res.json({
      message: result.message,
      student: {
        id: student._id,
        regimentalNo: student.regimentalNo,
        name: student.name,
        year: student.isPassout ? "Passout" : student.year,
        status: student.status,
        isPassout: student.isPassout,
        graduationDate: student.graduationDate
      }
    });
  } catch (error) {
    console.error("Promote student error:", error);
    res.status(500).json({ message: "Server error while promoting student." });
  }
});

router.post("/bulk-promote", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const year = Number(req.body.year);
    const remarks = req.body.remarks || "";

    if (!Number.isInteger(year) || year < 1 || year > 3) {
      return res.status(400).json({ message: "Year must be 1, 2 or 3." });
    }

    const students = await User.find({
      role: "student",
      year,
      status: "approved",
      isPassout: false
    }).sort({ regimentalNo: 1 });

    if (students.length === 0) {
      return res.status(404).json({ message: `No approved Year ${year} students found.` });
    }

    let promoted = 0;
    let passout = 0;
    let failed = 0;
    const processedStudents = [];

    for (const student of students) {
      try {
        const result =
          year === 3
            ? student.passoutStudent(getActorId(req), remarks)
            : student.promoteStudent(getActorId(req), remarks);

        if (!result.success) {
          failed += 1;
          continue;
        }

        await student.save();

        if (year === 3) {
          passout += 1;
          processedStudents.push({
            regNo: student.regimentalNo,
            name: student.name,
            action: "PASSOUT"
          });
        } else {
          promoted += 1;
          processedStudents.push({
            regNo: student.regimentalNo,
            name: student.name,
            fromYear: year,
            toYear: year + 1
          });
        }
      } catch (error) {
        console.error(`Bulk promotion failed for ${student.regimentalNo}:`, error);
        failed += 1;
      }
    }

    res.json({
      message: "Bulk processing complete.",
      promoted,
      passout,
      failed,
      total: students.length,
      fromYear: year,
      toYear: year === 3 ? "PASSOUT" : year + 1,
      processedStudents
    });
  } catch (error) {
    console.error("Bulk promotion error:", error);
    res.status(500).json({ message: "Server error while processing bulk promotion." });
  }
});

router.get("/promotion-history/:id", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const student = await User.findById(req.params.id).select(
      "regimentalNo name year isPassout promotionHistory"
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    res.json({
      student: {
        regimentalNo: student.regimentalNo,
        name: student.name,
        currentYear: student.isPassout ? "Passout" : student.year
      },
      promotionHistory: [...student.promotionHistory].sort(
        (left, right) => new Date(right.promotionDate) - new Date(left.promotionDate)
      )
    });
  } catch (error) {
    console.error("Promotion history error:", error);
    res.status(500).json({ message: "Server error while fetching promotion history." });
  }
});

router.get("/passout-for-deletion", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const passoutStudents = await User.find({
      role: "student",
      isPassout: true
    })
      .select("regimentalNo name enrollmentYear graduationDate dataExpiryDate")
      .sort({ enrollmentYear: 1, regimentalNo: 1 })
      .lean();

    const groupedByEnrollmentYear = passoutStudents.reduce((groups, student) => {
      const key = student.enrollmentYear || "Unknown";
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(student);
      return groups;
    }, {});

    res.json({
      totalExpired: passoutStudents.length,
      expiredStudents: passoutStudents,
      groupedByEnrollmentYear
    });
  } catch (error) {
    console.error("Passout-for-deletion error:", error);
    res.status(500).json({ message: "Server error while fetching passout students." });
  }
});

router.delete("/passout/:id", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const student = await User.findById(req.params.id);
    if (!student || student.role !== "student") {
      return res.status(404).json({ message: "Student not found." });
    }

    if (!student.isPassout) {
      return res.status(400).json({ message: "Student is not marked as passout." });
    }

    await deleteStudentCascade(student);

    res.json({
      message: "Passout student deleted successfully.",
      regNo: student.regimentalNo,
      name: student.name
    });
  } catch (error) {
    console.error("Delete passout error:", error);
    res.status(500).json({ message: "Server error while deleting passout student." });
  }
});

router.delete("/passout-all", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const students = await User.find({
      role: "student",
      isPassout: true
    }).sort({ enrollmentYear: 1, regimentalNo: 1 });

    if (students.length === 0) {
      return res.status(404).json({
        message: "No passout students found."
      });
    }

    let deletedCount = 0;
    let errorCount = 0;
    const deletedStudents = [];

    for (const student of students) {
      try {
        await deleteStudentCascade(student);
        deletedCount += 1;
        deletedStudents.push({
          regNo: student.regimentalNo,
          name: student.name,
          enrollmentYear: student.enrollmentYear
        });
      } catch (error) {
        console.error(`Delete failed for ${student.regimentalNo}:`, error);
        errorCount += 1;
      }
    }

    res.json({
      message: "All passout students deleted successfully.",
      deletedCount,
      errorCount,
      totalAttempted: students.length,
      deletedStudents
    });
  } catch (error) {
    console.error("Delete all passout error:", error);
    res.status(500).json({ message: "Server error while deleting all passout students." });
  }
});

router.delete("/passout-year/:enrollmentYear", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const enrollmentYear = Number(req.params.enrollmentYear);
    if (!Number.isInteger(enrollmentYear)) {
      return res.status(400).json({ message: "Invalid enrollment year." });
    }

    const students = await User.find({
      role: "student",
      isPassout: true,
      enrollmentYear
    }).sort({ regimentalNo: 1 });

    if (students.length === 0) {
      return res.status(404).json({
        message: "No passout students found for this enrollment year."
      });
    }

    let deletedCount = 0;
    let errorCount = 0;
    const deletedStudents = [];

    for (const student of students) {
      try {
        await deleteStudentCascade(student);
        deletedCount += 1;
        deletedStudents.push({
          regNo: student.regimentalNo,
          name: student.name,
          enrollmentYear: student.enrollmentYear
        });
      } catch (error) {
        console.error(`Delete failed for ${student.regimentalNo}:`, error);
        errorCount += 1;
      }
    }

    res.json({
      message: "Deletion complete.",
      enrollmentYear,
      deletedCount,
      errorCount,
      totalAttempted: students.length,
      deletedStudents
    });
  } catch (error) {
    console.error("Delete passout year error:", error);
    res.status(500).json({ message: "Server error while deleting passout students." });
  }
});

module.exports = router;
