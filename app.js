const STORAGE_KEY = "hdu_english3_133033_progress_v2";
const AUTH_STORAGE_KEY = "hdu_english3_133033_auth_v2";
const CONFIG_STORAGE_KEY = "hdu_english3_133033_cloud_config_v2";
const TEACHER_ADMIN_EMAIL = "leviethoainam287@gmail.com";
const TEACHER_ADMIN_EMAIL_2 = "leviethoainam297@gmail.com";
const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1UW4oQ2lOoFybHKO3FTMFOpGxQFy4dGAlJAu8Wj_YDTQ/edit";

let cloudConfig = {
  appsScriptUrl: "",
  googleClientId: "",
  localWhitelist: [
    { email: "leviethoainam287@gmail.com", name: "Giảng viên Lê Viết Hoài Nam", role: "teacher", status: "active" },
    { email: "leviethoainam297@gmail.com", name: "Giảng viên Lê Viết Hoài Nam", role: "teacher", status: "active" },
    { email: "bichvn0110@gmail.com", name: "Nguyễn Thị Ngọc Bích", role: "student", status: "active" },
    { email: "hatrang3399@gmail.com", name: "Lê Trần Hà Trang", role: "student", status: "active" },
    { email: "nguyenthithuha2005ns@gmail.com", name: "Nguyễn Thị Thu Hà", role: "student", status: "active" },
    { email: "leyenvy05022005@gmail.com", name: "Lê Yến Vy", role: "student", status: "active" }
  ],
  cloudStudentsProgress: []
};

let currentUser = null;

let state = {
  currentTab: "theory",
  unitFilter: "ALL",
  writtenSubTab: "wordFormation",
  mcqAnswers: {},
  textAnswers: {},
  essays: {},
  flaggedQuestions: {},
  teacherComment: "",
  teacherGrade: ""
};

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function loadConfigAndAuth() {
  try {
    const savedCfg = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (savedCfg) {
      const parsed = JSON.parse(savedCfg);
      cloudConfig = { ...cloudConfig, ...parsed };
      if (!cloudConfig.localWhitelist.some(u => u.email === TEACHER_ADMIN_EMAIL)) {
        cloudConfig.localWhitelist.unshift({
          email: TEACHER_ADMIN_EMAIL,
          name: "Giảng viên Lê Viết Hoài Nam",
          role: "teacher",
          status: "active"
        });
      }
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("api")) {
      cloudConfig.appsScriptUrl = params.get("api").trim();
      saveCloudConfig();
    }
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (savedAuth) {
      currentUser = JSON.parse(savedAuth);
    }
  } catch (e) {}
}

function saveCloudConfig() {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cloudConfig));
  } catch (e) {}
}

function getUserStorageKey() {
  const emailKey = currentUser && currentUser.email ? currentUser.email.toLowerCase() : "guest";
  return `${STORAGE_KEY}_${emailKey}`;
}

function loadState() {
  try {
    const saved = localStorage.getItem(getUserStorageKey()) || localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state = { ...state, ...parsed };
    }
  } catch (e) {}
}

function saveState() {
  try {
    localStorage.setItem(getUserStorageKey(), JSON.stringify(state));
  } catch (e) {}
  updateProgressUI();
}

// ============================================================================
// ĐĂNG NHẬP GOOGLE & KIỂM TRA QUYỀN TRUY CẬP
// ============================================================================
function updateAuthUI() {
  const overlay = document.getElementById("auth-overlay");
  const navTeacher = document.getElementById("nav-teacher");
  const roleBadge = document.getElementById("user-role-badge");
  const nameDisp = document.getElementById("user-name-display");
  const emailDisp = document.getElementById("user-email-display");
  const fbBanner = document.getElementById("teacher-feedback-banner");
  const fbContent = document.getElementById("teacher-feedback-content");

  if (!currentUser || !currentUser.email) {
    overlay.style.display = "flex";
    initGoogleGsiButton();
    return;
  }

  overlay.style.display = "none";
  const isTeacher = currentUser.email.toLowerCase() === TEACHER_ADMIN_EMAIL;
  currentUser.role = isTeacher ? "teacher" : "student";

  nameDisp.textContent = currentUser.name || currentUser.email;
  emailDisp.textContent = `(${currentUser.email})`;
  roleBadge.textContent = isTeacher ? "GIẢNG VIÊN QUẢN TRỊ" : "HỌC VIÊN CHÍNH THỨC";
  navTeacher.style.display = isTeacher ? "inline-flex" : "none";

  if (state.teacherComment || state.teacherGrade) {
    fbBanner.classList.add("show");
    fbContent.innerHTML = `
      ${state.teacherGrade ? `<div><b>Điểm số Giảng viên đánh giá:</b> <span style="color:var(--warn); font-weight:700;">${state.teacherGrade}</span></div>` : ""}
      ${state.teacherComment ? `<div style="margin-top:2px;"><b>Lời phê:</b> ${state.teacherComment}</div>` : ""}
    `;
  } else {
    fbBanner.classList.remove("show");
  }
}

function initGoogleGsiButton() {
  if (cloudConfig.googleClientId && window.google && window.google.accounts) {
    window.google.accounts.id.initialize({
      client_id: cloudConfig.googleClientId,
      callback: handleGoogleCredentialResponse
    });
    window.google.accounts.id.renderButton(
      document.getElementById("google-gsi-container"),
      { theme: "outline", size: "large", width: 360 }
    );
  }
}

function handleGoogleCredentialResponse(response) {
  try {
    const payload = JSON.parse(atob(response.credential.split(".")[1]));
    verifyAndLoginUser(payload.email, payload.name || payload.email);
  } catch (e) {
    showAuthError("Không thể đọc thông tin tài khoản Google.");
  }
}

window.handleEmailLogin = function() {
  const emailInp = document.getElementById("login-email-input");
  const nameInp = document.getElementById("login-name-input");
  const classInp = document.getElementById("login-class-input");
  const phoneInp = document.getElementById("login-phone-input");

  const email = (emailInp.value || "").trim().toLowerCase();
  const name = (nameInp.value || "").trim() || email.split("@")[0];
  const sClass = classInp ? (classInp.value || "").trim() : "";
  const sPhone = phoneInp ? (phoneInp.value || "").trim() : "";

  if (!email || !email.includes("@")) {
    showAuthError("Vui lòng nhập đúng địa chỉ Gmail của bạn.");
    return;
  }
  if (!nameInp.value || !nameInp.value.trim()) {
    showAuthError("Vui lòng nhập họ và tên của bạn để hệ thống ghi danh.");
    return;
  }
  verifyAndLoginUser(email, name, sClass, sPhone);
};

function showAuthError(msg) {
  const el = document.getElementById("auth-error-msg");
  el.classList.add("show");
  el.innerHTML = msg;
}

async function verifyAndLoginUser(email, name, studentClass = "", phone = "") {
  const cleanEmail = email.trim().toLowerCase();
  const isTeacher = cleanEmail === TEACHER_ADMIN_EMAIL || cleanEmail === TEACHER_ADMIN_EMAIL_2;

  // 1. Tự động đồng bộ lên Google Sheets nếu có link Apps Script
  if (cloudConfig.appsScriptUrl) {
    try {
      showToast("Đang đồng bộ tài khoản...");
      const url = `${cloudConfig.appsScriptUrl}?action=auto_register&email=${encodeURIComponent(cleanEmail)}&name=${encodeURIComponent(name)}&studentClass=${encodeURIComponent(studentClass)}&phone=${encodeURIComponent(phone)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.allAllowed) cloudConfig.localWhitelist = data.allAllowed;
      if (data.allProgress) cloudConfig.cloudStudentsProgress = data.allProgress;
      saveCloudConfig();

      if (data.progress && data.progress.state && Object.keys(data.progress.state).length > 0) {
        state = { ...state, ...data.progress.state };
        state.teacherComment = data.progress.teacherComment || "";
        state.teacherGrade = data.progress.teacherGrade || "";
        saveState();
      }
    } catch (err) {
      console.warn("Cloud auto-register error:", err);
    }
  }

  // 2. Tự động tạo và kích hoạt tài khoản trong Whitelist cục bộ
  let allowedUser = cloudConfig.localWhitelist.find(u => u.email.toLowerCase() === cleanEmail);
  const nowStr = new Date().toLocaleString("vi-VN");
  if (!allowedUser) {
    allowedUser = {
      email: cleanEmail,
      name: name,
      studentClass: studentClass,
      phone: phone,
      role: isTeacher ? "teacher" : "student",
      status: "active",
      createdAt: nowStr
    };
    cloudConfig.localWhitelist.push(allowedUser);
    saveCloudConfig();
  } else {
    if (name) allowedUser.name = name;
    if (studentClass) allowedUser.studentClass = studentClass;
    if (phone) allowedUser.phone = phone;
    saveCloudConfig();
  }

  currentUser = {
    email: cleanEmail,
    name: isTeacher ? "Giảng viên Lê Viết Hoài Nam" : (allowedUser ? allowedUser.name : name),
    studentClass: studentClass || (allowedUser ? allowedUser.studentClass : ""),
    phone: phone || (allowedUser ? allowedUser.phone : ""),
    role: isTeacher ? "teacher" : "student"
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser));
  document.getElementById("auth-error-msg").classList.remove("show");
  loadState();
  if (isTeacher) state.currentTab = "teacher";
  updateAuthUI();
  updateProgressUI();
  renderCurrentTab();

  if (isTeacher) {
    showToast(`Xin chào thầy Nam! Đã đăng nhập trang quản trị.`);
  } else {
    showToast(`Chào mừng em ${currentUser.name}! Tài khoản đã được kích hoạt tự động.`);
  }
}

window.logoutUser = function() {
  currentUser = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  updateAuthUI();
};

window.pushProgressToCloud = async function(showAlert = false) {
  if (!currentUser || !currentUser.email) {
    updateAuthUI();
    return;
  }
  const st = computeStats();
  const acc = st.totalDone ? Math.round((st.totalCorrect / st.totalDone) * 100) : 0;
  const statusEl = document.getElementById("cloud-sync-status");

  const studentRecord = {
    email: currentUser.email,
    name: currentUser.name,
    updatedAt: new Date().toLocaleString("vi-VN"),
    totalDone: st.totalDone,
    totalCorrect: st.totalCorrect,
    accuracy: `${acc}%`,
    mockScore: st.mockScoreTotal,
    essaysCount: st.writing.done,
    teacherComment: state.teacherComment || "",
    teacherGrade: state.teacherGrade || "",
    state: state
  };

  const idx = cloudConfig.cloudStudentsProgress.findIndex(p => p.email.toLowerCase() === currentUser.email.toLowerCase());
  if (idx >= 0) cloudConfig.cloudStudentsProgress[idx] = studentRecord;
  else cloudConfig.cloudStudentsProgress.push(studentRecord);
  saveCloudConfig();

  if (!cloudConfig.appsScriptUrl) {
    if (statusEl) statusEl.textContent = "Đã lưu trên trình duyệt";
    if (showAlert) showToast("Đã lưu tiến độ tại máy (Chưa gắn URL Google Sheets)");
    return;
  }

  try {
    if (statusEl) statusEl.textContent = "Đang đồng bộ...";
    const res = await fetch(cloudConfig.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "save_progress",
        email: currentUser.email,
        name: currentUser.name,
        summary: {
          totalDone: st.totalDone,
          totalCorrect: st.totalCorrect,
          accuracy: acc,
          mockScore: st.mockScoreTotal,
          essaysCount: st.writing.done
        },
        state: state
      })
    });
    const data = await res.json();
    if (data.ok) {
      if (data.teacherComment !== undefined) state.teacherComment = data.teacherComment;
      if (data.teacherGrade !== undefined) state.teacherGrade = data.teacherGrade;
      saveState();
      updateAuthUI();
      if (statusEl) statusEl.textContent = `Đã đồng bộ (${data.savedAt || "vừa xong"})`;
      if (showAlert) showToast("Đã đồng bộ tiến độ & bài viết lên Google Sheets của Giảng viên");
    } else {
      if (statusEl) statusEl.textContent = "Lỗi quyền truy cập";
      if (showAlert) alert("Không thể đẩy dữ liệu: " + (data.error || "Chưa được cấp quyền"));
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = "Lỗi kết nối Sheets";
    if (showAlert) showToast("Không thể kết nối Google Sheets Web App");
  }
};

function normalizeStr(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[.?!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function speakText(text, rate = 0.95) {
  if (!("speechSynthesis" in window)) {
    alert("Trình duyệt của bạn không hỗ trợ đọc giọng nói tự động. Hãy bật hiện văn bản nghe (Transcript).");
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = rate;
  window.speechSynthesis.speak(utter);
}

function stopAudio() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function computeStats(customState) {
  const S = customState || state;
  const D = window.COURSE_DATA;

  const countMcqList = (list) => {
    let done = 0, corr = 0;
    list.forEach(q => {
      const ans = (S.mcqAnswers || {})[q.id];
      if (ans) {
        done++;
        if (ans === q.answer) corr++;
      }
    });
    return { done, corr, total: list.length };
  };

  const pronStats = countMcqList(D.pronunciationQuestions);
  const unitStats = countMcqList(D.unitMcqQuestions);
  const bGramStats = countMcqList(D.bGrammarQuestions);

  let wDone = 0, wCorr = 0, wTotal = 0;
  Object.keys(D.writtenExercises).forEach(cat => {
    D.writtenExercises[cat].forEach(item => {
      wTotal++;
      const id = `w_${cat}_${item.num}`;
      const tAns = (S.textAnswers || {})[id];
      if (tAns && tAns.value) {
        wDone++;
        if (tAns.isCorrect) wCorr++;
      }
    });
  });

  let lDone = 0, lCorr = 0, lTotal = 15;
  D.listeningSections.forEach(sec => {
    if (sec.questions) {
      sec.questions.forEach(q => {
        const ans = (S.mcqAnswers || {})[q.id];
        if (ans) {
          lDone++;
          if (ans === q.answer) lCorr++;
        }
      });
    }
    if (sec.fillQuestions) {
      sec.fillQuestions.forEach(fq => {
        const tAns = (S.textAnswers || {})[fq.id];
        if (tAns && tAns.value) {
          lDone++;
          if (tAns.isCorrect) lCorr++;
        }
      });
    }
  });

  let rList = [];
  D.readingSections.forEach(sec => { rList = rList.concat(sec.questions); });
  const readStats = countMcqList(rList);

  let essayDone = 0;
  D.writingTopics.forEach(t => {
    const txt = ((S.essays || {})[t.id] || "").trim();
    const words = txt ? txt.split(/\s+/).length : 0;
    if (words >= 50) essayDone++;
  });

  const M = D.mockExam;
  const mMcqs = [].concat(M.part1Questions, M.part2Questions, M.part3Questions);
  const mStats = countMcqList(mMcqs);
  let mRwDone = 0, mRwCorr = 0;
  M.part4Rewrites.forEach(rw => {
    const tAns = (S.textAnswers || {})[rw.id];
    if (tAns && tAns.value) {
      mRwDone++;
      if (tAns.isCorrect) mRwCorr++;
    }
  });

  let autoPoints = 0;
  mMcqs.forEach(q => {
    if ((S.mcqAnswers || {})[q.id] === q.answer) autoPoints += q.points;
  });
  M.part4Rewrites.forEach(rw => {
    const tAns = (S.textAnswers || {})[rw.id];
    if (tAns && tAns.isCorrect) autoPoints += rw.points;
  });
  const mockEssayText = ((S.essays || {})["mock_essay"] || "").trim();
  const mockWords = mockEssayText ? mockEssayText.split(/\s+/).length : 0;
  const essayPoints = mockWords >= 120 ? 1.2 : (mockWords >= 60 ? 0.6 : 0);
  const mockScoreTotal = (autoPoints + essayPoints).toFixed(1);

  const totalDone = pronStats.done + unitStats.done + bGramStats.done + wDone + lDone + readStats.done + mStats.done + mRwDone;
  const totalCorrect = pronStats.corr + unitStats.corr + bGramStats.corr + wCorr + lCorr + readStats.corr + mStats.corr + mRwCorr;
  const grandTotal = pronStats.total + unitStats.total + bGramStats.total + wTotal + lTotal + readStats.total + 39;

  return {
    pron: pronStats,
    unit_mcq: unitStats,
    b_gram: bGramStats,
    written: { done: wDone, corr: wCorr, total: wTotal },
    listening: { done: lDone, corr: lCorr, total: lTotal },
    reading: readStats,
    writing: { done: essayDone, total: D.writingTopics.length },
    mock: { done: mStats.done + mRwDone, corr: mStats.corr + mRwCorr, total: 39 },
    mockScoreTotal,
    totalDone,
    totalCorrect,
    grandTotal
  };
}

function updateProgressUI() {
  const st = computeStats();
  document.getElementById("badge-pron").textContent = `${st.pron.done}/${st.pron.total}`;
  document.getElementById("badge-unit_mcq").textContent = `${st.unit_mcq.done}/${st.unit_mcq.total}`;
  document.getElementById("badge-b_gram").textContent = `${st.b_gram.done}/${st.b_gram.total}`;
  document.getElementById("badge-written").textContent = `${st.written.done}/${st.written.total}`;
  document.getElementById("badge-listening").textContent = `${st.listening.done}/${st.listening.total}`;
  document.getElementById("badge-reading").textContent = `${st.reading.done}/${st.reading.total}`;
  document.getElementById("badge-writing").textContent = `${st.writing.done}/${st.writing.total}`;
  document.getElementById("badge-mock").textContent = `${st.mock.done}/${st.mock.total}`;

  const pct = st.grandTotal ? Math.round((st.totalDone / st.grandTotal) * 100) : 0;
  const acc = st.totalDone ? Math.round((st.totalCorrect / st.totalDone) * 100) : 0;

  document.getElementById("overall-pct").textContent = `${pct}%`;
  document.getElementById("overall-detail").textContent = `${st.totalDone} / ${st.grandTotal} câu`;
  document.getElementById("stat-done").textContent = `${st.totalCorrect} câu đúng`;
  document.getElementById("stat-acc").textContent = `${acc}%`;
  const mockEl = document.getElementById("stat-mock-score");
  if (mockEl) mockEl.innerHTML = `${st.mockScoreTotal}<span style="font-size:16px; font-weight:500;">/10</span>`;
}

// Render MCQ card
function renderMcqCard(q) {
  const letters = ["A", "B", "C", "D"];
  const userAns = state.mcqAnswers[q.id];
  const isAnswered = Boolean(userAns);
  const isCorrect = userAns === q.answer;
  const isFlagged = Boolean((state.flaggedQuestions || {})[q.id]);

  const cardClass = isAnswered ? (isCorrect ? "q-card correct" : "q-card wrong") : "q-card";
  let optsHtml = "";
  q.options.forEach((optText, idx) => {
    const letter = letters[idx];
    let btnClass = "opt-btn";
    if (isAnswered) {
      if (userAns === letter) {
        btnClass += isCorrect ? " selected-correct" : " selected-wrong";
      } else if (letter === q.answer) {
        btnClass += " show-answer";
      }
    }
    optsHtml += `<button class="${btnClass}" onclick="selectMcq('${q.id}', '${letter}')">
      <b style="font-family:var(--f-mono);">${letter}.</b> <span>${optText}</span>
    </button>`;
  });

  const fbClass = isAnswered ? (isCorrect ? "notice ok show" : "notice show") : "notice";
  const fbTitle = isCorrect ? "Chính xác." : `Chưa chính xác — Đáp án đúng là ${q.answer}.`;
  const cleanPrompt = q.prompt.replace(/^<b>Câu\s+\d+[^:]*:<\/b>\s*/i, "");

  return `<div class="${cardClass}" id="card-${q.id}">
    <div class="q-header" style="justify-content:space-between;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="q-chip">Câu ${q.num}</span>
        ${q.unit ? `<span class="eyebrow" style="font-size:10px;">${q.unit.replace("Unit", "BÀI")}</span>` : ""}
      </div>
      <button class="btn sm" style="padding:3px 10px; font-size:11.5px; ${isFlagged ? 'border-color:var(--flag); color:var(--flag); background:var(--blush);' : ''}" onclick="toggleFlag('${q.id}')">
        ${isFlagged ? "★ Đã đánh dấu" : "☆ Đánh dấu"}
      </button>
    </div>
    <div class="q-prompt">${cleanPrompt}</div>
    <div class="options-grid">${optsHtml}</div>
    <div class="${fbClass}">
      <b>${fbTitle}</b> ${q.explanation || ""}
    </div>
  </div>`;
}

window.toggleFlag = function(qId) {
  if (!state.flaggedQuestions) state.flaggedQuestions = {};
  state.flaggedQuestions[qId] = !state.flaggedQuestions[qId];
  saveState();
  renderCurrentTab();
};

window.selectMcq = function(qId, letter) {
  state.mcqAnswers[qId] = letter;
  saveState();
  renderCurrentTab();
  pushProgressToCloud(false);
};

// Render Written / Gap-fill Card
function renderWrittenCard(id, num, promptHtml, validAnswers, hintOrDisplay) {
  const saved = state.textAnswers[id];
  const val = saved ? saved.value : "";
  const isChecked = saved && saved.value !== "";
  const isCorrect = saved && saved.isCorrect;

  const cardClass = isChecked ? (isCorrect ? "q-card correct" : "q-card wrong") : "q-card";
  const fbClass = isChecked ? (isCorrect ? "notice ok show" : "notice show") : "notice";
  const ansListStr = validAnswers.join(" / ");

  return `<div class="${cardClass}" id="card-${id}">
    <div class="q-header">
      <span class="q-chip">Câu ${num}</span>
    </div>
    <div class="q-prompt">${promptHtml}</div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
      <input type="text" class="text-input" id="input-${id}" value="${val.replace(/"/g, '&quot;')}" placeholder="Nhập câu trả lời của bạn..." onkeydown="if(event.key==='Enter') checkWritten('${id}')" />
      <button class="btn primary" onclick="checkWritten('${id}')">Kiểm tra đáp án</button>
    </div>
    <div class="${fbClass}">
      <b>${isCorrect ? "Chính xác." : "Chưa khớp đáp án chuẩn."}</b>
      <div style="margin-top:3px;"><b>Đáp án chuẩn:</b> ${hintOrDisplay || ansListStr}</div>
    </div>
  </div>`;
}

function getWrittenItemById(id) {
  const D = window.COURSE_DATA;
  for (const cat of Object.keys(D.writtenExercises)) {
    for (const item of D.writtenExercises[cat]) {
      if (`w_${cat}_${item.num}` === id) return item;
    }
  }
  for (const sec of D.listeningSections) {
    if (sec.fillQuestions) {
      for (const fq of sec.fillQuestions) {
        if (fq.id === id) return fq;
      }
    }
  }
  for (const rw of D.mockExam.part4Rewrites) {
    if (rw.id === id) return rw;
  }
  return null;
}

window.checkWritten = function(id) {
  const inp = document.getElementById(`input-${id}`);
  if (!inp) return;
  const userVal = inp.value.trim();
  const item = getWrittenItemById(id);
  if (!item) return;

  const normUser = normalizeStr(userVal);
  const isCorrect = item.answers.some(ans => normalizeStr(ans) === normUser);

  state.textAnswers[id] = { value: userVal, isCorrect };
  saveState();
  renderCurrentTab();
  pushProgressToCloud(false);
};

// ============================================================================
// TRANG QUẢN LÝ LỚP HỌC CỦA GIẢNG VIÊN (ATELIER TEACHER DASHBOARD)
// ============================================================================
function renderTeacherDashboard() {
  const D = window.COURSE_DATA;
  const shareUrl = cloudConfig.appsScriptUrl
    ? `${window.location.origin}${window.location.pathname}?api=${encodeURIComponent(cloudConfig.appsScriptUrl)}`
    : `${window.location.origin}${window.location.pathname}`;

  let whitelistRows = cloudConfig.localWhitelist.map(u => `
    <tr>
      <td><b>${u.email}</b></td>
      <td>${u.name || "—"}</td>
      <td><span class="eyebrow" style="font-size:10px;">${u.role === 'teacher' ? 'GIẢNG VIÊN' : 'HỌC VIÊN'}</span></td>
      <td><span style="color:var(--ok); font-weight:600;">Đang hoạt động</span></td>
      <td>
        ${u.email !== TEACHER_ADMIN_EMAIL
          ? `<button class="btn danger sm" onclick="removeStudentEmail('${u.email}')">Thu hồi quyền</button>`
          : `<span style="font-size:12px; color:var(--ink-2);">Quản trị viên</span>`}
      </td>
    </tr>
  `).join("");

  let progressCards = "";
  if (cloudConfig.cloudStudentsProgress.length === 0) {
    progressCards = `<div class="notice butter show" style="text-align:center; padding:22px;">
      Chưa có hồ sơ bài làm nào được gửi lên. Khi học viên đăng nhập và bấm <b>"Đồng bộ lên Giảng viên"</b> (hoặc gửi tệp <code>.json</code> để thầy nạp vào bên dưới), toàn bộ kết quả và bài luận sẽ hiển thị tại đây.
    </div>`;
  } else {
    cloudConfig.cloudStudentsProgress.forEach((stu, idx) => {
      const sStats = computeStats(stu.state || {});
      const essaysHtml = D.writingTopics.map(t => {
        const txt = ((stu.state && stu.state.essays) ? stu.state.essays[t.id] : "") || "";
        const wc = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        if (!txt.trim()) return "";
        return `<div class="notice-box" style="margin-top:10px;">
          <b>${t.title} (${wc} từ):</b>
          <div style="white-space:pre-line; font-size:14px; margin-top:6px;">${txt}</div>
        </div>`;
      }).join("");
      const mockEssay = ((stu.state && stu.state.essays) ? stu.state.essays["mock_essay"] : "") || "";

      progressCards += `<div class="card" style="--tint:var(--butter); margin-top:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
          <div>
            <span class="eyebrow">HỒ SƠ HỌC VIÊN</span>
            <h3 style="font-size:26px; margin-top:2px;">${stu.name} <em>(${stu.email})</em></h3>
            <div style="font-size:12.5px; color:var(--ink-2);">Đồng bộ lần cuối: ${stu.updatedAt || "Vừa xong"}</div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <span class="q-chip">Đã làm: ${sStats.totalDone}/${sStats.grandTotal}</span>
            <span class="q-chip" style="background:var(--mint); color:var(--ok);">Đúng: ${sStats.totalCorrect} câu (${stu.accuracy})</span>
            <span class="q-chip" style="background:var(--butter); color:var(--gold);">Điểm thi thử: ${sStats.mockScoreTotal}/10</span>
          </div>
        </div>

        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Ngữ âm (30)</th>
                <th>Bài 7–12 (60)</th>
                <th>Ngữ pháp B (30)</th>
                <th>Tự luận (55)</th>
                <th>Nghe (15)</th>
                <th>Đọc PET (23)</th>
                <th>Bài luận (6)</th>
                <th>Thi thử</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${sStats.pron.corr}/${sStats.pron.done}</td>
                <td>${sStats.unit_mcq.corr}/${sStats.unit_mcq.done}</td>
                <td>${sStats.b_gram.corr}/${sStats.b_gram.done}</td>
                <td>${sStats.written.corr}/${sStats.written.done}</td>
                <td>${sStats.listening.corr}/${sStats.listening.done}</td>
                <td>${sStats.reading.corr}/${sStats.reading.done}</td>
                <td>${sStats.writing.done}/6 bài</td>
                <td><b>${sStats.mockScoreTotal} / 10</b></td>
              </tr>
            </tbody>
          </table>
        </div>

        ${essaysHtml ? `<div style="margin-top:16px;"><span class="eyebrow">BÀI LUYỆN VIẾT CỦA HỌC VIÊN</span>${essaysHtml}</div>` : ""}
        ${mockEssay ? `<div class="notice-box" style="margin-top:10px; background:var(--sky); border-left-color:var(--accent);"><b>Bài viết trong Đề Thi Thử Cuối Kỳ:</b><div style="white-space:pre-line; font-size:14px; margin-top:6px;">${mockEssay}</div></div>` : ""}

        <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--line); display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <input type="text" id="grade-score-${idx}" class="text-input" style="max-width:170px;" placeholder="Điểm chấm (vd: 8.5/10)" value="${(stu.teacherGrade || '').replace(/"/g, '&quot;')}" />
          <input type="text" id="grade-comment-${idx}" class="text-input" placeholder="Nhập lời phê và nhận xét bài viết cho học viên..." value="${(stu.teacherComment || '').replace(/"/g, '&quot;')}" />
          <button class="btn primary" onclick="saveTeacherGrade('${stu.email}', ${idx})">Lưu điểm & Gửi lời phê</button>
        </div>
      </div>`;
    });
  }

  return `
    <div class="card" style="--tint:var(--butter);">
      <span class="eyebrow">PHÂN QUYỀN TRUY CẬP</span>
      <h2 class="card-title">Danh sách <em>Học viên</em> được phép đăng nhập</h2>
      <p style="font-size:14px; color:var(--ink-2); margin-bottom:16px;">
        Chỉ những tài khoản Gmail nằm trong danh sách dưới đây mới có thể vượt qua cổng xác thực để làm bài và đẩy tiến độ về trang quản trị của thầy.
      </p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;">
        <input type="email" id="new-student-email" class="text-input" placeholder="Nhập địa chỉ Gmail học viên (vd: hocvien@gmail.com)..." />
        <input type="text" id="new-student-name" class="text-input" placeholder="Họ và tên học viên..." />
        <button class="btn primary" onclick="addStudentEmail()">+ Cấp quyền Gmail này</button>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>Địa chỉ Gmail</th>
              <th>Họ và Tên</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>${whitelistRows}</tbody>
        </table>
      </div>
    </div>

    <div class="rule"><span>TIẾN ĐỘ & BÀI LÀM HỌC VIÊN</span></div>

    <div class="card" style="--tint:var(--mint);">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
        <div>
          <span class="eyebrow">THEO DÕI HỌC TẬP</span>
          <h2 class="card-title" style="margin-bottom:2px;">Bảng điểm & <em>Bài luận</em> của học viên</h2>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn primary sm" onclick="refreshFromGoogleSheets()">Tải dữ liệu từ Google Sheets</button>
          <label class="btn sm" style="cursor:pointer;">
            Nạp tệp .JSON của học viên
            <input type="file" accept=".json" style="display:none" onchange="importStudentJsonForReview(event)" />
          </label>
          <button class="btn danger sm" onclick="resetAllProgress()">Xóa làm lại trên máy này</button>
        </div>
      </div>
      ${progressCards}
    </div>

    <div class="rule"><span>ĐỒNG BỘ ĐÁM MÂY GOOGLE SHEETS</span></div>

    <div class="card" style="--tint:var(--sky);">
      <span class="eyebrow">CẤU HÌNH KẾT NỐI</span>
      <h2 class="card-title">Liên kết <em>Google Trang tính</em> (Google Sheets)</h2>
      <p style="font-size:14px; color:var(--ink-2); margin-bottom:14px;">
        Kết nối trang web với tệp Google Trang tính trên tài khoản <b>${TEACHER_ADMIN_EMAIL}</b> để lưu trữ danh sách lớp và bài làm từ xa:
      </p>
      <div class="passage-box" style="font-size:13.8px;">
        <div style="margin-bottom:10px; padding:10px 14px; background:var(--butter); border:1px solid rgba(154,116,50,0.4); border-radius:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <b>📊 Bảng Google Sheets chính thức đã tạo trên tài khoản của thầy:</b><br/>
            <span style="font-size:12.5px; color:var(--ink-2);">Gồm 3 trang tính: <code>Dang_Ky_Hoc_Vien</code>, <code>Danh_Sach_Hoc_Vien</code>, <code>Tien_Do_Hoc_Vien</code></span>
          </div>
          <a href="https://docs.google.com/spreadsheets/d/1UW4oQ2lOoFybHKO3FTMFOpGxQFy4dGAlJAu8Wj_YDTQ/edit" target="_blank" class="btn primary sm">Mở Bảng Google Sheets ↗</a>
        </div>
        <b>Hướng dẫn bật đồng bộ tự động 2 chiều (chỉ thực hiện 1 lần trên bảng trên):</b>
        <ol style="padding-left:20px; margin-top:6px;">
          <li>Bấm nút <b>"Mở Bảng Google Sheets ↗"</b> ở trên.</li>
          <li>Trên thanh menu bảng tính chọn <b>Tiện ích mở rộng (Extensions)</b> → <b>Apps Script</b>. Bấm nút <b>"Sao chép mã Apps Script"</b> bên dưới và dán đè vào trình soạn thảo, sau đó bấm Lưu.</li>
          <li>Bấm <b>Triển khai (Deploy)</b> → <b>Tùy chọn triển khai mới</b> → Loại: <b>Ứng dụng web (Web app)</b> → Ai có quyền truy cập: chọn <b>"Bất kỳ ai" (Anyone)</b> → Sao chép <b>URL ứng dụng web (<code>.../exec</code>)</b> dán vào ô bên dưới:</li>
        </ol>
        <div style="margin-top:12px;">
          <button class="btn sm" onclick="copyAppsScriptCode()">Sao chép mã Google Apps Script</button>
        </div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <input type="url" id="apps-script-url-input" class="text-input" placeholder="Dán URL Web App của Google Apps Script (https://script.google.com/macros/s/.../exec)..." value="${cloudConfig.appsScriptUrl}" />
        <button class="btn primary" onclick="saveAppsScriptUrl()">Lưu kết nối Google Sheets</button>
      </div>
      ${cloudConfig.appsScriptUrl ? `
        <div class="notice ok show" style="margin-top:14px;">
          <b>Đã kết nối Google Sheets thành công.</b> Đường dẫn gửi cho học viên (đã đính kèm khóa kết nối bảng tính của thầy):<br/>
          <code style="word-break:break-all; background:var(--surface); padding:6px 10px; border-radius:8px; display:inline-block; margin-top:6px; border:1px solid var(--line);">${shareUrl}</code>
        </div>
      ` : ""}
    </div>
  `;
}

window.addStudentEmail = async function() {
  const emailInp = document.getElementById("new-student-email");
  const nameInp = document.getElementById("new-student-name");
  const targetEmail = (emailInp.value || "").trim().toLowerCase();
  const targetName = (nameInp.value || "").trim() || targetEmail.split("@")[0];

  if (!targetEmail || !targetEmail.includes("@")) {
    alert("Vui lòng nhập đúng địa chỉ Gmail của học viên.");
    return;
  }

  const existing = cloudConfig.localWhitelist.find(u => u.email.toLowerCase() === targetEmail);
  if (existing) {
    existing.name = targetName;
    existing.status = "active";
  } else {
    cloudConfig.localWhitelist.push({
      email: targetEmail,
      name: targetName,
      role: "student",
      status: "active"
    });
  }
  saveCloudConfig();

  if (cloudConfig.appsScriptUrl) {
    try {
      const res = await fetch(cloudConfig.appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "manage_whitelist",
          email: TEACHER_ADMIN_EMAIL,
          subAction: "add",
          targetEmail,
          targetName
        })
      });
      const data = await res.json();
      if (data.allAllowed) cloudConfig.localWhitelist = data.allAllowed;
      saveCloudConfig();
    } catch (e) {}
  }
  showToast(`Đã cấp quyền cho ${targetEmail}`);
  renderCurrentTab();
};

window.removeStudentEmail = async function(targetEmail) {
  if (!confirm(`Bạn có chắc muốn thu hồi quyền truy cập của ${targetEmail}?`)) return;
  cloudConfig.localWhitelist = cloudConfig.localWhitelist.filter(u => u.email.toLowerCase() !== targetEmail.toLowerCase());
  saveCloudConfig();

  if (cloudConfig.appsScriptUrl) {
    try {
      const res = await fetch(cloudConfig.appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "manage_whitelist",
          email: TEACHER_ADMIN_EMAIL,
          subAction: "remove",
          targetEmail
        })
      });
      const data = await res.json();
      if (data.allAllowed) cloudConfig.localWhitelist = data.allAllowed;
      saveCloudConfig();
    } catch (e) {}
  }
  showToast(`Đã thu hồi quyền của ${targetEmail}`);
  renderCurrentTab();
};

window.saveAppsScriptUrl = function() {
  const inp = document.getElementById("apps-script-url-input");
  cloudConfig.appsScriptUrl = (inp.value || "").trim();
  saveCloudConfig();
  showToast("Đã lưu kết nối Google Sheets");
  renderCurrentTab();
  if (cloudConfig.appsScriptUrl) refreshFromGoogleSheets();
};

window.refreshFromGoogleSheets = async function() {
  if (!cloudConfig.appsScriptUrl) {
    alert("Vui lòng dán URL Web App Google Sheets ở mục Cấu hình kết nối trước.");
    return;
  }
  try {
    const url = `${cloudConfig.appsScriptUrl}?action=check_user&email=${encodeURIComponent(TEACHER_ADMIN_EMAIL)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.allAllowed) cloudConfig.localWhitelist = data.allAllowed;
    if (data.allProgress) cloudConfig.cloudStudentsProgress = data.allProgress;
    saveCloudConfig();
    renderCurrentTab();
    showToast("Đã đồng bộ dữ liệu mới nhất từ Google Sheets");
  } catch (err) {
    alert("Không thể tải dữ liệu từ Google Sheets: " + err.message);
  }
};

window.saveTeacherGrade = async function(studentEmail, idx) {
  const grade = (document.getElementById(`grade-score-${idx}`).value || "").trim();
  const comment = (document.getElementById(`grade-comment-${idx}`).value || "").trim();

  const stu = cloudConfig.cloudStudentsProgress.find(s => s.email.toLowerCase() === studentEmail.toLowerCase());
  if (stu) {
    stu.teacherGrade = grade;
    stu.teacherComment = comment;
    saveCloudConfig();
  }

  if (cloudConfig.appsScriptUrl) {
    try {
      await fetch(cloudConfig.appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "grade_student",
          email: TEACHER_ADMIN_EMAIL,
          studentEmail,
          teacherGrade: grade,
          teacherComment: comment
        })
      });
    } catch (e) {}
  }
  showToast(`Đã lưu điểm và lời phê cho ${studentEmail}`);
  renderCurrentTab();
};

window.importStudentJsonForReview = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedState = JSON.parse(e.target.result);
      const st = computeStats(importedState);
      const acc = st.totalDone ? Math.round((st.totalCorrect / st.totalDone) * 100) : 0;
      const email = importedState.studentEmail || prompt("Nhập địa chỉ Gmail của học viên:", "hocvien@gmail.com") || "hocvien@gmail.com";
      const record = {
        email: email,
        name: importedState.studentName || email,
        updatedAt: new Date().toLocaleString("vi-VN"),
        totalDone: st.totalDone,
        totalCorrect: st.totalCorrect,
        accuracy: `${acc}%`,
        mockScore: st.mockScoreTotal,
        essaysCount: st.writing.done,
        teacherComment: importedState.teacherComment || "",
        teacherGrade: importedState.teacherGrade || "",
        state: importedState
      };
      const idx = cloudConfig.cloudStudentsProgress.findIndex(p => p.email.toLowerCase() === email.toLowerCase());
      if (idx >= 0) cloudConfig.cloudStudentsProgress[idx] = record;
      else cloudConfig.cloudStudentsProgress.push(record);
      saveCloudConfig();
      renderCurrentTab();
      showToast("Đã nạp hồ sơ bài làm của học viên");
    } catch (err) {
      alert("Tệp JSON không hợp lệ.");
    }
  };
  reader.readAsText(file);
};

window.copyAppsScriptCode = async function() {
  try {
    const res = await fetch("google_apps_script_backend.gs");
    const txt = await res.text();
    await navigator.clipboard.writeText(txt);
    showToast("Đã sao chép mã Google Apps Script vào bộ nhớ tạm");
  } catch (e) {
    alert("Bạn có thể mở tệp 'google_apps_script_backend.gs' trong kho lưu trữ để sao chép mã.");
  }
};

// ============================================================================
// HIỂN THỊ CÁC CHUYÊN ĐỀ HỌC THUẬT & PHÒNG THI THẬT (.rx)
// ============================================================================
window.switchTab = function(tabName) {
  stopAudio();
  state.currentTab = tabName;
  document.querySelectorAll(".nav-tab").forEach(n => {
    n.classList.toggle("active", n.getAttribute("data-tab") === tabName);
  });
  saveState();
  renderCurrentTab();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

function renderCurrentTab() {
  const D = window.COURSE_DATA;
  const area = document.getElementById("content-area");
  const titleEl = document.getElementById("section-title");
  const subEl = document.getElementById("section-sub");
  const eyeEl = document.getElementById("section-eyebrow");

  if (state.currentTab === "teacher") {
    if (!currentUser || currentUser.email.toLowerCase() !== TEACHER_ADMIN_EMAIL) {
      state.currentTab = "theory";
      return renderCurrentTab();
    }
    eyeEl.textContent = "QUẢN TRỊ HỌC THUẬT • GIẢNG VIÊN LÊ VIẾT HOÀI NAM";
    titleEl.innerHTML = "Quản lý <em>Lớp học</em> & Học viên";
    subEl.textContent = "Cấp quyền truy cập theo tài khoản Google, theo dõi tiến độ từng chuyên đề và chấm bài luận 120–150 từ.";
    area.innerHTML = renderTeacherDashboard();
    return;
  }

  const tints = ["var(--butter)", "var(--mint)", "var(--sky)", "var(--lilac)", "var(--blush)", "var(--butter)"];

  if (state.currentTab === "theory") {
    eyeEl.textContent = "TỔNG HỢP KIẾN THỨC • SPEAKOUT PRE-INTERMEDIATE B1";
    titleEl.innerHTML = "Hệ thống <em>Lý thuyết</em> Trọng tâm";
    subEl.textContent = "Tóm tắt toàn bộ cấu trúc ngữ pháp, từ vựng theo chủ đề và ngữ âm giao tiếp từ Bài 7 đến Bài 12.";
    let html = "";
    D.unitsTheory.forEach((u, idx) => {
      const viTitle = u.title.replace("Unit", "Bài");
      html += `<div class="card" style="--tint:${tints[idx % tints.length]};">
        <span class="eyebrow">NỘI DUNG ${idx + 1} • CHUẨN ĐẦU RA CLO1</span>
        <h2 class="card-title" style="margin-top:4px;">${viTitle}</h2>
        <div class="rule"><span>NGỮ PHÁP CỐT LÕI</span></div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${u.grammar.map(g => `<div class="notice-box" style="margin:0; background:var(--surface);">${g}</div>`).join("")}
        </div>
        <div class="rule"><span>TỪ VỰNG & CỐ ĐỊNH TỪ</span></div>
        <ul style="padding-left:20px; color:var(--ink);">
          ${u.vocab.map(v => `<li style="margin-bottom:6px;">${v}</li>`).join("")}
        </ul>
        <div class="rule"><span>NGỮ ÂM & CHỨC NĂNG GIAO TIẾP</span></div>
        <div style="background:var(--surface); border:1px solid var(--line); padding:12px 16px; border-radius:14px; font-size:14px;">${u.pronunciation}</div>
      </div>`;
    });
    area.innerHTML = html;
  }

  else if (state.currentTab === "pron") {
    eyeEl.textContent = "CHUYÊN ĐỀ 1 • CHUẨN ĐẦU RA CLO1 (30 CÂU)";
    titleEl.innerHTML = "Ngữ âm, <em>Trọng âm</em> & Ngữ điệu";
    subEl.textContent = "Phát âm đuôi -s/-es, âm câm (Silent letters), trọng âm từ và ngữ âm giao tiếp đặc thù của Speakout.";
    area.innerHTML = D.pronunciationQuestions.map(renderMcqCard).join("");
  }

  else if (state.currentTab === "unit_mcq") {
    eyeEl.textContent = "CHUYÊN ĐỀ 2 • CHUẨN ĐẦU RA CLO1 (60 CÂU)";
    titleEl.innerHTML = "Trắc nghiệm <em>Từ vựng & Ngữ pháp</em> theo Bài";
    subEl.textContent = "Lọc theo từng bài học từ Bài 7 đến Bài 12 để ôn luyện chuyên sâu hoặc làm toàn bộ 60 câu.";
    const units = [
      { id: "ALL", label: "Tất cả (60 câu)" },
      { id: "Unit 7", label: "Bài 7: Thay đổi" },
      { id: "Unit 8", label: "Bài 8: Tiền bạc" },
      { id: "Unit 9", label: "Bài 9: Thiên nhiên" },
      { id: "Unit 10", label: "Bài 10: Xã hội" },
      { id: "Unit 11", label: "Bài 11: Công nghệ" },
      { id: "Unit 12", label: "Bài 12: Danh tiếng" }
    ];
    let filterHtml = `<div class="filter-bar">` + units.map(u =>
      `<button class="btn sm ${state.unitFilter === u.id ? 'primary' : ''}" onclick="setUnitFilter('${u.id}')">${u.label}</button>`
    ).join("") + `</div>`;

    const filtered = state.unitFilter === "ALL"
      ? D.unitMcqQuestions
      : D.unitMcqQuestions.filter(q => q.unit === state.unitFilter);

    area.innerHTML = filterHtml + filtered.map(renderMcqCard).join("");
  }

  else if (state.currentTab === "b_gram") {
    eyeEl.textContent = "CHUYÊN ĐỀ 3 • NGỮ PHÁP TRÌNH ĐỘ B PHÂN LOẠI CAO (30 CÂU)";
    titleEl.innerHTML = "Chuyên sâu <em>Ngữ pháp</em> Trình độ B";
    subEl.textContent = "Tập trung vào Thể giả định (Subjunctives), Would rather, Prefer, Had better, It's high time, Câu hỏi tường thuật và Bị động.";
    area.innerHTML = D.bGrammarQuestions.map(renderMcqCard).join("");
  }

  else if (state.currentTab === "written") {
    eyeEl.textContent = "CHUYÊN ĐỀ 4 • CHUẨN ĐẦU RA CLO1 & CLO4 (55 CÂU)";
    titleEl.innerHTML = "Tự luận <em>Cấu tạo từ</em> & Viết lại câu";
    subEl.textContent = "Nhập trực tiếp đáp án vào ô trả lời và nhấn Enter (hoặc bấm Kiểm tra đáp án) để hệ thống chấm tự động.";
    const tabs = [
      { id: "wordFormation", label: "4A. Cấu tạo từ & Hậu tố (10)" },
      { id: "prepositions", label: "4B. Giới từ & Cụm động từ (10)" },
      { id: "pronouns", label: "4C. Đại từ liên kết câu (5)" },
      { id: "errorCorrection", label: "4D. Tìm & Sửa lỗi sai (10)" },
      { id: "sentenceTransformation", label: "4E. Viết lại câu (20)" }
    ];
    let navHtml = `<div class="filter-bar">` + tabs.map(t =>
      `<button class="btn sm ${state.writtenSubTab === t.id ? 'primary' : ''}" onclick="setWrittenSubTab('${t.id}')">${t.label}</button>`
    ).join("") + `</div>`;

    const list = D.writtenExercises[state.writtenSubTab] || [];
    const cardsHtml = list.map(item =>
      renderWrittenCard(
        `w_${state.writtenSubTab}_${item.num}`,
        item.num,
        item.prompt,
        item.answers,
        item.displayAnswer ? `${item.displayAnswer}` : `${item.answers.join(" / ")} — <i>(${item.hint})</i>`
      )
    ).join("");
    area.innerHTML = navHtml + cardsHtml;
  }

  else if (state.currentTab === "listening") {
    eyeEl.textContent = "CHUYÊN ĐỀ 5 • CHUẨN ĐẦU RA CLO2 (15 CÂU)";
    titleEl.innerHTML = "Luyện kỹ năng <em>Nghe hiểu</em> B1";
    subEl.textContent = "Sử dụng trình phát âm thanh tích hợp (tốc độ chuẩn hoặc tốc độ chậm 0.8x) và đối chiếu văn bản nghe.";
    let html = "";
    D.listeningSections.forEach((sec, idx) => {
      const safeScript = sec.audioScript.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      html += `<div class="card" style="--tint:${tints[idx % tints.length]};">
        <span class="eyebrow">PHẦN NGHE ${idx + 1} • ĐỊNH DẠNG SPEAKOUT & PET B1</span>
        <h2 class="card-title" style="margin-top:4px;">${sec.title}</h2>
        <div class="audio-panel">
          <div>
            <b style="font-size:14.5px;">Trình phát âm thanh tiếng Anh (B1 Audio)</b>
            <div style="font-size:12.5px; color:var(--ink-2);">Chọn nghe tốc độ tiêu chuẩn hoặc nghe chậm để bắt từ khóa</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn primary sm" onclick="speakText('${safeScript}', 0.95)">Phát âm thanh (1.0x)</button>
            <button class="btn sm" onclick="speakText('${safeScript}', 0.78)">Nghe chậm (0.8x)</button>
            <button class="btn sm" onclick="stopAudio()">Dừng phát</button>
            <button class="btn sm" onclick="toggleTranscript('tr-${sec.id}')">Văn bản nghe (Transcript)</button>
          </div>
        </div>
        <div id="tr-${sec.id}" class="passage-box" style="display:none;">
          <span class="eyebrow" style="margin-bottom:4px;">NỘI DUNG BÀI NGHE (AUDIO SCRIPT)</span>
          ${sec.audioScript}
        </div>
        ${sec.questions ? sec.questions.map(renderMcqCard).join("") : ""}
        ${sec.fillQuestions ? sec.fillQuestions.map(fq =>
          renderWrittenCard(fq.id, fq.num, fq.prompt, fq.answers, `${fq.answers[0]} — <i>(${fq.hint})</i>`)
        ).join("") : ""}
      </div>`;
    });
    area.innerHTML = html;
  }

  else if (state.currentTab === "reading") {
    eyeEl.textContent = "CHUYÊN ĐỀ 6 • CHUẨN ĐẦU RA CLO3 (23 CÂU)";
    titleEl.innerHTML = "Luyện kỹ năng <em>Đọc hiểu</em> Cambridge PET";
    subEl.textContent = "Đọc biển báo & tin nhắn ngắn (PET Part 1), đọc điền từ vào đoạn văn (Cloze Text) và đọc hiểu bài báo học thuật.";
    let html = "";
    D.readingSections.forEach((sec, idx) => {
      html += `<div class="card" style="--tint:${tints[idx % tints.length]};">
        <span class="eyebrow">BÀI ĐỌC ${idx + 1} • TRÌNH ĐỘ B1</span>
        <h2 class="card-title" style="margin-top:4px;">${sec.title}</h2>
        <div class="passage-box">${sec.passage}</div>
        ${sec.questions.map(renderMcqCard).join("")}
      </div>`;
    });
    area.innerHTML = html;
  }

  else if (state.currentTab === "writing") {
    eyeEl.textContent = "CHUYÊN ĐỀ 7 • CHUẨN ĐẦU RA CLO4 (6 CHỦ ĐỀ TRỌNG TÂM)";
    titleEl.innerHTML = "Luyện viết <em>Đoạn văn & Thư</em> (120–150 từ)";
    subEl.textContent = "Tích hợp Khung giàn giáo mẫu câu (Writing Templates), bộ đếm từ tự động và 6 bài viết mẫu chuẩn B1.";
    let html = "";
    D.writingTopics.forEach((t, idx) => {
      const savedText = state.essays[t.id] || "";
      const words = savedText.trim() ? savedText.trim().split(/\s+/).length : 0;
      const wordColor = (words >= 120 && words <= 160) ? "var(--ok)" : (words > 0 ? "var(--gold)" : "var(--ink-2)");

      html += `<div class="card" style="--tint:${tints[idx % tints.length]};">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <span class="eyebrow">${t.unit.replace("Unit", "BÀI")} • TIÊU CHÍ RUBRIC 2</span>
          <span class="q-chip">Mục tiêu: 120 – 150 từ</span>
        </div>
        <h2 class="card-title" style="margin-top:4px;">${t.title}</h2>
        <p style="margin:6px 0 14px; font-weight:600; color:var(--ink);">Đề bài: ${t.prompt}</p>
        <div class="notice-box" style="background:var(--surface);">
          <b>Danh mục cấu trúc cần vận dụng trong bài:</b>
          <ul style="padding-left:20px; margin-top:4px;">
            ${t.checklist.map(c => `<li>${c}</li>`).join("")}
          </ul>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
          <button class="btn sm" onclick="insertTemplate('${t.id}')">Chèn khung mẫu câu gợi ý</button>
          <button class="btn sm" onclick="toggleTranscript('model-${t.id}')">Xem bài viết mẫu đạt 10/10</button>
        </div>
        <div id="model-${t.id}" class="passage-box" style="display:none;">
          <span class="eyebrow" style="margin-bottom:4px;">BÀI VIẾT MẪU THAM KHẢO (140+ TỪ)</span>
          <div style="white-space:pre-line;">${t.modelEssay}</div>
        </div>
        <textarea class="writing-area" id="essay-${t.id}" placeholder="Nhập bài viết của bạn tại đây (tự động lưu theo từng chữ)..." oninput="updateEssay('${t.id}')">${savedText}</textarea>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:10px;">
          <span id="wc-${t.id}" style="font-family:var(--f-mono); font-size:13px; font-weight:600; color:${wordColor};">Số từ hiện tại: ${words} từ (Chuẩn yêu cầu: 120 – 150 từ)</span>
          <button class="btn primary sm" onclick="pushProgressToCloud(true)">Gửi bài viết lên Giảng viên</button>
        </div>
      </div>`;
    });
    area.innerHTML = html;
  }

  else if (state.currentTab === "mock") {
    eyeEl.textContent = "MÀN LÀM BÀI THI THẬT (.RX) • TÁCH BIỆT PHONG CÁCH PHÒNG THI INSPERA";
    titleEl.innerHTML = "Phòng thi <em>Kết thúc học phần</em> (10.0 điểm)";
    subEl.textContent = "Giao diện phòng thi tiêu chuẩn giúp học viên làm quen áp lực phòng thi thật. Bấm vào ô số câu trên thanh điều hướng để chuyển nhanh.";
    const M = D.mockExam;
    const safeAudioA = M.audioScriptA.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    const safeAudioB = M.audioScriptB.replace(/'/g, "\\'").replace(/"/g, "&quot;");

    let autoPoints = 0;
    const allMcqs = [].concat(M.part1Questions, M.part2Questions, M.part3Questions);
    allMcqs.forEach(q => {
      if (state.mcqAnswers[q.id] === q.answer) autoPoints += q.points;
    });
    M.part4Rewrites.forEach(rw => {
      if (state.textAnswers[rw.id] && state.textAnswers[rw.id].isCorrect) autoPoints += rw.points;
    });
    const mockEssayText = (state.essays["mock_essay"] || "").trim();
    const mockWords = mockEssayText ? mockEssayText.split(/\s+/).length : 0;
    const essayPoints = mockWords >= 120 ? 1.2 : (mockWords >= 60 ? 0.6 : 0);
    const totalScore = (autoPoints + essayPoints).toFixed(1);

    // Build Question Number Chips Palette (1..39)
    let chipsHtml = "";
    allMcqs.forEach(q => {
      const answered = Boolean(state.mcqAnswers[q.id]);
      const flagged = Boolean((state.flaggedQuestions || {})[q.id]);
      chipsHtml += `<button class="rx-chip ${answered ? 'answered' : ''} ${flagged ? 'flagged' : ''}" onclick="document.getElementById('card-${q.id}').scrollIntoView({behavior:'smooth', block:'center'})" title="Câu ${q.num}">${q.num}</button>`;
    });
    M.part4Rewrites.forEach(rw => {
      const answered = Boolean(state.textAnswers[rw.id] && state.textAnswers[rw.id].value);
      chipsHtml += `<button class="rx-chip ${answered ? 'answered' : ''}" onclick="document.getElementById('card-${rw.id}').scrollIntoView({behavior:'smooth', block:'center'})" title="Câu ${rw.num}">${rw.num}</button>`;
    });

    let html = `<div class="rx">
      <div class="rx-topbar">
        <div>
          <div style="font-size:11px; opacity:0.8; text-transform:uppercase;">INSPERA ASSESSMENT • TRƯỜNG ĐẠI HỌC HỒNG ĐỨC</div>
          <div style="font-size:16px; font-weight:700;">ĐỀ THI KẾT THÚC HỌC PHẦN: TIẾNG ANH 3 (MÃ HP: 133033)</div>
        </div>
        <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
          <div style="background:#111827; padding:6px 14px; border-radius:4px; font-size:14px; font-weight:700;">
            ĐIỂM HIỆN TẠI: <span style="color:#f6e39a;">${totalScore} / 10.0</span>
            <span style="font-size:11.5px; font-weight:400; opacity:0.85;">(TN & Câu: ${autoPoints.toFixed(1)}/8.8 • Viết: ${essayPoints.toFixed(1)}/1.2)</span>
          </div>
          <button onclick="pushProgressToCloud(true)" style="background:#2e6f51; color:#fff; border:none; padding:8px 16px; border-radius:4px; font-weight:700; cursor:pointer;">NỘP BÀI THI LÊN GIẢNG VIÊN</button>
        </div>
      </div>

      <div class="rx-palette">
        <span style="font-size:12px; font-weight:700; margin-right:6px;">BẢNG CÂU HỎI (1–39):</span>
        ${chipsHtml}
      </div>

      <div class="rx-body">
        <div class="rx-section">
          <h2>PHẦN 1: NGỮ ÂM, TỪ VỰNG, NGỮ PHÁP & GIAO TIẾP (CLO1 – 3.0 ĐIỂM)</h2>
          <p style="font-size:13px; color:#555; margin-bottom:14px;">15 câu × 0.2 điểm = 3.0 điểm</p>
          ${M.part1Questions.map(renderMcqCard).join("")}
        </div>

        <div class="rx-section">
          <h2>PHẦN 2: NGHE HIỂU (CLO2 – 2.0 ĐIỂM)</h2>
          <p style="font-size:13px; color:#555; margin-bottom:14px;">10 câu × 0.2 điểm = 2.0 điểm</p>
          <div style="background:#F0F4F8; border:1px solid #CBD5E1; padding:12px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <b>Phần Nghe A (Câu 16–20): Hội thoại tại Văn phòng Du học</b>
            <div style="display:flex; gap:8px;">
              <button class="btn sm" style="border-radius:4px;" onclick="speakText('${safeAudioA}', 0.95)">Phát Phần A</button>
              <button class="btn sm" style="border-radius:4px;" onclick="stopAudio()">Dừng</button>
              <button class="btn sm" style="border-radius:4px;" onclick="toggleTranscript('tr-mock-a')">Hiện Transcript A</button>
            </div>
          </div>
          <div id="tr-mock-a" style="display:none; background:#FFF; border:1px solid #CCC; padding:12px; margin-bottom:14px; font-size:13.5px;">${M.audioScriptA}</div>
          ${M.part2Questions.filter(q => q.section === "A").map(renderMcqCard).join("")}

          <div style="background:#F0F4F8; border:1px solid #CBD5E1; padding:12px 16px; margin:18px 0 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <b>Phần Nghe B (Câu 21–25): Bản tin Radio — Thị trấn Không Rác thải Nhựa</b>
            <div style="display:flex; gap:8px;">
              <button class="btn sm" style="border-radius:4px;" onclick="speakText('${safeAudioB}', 0.95)">Phát Phần B</button>
              <button class="btn sm" style="border-radius:4px;" onclick="stopAudio()">Dừng</button>
              <button class="btn sm" style="border-radius:4px;" onclick="toggleTranscript('tr-mock-b')">Hiện Transcript B</button>
            </div>
          </div>
          <div id="tr-mock-b" style="display:none; background:#FFF; border:1px solid #CCC; padding:12px; margin-bottom:14px; font-size:13.5px;">${M.audioScriptB}</div>
          ${M.part2Questions.filter(q => q.section === "B").map(renderMcqCard).join("")}
        </div>

        <div class="rx-section">
          <h2>PHẦN 3: ĐỌC HIỂU (CLO3 – 3.0 ĐIỂM)</h2>
          <p style="font-size:13px; color:#555; margin-bottom:14px;">10 câu × 0.3 điểm = 3.0 điểm</p>
          <h3 style="font-size:14px; margin-bottom:8px;">Mục A (Câu 26–30): Đọc điền từ vào đoạn văn</h3>
          <div style="background:#FAFAFA; border:1px solid #CCC; padding:14px 18px; margin-bottom:14px; line-height:1.7;">${M.readingClozePassage}</div>
          ${M.part3Questions.filter(q => q.section === "A").map(renderMcqCard).join("")}

          <h3 style="font-size:14px; margin:18px 0 8px;">Mục B (Câu 31–35): Đọc hiểu văn bản</h3>
          <div style="background:#FAFAFA; border:1px solid #CCC; padding:14px 18px; margin-bottom:14px; line-height:1.7;">${M.readingCompPassage}</div>
          ${M.part3Questions.filter(q => q.section === "B").map(renderMcqCard).join("")}
        </div>

        <div class="rx-section">
          <h2>PHẦN 4: KỸ NĂNG VIẾT (CLO4 – 2.0 ĐIỂM)</h2>
          <h3 style="font-size:14px; margin-bottom:10px;">Mục A (0.8 điểm – 4 câu × 0.2 điểm): Viết lại câu sao cho nghĩa không đổi</h3>
          ${M.part4Rewrites.map(rw => renderWrittenCard(rw.id, rw.num, rw.prompt, rw.answers, rw.displayAnswer)).join("")}

          <h3 style="font-size:14px; margin:18px 0 8px;">Mục B (1.2 điểm): Viết đoạn văn / bài luận ngắn (120–150 từ)</h3>
          <p style="font-size:13.5px; margin-bottom:10px;">
            Chọn 1 trong 2 chủ đề sau và viết bài hoàn chỉnh từ 120 đến 150 từ:<br/>
            • <b>Đề 1:</b> Trình bày quan điểm của bạn về lợi ích và tác hại của mạng xã hội / Internet đối với sinh viên đại học.<br/>
            • <b>Đề 2:</b> Kể về một quyết định hoặc sự thay đổi quan trọng trong cuộc đời bạn và ảnh hưởng của nó.
          </p>
          <textarea class="writing-area" style="border-radius:3px; background:#FFF; border-color:#BBB; font-family:Arial, sans-serif;" id="essay-mock_essay" placeholder="Nhập bài viết thi thử của bạn tại đây..." oninput="updateEssay('mock_essay')">${mockEssayText}</textarea>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
            <span id="wc-mock_essay" style="font-size:13px; font-weight:700;">Số từ hiện tại: ${mockWords} từ (Đủ 120 từ = 1.2 điểm)</span>
            <button onclick="pushProgressToCloud(true)" style="background:#232A34; color:#fff; border:none; padding:8px 18px; border-radius:4px; font-weight:700; cursor:pointer;">LƯU & NỘP BÀI VIẾT</button>
          </div>
        </div>
      </div>
    </div>`;

    area.innerHTML = html;
  }
}

window.setUnitFilter = function(u) {
  state.unitFilter = u;
  saveState();
  renderCurrentTab();
};

window.setWrittenSubTab = function(sub) {
  state.writtenSubTab = sub;
  saveState();
  renderCurrentTab();
};

window.toggleTranscript = function(elId) {
  const el = document.getElementById(elId);
  if (el) {
    el.style.display = el.style.display === "none" ? "block" : "none";
  }
};

window.updateEssay = function(topicId) {
  const ta = document.getElementById(`essay-${topicId}`);
  if (!ta) return;
  state.essays[topicId] = ta.value;
  const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
  const wcEl = document.getElementById(`wc-${topicId}`);
  if (wcEl) {
    wcEl.textContent = `Số từ hiện tại: ${words} từ (Chuẩn yêu cầu: 120 – 150 từ)`;
    wcEl.style.color = (words >= 120 && words <= 160) ? "var(--ok)" : "var(--gold)";
  }
  saveState();
};

window.insertTemplate = function(topicId) {
  const D = window.COURSE_DATA;
  const topic = D.writingTopics.find(t => t.id === topicId);
  if (!topic) return;
  const ta = document.getElementById(`essay-${topicId}`);
  if (ta) {
    ta.value = topic.template;
    updateEssay(topicId);
    showToast("Đã chèn khung mẫu câu gợi ý");
  }
};

window.exportProgress = function() {
  const exportPayload = {
    ...state,
    studentEmail: currentUser ? currentUser.email : "hocvien@gmail.com",
    studentName: currentUser ? currentUser.name : "Học viên"
  };
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tien_do_${(currentUser ? currentUser.email.split('@')[0] : 'tieng_anh_3')}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Đã tải xuống tệp tiến độ (.json)");
};

window.importProgress = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      state = { ...state, ...imported };
      saveState();
      renderCurrentTab();
      pushProgressToCloud(false);
      showToast("Đã khôi phục tiến độ học tập thành công");
    } catch (err) {
      alert("Tệp tiến độ không hợp lệ.");
    }
  };
  reader.readAsText(file);
};

window.resetAllProgress = function() {
  if (confirm("Bạn có chắc chắn muốn xóa toàn bộ tiến độ trên trình duyệt này để làm lại từ đầu không?")) {
    state.mcqAnswers = {};
    state.textAnswers = {};
    state.essays = {};
    state.flaggedQuestions = {};
    saveState();
    renderCurrentTab();
    showToast("Đã đặt lại toàn bộ bài làm");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  loadConfigAndAuth();
  loadState();

  document.querySelectorAll(".nav-tab").forEach(item => {
    item.addEventListener("click", () => {
      switchTab(item.getAttribute("data-tab"));
    });
  });

  updateAuthUI();

  const activeNav = document.querySelector(`.nav-tab[data-tab="${state.currentTab}"]`);
  if (activeNav && activeNav.style.display !== "none") {
    document.querySelectorAll(".nav-tab").forEach(n => n.classList.remove("active"));
    activeNav.classList.add("active");
  }

  updateProgressUI();
  renderCurrentTab();
});
