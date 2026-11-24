const STORAGE_KEY = "hdu_english3_133033_progress_v2";
const AUTH_STORAGE_KEY = "hdu_english3_133033_auth_v2";
const CONFIG_STORAGE_KEY = "hdu_english3_133033_cloud_config_v2";
const TEACHER_ADMIN_EMAIL = "leviethoainam287@gmail.com";

// Cấu hình kết nối Google Sheets Web App & Google Client ID
let cloudConfig = {
  appsScriptUrl: "",        // URL Web App của Google Apps Script (.../exec)
  googleClientId: "",       // Tùy chọn: Google OAuth Client ID nếu muốn dùng nút popup 1-click
  localWhitelist: [         // Danh sách Gmail được phép học (đồng bộ với Google Sheets)
    { email: "leviethoainam287@gmail.com", name: "Giảng viên Lê Viết Hoài Nam", role: "teacher", status: "active" }
  ],
  cloudStudentsProgress: [] // Dữ liệu tiến độ của các học viên tải về từ Google Sheets hoặc nạp file
};

let currentUser = null; // { email, name, role: "teacher" | "student" }

let state = {
  currentTab: "theory",
  unitFilter: "ALL",
  writtenSubTab: "wordFormation",
  mcqAnswers: {},
  textAnswers: {},
  essays: {},
  teacherComment: "",
  teacherGrade: ""
};

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
    // Check URL query param ?api=... so teacher can share link with embedded Apps Script URL!
    const params = new URLSearchParams(window.location.search);
    if (params.get("api")) {
      cloudConfig.appsScriptUrl = params.get("api").trim();
      saveCloudConfig();
    }
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (savedAuth) {
      currentUser = JSON.parse(savedAuth);
    }
  } catch (e) {
    console.warn("Load config error:", e);
  }
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
  } catch (e) {
    console.warn("Could not read localStorage:", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(getUserStorageKey(), JSON.stringify(state));
  } catch (e) {}
  updateProgressUI();
}

// ============================================================================
// HỆ THỐNG ĐĂNG NHẬP GOOGLE, KIỂM TRA QUYỀN (WHITELIST) & ĐỒNG BỘ GOOGLE SHEETS
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
  emailDisp.textContent = currentUser.email;
  roleBadge.textContent = isTeacher ? "GIẢNG VIÊN (ADMIN)" : "HỌC VIÊN";
  roleBadge.className = "role-badge " + (isTeacher ? "role-teacher" : "role-student");
  navTeacher.style.display = isTeacher ? "flex" : "none";

  if (state.teacherComment || state.teacherGrade) {
    fbBanner.style.display = "block";
    fbContent.innerHTML = `
      ${state.teacherGrade ? `<div><b>Điểm Giảng viên chấm:</b> <span style="color:var(--danger); font-weight:700;">${state.teacherGrade}</span></div>` : ""}
      ${state.teacherComment ? `<div><b>Lời phê:</b> ${state.teacherComment}</div>` : ""}
    `;
  } else {
    fbBanner.style.display = "none";
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
  const email = (emailInp.value || "").trim().toLowerCase();
  const name = (nameInp.value || "").trim() || email.split("@")[0];

  if (!email || !email.includes("@")) {
    showAuthError("Vui lòng nhập đúng địa chỉ Gmail của bạn!");
    return;
  }
  verifyAndLoginUser(email, name);
};

function showAuthError(msg) {
  const el = document.getElementById("auth-error-msg");
  el.style.display = "block";
  el.innerHTML = msg;
}

async function verifyAndLoginUser(email, name) {
  const cleanEmail = email.trim().toLowerCase();
  const isTeacher = cleanEmail === TEACHER_ADMIN_EMAIL;

  // 1. Nếu đã kết nối Google Sheets Web App URL -> Kiểm tra trực tiếp trên Google Sheets
  if (cloudConfig.appsScriptUrl) {
    try {
      showAuthError("<span style='color:var(--primary);'>⏳ Đang kiểm tra quyền truy cập trên Google Sheets của Giảng viên...</span>");
      const url = `${cloudConfig.appsScriptUrl}?action=check_user&email=${encodeURIComponent(cleanEmail)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.authorized && !isTeacher) {
        showAuthError(`⛔ Tài khoản <b>${cleanEmail}</b> chưa được Giảng viên (<b>${TEACHER_ADMIN_EMAIL}</b>) cấp quyền trong danh sách học viên! Vui lòng liên hệ Giảng viên để được thêm Gmail.`);
        return;
      }

      if (data.allAllowed) cloudConfig.localWhitelist = data.allAllowed;
      if (data.allProgress) cloudConfig.cloudStudentsProgress = data.allProgress;
      saveCloudConfig();

      currentUser = {
        email: cleanEmail,
        name: (data.user && data.user.name) || name,
        role: isTeacher ? "teacher" : "student"
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser));
      loadState();

      // Khôi phục tiến độ từ Google Sheets nếu trên máy chưa có hoặc trên Cloud mới hơn
      if (data.progress && data.progress.state && Object.keys(data.progress.state).length > 0) {
        state = { ...state, ...data.progress.state };
        state.teacherComment = data.progress.teacherComment || "";
        state.teacherGrade = data.progress.teacherGrade || "";
        saveState();
      }

      document.getElementById("auth-error-msg").style.display = "none";
      if (isTeacher) state.currentTab = "teacher";
      updateAuthUI();
      updateProgressUI();
      renderCurrentTab();
      return;
    } catch (err) {
      console.warn("Cloud check failed, falling back to local whitelist:", err);
    }
  }

  // 2. Kiểm tra danh sách Whitelist cục bộ
  const allowedUser = cloudConfig.localWhitelist.find(u => u.email.toLowerCase() === cleanEmail && u.status !== "blocked");
  if (!isTeacher && !allowedUser) {
    showAuthError(`⛔ Tài khoản <b>${cleanEmail}</b> chưa nằm trong danh sách được Giảng viên (<b>${TEACHER_ADMIN_EMAIL}</b>) cấp quyền!<br/>Hãy báo Giảng viên đăng nhập và thêm Gmail của bạn vào danh sách lớp.`);
    return;
  }

  currentUser = {
    email: cleanEmail,
    name: isTeacher ? "Giảng viên Lê Viết Hoài Nam" : (allowedUser ? allowedUser.name : name),
    role: isTeacher ? "teacher" : "student"
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser));
  document.getElementById("auth-error-msg").style.display = "none";
  loadState();
  if (isTeacher) state.currentTab = "teacher";
  updateAuthUI();
  updateProgressUI();
  renderCurrentTab();
}

window.logoutUser = function() {
  currentUser = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  updateAuthUI();
};

// Đẩy (Push) tiến độ của học viên lên Google Sheets của Giảng viên
window.pushProgressToCloud = async function(showAlert = false) {
  if (!currentUser || !currentUser.email) {
    updateAuthUI();
    return;
  }
  const st = computeStats();
  const acc = st.totalDone ? Math.round((st.totalCorrect / st.totalDone) * 100) : 0;
  const statusEl = document.getElementById("cloud-sync-status");

  // Lưu bản ghi vào bộ nhớ quản lý trên máy
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
    if (statusEl) statusEl.innerHTML = "● Đã lưu tại máy (Chưa gắn link Google Sheets)";
    if (showAlert) {
      alert("Đã lưu tiến độ trên trình duyệt! (Để đồng bộ trực tuyến về Google Sheets từ xa, Giảng viên chỉ cần dán link Web App Google Sheets vào mục Cài đặt trên Trang Giảng Viên).");
    }
    return;
  }

  try {
    if (statusEl) statusEl.innerHTML = "⏳ Đang đồng bộ lên Google Sheets...";
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
      if (statusEl) statusEl.innerHTML = `✔ Đã đẩy lên Google Sheets (${data.savedAt || "vừa xong"})`;
      if (showAlert) alert("✔ Đã đẩy toàn bộ tiến độ và bài viết lên Google Sheets của Giảng viên thành công!");
    } else {
      if (statusEl) statusEl.innerHTML = "⚠ Lỗi quyền truy cập khi đẩy lên Sheets";
      if (showAlert) alert("Không thể đẩy dữ liệu: " + (data.error || "Chưa được cấp quyền"));
    }
  } catch (err) {
    if (statusEl) statusEl.innerHTML = "⚠ Không thể kết nối Google Sheets";
    if (showAlert) alert("Lỗi kết nối tới Google Sheets Web App: " + err.message);
  }
};

function normalizeStr(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[.?!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Speech Synthesis for Listening sections
function speakText(text, rate = 0.95) {
  if (!("speechSynthesis" in window)) {
    alert("Trình duyệt của bạn không hỗ trợ đọc giọng nói tự động. Hãy bật hiện Transcript để đọc bài nghe.");
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

// Compute stats for all sections
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

  // Compute Mock Score out of 10.0
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
  document.getElementById("overall-bar").style.width = `${pct}%`;
  document.getElementById("overall-detail").textContent = `Đã làm: ${st.totalDone} / ${st.grandTotal} câu • Đúng: ${st.totalCorrect}`;
  document.getElementById("stat-done").textContent = `Đã hoàn thành: ${st.totalDone} / ${st.grandTotal} câu`;
  document.getElementById("stat-acc").textContent = `Tỷ lệ đúng: ${acc}% (${st.totalCorrect} câu)`;
}

// Render MCQ card
function renderMcqCard(q) {
  const letters = ["A", "B", "C", "D"];
  const userAns = state.mcqAnswers[q.id];
  const isAnswered = Boolean(userAns);
  const isCorrect = userAns === q.answer;

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
      <b>${letter}.</b> <span>${optText}</span>
    </button>`;
  });

  const fbClass = isAnswered ? (isCorrect ? "feedback-box show ok" : "feedback-box show err") : "feedback-box";
  const fbTitle = isCorrect ? "✔ Chính xác!" : `✘ Chưa đúng. Đáp án đúng là ${q.answer}.`;

  return `<div class="${cardClass}" id="card-${q.id}">
    <div class="q-prompt">${q.unit ? `<span class="stat-pill" style="padding:2px 8px; font-size:0.75rem; margin-right:6px;">${q.unit}</span>` : ""}${q.prompt}</div>
    <div class="options-grid">${optsHtml}</div>
    <div class="${fbClass}">
      <b>${fbTitle}</b> ${q.explanation || ""}
    </div>
  </div>`;
}

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
  const fbClass = isChecked ? (isCorrect ? "feedback-box show ok" : "feedback-box show err") : "feedback-box";
  const ansListStr = validAnswers.join(" / ");

  return `<div class="${cardClass}">
    <div class="q-prompt"><b>Câu ${num}:</b> ${promptHtml}</div>
    <div class="input-row">
      <input type="text" class="text-input" id="input-${id}" value="${val.replace(/"/g, '&quot;')}" placeholder="Nhập câu trả lời của bạn..." onkeydown="if(event.key==='Enter') checkWritten('${id}')" />
      <button class="btn" onclick="checkWritten('${id}')">Kiểm tra</button>
    </div>
    <div class="${fbClass}">
      <b>${isCorrect ? "✔ Chính xác!" : "✘ Chưa khớp đáp án."}</b>
      <div><b>Đáp án chuẩn:</b> ${hintOrDisplay || ansListStr}</div>
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
// TRANG QUẢN LÝ CỦA GIẢNG VIÊN (TEACHER DASHBOARD - leviethoainam287@gmail.com)
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
      <td><span class="role-badge ${u.role === 'teacher' ? 'role-teacher' : 'role-student'}">${u.role === 'teacher' ? 'Giảng viên' : 'Học viên'}</span></td>
      <td><span style="color:var(--success); font-weight:600;">● Đã cấp quyền</span></td>
      <td>
        ${u.email !== TEACHER_ADMIN_EMAIL
          ? `<button class="btn btn-danger" style="padding:4px 10px; font-size:0.78rem;" onclick="removeStudentEmail('${u.email}')">Xóa quyền</button>`
          : `<span style="font-size:0.78rem; color:var(--muted);">Quản trị viên</span>`}
      </td>
    </tr>
  `).join("");

  let progressCards = "";
  if (cloudConfig.cloudStudentsProgress.length === 0) {
    progressCards = `<div style="padding:18px; background:#f8fafc; border-radius:8px; text-align:center; color:var(--muted);">
      Chưa có dữ liệu tiến độ học viên gửi lên. Học viên sau khi đăng nhập và làm bài bấm nút <b>"☁ Nộp / Đồng bộ bài"</b> (hoặc gửi file <code>.json</code> để bạn nạp vào bên dưới) sẽ hiển thị chi tiết tại đây.
    </div>`;
  } else {
    cloudConfig.cloudStudentsProgress.forEach((stu, idx) => {
      const sStats = computeStats(stu.state || {});
      const essaysHtml = D.writingTopics.map(t => {
        const txt = ((stu.state && stu.state.essays) ? stu.state.essays[t.id] : "") || "";
        const wc = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        if (!txt.trim()) return "";
        return `<div style="background:#fffbeb; border:1px solid #fde68a; padding:10px 14px; border-radius:8px; margin-top:8px;">
          <b>${t.title} (${wc} từ):</b>
          <div style="white-space:pre-line; font-size:0.9rem; margin-top:4px;">${txt}</div>
        </div>`;
      }).join("");
      const mockEssay = ((stu.state && stu.state.essays) ? stu.state.essays["mock_essay"] : "") || "";

      progressCards += `<div class="q-card" style="border-left:5px solid var(--primary-light);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <h3 style="margin:0;">👤 ${stu.name} (${stu.email})</h3>
            <div style="font-size:0.8rem; color:var(--muted);">Cập nhật lần cuối: ${stu.updatedAt || "Vừa xong"}</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <span class="stat-pill">Tổng số câu đã làm: ${sStats.totalDone}/${sStats.grandTotal}</span>
            <span class="stat-pill" style="background:var(--success-bg); color:var(--success);">Đúng: ${sStats.totalCorrect} câu (${stu.accuracy})</span>
            <span class="stat-pill" style="background:var(--warning-bg); color:var(--warning);">Thi thử: ${sStats.mockScoreTotal}/10đ</span>
          </div>
        </div>

        <table class="data-table" style="margin-top:12px;">
          <thead>
            <tr>
              <th>Ngữ âm (30)</th>
              <th>TN Units 7-12 (60)</th>
              <th>Ngữ pháp B (30)</th>
              <th>Tự luận (55)</th>
              <th>Nghe (15)</th>
              <th>Đọc PET (23)</th>
              <th>Bài viết (6)</th>
              <th>Đề thi thử</th>
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
              <td><b>${sStats.mockScoreTotal} / 10đ</b></td>
            </tr>
          </tbody>
        </table>

        ${essaysHtml ? `<div style="margin-top:12px;"><b>📝 Các bài luyện viết của học viên:</b>${essaysHtml}</div>` : ""}
        ${mockEssay ? `<div style="background:#eff6ff; border:1px solid #bfdbfe; padding:10px 14px; border-radius:8px; margin-top:8px;"><b>📝 Bài viết trong Đề Thi Thử:</b><div style="white-space:pre-line; font-size:0.9rem; margin-top:4px;">${mockEssay}</div></div>` : ""}

        <div style="margin-top:14px; padding-top:12px; border-top:1px dashed var(--border); display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <input type="text" id="grade-score-${idx}" class="text-input" style="max-width:160px;" placeholder="Điểm GV chấm (vd: 8.5/10)" value="${(stu.teacherGrade || '').replace(/"/g, '&quot;')}" />
          <input type="text" id="grade-comment-${idx}" class="text-input" placeholder="Nhập nhận xét / sửa bài cho học viên..." value="${(stu.teacherComment || '').replace(/"/g, '&quot;')}" />
          <button class="btn btn-success" onclick="saveTeacherGrade('${stu.email}', ${idx})">💾 Lưu Điểm & Gửi Nhận Xét</button>
        </div>
      </div>`;
    });
  }

  return `
    <div class="card">
      <h2>1. Quản Lý Danh Sách Học Viên Được Phép Truy Cập (Google Whitelist)</h2>
      <p style="font-size:0.9rem; color:var(--muted); margin-bottom:12px;">
        Chỉ những học viên có địa chỉ Gmail trong bảng dưới đây mới được phép đăng nhập vào web và đẩy tiến độ lên hệ thống của bạn.
      </p>
      <div class="input-row" style="margin-bottom:14px;">
        <input type="email" id="new-student-email" class="text-input" placeholder="Nhập Gmail của học viên cần cấp quyền (vd: sinhvien@gmail.com)..." />
        <input type="text" id="new-student-name" class="text-input" placeholder="Họ và tên học viên..." />
        <button class="btn btn-success" onclick="addStudentEmail()">+ Cấp Quyền Gmail Này</button>
      </div>
      <table class="data-table">
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

    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
        <div>
          <h2 style="margin-bottom:2px;">2. Theo Dõi Tiến Độ & Chấm Bài Của Học Viên</h2>
          <p style="font-size:0.88rem; color:var(--muted);">Xem chi tiết số câu đúng/sai từng chuyên đề, đọc bài luận 120–150 từ và chấm điểm</p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn" onclick="refreshFromGoogleSheets()">🔄 Tải Dữ Liệu Mới Nhất Từ Google Sheets</button>
          <label class="btn btn-outline" style="cursor:pointer;">
            📂 Nạp File .JSON Của Học Viên
            <input type="file" accept=".json" style="display:none" onchange="importStudentJsonForReview(event)" />
          </label>
        </div>
      </div>
      ${progressCards}
    </div>

    <div class="card">
      <h2>3. Kết Nối Cơ Sở Dữ Liệu Google Sheets (Cách 2 – Miễn Phí 100%)</h2>
      <p style="font-size:0.9rem; color:var(--muted); margin-bottom:12px;">
        Kết nối trang GitHub Pages này với file Google Trang tính trên tài khoản <b>${TEACHER_ADMIN_EMAIL}</b> của bạn để học viên ngồi ở nhà bấm "Đồng bộ" là điểm và bài viết tự động nhảy vào Google Sheets của bạn:
      </p>
      <div style="background:#f8fafc; border:1px solid var(--border); border-radius:8px; padding:14px 18px; font-size:0.88rem; margin-bottom:14px;">
        <b>3 bước cài đặt siêu nhanh (chỉ làm 1 lần duy nhất):</b>
        <ol style="padding-left:20px; margin-top:6px;">
          <li>Mở <a href="https://sheets.new" target="_blank" style="color:var(--primary-light); font-weight:600;">Google Sheets mới (sheets.new)</a> bằng Gmail <b>${TEACHER_ADMIN_EMAIL}</b>.</li>
          <li>Trên thanh menu chọn <b>Tiện ích mở rộng (Extensions)</b> → <b>Apps Script</b>. Xóa code mặc định, mở file <code>google_apps_script_backend.gs</code> trong thư mục dự án (hoặc bấm nút <b>"📋 Copy Mã Apps Script"</b> ngay bên dưới) dán vào rồi bấm <b>Lưu</b>.</li>
          <li>Bấm <b>Triển khai (Deploy)</b> → <b>Tùy chọn triển khai mới (New deployment)</b> → Loại: <b>Ứng dụng web (Web app)</b> → Ai có quyền truy cập: chọn <b>"Bất kỳ ai" (Anyone)</b> → Bấm <b>Triển khai</b> và copy đường link <b>URL ứng dụng web (có đuôi <code>/exec</code>)</b> dán vào ô dưới đây:</li>
        </ol>
        <div style="margin-top:10px;">
          <button class="btn btn-outline" style="padding:6px 12px; font-size:0.82rem;" onclick="copyAppsScriptCode()">📋 Copy Mã Google Apps Script (google_apps_script_backend.gs)</button>
        </div>
      </div>
      <div class="input-row">
        <input type="url" id="apps-script-url-input" class="text-input" placeholder="Dán URL Web App của Google Apps Script (https://script.google.com/macros/s/.../exec) vào đây..." value="${cloudConfig.appsScriptUrl}" />
        <button class="btn" onclick="saveAppsScriptUrl()">💾 Lưu Kết Nối Google Sheets</button>
      </div>
      ${cloudConfig.appsScriptUrl ? `
        <div style="margin-top:12px; padding:10px 14px; background:var(--success-bg); color:var(--success); border-radius:8px; font-size:0.86rem;">
          <b>✔ Đã kết nối Google Sheets!</b> Đường link gửi cho học viên (đã nhúng sẵn kết nối Google Sheets của bạn):<br/>
          <code style="word-break:break-all; background:#fff; padding:4px 8px; border-radius:4px; display:inline-block; margin-top:4px;">${shareUrl}</code>
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
    alert("Vui lòng nhập đúng địa chỉ Gmail của học viên!");
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
    } catch (e) {
      console.warn("Could not sync whitelist to Sheets:", e);
    }
  }
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
  renderCurrentTab();
};

window.saveAppsScriptUrl = function() {
  const inp = document.getElementById("apps-script-url-input");
  cloudConfig.appsScriptUrl = (inp.value || "").trim();
  saveCloudConfig();
  alert("✔ Đã lưu địa chỉ Google Sheets Web App thành công!");
  renderCurrentTab();
  if (cloudConfig.appsScriptUrl) refreshFromGoogleSheets();
};

window.refreshFromGoogleSheets = async function() {
  if (!cloudConfig.appsScriptUrl) {
    alert("Bạn chưa dán link URL Web App Google Sheets ở Mục 3!");
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
    alert("✔ Đã tải danh sách học viên và tiến độ mới nhất từ Google Sheets!");
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
  alert(`✔ Đã lưu điểm (${grade}) và nhận xét cho học viên ${studentEmail}!`);
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
      const email = importedState.studentEmail || prompt("Nhập Gmail hoặc tên của học viên cho file này:", "hocvien@gmail.com") || "hocvien@gmail.com";
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
      alert("✔ Đã nạp dữ liệu bài làm của học viên vào Trang Giảng Viên!");
    } catch (err) {
      alert("File JSON không hợp lệ!");
    }
  };
  reader.readAsText(file);
};

window.copyAppsScriptCode = async function() {
  try {
    const res = await fetch("google_apps_script_backend.gs");
    const txt = await res.text();
    await navigator.clipboard.writeText(txt);
    alert("✔ Đã copy toàn bộ mã Google Apps Script vào bộ nhớ tạm! Bạn chỉ cần mở Google Sheets -> Tiện ích mở rộng -> Apps Script và dán (Ctrl+V / Cmd+V) vào.");
  } catch (e) {
    alert("Bạn có thể mở file 'google_apps_script_backend.gs' trong thư mục dự án hoặc trên GitHub repository để copy mã.");
  }
};

// Render Tabs
function renderCurrentTab() {
  const D = window.COURSE_DATA;
  const area = document.getElementById("content-area");
  const titleEl = document.getElementById("section-title");
  const subEl = document.getElementById("section-sub");

  if (state.currentTab === "teacher") {
    if (!currentUser || currentUser.email.toLowerCase() !== TEACHER_ADMIN_EMAIL) {
      state.currentTab = "theory";
      return renderCurrentTab();
    }
    titleEl.textContent = "👨‍🏫 Trang Quản Lý Giảng Viên (leviethoainam287@gmail.com)";
    subEl.textContent = "Cấp quyền Gmail cho học viên (Whitelist), xem tiến độ chi tiết, đọc bài viết và chấm điểm trực tuyến";
    area.innerHTML = renderTeacherDashboard();
    return;
  }

  if (state.currentTab === "theory") {
    titleEl.textContent = "1. Hệ Thống Lý Thuyết Trọng Tâm (Units 7 – 12)";
    subEl.textContent = "Tóm tắt toàn bộ ngữ pháp Speakout Pre-Intermediate B1 & Ngữ pháp trình độ B";
    let html = "";
    D.unitsTheory.forEach(u => {
      html += `<div class="card">
        <h2>${u.title}</h2>
        <h3>A. Ngữ pháp cốt lõi (Grammar)</h3>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${u.grammar.map(g => `<div style="background:#f8fafc; padding:10px 14px; border-left:3px solid var(--primary-light); border-radius:4px;">${g}</div>`).join("")}
        </div>
        <h3>B. Từ vựng theo chủ đề (Vocabulary)</h3>
        <ul style="padding-left:20px;">
          ${u.vocab.map(v => `<li style="margin-bottom:4px;">${v}</li>`).join("")}
        </ul>
        <h3>C. Ngữ âm & Giao tiếp (Pronunciation & Function)</h3>
        <div style="background:var(--primary-bg); padding:10px 14px; border-radius:6px; font-size:0.92rem;">${u.pronunciation}</div>
      </div>`;
    });
    area.innerHTML = html;
  }

  else if (state.currentTab === "pron") {
    titleEl.textContent = "2. Chuyên Đề Ngữ Âm, Trọng Âm & Ngữ Điệu Giao Tiếp (30 Câu - CLO1)";
    subEl.textContent = "Bao gồm phát âm đuôi -s/-es, âm câm (Silent letters), trọng âm từ & ngữ âm Speakout (Weak forms, Multi-word verb stress)";
    area.innerHTML = D.pronunciationQuestions.map(renderMcqCard).join("");
  }

  else if (state.currentTab === "unit_mcq") {
    titleEl.textContent = "3. Trắc Nghiệm Từ Vựng, Ngữ Pháp & Giao Tiếp Theo Bài (60 Câu - CLO1)";
    subEl.textContent = "Chọn Unit bên dưới để lọc bài tập hoặc luyện toàn bộ 60 câu";
    const units = ["ALL", "Unit 7", "Unit 8", "Unit 9", "Unit 10", "Unit 11", "Unit 12"];
    let filterHtml = `<div class="filter-bar">` + units.map(u =>
      `<button class="filter-btn ${state.unitFilter === u ? 'active' : ''}" onclick="setUnitFilter('${u}')">${u === 'ALL' ? 'Tất cả (60 câu)' : u}</button>`
    ).join("") + `</div>`;

    const filtered = state.unitFilter === "ALL"
      ? D.unitMcqQuestions
      : D.unitMcqQuestions.filter(q => q.unit === state.unitFilter);

    area.innerHTML = filterHtml + filtered.map(renderMcqCard).join("");
  }

  else if (state.currentTab === "b_gram") {
    titleEl.textContent = "4. Trọng Tâm Ngữ Pháp Trình Độ B Phân Loại Cao (30 Câu - CLO1)";
    subEl.textContent = "Xoáy sâu vào các cấu trúc Subjunctives, Would rather / Prefer / Had better / It's high time, Reported Questions & Passive";
    area.innerHTML = D.bGrammarQuestions.map(renderMcqCard).join("");
  }

  else if (state.currentTab === "written") {
    titleEl.textContent = "5. Bài Tập Tự Luận Từ Vựng, Đại Từ & Viết Lại Câu (55 Câu - CLO1 & CLO4)";
    subEl.textContent = "Nhập đáp án vào ô trống và bấm Kiểm tra (hoặc phím Enter) để chấm điểm tự động";
    const tabs = [
      { id: "wordFormation", label: "4A. Word Formation (10 câu)" },
      { id: "prepositions", label: "4B. Giới từ & Cụm ĐT (10 câu)" },
      { id: "pronouns", label: "4C. Đại từ liên kết (5 câu)" },
      { id: "errorCorrection", label: "4D. Sửa lỗi sai (10 câu)" },
      { id: "sentenceTransformation", label: "4E. Viết lại câu (20 câu)" }
    ];
    let navHtml = `<div class="filter-bar">` + tabs.map(t =>
      `<button class="filter-btn ${state.writtenSubTab === t.id ? 'active' : ''}" onclick="setWrittenSubTab('${t.id}')">${t.label}</button>`
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
    titleEl.textContent = "6. Luyện Kỹ Năng Nghe Hiểu Chuẩn Speakout & PET B1 (15 Câu - CLO2)";
    subEl.textContent = "Bấm nút '🔊 Nghe Audio' để nghe giọng đọc tiếng Anh tự động hoặc xem Transcript để phân tích từ khóa";
    let html = "";
    D.listeningSections.forEach(sec => {
      const safeScript = sec.audioScript.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      html += `<div class="card">
        <h2>${sec.title}</h2>
        <div class="audio-panel">
          <div>
            <b>🎧 Audio Player (Giọng đọc chuẩn B1)</b>
            <div style="font-size:0.82rem; color:var(--muted);">Có thể nghe tốc độ chuẩn hoặc tốc độ chậm 0.8x</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn" onclick="speakText('${safeScript}', 0.95)">🔊 Nghe Audio (1.0x)</button>
            <button class="btn btn-outline" onclick="speakText('${safeScript}', 0.78)">🐢 Nghe Chậm (0.8x)</button>
            <button class="btn btn-outline" onclick="stopAudio()">⏹ Dừng</button>
            <button class="btn btn-outline" onclick="toggleTranscript('tr-${sec.id}')">📄 Hiện/Ẩn Transcript</button>
          </div>
        </div>
        <div id="tr-${sec.id}" class="passage-box" style="display:none;">
          <b>Audio Transcript:</b><br/>${sec.audioScript}
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
    titleEl.textContent = "7. Luyện Kỹ Năng Đọc Hiểu Chuẩn Cambridge PET B1 (23 Câu - CLO3)";
    subEl.textContent = "Bao gồm Đọc biển báo/thông báo ngắn (PET Part 1), Đọc điền từ Cloze Text và Đọc hiểu bài báo B1";
    let html = "";
    D.readingSections.forEach(sec => {
      html += `<div class="card">
        <h2>${sec.title}</h2>
        <div class="passage-box">${sec.passage}</div>
        ${sec.questions.map(renderMcqCard).join("")}
      </div>`;
    });
    area.innerHTML = html;
  }

  else if (state.currentTab === "writing") {
    titleEl.textContent = "8. Luyện Viết Đoạn Văn & Thư Trang Trọng 120–150 Từ (6 Chủ Đề - CLO4)";
    subEl.textContent = "Có khung mẫu câu (Writing Templates), bộ đếm số từ tự động (chuẩn 120–150 từ) và bài mẫu đạt 10/10 điểm";
    let html = "";
    D.writingTopics.forEach(t => {
      const savedText = state.essays[t.id] || "";
      const words = savedText.trim() ? savedText.trim().split(/\s+/).length : 0;
      const wordColor = (words >= 120 && words <= 160) ? "var(--success)" : (words > 0 ? "var(--warning)" : "var(--muted)");

      html += `<div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
          <h2>${t.title}</h2>
          <span class="stat-pill">${t.unit}</span>
        </div>
        <p style="margin:8px 0 12px; font-weight:600;">Đề bài: ${t.prompt}</p>
        <div style="background:#f8fafc; padding:12px 16px; border-radius:8px; margin-bottom:12px; font-size:0.88rem;">
          <b>✔ Tiêu chí cần có trong bài (Checklist Rubric 2):</b>
          <ul style="padding-left:20px; margin-top:4px;">
            ${t.checklist.map(c => `<li>${c}</li>`).join("")}
          </ul>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <button class="btn btn-outline" onclick="insertTemplate('${t.id}')">📋 Chèn Khung Mẫu Câu (Template) Vào Ô Viết</button>
          <button class="btn btn-outline" onclick="toggleTranscript('model-${t.id}')">👁 Xem Bài Viết Mẫu Đạt 10/10</button>
        </div>
        <div id="model-${t.id}" class="passage-box" style="display:none;">
          <b>Bài viết mẫu chuẩn B1 (140+ từ):</b><br/>
          <div style="white-space:pre-line; margin-top:6px;">${t.modelEssay}</div>
        </div>
        <textarea class="writing-area" id="essay-${t.id}" placeholder="Viết bài của bạn tại đây (hệ thống tự động lưu khi bạn gõ)..." oninput="updateEssay('${t.id}')">${savedText}</textarea>
        <div class="word-count-bar">
          <span id="wc-${t.id}" style="color:${wordColor};">Số từ hiện tại: ${words} từ (Mục tiêu CLO4: 120 – 150 từ)</span>
          <button class="btn btn-success" style="padding:5px 12px; font-size:0.8rem;" onclick="pushProgressToCloud(true)">☁ Gửi bài viết này lên Giảng viên</button>
        </div>
      </div>`;
    });
    area.innerHTML = html;
  }

  else if (state.currentTab === "mock") {
    titleEl.textContent = "9. Đề Thi Thử Kết Thúc Học Phần Chuẩn Ma Trận (10.0 Điểm)";
    subEl.textContent = "Cấu trúc: Phần 1 (CLO1: 3.0đ) • Phần 2 (CLO2: 2.0đ) • Phần 3 (CLO3: 3.0đ) • Phần 4 (CLO4: 2.0đ)";
    const M = D.mockExam;
    const safeAudioA = M.audioScriptA.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    const safeAudioB = M.audioScriptB.replace(/'/g, "\\'").replace(/"/g, "&quot;");

    let autoPoints = 0;
    [].concat(M.part1Questions, M.part2Questions, M.part3Questions).forEach(q => {
      if (state.mcqAnswers[q.id] === q.answer) autoPoints += q.points;
    });
    M.part4Rewrites.forEach(rw => {
      if (state.textAnswers[rw.id] && state.textAnswers[rw.id].isCorrect) autoPoints += rw.points;
    });
    const mockEssayText = (state.essays["mock_essay"] || "").trim();
    const mockWords = mockEssayText ? mockEssayText.split(/\s+/).length : 0;
    const essayPoints = mockWords >= 120 ? 1.2 : (mockWords >= 60 ? 0.6 : 0);
    const totalScore = (autoPoints + essayPoints).toFixed(1);

    let html = `<div class="card" style="background:var(--primary-bg); border-color:#93c5fd;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <h2 style="margin-bottom:4px;">BẢNG ĐIỂM ĐỀ THI THỬ HIỆN TẠI: ${totalScore} / 10.0 ĐIỂM</h2>
          <p style="font-size:0.88rem; color:var(--text);">Điểm Trắc nghiệm & Viết lại câu: <b>${autoPoints.toFixed(1)} / 8.8đ</b> • Điểm Bài viết đoạn văn (120–150 từ): <b>${essayPoints.toFixed(1)} / 1.2đ</b></p>
        </div>
        <button class="btn btn-success" onclick="pushProgressToCloud(true)">☁ Nộp Bài Thi Thử Lên Giảng Viên</button>
      </div>
    </div>`;

    html += `<div class="card">
      <h2>PART 1: PRONUNCIATION, VOCABULARY, GRAMMAR & COMMUNICATION (CLO1 – 3.0 POINTS)</h2>
      <p style="color:var(--muted); font-size:0.88rem; margin-bottom:14px;">15 câu × 0.2 điểm = 3.0 điểm</p>
      ${M.part1Questions.map(renderMcqCard).join("")}
    </div>`;

    html += `<div class="card">
      <h2>PART 2: LISTENING COMPREHENSION (CLO2 – 2.0 POINTS)</h2>
      <p style="color:var(--muted); font-size:0.88rem; margin-bottom:14px;">10 câu × 0.2 điểm = 2.0 điểm</p>
      <div class="audio-panel">
        <b>🎧 Section A (Questions 16–20): Study Abroad Office Conversation</b>
        <div style="display:flex; gap:8px;">
          <button class="btn" onclick="speakText('${safeAudioA}', 0.95)">🔊 Nghe Section A</button>
          <button class="btn btn-outline" onclick="stopAudio()">⏹ Dừng</button>
          <button class="btn btn-outline" onclick="toggleTranscript('tr-mock-a')">📄 Transcript A</button>
        </div>
      </div>
      <div id="tr-mock-a" class="passage-box" style="display:none;">${M.audioScriptA}</div>
      ${M.part2Questions.filter(q => q.section === "A").map(renderMcqCard).join("")}

      <div class="audio-panel" style="margin-top:20px;">
        <b>🎧 Section B (Questions 21–25): Radio Report – Plastic-Free Town</b>
        <div style="display:flex; gap:8px;">
          <button class="btn" onclick="speakText('${safeAudioB}', 0.95)">🔊 Nghe Section B</button>
          <button class="btn btn-outline" onclick="stopAudio()">⏹ Dừng</button>
          <button class="btn btn-outline" onclick="toggleTranscript('tr-mock-b')">📄 Transcript B</button>
        </div>
      </div>
      <div id="tr-mock-b" class="passage-box" style="display:none;">${M.audioScriptB}</div>
      ${M.part2Questions.filter(q => q.section === "B").map(renderMcqCard).join("")}
    </div>`;

    html += `<div class="card">
      <h2>PART 3: READING COMPREHENSION (CLO3 – 3.0 POINTS)</h2>
      <p style="color:var(--muted); font-size:0.88rem; margin-bottom:14px;">10 câu × 0.3 điểm = 3.0 điểm</p>
      <h3>Section A (Questions 26–30): Cloze Test</h3>
      <div class="passage-box">${M.readingClozePassage}</div>
      ${M.part3Questions.filter(q => q.section === "A").map(renderMcqCard).join("")}

      <h3 style="margin-top:20px;">Section B (Questions 31–35): Reading Comprehension</h3>
      <div class="passage-box">${M.readingCompPassage}</div>
      ${M.part3Questions.filter(q => q.section === "B").map(renderMcqCard).join("")}
    </div>`;

    html += `<div class="card">
      <h2>PART 4: WRITING (CLO4 – 2.0 POINTS)</h2>
      <h3>Section A (0.8 points – 4 câu × 0.2 điểm): Sentence Transformation</h3>
      ${M.part4Rewrites.map(rw => renderWrittenCard(rw.id, rw.num, rw.prompt, rw.answers, rw.displayAnswer)).join("")}

      <h3 style="margin-top:20px;">Section B (1.2 points): Paragraph / Short Essay Writing (120–150 words)</h3>
      <p style="font-size:0.92rem; margin-bottom:8px;">
        Chọn 1 trong 2 đề sau và viết đoạn văn/bài luận ngắn khoảng 120–150 từ:<br/>
        • <b>Option 1:</b> Write a short essay giving your opinion on the advantages and disadvantages of using social media / the Internet for university students.<br/>
        • <b>Option 2:</b> Write a short paragraph/essay about an important decision or change in your life and how it affected you.
      </p>
      <textarea class="writing-area" id="essay-mock_essay" placeholder="Nhập bài viết thi thử của bạn (viết đủ 120 từ trở lên để được cộng 1.2 điểm vào tổng điểm thi thử)..." oninput="updateEssay('mock_essay')">${mockEssayText}</textarea>
      <div class="word-count-bar">
        <span id="wc-mock_essay">Số từ hiện tại: ${mockWords} từ (Đủ 120 từ = 1.2 điểm)</span>
        <button class="btn btn-success" style="padding:5px 12px; font-size:0.8rem;" onclick="pushProgressToCloud(true)">☁ Nộp bài viết lên Giảng viên</button>
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
    wcEl.textContent = `Số từ hiện tại: ${words} từ (Mục tiêu CLO4: 120 – 150 từ)`;
    wcEl.style.color = (words >= 120 && words <= 160) ? "var(--success)" : "var(--warning)";
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
  }
};

// Export / Import / Reset Progress
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
      alert("Đã khôi phục tiến độ học tập thành công!");
    } catch (err) {
      alert("File tiến độ không hợp lệ!");
    }
  };
  reader.readAsText(file);
};

window.resetAllProgress = function() {
  if (confirm("Bạn có chắc chắn muốn xóa toàn bộ tiến độ để làm lại từ đầu không?")) {
    state.mcqAnswers = {};
    state.textAnswers = {};
    state.essays = {};
    saveState();
    renderCurrentTab();
  }
};

// Setup navigation
document.addEventListener("DOMContentLoaded", () => {
  loadConfigAndAuth();
  loadState();

  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      stopAudio();
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      item.classList.add("active");
      state.currentTab = item.getAttribute("data-tab");
      saveState();
      renderCurrentTab();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  updateAuthUI();

  const activeNav = document.querySelector(`.nav-item[data-tab="${state.currentTab}"]`);
  if (activeNav && activeNav.style.display !== "none") {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    activeNav.classList.add("active");
  }

  updateProgressUI();
  renderCurrentTab();
});
