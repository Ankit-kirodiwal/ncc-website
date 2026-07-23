const API_BASE = "/api";
const messageBox = document.getElementById("messageBox");
const forgotPasswordPanel = document.getElementById("forgotPasswordPanel");
const forgotPasswordToggle = document.getElementById("forgotPasswordToggle");
const forgotPasswordCancel = document.getElementById("forgotPasswordCancel");
const studentLoginIdInput = document.getElementById("studentLoginId");
const forgotLoginIdInput = document.getElementById("forgotLoginId");
const forgotDobInput = document.getElementById("forgotDob");
const forgotOtpStatus = document.getElementById("forgotOtpStatus");
const sendOtpBtn = document.getElementById("sendOtpBtn");
let forgotOtpRequested = false;

function showTab(tabId) {
  document.querySelectorAll(".form-section").forEach((section) => {
    section.classList.remove("active");
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  document.getElementById(tabId).classList.add("active");

  const clickedBtn = Array.from(document.querySelectorAll(".tab-btn")).find((btn) =>
    btn.getAttribute("onclick")?.includes(tabId)
  );

  if (clickedBtn) {
    clickedBtn.classList.add("active");
  }
}

function showMessage(msg, color = "green") {
  messageBox.textContent = msg;
  messageBox.style.color = color;
}

function togglePassword(inputId) {
  const passwordInput = document.getElementById(inputId);

  if (!passwordInput) {
    return;
  }

  passwordInput.type = passwordInput.type === "password" ? "text" : "password";
}

function openForgotPasswordPanel() {
  forgotPasswordPanel.hidden = false;
  forgotLoginIdInput.value = studentLoginIdInput.value.trim();
  forgotOtpRequested = false;
  forgotOtpStatus.hidden = true;
  forgotOtpStatus.textContent = "";
  showMessage("Enter your details and request an OTP.", "#0f62d6");
}

function closeForgotPasswordPanel() {
  forgotPasswordPanel.hidden = true;
  document.getElementById("forgotPasswordForm").reset();
  forgotOtpRequested = false;
  forgotOtpStatus.hidden = true;
  forgotOtpStatus.textContent = "";
}

forgotPasswordToggle.addEventListener("click", openForgotPasswordPanel);
forgotPasswordCancel.addEventListener("click", closeForgotPasswordPanel);

sendOtpBtn.addEventListener("click", async () => {
  const loginId = forgotLoginIdInput.value.trim();
  const dob = forgotDobInput.value;

  if (!loginId || !dob) {
    showMessage("Enter email or regimental no and date of birth first.", "red");
    return;
  }

  sendOtpBtn.disabled = true;
  sendOtpBtn.textContent = "Sending OTP...";

  try {
    const res = await fetch(`${API_BASE}/auth/forgot-password/request-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ loginId, dob })
    });

    const result = await res.json();

    if (!res.ok) {
      showMessage(result.message || "Unable to send OTP.", "red");
      return;
    }

    forgotOtpRequested = true;
    forgotOtpStatus.hidden = false;
    forgotOtpStatus.textContent = `OTP sent to ${result.maskedEmail || "your registered email"}.`;
    showMessage(result.message || "OTP sent successfully.", "green");
  } catch (error) {
    showMessage("Something went wrong while sending OTP", "red");
  } finally {
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = "Send OTP";
  }
});

document.getElementById("studentRegisterForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    regimentalNo: document.getElementById("regimentalNo").value.trim(),
    name: document.getElementById("name").value.trim(),
    fatherName: document.getElementById("fatherName").value.trim(),
    dob: document.getElementById("dob").value,
    email: document.getElementById("email").value.trim(),
    password: document.getElementById("studentRegisterPassword").value
  };

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    showMessage(result.message, res.ok ? "green" : "red");
  } catch (error) {
    showMessage("Something went wrong during registration", "red");
  }
});

document.getElementById("studentLoginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    loginId: studentLoginIdInput.value.trim(),
    password: document.getElementById("studentLoginPassword").value
  };

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (res.ok && result.user.role === "student") {
      sessionStorage.setItem("token", result.token);
      sessionStorage.setItem("user", JSON.stringify(result.user));
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      showMessage("Student login successful", "green");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1000);
    } else if (res.ok && result.user.role === "admin") {
      showMessage("Admin login detected. Please use the admin login tab.", "orange");
    } else {
      showMessage(result.message || "Login failed", "red");
    }
  } catch (error) {
    showMessage("Something went wrong during login", "red");
  }
});

document.getElementById("forgotPasswordForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const loginId = forgotLoginIdInput.value.trim();
  const dob = document.getElementById("forgotDob").value;
  const otp = document.getElementById("forgotOtp").value.trim();
  const newPassword = document.getElementById("forgotNewPassword").value;
  const confirmPassword = document.getElementById("forgotConfirmPassword").value;

  if (!forgotOtpRequested) {
    showMessage("Please request OTP first.", "red");
    return;
  }

  if (otp.length !== 6) {
    showMessage("Enter the 6-digit OTP sent to your email.", "red");
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage("New password and confirm password must match.", "red");
    return;
  }

  if (newPassword.length < 6) {
    showMessage("New password must be at least 6 characters.", "red");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/forgot-password/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        loginId,
        dob,
        otp,
        newPassword
      })
    });

    const result = await res.json();

    if (!res.ok) {
      showMessage(result.message || "Unable to reset password.", "red");
      return;
    }

    studentLoginIdInput.value = loginId;
    closeForgotPasswordPanel();
    showMessage(result.message || "Password reset successful. Please log in.", "green");
  } catch (error) {
    showMessage("Something went wrong during password reset", "red");
  }
});

document.getElementById("adminLoginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    loginId: document.getElementById("adminLoginId").value.trim(),
    password: document.getElementById("adminLoginPassword").value
  };

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (res.ok && result.user.role === "admin") {
      sessionStorage.setItem("token", result.token);
      sessionStorage.setItem("user", JSON.stringify(result.user));
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      showMessage("Admin login successful", "green");
      setTimeout(() => {
        window.location.href = "admin/erp2.html";
      }, 1000);
    } else {
      showMessage(result.message || "Invalid admin login", "red");
    }
  } catch (error) {
    showMessage("Something went wrong during admin login", "red");
  }
});
