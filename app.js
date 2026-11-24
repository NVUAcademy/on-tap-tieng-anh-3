const STORAGE_KEY = "hdu_english3_133033_progress_v2";

let state = {
  currentTab: "theory",
  unitFilter: "ALL",
  writtenSubTab: "wordFormation",
  mcqAnswers: {},      // { questionId: "A" | "B" | "C" | "D" }
  textAnswers: {},     // { questionId: { value: "...", isCorrect: true/false } }
  essays: {},          // { topicId: "essay text..." }
  mockSubmitted: false,
  mockScore: null
};

// Load saved progress from localStorage
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save to localStorage:", e);
  }
  updateProgressUI();
}

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
function computeStats() {
  const D = window.COURSE_DATA;
  let totalDone = 0;
  let totalCorrect = 0;

  const countMcqList = (list) => {
    let done = 0, corr = 0;
    list.forEach(q => {
      const ans = state.mcqAnswers[q.id];
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

  // Written (55 items)
  let wDone = 0, wCorr = 0, wTotal = 0;
  Object.keys(D.writtenExercises).forEach(cat => {
    D.writtenExercises[cat].forEach(item => {
      wTotal++;
      const id = `w_${cat}_${item.num}`;
      if (state.textAnswers[id] && state.textAnswers[id].value) {
        wDone++;
        if (state.textAnswers[id].isCorrect) wCorr++;
      }
    });
  });

  // Listening (15 items)
  let lDone = 0, lCorr = 0, lTotal = 15;
  D.listeningSections.forEach(sec => {
    if (sec.questions) {
      sec.questions.forEach(q => {
        if (state.mcqAnswers[q.id]) {
          lDone++;
          if (state.mcqAnswers[q.id] === q.answer) lCorr++;
        }
      });
    }
    if (sec.fillQuestions) {
      sec.fillQuestions.forEach(fq => {
        if (state.textAnswers[fq.id] && state.textAnswers[fq.id].value) {
          lDone++;
          if (state.textAnswers[fq.id].isCorrect) lCorr++;
        }
      });
    }
  });

  // Reading (23 items)
  let rList = [];
  D.readingSections.forEach(sec => { rList = rList.concat(sec.questions); });
  const readStats = countMcqList(rList);

  // Writing topics (6 essays)
  let essayDone = 0;
  D.writingTopics.forEach(t => {
    const txt = (state.essays[t.id] || "").trim();
    const words = txt ? txt.split(/\s+/).length : 0;
    if (words >= 50) essayDone++;
  });

  // Mock Exam (39 questions + 1 essay)
  const mMcqs = [].concat(D.mockExam.part1Questions, D.mockExam.part2Questions, D.mockExam.part3Questions);
  const mStats = countMcqList(mMcqs);
  let mRwDone = 0, mRwCorr = 0;
  D.mockExam.part4Rewrites.forEach(rw => {
    if (state.textAnswers[rw.id] && state.textAnswers[rw.id].value) {
      mRwDone++;
      if (state.textAnswers[rw.id].isCorrect) mRwCorr++;
    }
  });

  totalDone = pronStats.done + unitStats.done + bGramStats.done + wDone + lDone + readStats.done + mStats.done + mRwDone;
  totalCorrect = pronStats.corr + unitStats.corr + bGramStats.corr + wCorr + lCorr + readStats.corr + mStats.corr + mRwCorr;
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
  // Check writtenExercises
  for (const cat of Object.keys(D.writtenExercises)) {
    for (const item of D.writtenExercises[cat]) {
      if (`w_${cat}_${item.num}` === id) return item;
    }
  }
  // Check listening gap fill
  for (const sec of D.listeningSections) {
    if (sec.fillQuestions) {
      for (const fq of sec.fillQuestions) {
        if (fq.id === id) return fq;
      }
    }
  }
  // Check mock exam rewrites
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
};

// Render Tabs
function renderCurrentTab() {
  const D = window.COURSE_DATA;
  const area = document.getElementById("content-area");
  const titleEl = document.getElementById("section-title");
  const subEl = document.getElementById("section-sub");

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
    D.listeningSections.forEach((sec, idx) => {
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
          <span style="color:var(--success); font-size:0.82rem;">✔ Đã tự động lưu</span>
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

    // Compute current mock score out of 8.8 automated points + 1.2 essay points
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
      </div>
    </div>`;

    // Part 1
    html += `<div class="card">
      <h2>PART 1: PRONUNCIATION, VOCABULARY, GRAMMAR & COMMUNICATION (CLO1 – 3.0 POINTS)</h2>
      <p style="color:var(--muted); font-size:0.88rem; margin-bottom:14px;">15 câu × 0.2 điểm = 3.0 điểm</p>
      ${M.part1Questions.map(renderMcqCard).join("")}
    </div>`;

    // Part 2
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

    // Part 3
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

    // Part 4
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
        <span style="color:var(--success); font-size:0.82rem;">✔ Đã tự động lưu</span>
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
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tien_do_tieng_anh_3_${new Date().toISOString().slice(0, 10)}.json`;
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

  // Restore active tab highlight
  const activeNav = document.querySelector(`.nav-item[data-tab="${state.currentTab}"]`);
  if (activeNav) {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    activeNav.classList.add("active");
  }

  updateProgressUI();
  renderCurrentTab();
});
