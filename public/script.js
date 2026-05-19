function toggleContent(id) {
  const content = document.getElementById(id);
  if (content.style.maxHeight) {
    content.style.maxHeight = null;
  } else {
    content.style.maxHeight = content.scrollHeight + "px";
  }
}

const API_BASE = "/api";
const SERVER_ORIGIN = window.location.origin;
const CONTENT_PLACEHOLDER_IMAGE = "./achivement images/user.png";
const GALLERY_PLACEHOLDER_IMAGE = "./assets/mainimg1.jpg";

let homepageContentCache = [];
let imageModalElement = null;
let imageModalImg = null;
let adminContentAssetsVisible = false;
const adminContentFilterState = {
  section: "all",
  query: ""
};
const contentFormProfiles = {
  achievements: {
    title: "Student name",
    subtitle: "Regimental No ",
    facts: "Batch: xxxx-xx",
    highlight: "what he achieved like joined Indian Army, NDA, etc "
  },
  "national-camps": {
    title: "Cadet name ",
    subtitle: "Regimental No ",
    facts: "Camp: TSC 2023\nCategory: Map Reading",
    highlight: ""
  },
  gallery: {
    title: "Event",
    subtitle: "Date (dd.mm.yyyy)",
    facts: "Optional facts, one per line. Example:\nEvent: Tree Plantation\nDate: 23.11.2024",
    highlight: "Optional highlight line"
  }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSectionLabel(section) {
  if (section === "national-camps") {
    return "National Camps";
  }

  if (section === "gallery") {
    return "Gallery";
  }

  return "Achievements";
}

function normalizeImageSrc(url, fallbackImage) {
  return String(url || "").trim() || fallbackImage;
}

function resolveAssetLink(url) {
  const normalized = String(url || "").trim();

  if (!normalized) {
    return "";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("/")) {
    return `${SERVER_ORIGIN}${normalized}`;
  }

  return normalized;
}

function parseFactsInput(factsText) {
  return String(factsText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) {
        return {
          label: "Details",
          value: line
        };
      }

      return {
        label: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim()
      };
    })
    .filter((fact) => fact.label && fact.value);
}

function factsToTextareaValue(facts = []) {
  if (!Array.isArray(facts)) {
    return "";
  }

  return facts
    .map((fact) => `${fact.label}: ${fact.value}`)
    .join("\n");
}

function updateContentFormBySection(section) {
  const profile = contentFormProfiles[section] || contentFormProfiles.achievements;
  const titleInput = document.getElementById("contentTitle");
  const subtitleInput = document.getElementById("contentSubtitle");
  const factsGroup = document.getElementById("contentFactsGroup");
  const factsInput = document.getElementById("contentFacts");
  const highlightGroup = document.getElementById("contentHighlightGroup");
  const highlightInput = document.getElementById("contentHighlight");

  if (titleInput) titleInput.placeholder = profile.title;
  if (subtitleInput) subtitleInput.placeholder = profile.subtitle;
  if (factsGroup) factsGroup.classList.toggle("hidden", section === "gallery");
  if (factsInput) factsInput.placeholder = profile.facts;
  if (highlightGroup) highlightGroup.classList.toggle("hidden", section === "national-camps");
  if (highlightInput) highlightInput.placeholder = profile.highlight;
}

function setAssetsPanelVisibility(visible) {
  adminContentAssetsVisible = visible;

  const panel = document.getElementById("contentAssetsPanel");
  const toggleButton = document.getElementById("contentToggleAssetsBtn");

  if (panel) {
    panel.classList.toggle("hidden", !visible);
  }

  if (toggleButton) {
    toggleButton.textContent = visible ? "Hide Assets" : "Manage Assets";
  }
}

function updateContentSummaryCounts(items = []) {
  const counts = items.reduce(
    (accumulator, item) => {
      if (item.section === "achievements") {
        accumulator.achievements += 1;
      } else if (item.section === "national-camps") {
        accumulator.nationalCamps += 1;
      } else if (item.section === "gallery") {
        accumulator.gallery += 1;
      }

      return accumulator;
    },
    {
      achievements: 0,
      nationalCamps: 0,
      gallery: 0
    }
  );

  const achievementsCount = document.getElementById("summaryAchievementsCount");
  const nationalCampsCount = document.getElementById("summaryNationalCampsCount");
  const galleryCount = document.getElementById("summaryGalleryCount");

  if (achievementsCount) achievementsCount.textContent = counts.achievements;
  if (nationalCampsCount) nationalCampsCount.textContent = counts.nationalCamps;
  if (galleryCount) galleryCount.textContent = counts.gallery;
}

function getFilteredAdminContentItems() {
  const query = adminContentFilterState.query.trim().toLowerCase();

  return homepageContentCache.filter((item) => {
    if (
      adminContentFilterState.section !== "all" &&
      item.section !== adminContentFilterState.section
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    const factsText = Array.isArray(item.facts)
      ? item.facts.map((fact) => `${fact.label} ${fact.value}`).join(" ")
      : "";

    const haystack = [
      item.title,
      item.subtitle,
      item.description,
      item.highlightText,
      factsText,
      getSectionLabel(item.section)
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Image modal
  const modal = document.createElement("div");
  modal.id = "imageModal";
  modal.style = `
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.85);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;

  const modalImg = document.createElement("img");
  modalImg.style = `
    max-height: 90vh;
    max-width: 90vw;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  `;

  modal.appendChild(modalImg);
  document.body.appendChild(modal);
  imageModalElement = modal;
  imageModalImg = modalImg;

  document.addEventListener("click", (event) => {
    const zoomableImage = event.target.closest("[data-zoomable-gallery-image='true']");

    if (!zoomableImage || !imageModalElement || !imageModalImg) {
      return;
    }

    imageModalImg.src = zoomableImage.src;
    imageModalElement.style.display = "flex";
  });

  modal.addEventListener("click", () => {
    modal.style.display = "none";
    modalImg.src = "";
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      modal.style.display = "none";
      modalImg.src = "";
    }
  });

  // Mobile menu
  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("hidden");
    });

    const mobileMenuLinks = document.querySelectorAll("#mobileMenu a");

    mobileMenuLinks.forEach(link => {
      link.addEventListener("click", () => {
        mobileMenu.classList.add("hidden");
      });
    });
  }

  // Auth / role-based UI
  const token = localStorage.getItem("token");
  const userData = localStorage.getItem("user");

  const userBar = document.getElementById("userBar");
  const welcomeUser = document.getElementById("welcomeUser");
  const loginNavBtnDesktop = document.getElementById("loginNavBtnDesktop");
  const loginNavBtnMobile = document.getElementById("loginNavBtnMobile");
  const logoutBtnDesktop = document.getElementById("logoutNavBtnDesktop");
  const logoutBtnMobile = document.getElementById("logoutNavBtnMobile");
  const studentPanel = document.getElementById("studentPanel");
  const adminPanel = document.getElementById("adminPanel");
 
  loadPublicHomepageContent();

  if (!token || !userData) {
    if (loginNavBtnDesktop) loginNavBtnDesktop.classList.remove("hidden");
    if (loginNavBtnMobile) loginNavBtnMobile.classList.remove("hidden");
    if (logoutBtnDesktop) logoutBtnDesktop.classList.add("hidden");
    if (logoutBtnMobile) logoutBtnMobile.classList.add("hidden");
    return;
  }

  const user = JSON.parse(userData);

  // STUDENT
  if (user.role === "student") {
    const userBar = document.getElementById("userBar");
    const welcomeUser = document.getElementById("welcomeUser");

    if (userBar) userBar.style.display = "block";
    if (welcomeUser) welcomeUser.textContent = `Welcome, ${user.name} (${user.regimentalNo})`;
  }
  const openNotesModalButton = document.getElementById("openNotesModal");
  const closeNotesModalButton = document.getElementById("closeNotesModal");
  const notesModal = document.getElementById("notesModal");

  if (openNotesModalButton && closeNotesModalButton && notesModal) {
    openNotesModalButton.addEventListener("click", () => {
      notesModal.style.display = "block";
    });

    closeNotesModalButton.addEventListener("click", () => {
      notesModal.style.display = "none";
    });

    window.addEventListener("click", (e) => {
      if (e.target === notesModal) {
        notesModal.style.display = "none";
      }
    });
  }

  // ADMIN
  if (user.role === "admin") {
    const adminBar = document.getElementById("adminUserBar");
    const adminWelcome = document.getElementById("adminWelcomeUser");

    if (adminBar) adminBar.style.display = "block";
    if (adminWelcome) adminWelcome.textContent = `Welcome, ${user.name} `;
  }

  if (loginNavBtnDesktop) loginNavBtnDesktop.classList.add("hidden");
  if (loginNavBtnMobile) loginNavBtnMobile.classList.add("hidden");
  if (logoutBtnDesktop) logoutBtnDesktop.classList.remove("hidden");
  if (logoutBtnMobile) logoutBtnMobile.classList.remove("hidden");
  
  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "index.html";
  }
  if (logoutBtnDesktop) logoutBtnDesktop.addEventListener("click", handleLogout);
  if (logoutBtnMobile) logoutBtnMobile.addEventListener("click", handleLogout);

  if (loginNavBtnDesktop) {
    loginNavBtnDesktop.addEventListener("click", () => {
      window.location.href = "login.html";
    });
  }

  if (loginNavBtnMobile) {
    loginNavBtnMobile.addEventListener("click", () => {
      window.location.href = "login.html";
    });
  }

  if (user.role === "student") {
    if (studentPanel) studentPanel.style.display = "block";
    loadStudentProfile(token);
    loadStudentNotes(token);
    loadMyAttendance(token);
    // ✅ FEATURE 3: Load student's attendance history
    loadStudentAttendanceHistory(token);
  }

  if (user.role === "admin") {
    if (adminPanel) adminPanel.style.display = "block";
    loadPendingStudents(token);
    setupAddNoteForm();
    setupContentManager(token);
    loadStudentNotes(token);
    loadAllStudents(token);
    loadAdminContentList(token);
  }
});


async function loadPendingStudents(token) {
  const pendingStudentsList = document.getElementById("pendingStudentsList");
  if (!pendingStudentsList) return;

  try {
    const res = await fetch(`${API_BASE}/admin/pending-students`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const students = await res.json();

    if (!res.ok) {
      pendingStudentsList.innerHTML = `<p>${students.message || "Failed to load pending students"}</p>`;
      return;
    }

    if (students.length === 0) {
      pendingStudentsList.innerHTML = "<p>No pending requests</p>";
      return;
    }

    pendingStudentsList.innerHTML = students.map(student => `
      <div style="padding:10px; border:1px solid #ccc; margin-bottom:10px; border-radius:8px;">
        <p><strong>Name:</strong> ${student.name}</p>
        <p><strong>Regimental No:</strong> ${student.regimentalNo}</p>
        <p><strong>Email:</strong> ${student.email}</p>
        <button onclick="approveStudent('${student._id}')">Approve</button>
      </div>
    `).join("");
  } catch (error) {
    pendingStudentsList.innerHTML = "<p>Error loading pending students</p>";
  }
}

async function approveStudent(studentId) {
  const token = localStorage.getItem("token");

  try {
    const res = await fetch(`${API_BASE}/admin/approve/${studentId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const result = await res.json();
    alert(result.message);

    if (res.ok) {
      loadPendingStudents(token);
      loadAllStudents(token);
    }
  } catch (error) {
    alert("Error approving student");
  }
}

async function loadStudentNotes(token) {
  const notesList = document.getElementById("notesList");
  if (!notesList) return;
  try {
    const res = await fetch(`${API_BASE}/notes`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const notes = await res.json();
    if (!res.ok) {
      notesList.innerHTML = `<li>${notes.message || "Failed to load notes"}</li>`;
      return;
    }
    if (notes.length === 0) {
      notesList.innerHTML = "<li>No notes available yet</li>";
      return;
    }
    const notesList = document.getElementById("notesList");
    const adminNotesList = document.getElementById("adminNotesList");
    // For students, show basic note info
    if (notesList) {
      notesList.innerHTML = notes.map(note => `
        <li style="margin-bottom:10px; padding:10px; border:1px solid #ccc; border-radius:8px;">
          <strong>${note.title}</strong><br>
          ${note.description || ""}<br>
          ${note.fileName ? `<small>${note.fileName}</small><br>` : ""}
          <a href="${resolveAssetLink(note.fileLink)}" target="_blank" rel="noopener noreferrer">Open Note</a>
        </li>
      `).join("");
    }
    // For admins, show notes with delete option
    if (adminNotesList) {
      adminNotesList.innerHTML = notes.map(note => `
        <div style="border:1px solid #ccc; padding:10px; margin-bottom:10px; border-radius:8px;">
          <strong>${note.title}</strong><br>
          ${note.description || ""}<br>
          ${note.fileName ? `<small>${note.fileName}</small><br>` : ""}
          <a href="${resolveAssetLink(note.fileLink)}" target="_blank" rel="noopener noreferrer">Open Note</a><br><br>
          <button onclick="deleteNote('${note._id}')">❌ Delete</button>
        </div>
      `).join("");
    }
  }
  
  
  catch (error) {
    notesList.innerHTML = "<li>Error loading notes</li>";
  }
}

async function deleteNote(noteId) {
  const token = localStorage.getItem("token");

  if (!confirm("Are you sure you want to delete this note?")) return;

  try {
    const res = await fetch(`${API_BASE}/notes/${noteId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const result = await res.json();
    alert(result.message);

    if (res.ok) {
      loadStudentNotes(token);
    }
  } catch (error) {
    alert("Error deleting note");
  }
}

function setupAddNoteForm() {
  const addNoteForm = document.getElementById("addNoteForm");
  const noteMessage = document.getElementById("noteMessage");

  if (!addNoteForm) return;

  addNoteForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const token = localStorage.getItem("token");
    const noteFile = document.getElementById("noteFile").files[0];

    if (!noteFile) {
      noteMessage.textContent = "Please choose a note file.";
      noteMessage.style.color = "red";
      return;
    }

    const formData = new FormData();
    formData.append("title", document.getElementById("noteTitle").value.trim());
    formData.append("description", document.getElementById("noteDescription").value.trim());
    formData.append("noteFile", noteFile);

    try {
      const res = await fetch(`${API_BASE}/notes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const result = await res.json();
      noteMessage.textContent = result.message;
      noteMessage.style.color = res.ok ? "green" : "red";

      if (res.ok) {
        addNoteForm.reset();
        loadStudentNotes(token);
      }
    } catch (error) {
      noteMessage.textContent = "Error adding note";
      noteMessage.style.color = "red";
    }
  });
}

async function loadAllStudents(token) {
  const studentAttendanceList = document.getElementById("studentAttendanceList");
  if (!studentAttendanceList) return;

  try {
    const res = await fetch(`${API_BASE}/admin/students`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const students = await res.json();

    if (!res.ok) {
      studentAttendanceList.innerHTML = `<p>${students.message || "Failed to load students"}</p>`;
      return;
    }

    if (students.length === 0) {
      studentAttendanceList.innerHTML = "<p>No students found</p>";
      return;
    }

    studentAttendanceList.innerHTML = students.map(student => `
      <div style="border:1px solid #ccc; padding:10px; margin-bottom:10px; border-radius:8px;">
        
        <p><strong>${student.name}</strong> (${student.regimentalNo})</p>
        <p>Status: ${student.status}</p>
        <p>Current Attendance: ${student.attendance ?? 0}%</p>

        <!-- Attendance Update -->
        <input 
          type="number" 
          id="attendance-${student._id}" 
          min="0" 
          max="100" 
          placeholder="Enter attendance %" 
        />
        <button onclick="updateAttendance('${student._id}')">Update</button>

        <!-- Delete Button (ONLY for approved students) -->
        ${student.status === "approved" ? `
          <button 
            onclick="deleteStudent('${student._id}')"
            style="background:red; color:white; margin-top:8px; padding:5px 10px; border:none; border-radius:5px;">
            ❌ Delete
          </button>
        ` : ""}

      </div>
    `).join("");

  } catch (error) {
    studentAttendanceList.innerHTML = "<p>Error loading students</p>";
  }
}

async function deleteStudent(studentId) {
  const token = localStorage.getItem("token");

  if (!confirm("Are you sure you want to delete this student?")) return;

  try {
    const res = await fetch(`${API_BASE}/admin/student/${studentId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const result = await res.json();
    alert(result.message);

    if (res.ok) {
      loadAllStudents(token);
    }
  } catch (error) {
    alert("Error deleting student");
  }
}


async function updateAttendance(studentId) {
  const token = localStorage.getItem("token");
  const input = document.getElementById(`attendance-${studentId}`);
  const attendanceValue = Number(input.value);

  if (attendanceValue < 0 || attendanceValue > 100 || Number.isNaN(attendanceValue)) {
    alert("Please enter attendance between 0 and 100");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/attendance/${studentId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ attendance: attendanceValue })
    });

    const result = await res.json();
    alert(result.message);

    if (res.ok) {
      loadAllStudents(token);
    }
  } catch (error) {
    alert("Error updating attendance");
  }
}

async function loadStudentProfile(token) {
  const studentAttendance = document.getElementById("studentAttendance");
  if (!studentAttendance) return;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const user = await res.json();

    if (!res.ok) {
      studentAttendance.textContent = "Error";
      return;
    }

    studentAttendance.textContent = user.attendance ?? 0;
    localStorage.setItem("user", JSON.stringify(user));
  } catch (error) {
    studentAttendance.textContent = "Error";
  }
}

async function loadMyAttendance() {
  const token = localStorage.getItem("token");

  const res = await fetch("http://localhost:5000/api/attendance/my-attendance", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json();

  document.getElementById("studentAttendance").textContent = data.percentage;
}

// ====================  STUDENT ATTENDANCE HISTORY ====================

async function loadStudentAttendanceHistory(token) {
  try {
    const res = await fetch(`${API_BASE}/attendance/my-history`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Error loading student attendance history:", data.message);
      return;
    }

    displayStudentAttendanceHistory(data);
  } catch (error) {
    console.error("Error fetching attendance history:", error);
  }
}

function displayStudentAttendanceHistory(data) {
  const { student, summary, records } = data;

  // Create history section in student panel if it doesn't exist
  const studentPanel = document.getElementById("studentPanel");
  if (!studentPanel) return;

  // Check if history container already exists
  let historyContainer = document.getElementById("studentHistoryContainer");
  if (!historyContainer) {
    historyContainer = document.createElement("div");
    historyContainer.id = "studentHistoryContainer";
    historyContainer.style = `
      margin-top: 30px;
      padding: 20px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    `;
    studentPanel.appendChild(historyContainer);
  }

  let html = `
    <h3 style="margin-bottom: 20px; color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
      Your Attendance History
    </h3>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px;">
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; display: flex; justify-content: center; align-items: center; gap: 8px;">
        <p style="color: #666; margin: 0; font-size: 12px;">Total Days</p>
        <p style="color: #333; margin: 0; font-size: 24px; font-weight: bold;">
          ${summary.totalDays}
        </p>
      </div>
      
      <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; text-align: center; display: flex; justify-content: center; align-items: center; gap: 8px;">
        <p style="color: #2e7d32; margin: 0; font-size: 12px;">Present</p>
        <p style="color: #2e7d32; margin: 5px 0 0 0; font-size: 24px; font-weight: bold;">${summary.present}</p>
      </div>
      
      <div style="background: #ffebee; padding: 15px; border-radius: 8px; text-align: center; display: flex; justify-content: center; align-items: center; gap: 8px;">
        <p style="color: #c62828; margin: 0; font-size: 12px;">Absent</p>
        <p style="color: #c62828; margin: 5px 0 0 0; font-size: 24px; font-weight: bold;">${summary.absent}</p>
      </div>
      
      <div style="background: #fff3e0; padding: 15px; border-radius: 8px; text-align: center; display: flex; justify-content: center; align-items: center; gap: 8px;">
        <p style="color: #e65100; margin: 0; font-size: 12px;">Leave</p>
        <p style="color: #e65100; margin: 5px 0 0 0; font-size: 24px; font-weight: bold;">${summary.leave}</p>
      </div>
      
      <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center; display: flex; justify-content: center; align-items: center; gap: 8px;">
        <p style="color: #1565c0; margin: 0; font-size: 12px;">Attendance %</p>
        <p style="color: #1565c0; margin: 5px 0 0 0; font-size: 24px; font-weight: bold;">${summary.percentage}%</p>
      </div>
    </div>

    <h4 style="margin: 20px 0 10px 0; color: #333;">Attendance Records </h4>
    <div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 8px;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead style="background: #f5f5f5; position: sticky; top: 0;">
          <tr>
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd; font-weight: 600;">Date</th>
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd; font-weight: 600;">Status</th>
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd; font-weight: 600;">Remarks</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (records.length === 0) {
    html += `<tr><td colspan="3" style="padding: 20px; text-align: center; color: #999;">No attendance records yet</td></tr>`;
  } else {
    records.slice(0, 30).forEach((record) => {
      const statusColor = record.status === "present" ? "#2e7d32" : record.status === "absent" ? "#c62828" : "#e65100";
      const statusBg = record.status === "present" ? "#e8f5e9" : record.status === "absent" ? "#ffebee" : "#fff3e0";
      
      html += `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px; color: #333;">${record.date}</td>
          <td style="padding: 12px;">
            <span style="background: ${statusBg}; color: ${statusColor}; padding: 4px 8px; border-radius: 4px; font-weight: 500; font-size: 12px;">
              ${record.status.charAt(0).toUpperCase() + record.status.slice(1)}
            </span>
          </td>
          <td style="padding: 12px; color: #666;">${record.remarks || '-'}</td>
        </tr>
      `;
    });
  }

  html += `
        </tbody>
      </table>
    </div>
  `;

  historyContainer.innerHTML = html;
}

async function loadPublicHomepageContent() {
  try {
    const res = await fetch(`${API_BASE}/content`);
    const items = await res.json();

    if (!res.ok) {
      throw new Error(items.message || "Failed to load homepage content.");
    }

    homepageContentCache = Array.isArray(items) ? items : [];
    renderPublicHomepageSection("achievements", homepageContentCache);
    renderPublicHomepageSection("national-camps", homepageContentCache);
    renderPublicHomepageSection("gallery", homepageContentCache);
  } catch (error) {
    renderPublicHomepageError("achievementsGrid", "Unable to load achievements right now.");
    renderPublicHomepageError("nationalCampsGrid", "Unable to load national camp highlights right now.");
    renderPublicHomepageError("galleryGrid", "Unable to load gallery right now.");
  }
}

function renderPublicHomepageError(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div class="public-dynamic-empty">${escapeHtml(message)}</div>`;
}

function renderPublicHomepageSection(section, allItems) {
  const sectionItems = allItems.filter((item) => item.section === section);

  if (section === "achievements") {
    renderPublicCardSection("achievementsGrid", sectionItems, CONTENT_PLACEHOLDER_IMAGE, section);
    return;
  }

  if (section === "national-camps") {
    renderPublicCardSection("nationalCampsGrid", sectionItems, CONTENT_PLACEHOLDER_IMAGE, section);
    return;
  }

  renderPublicGallerySection("galleryGrid", sectionItems);
}

function renderPublicCardSection(containerId, items, fallbackImage, section) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<div class="public-dynamic-empty">No items added yet.</div>`;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const factsHtml = Array.isArray(item.facts) && item.facts.length
        ? `
          <div class="public-content-facts">
            ${item.facts
              .map(
                (fact) =>
                  `<div><strong>${escapeHtml(fact.label)}:</strong> ${escapeHtml(fact.value)}</div>`
              )
              .join("")}
          </div>
        `
        : "";

      return `
        <article class="bg-white rounded-lg shadow-md overflow-hidden transition duration-300 hover:shadow-xl public-dynamic-card">
          <img src="${escapeHtml(normalizeImageSrc(item.imageUrl, fallbackImage))}" alt="${escapeHtml(item.altText || item.title || "Homepage content image")}" />
          <div class="p-6">
            <h3 class="text-lg font-bold text-gray-800">${escapeHtml(item.title || "Untitled")}</h3>
            ${item.subtitle ? `<p class="text-sm text-gray-500 font-semibold">${escapeHtml(item.subtitle)}</p>` : ""}
            ${factsHtml}
            ${item.description ? `<p class="mt-3 text-gray-600">${escapeHtml(item.description)}</p>` : ""}
            ${section !== "national-camps" && item.highlightText ? `<p class="public-content-highlight">${escapeHtml(item.highlightText)}</p>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderPublicGallerySection(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<div class="public-dynamic-empty">No gallery images added yet.</div>`;
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <article class="public-gallery-card">
          <img
            src="${escapeHtml(normalizeImageSrc(item.imageUrl, GALLERY_PLACEHOLDER_IMAGE))}"
            alt="${escapeHtml(item.altText || item.title || "Student gallery image")}"
            data-zoomable-gallery-image="true"
          />
          ${item.title ? `<p class="public-gallery-caption">${escapeHtml(item.title)}</p>` : ""}
        </article>
      `
    )
    .join("");
}

function setupContentManager(token) {
  const form = document.getElementById("contentItemForm");
  const cancelButton = document.getElementById("contentCancelEditBtn");
  const sectionSelect = document.getElementById("contentSection");
  const toggleAssetsButton = document.getElementById("contentToggleAssetsBtn");
  const sectionFilter = document.getElementById("adminContentSectionFilter");
  const searchInput = document.getElementById("adminContentSearchInput");

  if (!form || form.dataset.bound === "true") {
    return;
  }

  form.dataset.bound = "true";
  updateContentFormBySection(sectionSelect?.value || "achievements");
  setAssetsPanelVisibility(false);

  if (sectionSelect) {
    sectionSelect.addEventListener("change", () => {
      updateContentFormBySection(sectionSelect.value);
    });
  }

  if (toggleAssetsButton) {
    toggleAssetsButton.addEventListener("click", () => {
      setAssetsPanelVisibility(!adminContentAssetsVisible);
    });
  }

  if (sectionFilter) {
    sectionFilter.addEventListener("change", () => {
      adminContentFilterState.section = sectionFilter.value;
      renderAdminContentList();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      adminContentFilterState.query = searchInput.value;
      renderAdminContentList();
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const contentId = document.getElementById("contentItemId").value.trim();
    const formData = new FormData();

    formData.append("section", document.getElementById("contentSection").value);
    formData.append("title", document.getElementById("contentTitle").value.trim());
    formData.append("subtitle", document.getElementById("contentSubtitle").value.trim());
    if (document.getElementById("contentSection").value !== "national-camps") {
      formData.append("highlightText", document.getElementById("contentHighlight").value.trim());
    }
    formData.append("altText", document.getElementById("contentAltText").value.trim());
    formData.append("sortOrder", document.getElementById("contentSortOrder").value || "0");
    formData.append("imageUrl", document.getElementById("contentImageUrl").value.trim());
    formData.append(
      "facts",
      JSON.stringify(parseFactsInput(document.getElementById("contentFacts").value))
    );

    const imageFile = document.getElementById("contentImageFile").files[0];
    if (imageFile) {
      formData.append("image", imageFile);
    }

    const method = contentId ? "PUT" : "POST";
    const endpoint = contentId ? `${API_BASE}/content/${contentId}` : `${API_BASE}/content`;

    try {
      const res = await fetch(endpoint, {
        method,
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const result = await res.json();
      const messageElement = document.getElementById("contentMessage");
      messageElement.textContent = result.message || "Request complete.";
      messageElement.style.color = res.ok ? "green" : "red";

      if (!res.ok) {
        return;
      }

      resetContentManagerForm();
      await loadAdminContentList(token);
      await loadPublicHomepageContent();
    } catch (error) {
      const messageElement = document.getElementById("contentMessage");
      messageElement.textContent = "Error saving homepage content.";
      messageElement.style.color = "red";
    }
  });

  cancelButton.addEventListener("click", resetContentManagerForm);
}

async function loadAdminContentList(token) {
  const container = document.getElementById("adminContentList");
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/content`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const items = await res.json();

    if (!res.ok) {
      container.innerHTML = `<p>${escapeHtml(items.message || "Failed to load homepage content.")}</p>`;
      return;
    }

    homepageContentCache = Array.isArray(items) ? items : [];
    updateContentSummaryCounts(homepageContentCache);

    if (homepageContentCache.length === 0) {
      container.innerHTML = "<p>No homepage content added yet.</p>";
      return;
    }
    renderAdminContentList();
  } catch (error) {
    container.innerHTML = "<p>Error loading homepage content.</p>";
  }
}

function renderAdminContentList() {
  const container = document.getElementById("adminContentList");
  if (!container) {
    return;
  }

  if (homepageContentCache.length === 0) {
    container.innerHTML = "<p>No homepage content added yet.</p>";
    return;
  }

  const filteredItems = getFilteredAdminContentItems();

  if (filteredItems.length === 0) {
    container.innerHTML =
      '<div class="public-dynamic-empty">No assets match the current filter.</div>';
    return;
  }

  container.innerHTML = filteredItems
    .map(
      (item) => `
        <div class="admin-content-item">
          <img class="admin-content-thumb" src="${escapeHtml(
            normalizeImageSrc(
              item.imageUrl,
              item.section === "gallery" ? GALLERY_PLACEHOLDER_IMAGE : CONTENT_PLACEHOLDER_IMAGE
            )
          )}" alt="${escapeHtml(item.altText || item.title || "Homepage content image")}" />
          <div class="admin-content-body">
            <span class="content-badge">${escapeHtml(getSectionLabel(item.section))}</span>
            <h4>${escapeHtml(item.title || "Untitled")}</h4>
            ${item.subtitle ? `<p>${escapeHtml(item.subtitle)}</p>` : ""}
            ${item.description ? `<p style="margin-top:8px;">${escapeHtml(item.description)}</p>` : ""}
            ${
              item.section !== "gallery" && Array.isArray(item.facts) && item.facts.length
                ? `<div class="admin-content-meta">${item.facts
                    .map(
                      (fact) =>
                        `<div><strong>${escapeHtml(fact.label)}:</strong> ${escapeHtml(fact.value)}</div>`
                    )
                    .join("")}</div>`
                : ""
            }
            ${item.section !== "national-camps" && item.highlightText ? `<p class="public-content-highlight">${escapeHtml(item.highlightText)}</p>` : ""}
          </div>
          <div class="admin-content-actions">
            <button type="button" onclick="startEditContentItem('${item._id}')">Edit</button>
            <button type="button" class="delete-action" onclick="deleteContentItem('${item._id}')">Delete</button>
          </div>
        </div>
      `
    )
    .join("");
}

function startEditContentItem(itemId) {
  const item = homepageContentCache.find((entry) => entry._id === itemId);
  if (!item) {
    return;
  }

  document.getElementById("contentItemId").value = item._id;
  document.getElementById("contentSection").value = item.section;
  document.getElementById("contentTitle").value = item.title || "";
  document.getElementById("contentSubtitle").value = item.subtitle || "";
  document.getElementById("contentFacts").value = factsToTextareaValue(item.facts);
  document.getElementById("contentHighlight").value = item.section === "national-camps" ? "" : (item.highlightText || "");
  document.getElementById("contentAltText").value = item.altText || "";
  document.getElementById("contentSortOrder").value = item.sortOrder ?? 0;
  document.getElementById("contentImageUrl").value = item.imageUrl || "";
  document.getElementById("contentSubmitBtn").textContent = "Update Content";
  document.getElementById("contentCancelEditBtn").classList.remove("hidden");
  updateContentFormBySection(item.section);
  setAssetsPanelVisibility(true);

  const messageElement = document.getElementById("contentMessage");
  if (messageElement) {
    messageElement.textContent = `Editing ${getSectionLabel(item.section)} item.`;
    messageElement.style.color = "#165fa6";
  }

  document.getElementById("contentItemForm").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function deleteContentItem(itemId) {
  const token = localStorage.getItem("token");
  if (!token) {
    return;
  }

  if (!confirm("Delete this homepage content item?")) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/content/${itemId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const result = await res.json();

    if (!res.ok) {
      alert(result.message || "Delete failed.");
      return;
    }

    await loadAdminContentList(token);
    await loadPublicHomepageContent();
    resetContentManagerForm();
  } catch (error) {
    alert("Error deleting homepage content.");
  }
}

function resetContentManagerForm() {
  const form = document.getElementById("contentItemForm");
  if (!form) {
    return;
  }

  form.reset();
  document.getElementById("contentItemId").value = "";
  document.getElementById("contentSortOrder").value = "0";
  document.getElementById("contentSubmitBtn").textContent = "Add Content";
  document.getElementById("contentCancelEditBtn").classList.add("hidden");
  updateContentFormBySection(document.getElementById("contentSection")?.value || "achievements");

  const messageElement = document.getElementById("contentMessage");
  if (messageElement) {
    messageElement.textContent = "";
  }
}
