const express = require("express");
const Attendance = require("../models/Attendance");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const {
  generateAttendanceExcel,
  convertExcelToBuffer
} = require("../excelReportService");

const router = express.Router();
const VALID_STATUSES = new Set(["present", "absent", "leave"]);

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

function normalizeStatus(status) {
  const map = {
    p: "present",
    present: "present",
    a: "absent",
    absent: "absent",
    l: "leave",
    leave: "leave"
  };

  return map[String(status || "").trim().toLowerCase()] || null;
}

function buildStudentQuery(year, options = {}) {
  const query = { role: "student" };
  const allowPassout = options.allowPassout !== false;

  if (!year || year === "all") {
    query.status = allowPassout
      ? { $in: ["approved", "passout"] }
      : "approved";
    return {
      query,
      yearLabel: "All Years"
    };
  }

  if (year === "passout") {
    query.isPassout = true;
    query.status = "passout";
    return {
      query,
      yearLabel: "Passed Out"
    };
  }

  const numericYear = Number(year);
  if (!Number.isInteger(numericYear) || numericYear < 1 || numericYear > 3) {
    return null;
  }

  query.year = numericYear;
  query.isPassout = false;
  query.status = "approved";

  return {
    query,
    yearLabel: `Year ${numericYear}`
  };
}

function buildDateFilter(startDate, endDate) {
  if (!startDate && !endDate) {
    return undefined;
  }

  const filter = {};
  if (startDate) {
    filter.$gte = startDate;
  }
  if (endDate) {
    filter.$lte = endDate;
  }

  return filter;
}

function summarizeRecords(records) {
  const totalDays = records.length;
  const present = records.filter((record) => record.status === "present").length;
  const absent = records.filter((record) => record.status === "absent").length;
  const leave = records.filter((record) => record.status === "leave").length;
  const percentage = totalDays === 0 ? 0 : Math.round((present / totalDays) * 100);

  return {
    totalDays,
    present,
    absent,
    leave,
    percentage
  };
}

async function updateStudentAttendancePercentage(regNo) {
  const records = await Attendance.find({ regNo }).lean();
  const summary = summarizeRecords(records);

  await User.findOneAndUpdate(
    { regimentalNo: regNo },
    { attendance: summary.percentage }
  );
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

router.post("/mark", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const { regNo, date, status, remarks } = req.body;
    const normalizedStatus = normalizeStatus(status);

    if (!regNo || !date || !normalizedStatus) {
      return res.status(400).json({ message: "regNo, date and valid status are required." });
    }

    const student = await User.findOne({ regimentalNo: regNo, role: "student" });
    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    const attendance = await Attendance.findOneAndUpdate(
      { regNo, date },
      {
        $set: {
          studentId: student._id,
          regNo,
          date,
          status: normalizedStatus,
          remarks: remarks || "",
          markedBy: getActorId(req),
          markedAt: new Date()
        }
      },
      {
        returnDocument: "after",
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    await updateStudentAttendancePercentage(regNo);

    res.json({
      message: "Attendance marked successfully.",
      attendance
    });
  } catch (error) {
    console.error("Mark attendance error:", error);
    res.status(500).json({ message: "Server error while marking attendance." });
  }
});

router.post("/mark-bulk", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const { date, attendanceData = [] } = req.body;

    if (!date || !Array.isArray(attendanceData) || attendanceData.length === 0) {
      return res.status(400).json({ message: "date and attendanceData are required." });
    }

    let successCount = 0;
    let failureCount = 0;
    const touchedRegNos = new Set();

    for (const record of attendanceData) {
      const normalizedStatus = normalizeStatus(record.status);
      if (!record.regNo || !normalizedStatus) {
        failureCount += 1;
        continue;
      }

      const student = await User.findOne({
        regimentalNo: record.regNo,
        role: "student"
      });

      if (!student) {
        failureCount += 1;
        continue;
      }

      await Attendance.findOneAndUpdate(
        { regNo: record.regNo, date },
        {
          $set: {
            studentId: student._id,
            regNo: record.regNo,
            date,
            status: normalizedStatus,
            remarks: record.remarks || "",
            markedBy: getActorId(req),
            markedAt: new Date()
          }
      },
      {
        returnDocument: "after",
        upsert: true,
        setDefaultsOnInsert: true
      }
      );

      touchedRegNos.add(record.regNo);
      successCount += 1;
    }

    for (const regNo of touchedRegNos) {
      await updateStudentAttendancePercentage(regNo);
    }

    res.json({
      message: `Attendance saved. ${successCount} successful, ${failureCount} failed.`,
      successCount,
      failureCount,
      totalProcessed: successCount + failureCount
    });
  } catch (error) {
    console.error("Bulk attendance error:", error);
    res.status(500).json({ message: "Server error while saving bulk attendance." });
  }
});

router.get("/student/:regNo", authMiddleware, async (req, res) => {
  try {
    const records = await Attendance.find({ regNo: req.params.regNo })
      .sort({ date: -1 })
      .lean();

    res.json({
      regNo: req.params.regNo,
      ...summarizeRecords(records),
      records
    });
  } catch (error) {
    console.error("Student attendance lookup error:", error);
    res.status(500).json({ message: "Error fetching student attendance." });
  }
});

router.get("/class", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const { year, date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date is required." });
    }

    const scope = buildStudentQuery(year, { allowPassout: true });
    if (!scope) {
      return res.status(400).json({ message: "Invalid year filter." });
    }

    const students = await User.find(scope.query)
      .select("regimentalNo name year status isPassout")
      .sort({ isPassout: 1, year: 1, regimentalNo: 1 });

    const normalizedStudents = [];
    for (const student of students) {
      const normalized = await normalizeStudentState(student);

      if (year === "passout" && !normalized.isPassout) {
        continue;
      }

      if (year && year !== "passout" && String(normalized.year) !== String(year)) {
        continue;
      }

      if (!year && normalized.status !== "approved" && !normalized.isPassout) {
        continue;
      }

      normalizedStudents.push(normalized);
    }

    const attendanceRecords = await Attendance.find({ date }).lean();
    const attendanceMap = new Map(
      attendanceRecords.map((record) => [record.regNo, record])
    );

    const attendanceData = normalizedStudents.map((student) => {
      const record = attendanceMap.get(student.regimentalNo);
      return {
        id: student._id,
        regNo: student.regimentalNo,
        name: student.name,
        year: student.isPassout ? "Passout" : student.year,
        isPassout: Boolean(student.isPassout),
        status: record?.status || "not-marked",
        remarks: record?.remarks || ""
      };
    });

    res.json({
      date,
      year: year || "all",
      yearLabel: scope.yearLabel,
      totalStudents: attendanceData.length,
      attendanceData
    });
  } catch (error) {
    console.error("Class attendance error:", error);
    res.status(500).json({ message: "Error fetching class attendance." });
  }
});

router.get("/my-attendance", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(getActorId(req)).select(
      "regimentalNo name year enrollmentYear isPassout"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const records = await Attendance.find({ regNo: user.regimentalNo })
      .sort({ date: -1 })
      .lean();

    res.json({
      student: {
        regNo: user.regimentalNo,
        name: user.name,
        year: user.isPassout ? "Passout" : user.year,
        enrollmentYear: user.enrollmentYear
      },
      summary: summarizeRecords(records),
      records: records.slice(0, 30)
    });
  } catch (error) {
    console.error("My attendance error:", error);
    res.status(500).json({ message: "Error fetching your attendance." });
  }
});

router.get("/history/:studentId", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const student = await User.findById(req.params.studentId).select(
      "regimentalNo name year enrollmentYear isPassout"
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    const records = await Attendance.find({ regNo: student.regimentalNo })
      .sort({ date: -1 })
      .lean();

    res.json({
      student: {
        id: student._id,
        regNo: student.regimentalNo,
        name: student.name,
        year: student.isPassout ? "Passout" : student.year,
        enrollmentYear: student.enrollmentYear
      },
      summary: summarizeRecords(records),
      records: records.slice(0, 30)
    });
  } catch (error) {
    console.error("Attendance history error:", error);
    res.status(500).json({ message: "Error fetching attendance history." });
  }
});

router.post("/history-bulk", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const { year, startDate, endDate } = req.body;
    const scope = buildStudentQuery(String(year || ""), { allowPassout: true });

    if (!scope) {
      return res.status(400).json({ message: "Valid year filter is required." });
    }

    const students = await User.find(scope.query)
      .select("regimentalNo name year isPassout")
      .sort({ regimentalNo: 1 })
      .lean();

    if (students.length === 0) {
      return res.status(404).json({ message: "No students found for the selected filter." });
    }

    const attendanceQuery = {
      regNo: { $in: students.map((student) => student.regimentalNo) }
    };

    const dateFilter = buildDateFilter(startDate, endDate);
    if (dateFilter) {
      attendanceQuery.date = dateFilter;
    }

    const records = await Attendance.find(attendanceQuery)
      .sort({ date: -1 })
      .lean();

    const studentStats = students.map((student) => {
      const recentRecords = records.filter(
        (record) => record.regNo === student.regimentalNo
      );

      return {
        regNo: student.regimentalNo,
        name: student.name,
        year: student.isPassout ? "Passout" : student.year,
        summary: summarizeRecords(recentRecords),
        recentRecords
      };
    });

    studentStats.sort(
      (left, right) => left.summary.percentage - right.summary.percentage
    );

    res.json({
      year: year || "all",
      yearLabel: scope.yearLabel,
      dateRange:
        startDate || endDate
          ? {
              startDate: startDate || null,
              endDate: endDate || null
            }
          : "All dates",
      totalStudents: students.length,
      studentsWithLowAttendance: studentStats.filter(
        (student) => student.summary.percentage < 75
      ).length,
      studentStats
    });
  } catch (error) {
    console.error("Bulk history error:", error);
    res.status(500).json({ message: "Error fetching bulk attendance history." });
  }
});

router.post("/download-report-excel", authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const { year, startDate, endDate } = req.body;
    const scope = buildStudentQuery(String(year || ""), { allowPassout: true });

    if (!scope) {
      return res.status(400).json({ message: "Valid year filter is required." });
    }

    const students = await User.find(scope.query)
      .select("regimentalNo name year isPassout")
      .sort({ regimentalNo: 1 })
      .lean();

    if (students.length === 0) {
      return res.status(404).json({ message: "No students found for the selected filter." });
    }

    const attendanceQuery = {
      regNo: { $in: students.map((student) => student.regimentalNo) }
    };

    const dateFilter = buildDateFilter(startDate, endDate);
    if (dateFilter) {
      attendanceQuery.date = dateFilter;
    }

    const records = await Attendance.find(attendanceQuery)
      .sort({ date: 1 })
      .lean();

    const studentStats = students.map((student) => {
      const recentRecords = records.filter(
        (record) => record.regNo === student.regimentalNo
      );

      return {
        regNo: student.regimentalNo,
        name: student.name,
        year: student.isPassout ? "Passout" : student.year,
        summary: summarizeRecords(recentRecords),
        recentRecords
      };
    });

    const { workbook, filename } = generateAttendanceExcel({
      year,
      yearLabel: scope.yearLabel,
      dateRange:
        startDate || endDate
          ? {
              startDate: startDate || null,
              endDate: endDate || null
            }
          : "All dates",
      studentStats
    });

    const buffer = convertExcelToBuffer(workbook);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error("Excel export error:", error);
    res.status(500).json({ message: "Error generating Excel report." });
  }
});

router.get("/my-history", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(getActorId(req)).select(
      "regimentalNo name year enrollmentYear isPassout"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const records = await Attendance.find({ regNo: user.regimentalNo })
      .sort({ date: -1 })
      .lean();

    res.json({
      student: {
        regNo: user.regimentalNo,
        name: user.name,
        year: user.isPassout ? "Passout" : user.year,
        enrollmentYear: user.enrollmentYear
      },
      summary: summarizeRecords(records),
      records: records.slice(0, 30)
    });
  } catch (error) {
    console.error("My history error:", error);
    res.status(500).json({ message: "Error fetching attendance history." });
  }
});

module.exports = router;
