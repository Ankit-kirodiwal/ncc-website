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
const forgotStep1 = document.getElementById("forgotStep1");
const forgotStep2 = document.getElementById("forgotStep2");
const forgotStep3 = document.getElementById("forgotStep3");
const forgotInstruction = document.getElementById("forgotInstruction");
const forgotOtpInput = document.getElementById("forgotOtp");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const resendOtpBtn = document.getElementById("resendOtpBtn");
const changeDetailsBtn = document.getElementById("changeDetailsBtn");

let forgotOtpRequested = false;
let forgotOtpVerified = false;

function showTab(tabId) {
  closeForgotPasswordPanel();
  showMessage("", "green");

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

function resetForgotPasswordSteps() {
  forgotStep1.hidden = false;
  forgotStep2.hidden = true;
  forgotStep3.hidden = true;
  
  forgotLoginIdInput.disabled = false;
  forgotDobInput.disabled = false;
  sendOtpBtn.style.display = "block";
  sendOtpBtn.disabled = false;
  sendOtpBtn.textContent = "Send OTP";

  if (forgotOtpInput) {
    forgotOtpInput.value = "";
    forgotOtpInput.disabled = false;
  }
  if (verifyOtpBtn) {
    verifyOtpBtn.disabled = false;
    verifyOtpBtn.textContent = "Verify OTP";
  }

  document.getElementById("forgotNewPassword").value = "";
  document.getElementById("forgotConfirmPassword").value = "";

  forgotOtpRequested = false;
  forgotOtpVerified = false;

  forgotOtpStatus.hidden = true;
  forgotOtpStatus.textContent = "";

  if (forgotInstruction) {
    forgotInstruction.textContent = "Confirm your details (Email/Regimental No and Date of Birth) to request an OTP.";
  }
}

const studentLoginForm = document.getElementById("studentLoginForm");

function openForgotPasswordPanel() {
  if (studentLoginForm) studentLoginForm.hidden = true;
  if (forgotPasswordToggle) forgotPasswordToggle.hidden = true;
  forgotPasswordPanel.hidden = false;
  resetForgotPasswordSteps();
  forgotLoginIdInput.value = studentLoginIdInput.value.trim();
  showMessage("", "green");
}

function closeForgotPasswordPanel() {
  forgotPasswordPanel.hidden = true;
  if (studentLoginForm) studentLoginForm.hidden = false;
  if (forgotPasswordToggle) forgotPasswordToggle.hidden = false;
  document.getElementById("forgotPasswordForm").reset();
  resetForgotPasswordSteps();
  showMessage("", "green");
}

forgotPasswordToggle.addEventListener("click", openForgotPasswordPanel);
forgotPasswordCancel.addEventListener("click", closeForgotPasswordPanel);

async function handleSendOtp() {
  const forgotVal = (document.getElementById("forgotLoginId")?.value || "").trim();
  const studentVal = (document.getElementById("studentLoginId")?.value || "").trim();
  const loginId = forgotVal || studentVal;

  const dobInput = document.getElementById("forgotDob");
  const dob = dobInput ? dobInput.value : "";

  if (!loginId || !dob) {
    showMessage("Enter email or regimental no and date of birth first.", "red");
    return;
  }

  // Synchronize both inputs
  const forgotLoginIdElem = document.getElementById("forgotLoginId");
  if (forgotLoginIdElem) forgotLoginIdElem.value = loginId;

  sendOtpBtn.disabled = true;
  sendOtpBtn.textContent = "Sending OTP...";

  try {
    const res = await fetch(`${API_BASE}/auth/forgot-password/request-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ loginId, email: loginId, regimentalNo: loginId, dob })
    });

    const result = await res.json();

    if (!res.ok) {
      showMessage(result.message || "Unable to send OTP.", "red");
      return;
    }

    forgotOtpRequested = true;
    forgotLoginIdInput.disabled = true;
    forgotDobInput.disabled = true;
    sendOtpBtn.style.display = "none";

    forgotStep2.hidden = false;
    if (forgotInstruction) {
      forgotInstruction.textContent = "Enter the 6-digit OTP sent to your registered email.";
    }

    forgotOtpStatus.hidden = false;
    forgotOtpStatus.textContent = `OTP sent to ${result.maskedEmail || "your registered email"}.`;
    showMessage(result.message || "OTP sent successfully.", "green");
  } catch (error) {
    showMessage("Something went wrong while sending OTP", "red");
  } finally {
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = "Send OTP";
  }
}

sendOtpBtn.addEventListener("click", handleSendOtp);

if (resendOtpBtn) {
  resendOtpBtn.addEventListener("click", handleSendOtp);
}

if (changeDetailsBtn) {
  changeDetailsBtn.addEventListener("click", () => {
    forgotLoginIdInput.disabled = false;
    forgotDobInput.disabled = false;
    sendOtpBtn.style.display = "block";
    forgotStep2.hidden = true;
    forgotStep3.hidden = true;
    forgotOtpRequested = false;
    forgotOtpVerified = false;
    forgotOtpStatus.hidden = true;
    if (forgotInstruction) {
      forgotInstruction.textContent = "Confirm your details (Email/Regimental No and Date of Birth) to request an OTP.";
    }
  });
}

if (verifyOtpBtn) {
  verifyOtpBtn.addEventListener("click", async () => {
    const loginId = forgotLoginIdInput.value.trim();
    const dob = forgotDobInput.value;
    const otp = forgotOtpInput.value.trim();

    if (!loginId || !dob) {
      showMessage("Please confirm your details first.", "red");
      return;
    }

    if (!forgotOtpRequested) {
      showMessage("Please request OTP first.", "red");
      return;
    }

    if (otp.length !== 6) {
      showMessage("Enter valid 6-digit OTP.", "red");
      return;
    }

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.textContent = "Verifying...";

    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password/verify-otp-only`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ loginId, dob, otp })
      });

      const result = await res.json();

      if (!res.ok) {
        showMessage(result.message || "Invalid OTP.", "red");
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.textContent = "Verify OTP";
        return;
      }

      forgotOtpVerified = true;
      forgotOtpInput.disabled = true;
      verifyOtpBtn.disabled = true;
      verifyOtpBtn.textContent = "Verified ✓";

      forgotStep3.hidden = false;
      if (forgotInstruction) {
        forgotInstruction.textContent = "OTP verified! Please set your new password.";
      }

      forgotOtpStatus.hidden = false;
      forgotOtpStatus.textContent = "✓ OTP Verified successfully.";
      showMessage("OTP verified successfully. Please enter your new password.", "green");
    } catch (error) {
      showMessage("Something went wrong during OTP verification", "red");
      verifyOtpBtn.disabled = false;
      verifyOtpBtn.textContent = "Verify OTP";
    }
  });
}

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
      localStorage.setItem("token", result.token);
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

  if (!forgotOtpVerified) {
    showMessage("Please click 'Verify OTP' to verify your OTP first.", "red");
    return;
  }

  if (!newPassword || !confirmPassword) {
    showMessage("Please enter your new password.", "red");
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

  const resetBtn = document.getElementById("resetPasswordSubmitBtn");
  if (resetBtn) {
    resetBtn.disabled = true;
    resetBtn.textContent = "Resetting Password...";
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
      if (resetBtn) {
        resetBtn.disabled = false;
        resetBtn.textContent = "Reset Password";
      }
      return;
    }

    studentLoginIdInput.value = loginId;
    closeForgotPasswordPanel();
    showMessage(result.message || "Password reset successful. Please log in with your new password.", "green");
  } catch (error) {
    showMessage("Something went wrong during password reset", "red");
    if (resetBtn) {
      resetBtn.disabled = false;
      resetBtn.textContent = "Reset Password";
    }
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
      localStorage.setItem("token", result.token);
      localStorage.removeItem("user");
      showMessage("Admin login successful", "green");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1000);
    } else {
      showMessage(result.message || "Invalid admin login", "red");
    }
  } catch (error) {
    showMessage("Something went wrong during admin login", "red");
  }
});
