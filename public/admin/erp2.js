const API_BASE = "/api";

const state = {
  currentAttendanceData: [],
  studentDirectory: [],
  lastBulkHistory: null
};

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  if (!token || user.role !== "admin") {
    window.location.href = "index.html";
    return;
  }

  document.getElementById("adminName").textContent = user.name || "Admin";
  document.getElementById("attendanceDate").value = new Date().toISOString().split("T")[0];

  document.getElementById("addStudentForm").addEventListener("submit", addStudent);
  document.getElementById("confirmBulkPromote").addEventListener("change", (event) => {
    document.getElementById("bulkPromoteBtn").disabled = !event.target.checked;
  });
  document.getElementById("studentSelect").addEventListener("change", updatePromotionInfo);
  document.getElementById("regimentalNo").addEventListener("input", updateStudentDerivedInfo);

  initializeDashboard();
});

async function initializeDashboard() {
  await Promise.all([
    loadStudentDirectory(),
    loadClassAttendance(),
    loadAllStudents()
  ]);
}

function showTab(tabId, event) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((button) => button.classList.remove("active"));

  document.getElementById(tabId).classList.add("active");
  event?.currentTarget?.classList.add("active");

  if (tabId === "attendance") {
    loadClassAttendance();
  }
  if (tabId === "history") {
    loadStudentsForHistoryDropdown();
  }
  if (tabId === "students") {
    loadAllStudents();
  }
  if (tabId === "promotion") {
    loadStudentsForPromotion();
  }
}

function getToken() {
  return localStorage.getItem("token");
}

async function apiRequest(path, options = {}) {
  const config = {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(options.body instanceof Blob ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    },
    ...options
  };

  const response = await fetch(`${API_BASE}${path}`, config);
  const contentType = response.headers.get("content-type") || "";

  if (options.expectBlob) {
    if (!response.ok) {
      let errorMessage = "Request failed.";
      if (contentType.includes("application/json")) {
        const errorBody = await response.json();
        errorMessage = errorBody.message || errorMessage;
      }
      throw new Error(errorMessage);
    }
    return response;
  }

  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(body.message || "Request failed.");
  }

  return body;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(dateString, includeTime = false) {
  if (!dateString) {
    return "-";
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-GB", includeTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" });
}

function yearLabel(student) {
  if (student.isPassout || student.year === "Passout") {
    return "Passout";
  }

  return `Year ${student.year || 1}`;
}

function statusBadge(status) {
  const safeStatus = String(status || "not-marked").toLowerCase();
  return `<span class="status-chip ${safeStatus}">${escapeHtml(safeStatus)}</span>`;
}

function showMessage(message, type = "info") {
  const box = document.getElementById("messageBox");
  box.textContent = message;
  box.className = `message-box show ${type}`;

  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    box.classList.remove("show");
  }, 3200);
}

async function loadStudentDirectory() {
  try {
    state.studentDirectory = await apiRequest("/admin/students");
    loadStudentsForHistoryDropdown();
    loadStudentsForPromotion();
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to load student directory.", "error");
  }
}

function populateSelect(selectId, students, placeholder) {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }

  select.innerHTML = `<option value="">${placeholder}</option>`;

  students.forEach((student) => {
    const option = document.createElement("option");
    option.value = student._id;
    option.textContent = `${student.regimentalNo} - ${student.name} (${yearLabel(student)})`;
    select.appendChild(option);
  });
}

async function loadClassAttendance() {
  const year = document.getElementById("yearFilter").value;
  const date = document.getElementById("attendanceDate").value;

  if (!date) {
    showMessage("Please select a date.", "warning");
    return;
  }

  try {
    const params = new URLSearchParams({ date });
    if (year) {
      params.set("year", year);
    }

    const data = await apiRequest(`/attendance/class?${params.toString()}`);
    state.currentAttendanceData = data.attendanceData || [];

    renderAttendanceTable(state.currentAttendanceData, !year, year);

    if (year === "passout") {
      await loadPassoutDeleteSection();
    } else {
      document.getElementById("passoutDeleteContainer").innerHTML = "";
    }

    showMessage(`Loaded ${data.totalStudents} students for ${data.yearLabel}.`, "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to load class attendance.", "error");
  }
}

function renderAttendanceTable(students, showYearColumn, selectedYear = "") {
  const tableHead = document.querySelector("#attendanceTable thead tr");
  const tableBody = document.getElementById("attendanceBody");

  const lastColumnLabel = selectedYear === "passout" ? "Action" : "Remarks / Action";

  tableHead.innerHTML = showYearColumn
    ? `<th>Year</th><th>Reg No</th><th>Name</th><th>Status</th><th>${lastColumnLabel}</th>`
    : `<th>Reg No</th><th>Name</th><th>Status</th><th>${lastColumnLabel}</th>`;

  if (!students.length) {
    tableBody.innerHTML = `<tr><td colspan="${showYearColumn ? 5 : 4}" class="text-center">No students found.</td></tr>`;
    return;
  }

  let html = "";
  let previousYear = null;

  students.forEach((student, index) => {
    const isPassoutRow = Boolean(student.isPassout || student.year === "Passout");

    if (showYearColumn && previousYear !== student.year) {
      previousYear = student.year;
      const sectionTitle = `${escapeHtml(yearLabel(student))} Students`;
      const sectionAction = isPassoutRow
        ? `
          <button
            type="button"
            class="btn btn-danger year-divider-btn"
            onclick="deleteAllPassoutStudents()"
          >
            Delete All
          </button>
        `
        : "";

      html += `
        <tr class="year-divider">
          <td colspan="5">
            <div class="year-divider-inner">
              <span>${sectionTitle}</span>
              ${sectionAction}
            </div>
          </td>
        </tr>
      `;
    }

    const cells = showYearColumn
      ? `
          <td>${escapeHtml(yearLabel(student))}</td>
          <td>${escapeHtml(student.regNo)}</td>
          <td>${escapeHtml(student.name)}</td>
        `
      : `
          <td>${escapeHtml(student.regNo)}</td>
          <td>${escapeHtml(student.name)}</td>
        `;

    if (isPassoutRow) {
      html += `
        <tr>
          ${cells}
          <td>${statusBadge("passout")}</td>
          <td>
            <button
              type="button"
              class="btn btn-danger"
              onclick="deletePassoutStudent('${escapeHtml(student.id)}')"
            >
              Delete
            </button>
          </td>
        </tr>
      `;
      return;
    }

    const radioGroupName = `status-${index}`;

    html += `
      <tr>
        ${cells}
        <td>
          <div class="status-radio-group" role="radiogroup" aria-label="Attendance status for ${escapeHtml(student.name)}">
            <label class="status-radio-option present">
              <input
                type="radio"
                class="status-radio"
                name="${radioGroupName}"
                value="present"
                data-index="${index}"
                data-regno="${escapeHtml(student.regNo)}"
                ${student.status === "present" ? "checked" : ""}
              >
              <span>Present</span>
            </label>
            <label class="status-radio-option absent">
              <input
                type="radio"
                class="status-radio"
                name="${radioGroupName}"
                value="absent"
                data-index="${index}"
                data-regno="${escapeHtml(student.regNo)}"
                ${student.status === "absent" ? "checked" : ""}
              >
              <span>Absent</span>
            </label>
            <label class="status-radio-option leave">
              <input
                type="radio"
                class="status-radio"
                name="${radioGroupName}"
                value="leave"
                data-index="${index}"
                data-regno="${escapeHtml(student.regNo)}"
                ${student.status === "leave" ? "checked" : ""}
              >
              <span>Leave</span>
            </label>
          </div>
        </td>

        <td>
          <input
            class="remarks-input"
            id="remarks-${index}"
            type="text"
            placeholder="Remarks"
            value="${escapeHtml(student.remarks || "")}" 
          >
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
}

async function submitAttendance() {
  const date = document.getElementById("attendanceDate").value;
  const year = document.getElementById("yearFilter").value;

  if (!date) {
    showMessage("Please select a date.", "warning");
    return;
  }

  const attendanceData = Array.from(document.querySelectorAll(".status-radio:checked"))
    .map((radio) => {
      const index = radio.dataset.index;
      return {
        regNo: radio.dataset.regno,
        status: radio.value,
        remarks: document.getElementById(`remarks-${index}`)?.value || ""
      };
    });

  if (!attendanceData.length) {
    showMessage("Please mark attendance for at least one student.", "warning");
    return;
  }

  try {
    const result = await apiRequest("/attendance/mark-bulk", {
      method: "POST",
      body: JSON.stringify({ year, date, attendanceData })
    });

    showMessage(result.message || "Attendance saved.", "success");
    await loadClassAttendance();
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to save attendance.", "error");
  }
}

function clearAttendance() {
  document.querySelectorAll(".status-radio").forEach((radio) => {
    radio.checked = false;
  });
  document.querySelectorAll(".remarks-input").forEach((input) => {
    input.value = "";
  });
  showMessage("Attendance form cleared.", "info");
}

async function loadPassoutDeleteSection() {
  try {
    const data = await apiRequest("/admin/passout-for-deletion");
    renderPassoutDeleteSection(data);
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to load passout deletion data.", "error");
  }
}

function renderPassoutDeleteSection(data) {
  const container = document.getElementById("passoutDeleteContainer");
  const groups = data.groupedByEnrollmentYear || {};
  const years = Object.keys(groups);

  if (!years.length) {
    container.innerHTML = `
      <div class="panel danger-panel">
        <h3>Delete Passout Students</h3>
        <p>No passout students found.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="panel danger-panel">
      <h3>Delete Passout Students</h3>
      <p>You can delete passout students directly from here.</p>
      <div class="stack">
        ${years.map((year) => {
          const students = groups[year];
          return `
            <div class="panel">
              <h3>Enrollment Year ${escapeHtml(year)} (${students.length})</h3>
              <p>${students.map((student) => `${escapeHtml(student.regimentalNo)} - ${escapeHtml(student.name)}`).join(", ")}</p>
              <div class="button-row">
                <button type="button" class="btn btn-danger" onclick="deletePassoutStudentsByYear(${Number(year)})">
                  Delete All ${escapeHtml(year)} Students
                </button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

async function deletePassoutStudentsByYear(enrollmentYear) {
  if (!confirm(`Delete all passout records from enrollment year ${enrollmentYear}?`)) {
    return;
  }

  if (!confirm("Final confirmation: this action permanently deletes student and attendance records.")) {
    return;
  }

  try {
    const result = await apiRequest(`/admin/passout-year/${enrollmentYear}`, {
      method: "DELETE"
    });

    showMessage(result.message || "Passout records deleted.", "success");
    await loadClassAttendance();
    await loadAllStudents();
    await loadStudentDirectory();
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to delete passout records.", "error");
  }
}

async function deletePassoutStudent(studentId) {
  if (!studentId) {
    showMessage("Passout student id is missing.", "error");
    return;
  }

  const student = state.studentDirectory.find((entry) => entry._id === studentId);
  const studentName = student?.name || "this student";

  if (!confirm(`Delete passout student ${studentName}?`)) {
    return;
  }

  if (!confirm("Final confirmation: this will permanently delete the student and linked attendance.")) {
    return;
  }

  try {
    const result = await apiRequest(`/admin/passout/${studentId}`, {
      method: "DELETE"
    });

    showMessage(result.message || "Passout student deleted.", "success");
    await Promise.all([loadClassAttendance(), loadAllStudents(), loadStudentDirectory()]);
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to delete passout student.", "error");
  }
}

async function deleteAllPassoutStudents() {
  const passoutStudents = state.currentAttendanceData.filter(
    (student) => student.isPassout || student.year === "Passout"
  );

  if (!passoutStudents.length) {
    showMessage("No passout students found.", "warning");
    return;
  }

  if (!confirm(`Delete all ${passoutStudents.length} passout students?`)) {
    return;
  }

  if (!confirm("Final confirmation: this will permanently delete all passout students and linked attendance.")) {
    return;
  }

  try {
    let deletedCount = 0;

    for (const student of passoutStudents) {
      await apiRequest(`/admin/passout/${student.id}`, {
        method: "DELETE"
      });
      deletedCount += 1;
    }

    showMessage(`Deleted ${deletedCount} passout students successfully.`, "success");
    await Promise.all([loadClassAttendance(), loadAllStudents(), loadStudentDirectory()]);
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to delete all passout students.", "error");
  }
}

function loadStudentsForHistoryDropdown() {
  populateSelect("historyStudentSelect", state.studentDirectory, "Select a student");
}

async function loadSingleStudentHistory() {
  const studentId = document.getElementById("historyStudentSelect").value;
  if (!studentId) {
    showMessage("Please select a student.", "warning");
    return;
  }

  try {
    const data = await apiRequest(`/attendance/history/${studentId}`);
    renderSingleHistory(data);
    showMessage("Student history loaded.", "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to load history.", "error");
  }
}

function renderSingleHistory(data) {
  const container = document.getElementById("singleHistoryContainer");
  const summary = data.summary || {};
  const records = data.records || [];

  container.innerHTML = `
    <div class="history-item">
      <h4>${escapeHtml(data.student.name)}</h4>
      <p><strong>Reg No:</strong> ${escapeHtml(data.student.regNo)}</p>
      <p><strong>Year:</strong> ${escapeHtml(data.student.year)}</p>
      <p><strong>Enrollment Year:</strong> ${escapeHtml(data.student.enrollmentYear)}</p>
    </div>
    <div class="metric-grid">
      <div class="metric-card"><span>Total Days</span><strong>${summary.totalDays || 0}</strong></div>
      <div class="metric-card"><span>Present</span><strong>${summary.present || 0}</strong></div>
      <div class="metric-card"><span>Absent</span><strong>${summary.absent || 0}</strong></div>
      <div class="metric-card"><span>Leave</span><strong>${summary.leave || 0}</strong></div>
      <div class="metric-card"><span>Attendance %</span><strong>${summary.percentage || 0}%</strong></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Status</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${records.length
            ? records.map((record) => `
                <tr>
                  <td>${escapeHtml(formatDate(record.date))}</td>
                  <td>${statusBadge(record.status)}</td>
                  <td>${escapeHtml(record.remarks || "-")}</td>
                </tr>
              `).join("")
            : '<tr><td colspan="3" class="text-center">No attendance records found.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

async function loadBulkHistory() {
  const year = document.getElementById("bulkHistoryYear").value;
  const startDate = document.getElementById("historyStartDate").value;
  const endDate = document.getElementById("historyEndDate").value;

  if (!year) {
    showMessage("Please select a year.", "warning");
    return;
  }

  try {
    const data = await apiRequest("/attendance/history-bulk", {
      method: "POST",
      body: JSON.stringify({
        year,
        startDate: startDate || null,
        endDate: endDate || null
      })
    });

    state.lastBulkHistory = data;
    renderBulkHistory(data);
    showMessage("Bulk attendance report loaded.", "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to load bulk history.", "error");
  }
}

function renderBulkHistory(data) {
  const stats = document.getElementById("bulkHistoryStats");
  const table = document.getElementById("bulkHistoryTable");
  const body = document.getElementById("bulkHistoryBody");

  stats.innerHTML = `
    <div class="metric-grid">
      <div class="metric-card"><span>Year</span><strong>${escapeHtml(data.yearLabel)}</strong></div>
      <div class="metric-card"><span>Total Students</span><strong>${data.totalStudents}</strong></div>
      <div class="metric-card"><span>Low Attendance</span><strong>${data.studentsWithLowAttendance}</strong></div>
      <div class="metric-card"><span>Date Range</span><strong>${escapeHtml(typeof data.dateRange === "string"
        ? data.dateRange
        : `${data.dateRange.startDate || "Start"} to ${data.dateRange.endDate || "End"}`)}</strong></div>
    </div>
  `;

  body.innerHTML = data.studentStats.map((stat) => `
    <tr>
      <td>${escapeHtml(stat.regNo)}</td>
      <td>${escapeHtml(stat.name)}</td>
      <td>${stat.summary.totalDays}</td>
      <td>${stat.summary.present}</td>
      <td>${stat.summary.absent}</td>
      <td>${stat.summary.leave}</td>
      <td>${stat.summary.percentage}%</td>
    </tr>
  `).join("");

  table.classList.remove("hidden");
}

async function downloadBulkHistoryAsExcel() {
  const year = document.getElementById("bulkHistoryYear").value;
  const startDate = document.getElementById("historyStartDate").value;
  const endDate = document.getElementById("historyEndDate").value;

  if (!year) {
    showMessage("Please select a year.", "warning");
    return;
  }

  try {
    const response = await apiRequest("/attendance/download-report-excel", {
      method: "POST",
      body: JSON.stringify({
        year,
        startDate: startDate || null,
        endDate: endDate || null
      }),
      expectBlob: true
    });

    const filenameMatch = response.headers
      .get("content-disposition")
      ?.match(/filename="?([^"]+)"?/);
    const filename = filenameMatch?.[1] || "attendance-report.xlsx";

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    showMessage(`Excel report downloaded: ${filename}`, "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to download Excel report.", "error");
  }
}

async function loadAllStudents() {
  const year = document.getElementById("studentYearFilter").value;
  const status = document.getElementById("studentStatusFilter").value;

  try {
    const params = new URLSearchParams();
    if (year) {
      params.set("year", year);
    }
    if (status) {
      params.set("status", status);
    }

    const students = await apiRequest(`/admin/students${params.toString() ? `?${params.toString()}` : ""}`);
    renderStudentsTable(students);
    showMessage(`Loaded ${students.length} students.`, "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to load students.", "error");
  }
}

function renderStudentsTable(students) {
  const body = document.getElementById("studentsBody");

  if (!students.length) {
    body.innerHTML = '<tr><td colspan="7" class="text-center">No students found.</td></tr>';
    return;
  }

  body.innerHTML = students.map((student) => `
    <tr>
      <td>${escapeHtml(student.regimentalNo)}</td>
      <td>${escapeHtml(student.name)}</td>
      <td>${escapeHtml(student.email)}</td>
      <td>${escapeHtml(yearLabel(student))}</td>
      <td>${statusBadge(student.status)}</td>
      <td>${student.attendance || 0}%</td>
      <td>
        <div class="action-inline">
          ${student.status === "pending"
            ? `<button type="button" class="btn btn-success" onclick="approveStudent('${student._id}')">Approve</button>`
            : ""}
          <button type="button" class="btn btn-danger" onclick="deleteStudent('${student._id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function openAddStudentModal() {
  document.getElementById("addStudentModal").classList.add("active");
  document.getElementById("addStudentModal").setAttribute("aria-hidden", "false");
}

function closeAddStudentModal() {
  document.getElementById("addStudentModal").classList.remove("active");
  document.getElementById("addStudentModal").setAttribute("aria-hidden", "true");
  document.getElementById("addStudentForm").reset();
  document.getElementById("studentAutoDetails").textContent =
    "Enter a regimental number to preview year details.";
}

function extractEnrollmentYearFromRegNo(regNo) {
  const normalized = String(regNo || "").trim().toUpperCase();
  const fourDigit = normalized.match(/[A-Z]+(\d{4})(?=[A-Z])/);
  if (fourDigit) {
    return Number(fourDigit[1]);
  }

  const twoDigit = normalized.match(/[A-Z]+(\d{2})(?=[A-Z])/);
  if (!twoDigit) {
    return null;
  }

  const shortYear = Number(twoDigit[1]);
  return shortYear >= 50 ? 1900 + shortYear : 2000 + shortYear;
}

function calculateYearFromEnrollment(enrollmentYear) {
  if (!enrollmentYear) {
    return null;
  }

  const now = new Date();
  const academicYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const computed = academicYear - enrollmentYear + 1;
  return Math.max(1, Math.min(3, computed));
}

function shouldAutoPassoutFromEnrollment(enrollmentYear) {
  if (!enrollmentYear) {
    return false;
  }

  const now = new Date();
  const academicYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return academicYear - enrollmentYear + 1 > 3;
}

function updateStudentDerivedInfo() {
  const regNo = document.getElementById("regimentalNo").value;
  const helper = document.getElementById("studentAutoDetails");
  const enrollmentYear = extractEnrollmentYearFromRegNo(regNo);

  if (!enrollmentYear) {
    helper.textContent = "Enter a valid regimental number to preview year details.";
    return;
  }

  const assignedYear = calculateYearFromEnrollment(enrollmentYear);
  const isAutoPassout = shouldAutoPassoutFromEnrollment(enrollmentYear);

  helper.textContent = isAutoPassout
    ? `Enrollment Year: ${enrollmentYear} | Assigned Status: Passout`
    : `Enrollment Year: ${enrollmentYear} | Assigned Year: Year ${assignedYear} | Status: approved`;
}

async function addStudent(event) {
  event.preventDefault();

  const studentData = {
    regimentalNo: document.getElementById("regimentalNo").value.trim(),
    name: document.getElementById("studentName").value.trim(),
    fatherName: document.getElementById("fatherName").value.trim(),
    dob: document.getElementById("studentDob").value,
    email: document.getElementById("studentEmail").value.trim(),
    password: document.getElementById("studentPassword").value
  };

  if (!studentData.regimentalNo || !studentData.name || !studentData.fatherName || !studentData.dob || !studentData.email || !studentData.password) {
    showMessage("All fields are required.", "warning");
    return;
  }

  try {
    const result = await apiRequest("/admin/students", {
      method: "POST",
      body: JSON.stringify(studentData)
    });

    showMessage(result.message || "Student added successfully.", "success");
    closeAddStudentModal();
    await Promise.all([loadAllStudents(), loadStudentDirectory(), loadClassAttendance()]);
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to add student.", "error");
  }
}

async function deleteStudent(studentId) {
  if (!confirm("Delete this student and all linked attendance records?")) {
    return;
  }

  try {
    const result = await apiRequest(`/admin/student/${studentId}`, {
      method: "DELETE"
    });

    showMessage(result.message || "Student deleted.", "success");
    await Promise.all([loadAllStudents(), loadStudentDirectory(), loadClassAttendance()]);
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to delete student.", "error");
  }
}

async function approveStudent(studentId) {
  try {
    const result = await apiRequest(`/admin/approve/${studentId}`, {
      method: "PUT"
    });

    showMessage(result.message || "Student approved.", "success");
    await Promise.all([loadAllStudents(), loadStudentDirectory()]);
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to approve student.", "error");
  }
}

function loadStudentsForPromotion() {
  const promotableStudents = state.studentDirectory.filter(
    (student) => student.status === "approved" && !student.isPassout
  );

  populateSelect("studentSelect", promotableStudents, "Select student");
  populateSelect("promotionHistorySelect", state.studentDirectory, "Select student");
  updatePromotionInfo();
}

function updatePromotionInfo() {
  const studentId = document.getElementById("studentSelect").value;
  const panel = document.getElementById("promotionInfo");

  if (!studentId) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  const student = state.studentDirectory.find((entry) => entry._id === studentId);
  if (!student) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  const currentYear = student.year || 1;
  const nextAction = currentYear >= 3 ? "Mark as PASSOUT" : `Promote to Year ${currentYear + 1}`;

  panel.innerHTML = `
    <p><strong>Student:</strong> ${escapeHtml(student.name)} (${escapeHtml(student.regimentalNo)})</p>
    <p><strong>Current Year:</strong> ${escapeHtml(yearLabel(student))}</p>
    <p><strong>Next Action:</strong> ${escapeHtml(nextAction)}</p>
  `;
  panel.classList.remove("hidden");
}

function getSelectedPromotionStudent() {
  const studentId = document.getElementById("studentSelect").value;
  return state.studentDirectory.find((student) => student._id === studentId);
}

function promoteStudentModal() {
  const student = getSelectedPromotionStudent();
  const remarks = document.getElementById("promotionRemarks").value.trim();

  if (!student) {
    showMessage("Please select a student.", "warning");
    return;
  }

  if ((student.year || 1) >= 3) {
    showMessage("Year 3 students must be marked as PASSOUT instead.", "warning");
    return;
  }

  if (confirm(`Promote ${student.name} from Year ${student.year} to Year ${student.year + 1}?`)) {
    promoteStudent(student._id, remarks);
  }
}

async function promoteStudent(studentId, remarks = "") {
  try {
    const result = await apiRequest(`/admin/promote/${studentId}`, {
      method: "PUT",
      body: JSON.stringify({ remarks })
    });

    document.getElementById("studentSelect").value = "";
    document.getElementById("promotionRemarks").value = "";
    updatePromotionInfo();

    showMessage(result.message || "Student promoted successfully.", "success");
    await Promise.all([loadStudentDirectory(), loadAllStudents(), loadClassAttendance()]);
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to promote student.", "error");
  }
}

function promoteYear3ToPassout() {
  const student = getSelectedPromotionStudent();
  const remarks = document.getElementById("promotionRemarks").value.trim();

  if (!student) {
    showMessage("Please select a student.", "warning");
    return;
  }

  if ((student.year || 1) !== 3) {
    showMessage("Only Year 3 students can be marked as PASSOUT.", "warning");
    return;
  }

  if (!confirm(`Mark ${student.name} as PASSOUT?`)) {
    return;
  }

  if (!confirm("Final confirmation: this will start the 2-year retention period.")) {
    return;
  }

  promoteStudent(student._id, remarks);
}

async function bulkPromoteStudents() {
  const year = document.getElementById("bulkPromoteYear").value;
  const remarks = document.getElementById("bulkPromotionRemarks").value.trim();
  const confirmed = document.getElementById("confirmBulkPromote").checked;

  if (!year) {
    showMessage("Please select a year.", "warning");
    return;
  }

  if (!confirmed) {
    showMessage("Please confirm the bulk action.", "warning");
    return;
  }

  if (!confirm(`Process all approved Year ${year} students?`)) {
    return;
  }

  try {
    const result = await apiRequest("/admin/bulk-promote", {
      method: "POST",
      body: JSON.stringify({ year: Number(year), remarks })
    });

    document.getElementById("bulkPromoteYear").value = "";
    document.getElementById("bulkPromotionRemarks").value = "";
    document.getElementById("confirmBulkPromote").checked = false;
    document.getElementById("bulkPromoteBtn").disabled = true;

    document.getElementById("bulkPromotionResult").innerHTML = `
      <div class="history-item">
        <h4>Bulk Processing Complete</h4>
        <p><strong>Promoted:</strong> ${result.promoted}</p>
        <p><strong>Passout:</strong> ${result.passout}</p>
        <p><strong>Failed:</strong> ${result.failed}</p>
        <p><strong>Total:</strong> ${result.total}</p>
      </div>
    `;

    showMessage(result.message || "Bulk promotion complete.", "success");
    await Promise.all([loadStudentDirectory(), loadAllStudents(), loadClassAttendance()]);
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to process bulk promotion.", "error");
  }
}

async function loadPromotionHistory() {
  const studentId = document.getElementById("promotionHistorySelect").value;
  if (!studentId) {
    showMessage("Please select a student.", "warning");
    return;
  }

  try {
    const data = await apiRequest(`/admin/promotion-history/${studentId}`);
    const container = document.getElementById("promotionHistoryContainer");

    if (!data.promotionHistory.length) {
      container.innerHTML = `
        <div class="history-item">
          <h4>${escapeHtml(data.student.name)}</h4>
          <p>No promotion history found yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="history-list">
        ${data.promotionHistory.map((item) => `
          <div class="history-item">
            <h4>${escapeHtml(data.student.name)} (${escapeHtml(data.student.regimentalNo)})</h4>
            <p><strong>Date:</strong> ${escapeHtml(formatDate(item.promotionDate, true))}</p>
            <p><strong>Movement:</strong> Year ${item.fromYear} to ${item.toYear === 3 && item.remarks?.startsWith("PASSOUT")
              ? "PASSOUT"
              : `Year ${item.toYear}`}</p>
            <p><strong>Remarks:</strong> ${escapeHtml(item.remarks || "-")}</p>
          </div>
        `).join("")}
      </div>
    `;

    showMessage("Promotion history loaded.", "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to load promotion history.", "error");
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "../index.html";
}

window.addEventListener("click", (event) => {
  const modal = document.getElementById("addStudentModal");
  if (event.target === modal) {
    closeAddStudentModal();
  }
});
