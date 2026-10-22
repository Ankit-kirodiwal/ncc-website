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

let forgotOtpRequested = false;
let forgotOtpVerified = false;

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

  forgotOtpRequested = false;
  forgotOtpVerified = false;

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

async function parseResponseSafe(res) {
  try {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        return { message: "Server is currently starting up on Render. Please wait ~15 seconds and try again." };
      }
      return { message: text || `Server responded with status ${res.status}` };
    }
  } catch (err) {
    return { message: "Network connection error. Please check your connection." };
  }
}

async function handleSendOtp() {
  const forgotVal = (document.getElementById("forgotLoginId")?.value || "").trim();
  const studentVal = (document.getElementById("studentLoginId")?.value || "").trim();
  const loginId = forgotVal || studentVal;
  const dob = (document.getElementById("forgotDob")?.value || "").trim();

  const sendBtn = document.getElementById("sendOtpBtn");
  const resendBtn = document.getElementById("resendOtpBtn");
  const forgotStatus = document.getElementById("forgotOtpStatus");
  const forgotInstruction = document.getElementById("forgotInstruction");
  const forgotStep2 = document.getElementById("forgotStep2");
  const forgotLoginIdInput = document.getElementById("forgotLoginId");
  const forgotDobInput = document.getElementById("forgotDob");

  if (!loginId || !dob) {
    showMessage("Please enter your Email or Regimental No and Date of Birth first.", "red");
    return;
  }

  if (forgotLoginIdInput) forgotLoginIdInput.value = loginId;

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending OTP...";
  }
  if (resendBtn) {
    resendBtn.disabled = true;
    resendBtn.textContent = "Sending...";
  }

  showMessage("Sending OTP, please wait...", "orange");

  try {
    const res = await fetch(`${API_BASE}/auth/forgot-password/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, email: loginId, regimentalNo: loginId, dob })
    });

    const result = await parseResponseSafe(res);

    if (!res.ok) {
      showMessage(result.message || "Unable to send OTP.", "red");
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = "Send OTP";
      }
      if (resendBtn) {
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend OTP";
      }
      return;
    }

    forgotOtpRequested = true;
    if (forgotLoginIdInput) forgotLoginIdInput.disabled = true;
    if (forgotDobInput) forgotDobInput.disabled = true;
    if (sendBtn) sendBtn.style.display = "none";

    if (forgotStep2) forgotStep2.hidden = false;
    if (forgotInstruction) {
      forgotInstruction.textContent = "Enter the 6-digit OTP sent to your registered email.";
    }
    if (forgotStatus) {
      forgotStatus.hidden = false;
      forgotStatus.textContent = `OTP sent to ${result.maskedEmail || "your registered email"}.`;
    }
    showMessage(result.message || "OTP sent successfully to your email.", "green");
  } catch (error) {
    console.error("Error requesting OTP:", error);
    showMessage("Failed to connect to server while requesting OTP.", "red");
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send OTP";
    }
  } finally {
    if (resendBtn) {
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend OTP";
    }
  }
}

async function handleVerifyOtp() {
  const loginId = (document.getElementById("forgotLoginId")?.value || "").trim();
  const dob = (document.getElementById("forgotDob")?.value || "").trim();
  const otp = (document.getElementById("forgotOtp")?.value || "").trim();

  const verifyBtn = document.getElementById("verifyOtpBtn");
  const forgotOtpInput = document.getElementById("forgotOtp");
  const forgotStep3 = document.getElementById("forgotStep3");
  const forgotInstruction = document.getElementById("forgotInstruction");
  const forgotStatus = document.getElementById("forgotOtpStatus");

  if (!loginId || !dob) {
    showMessage("Please confirm your details first.", "red");
    return;
  }
  if (!forgotOtpRequested) {
    showMessage("Please request an OTP first.", "red");
    return;
  }
  if (otp.length !== 6) {
    showMessage("Please enter the 6-digit OTP sent to your email.", "red");
    return;
  }

  if (verifyBtn) {
    verifyBtn.disabled = true;
    verifyBtn.textContent = "Verifying...";
  }

  try {
    const res = await fetch(`${API_BASE}/auth/forgot-password/verify-otp-only`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, dob, otp })
    });

    const result = await parseResponseSafe(res);

    if (!res.ok) {
      showMessage(result.message || "Invalid or expired OTP.", "red");
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = "Verify OTP";
      }
      return;
    }

    forgotOtpVerified = true;
    if (forgotOtpInput) forgotOtpInput.disabled = true;
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.textContent = "Verified ✓";
    }

    if (forgotStep3) forgotStep3.hidden = false;
    if (forgotInstruction) {
      forgotInstruction.textContent = "OTP verified! Please enter your new password.";
    }
    if (forgotStatus) {
      forgotStatus.hidden = false;
      forgotStatus.textContent = "✓ OTP Verified successfully.";
    }
    showMessage("OTP verified successfully. Please enter your new password.", "green");
  } catch (error) {
    console.error("Error verifying OTP:", error);
    showMessage("Failed to connect to server during OTP verification.", "red");
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Verify OTP";
    }
  }
}

function handleChangeDetails() {
  const forgotLoginIdInput = document.getElementById("forgotLoginId");
  const forgotDobInput = document.getElementById("forgotDob");
  const sendBtn = document.getElementById("sendOtpBtn");
  const forgotStep2 = document.getElementById("forgotStep2");
  const forgotStep3 = document.getElementById("forgotStep3");
  const forgotStatus = document.getElementById("forgotOtpStatus");
  const forgotInstruction = document.getElementById("forgotInstruction");

  if (forgotLoginIdInput) forgotLoginIdInput.disabled = false;
  if (forgotDobInput) forgotDobInput.disabled = false;
  if (sendBtn) {
    sendBtn.style.display = "block";
    sendBtn.disabled = false;
    sendBtn.textContent = "Send OTP";
  }
  if (forgotStep2) forgotStep2.hidden = true;
  if (forgotStep3) forgotStep3.hidden = true;
  forgotOtpRequested = false;
  forgotOtpVerified = false;
  if (forgotStatus) {
    forgotStatus.hidden = true;
    forgotStatus.textContent = "";
  }
  if (forgotInstruction) {
    forgotInstruction.textContent = "Confirm your details (Email/Regimental No and Date of Birth) to request an OTP.";
  }
}

async function handleResetPasswordSubmit(e) {
  e.preventDefault();

  const loginId = (document.getElementById("forgotLoginId")?.value || "").trim();
  const dob = (document.getElementById("forgotDob")?.value || "").trim();
  const otp = (document.getElementById("forgotOtp")?.value || "").trim();
  const newPassword = document.getElementById("forgotNewPassword")?.value || "";
  const confirmPassword = document.getElementById("forgotConfirmPassword")?.value || "";
  const resetBtn = document.getElementById("resetPasswordSubmitBtn");

  if (!forgotOtpRequested) {
    showMessage("Please request an OTP first.", "red");
    return;
  }
  if (!forgotOtpVerified) {
    showMessage("Please click 'Verify OTP' to verify your OTP first.", "red");
    return;
  }
  if (!newPassword || !confirmPassword) {
    showMessage("Please enter your new password and confirm it.", "red");
    return;
  }
  if (newPassword !== confirmPassword) {
    showMessage("New password and confirm password do not match.", "red");
    return;
  }
  if (newPassword.length < 6) {
    showMessage("New password must be at least 6 characters.", "red");
    return;
  }

  if (resetBtn) {
    resetBtn.disabled = true;
    resetBtn.textContent = "Resetting Password...";
  }

  try {
    const res = await fetch(`${API_BASE}/auth/forgot-password/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, dob, otp, newPassword })
    });

    const result = await parseResponseSafe(res);

    if (!res.ok) {
      showMessage(result.message || "Unable to reset password.", "red");
      if (resetBtn) {
        resetBtn.disabled = false;
        resetBtn.textContent = "Reset Password";
      }
      return;
    }

    const studentLoginIdInput = document.getElementById("studentLoginId");
    if (studentLoginIdInput) studentLoginIdInput.value = loginId;
    closeForgotPasswordPanel();
    showMessage(result.message || "Password reset successful. Please log in with your new password.", "green");
  } catch (error) {
    console.error("Error resetting password:", error);
    showMessage("Something went wrong during password reset", "red");
    if (resetBtn) {
      resetBtn.disabled = false;
      resetBtn.textContent = "Reset Password";
    }
  }
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

  const sendOtpBtn = document.getElementById("sendOtpBtn");
  if (sendOtpBtn) sendOtpBtn.addEventListener("click", handleSendOtp);

  const resendOtpBtn = document.getElementById("resendOtpBtn");
  if (resendOtpBtn) resendOtpBtn.addEventListener("click", handleSendOtp);

  const verifyOtpBtn = document.getElementById("verifyOtpBtn");
  if (verifyOtpBtn) verifyOtpBtn.addEventListener("click", handleVerifyOtp);

  const changeDetailsBtn = document.getElementById("changeDetailsBtn");
  if (changeDetailsBtn) changeDetailsBtn.addEventListener("click", handleChangeDetails);

  const forgotPasswordForm = document.getElementById("forgotPasswordForm");
  if (forgotPasswordForm) forgotPasswordForm.addEventListener("submit", handleResetPasswordSubmit);

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
