const API_BASE = "/api";

function showMessage(msg, color = "green") {
  const box = document.getElementById("messageBox");
  if (box) {
    box.textContent = msg || "";
    box.style.color = color;
  }
}

function togglePassword(inputId) {
  const passwordInput = document.getElementById(inputId);
  if (passwordInput) {
    passwordInput.type = passwordInput.type === "password" ? "text" : "password";
  }
}

function resetForgotPasswordSteps() {
  const s1 = document.getElementById("forgotStep1");
  const s2 = document.getElementById("forgotStep2");
  const s3 = document.getElementById("forgotStep3");
  if (s1) s1.hidden = false;
  if (s2) s2.hidden = true;
  if (s3) s3.hidden = true;

  const loginIdInput = document.getElementById("forgotLoginId");
  const dobInput = document.getElementById("forgotDob");
  const sendBtn = document.getElementById("sendOtpBtn");
  if (loginIdInput) loginIdInput.disabled = false;
  if (dobInput) dobInput.disabled = false;
  if (sendBtn) {
    sendBtn.style.display = "block";
    sendBtn.disabled = false;
    sendBtn.textContent = "Send OTP";
  }

  const otpInput = document.getElementById("forgotOtp");
  const verifyBtn = document.getElementById("verifyOtpBtn");
  if (otpInput) {
    otpInput.value = "";
    otpInput.disabled = false;
  }
  if (verifyBtn) {
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify OTP";
  }

  const newPass = document.getElementById("forgotNewPassword");
  if (newPass) newPass.value = "";
  const confirmPass = document.getElementById("forgotConfirmPassword");
  if (confirmPass) confirmPass.value = "";

  const status = document.getElementById("forgotOtpStatus");
  if (status) {
    status.hidden = true;
    status.textContent = "";
  }

  const instruction = document.getElementById("forgotInstruction");
  if (instruction) {
    instruction.textContent = "Confirm your details (Email/Regimental No and Date of Birth) to request an OTP.";
  }
}

function openForgotPasswordPanel() {
  const loginForm = document.getElementById("studentLoginForm");
  const toggle = document.getElementById("forgotPasswordToggle");
  const panel = document.getElementById("forgotPasswordPanel");

  if (loginForm) loginForm.hidden = true;
  if (toggle) toggle.hidden = true;
  if (panel) panel.hidden = false;

  resetForgotPasswordSteps();

  const studentLoginId = document.getElementById("studentLoginId");
  const forgotLoginId = document.getElementById("forgotLoginId");
  if (studentLoginId && forgotLoginId) {
    forgotLoginId.value = studentLoginId.value.trim();
  }
  showMessage("", "green");
}

function closeForgotPasswordPanel() {
  const panel = document.getElementById("forgotPasswordPanel");
  const loginForm = document.getElementById("studentLoginForm");
  const toggle = document.getElementById("forgotPasswordToggle");
  const forgotForm = document.getElementById("forgotPasswordForm");

  if (panel) panel.hidden = true;
  if (loginForm) loginForm.hidden = false;
  if (toggle) toggle.hidden = false;
  if (forgotForm) forgotForm.reset();

  resetForgotPasswordSteps();
  showMessage("", "green");
}

function showTab(tabId) {
  try {
    closeForgotPasswordPanel();
  } catch (_) {}
  showMessage("", "green");

  document.querySelectorAll(".form-section").forEach((section) => {
    section.classList.remove("active");
    section.style.display = "none";
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  const targetSection = document.getElementById(tabId);
  if (targetSection) {
    targetSection.classList.add("active");
    targetSection.style.display = "block";
  }

  const clickedBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`) ||
                     Array.from(document.querySelectorAll(".tab-btn")).find((btn) =>
                       btn.getAttribute("onclick")?.includes(tabId)
                     );

  if (clickedBtn) {
    clickedBtn.classList.add("active");
  }
}

// Make functions explicitly globally accessible
window.showTab = showTab;
window.togglePassword = togglePassword;

document.addEventListener("DOMContentLoaded", () => {
  const forgotToggle = document.getElementById("forgotPasswordToggle");
  const forgotCancel = document.getElementById("forgotPasswordCancel");
  if (forgotToggle) forgotToggle.addEventListener("click", openForgotPasswordPanel);
  if (forgotCancel) forgotCancel.addEventListener("click", closeForgotPasswordPanel);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = btn.dataset.tab || (btn.getAttribute("onclick")?.match(/showTab\('([^']+)'\)/) || [])[1];
      if (tabId) {
        showTab(tabId);
      }
    });
  });

  const studentLoginForm = document.getElementById("studentLoginForm");
  if (studentLoginForm) {
    studentLoginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const studentLoginId = document.getElementById("studentLoginId")?.value.trim() || "";
      const password = document.getElementById("studentLoginPassword")?.value || "";

      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loginId: studentLoginId, password })
        });
        const result = await res.json();
        if (res.ok && result.user?.role === "student") {
          localStorage.setItem("token", result.token);
          localStorage.removeItem("user");
          showMessage("Student login successful", "green");
          setTimeout(() => { window.location.href = "index.html"; }, 1000);
        } else if (res.ok && result.user?.role === "admin") {
          showMessage("Admin login detected. Please use the admin login tab.", "orange");
        } else {
          showMessage(result.message || "Login failed", "red");
        }
      } catch (error) {
        showMessage("Something went wrong during login", "red");
      }
    });
  }

  const studentRegisterForm = document.getElementById("studentRegisterForm");
  if (studentRegisterForm) {
    studentRegisterForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = {
        regimentalNo: document.getElementById("regimentalNo")?.value.trim() || "",
        name: document.getElementById("name")?.value.trim() || "",
        fatherName: document.getElementById("fatherName")?.value.trim() || "",
        dob: document.getElementById("dob")?.value || "",
        email: document.getElementById("email")?.value.trim() || "",
        password: document.getElementById("studentRegisterPassword")?.value || ""
      };

      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        showMessage(result.message || "Registration response received", res.ok ? "green" : "red");
      } catch (error) {
        showMessage("Something went wrong during registration", "red");
      }
    });
  }

  const adminLoginForm = document.getElementById("adminLoginForm");
  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = {
        loginId: document.getElementById("adminLoginId")?.value.trim() || "",
        password: document.getElementById("adminLoginPassword")?.value || ""
      };
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (res.ok && result.user?.role === "admin") {
          localStorage.setItem("token", result.token);
          localStorage.setItem("user", JSON.stringify(result.user));
          showMessage("Admin login successful. Redirecting...", "green");
          setTimeout(() => { window.location.href = "index.html"; }, 1000);
        } else {
          showMessage(result.message || "Invalid admin login", "red");
        }
      } catch (error) {
        showMessage("Something went wrong during admin login", "red");
      }
    });
  }
});
