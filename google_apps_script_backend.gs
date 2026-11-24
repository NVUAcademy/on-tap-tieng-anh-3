/**
 * ============================================================================
 * BACKEND GOOGLE SHEETS + APPS SCRIPT CHO HỆ THỐNG ÔN TẬP TIẾNG ANH 3 (133033)
 * Giảng viên Quản trị (Admin): leviethoainam287@gmail.com
 * ============================================================================
 * HƯỚNG DẪN CÀI ĐẶT TRÊN GOOGLE SHEETS (CHỈ MẤT 1 PHÚT):
 * 1. Mở Google Drive bằng Gmail leviethoainam287@gmail.com -> Tạo 1 file Google Trang tính (Google Sheets) mới.
 * 2. Trên thanh menu của Google Sheets, chọn: Tiện ích mở rộng (Extensions) -> Apps Script.
 * 3. Xóa đoạn code mặc định `function myFunction() {}`, dán TOÀN BỘ file này vào và bấm biểu tượng Đĩa mềm (Lưu / Ctrl+S).
 * 4. Bấm nút "Triển khai" (Deploy - góc trên bên phải) -> "Tùy chọn triển khai mới" (New deployment):
 *    - Bấm hình bánh răng (Chọn loại) -> chọn "Ứng dụng web" (Web app).
 *    - Thực thi dưới dạng (Execute as): "Tôi (leviethoainam287@gmail.com)".
 *    - Ai có quyền truy cập (Who has access): Chọn "Bất kỳ ai" (Anyone).
 *    - Bấm "Triển khai" (Deploy) -> Cấp quyền (Authorize access -> Advanced -> Go to project) -> Copy đường link "URL ứng dụng web" (Web App URL có đuôi /exec).
 * 5. Dán đường link Web App URL đó vào phần Cài đặt trên Trang Giảng Viên của web!
 */

const ADMIN_EMAIL = "leviethoainam287@gmail.com";

function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Tab Danh_Sach_Hoc_Vien (Whitelist)
  let wsAllowed = ss.getSheetByName("Danh_Sach_Hoc_Vien");
  if (!wsAllowed) {
    wsAllowed = ss.insertSheet("Danh_Sach_Hoc_Vien");
    wsAllowed.appendRow(["Email", "Ho_Ten", "Vai_Tro", "Trang_Thai", "Ngay_Cap_Quyen"]);
    wsAllowed.getRange("A1:E1").setFontWeight("bold").setBackground("#1e3a8a").setFontColor("#ffffff");
    // Luôn thêm sẵn tài khoản Giảng viên
    wsAllowed.appendRow([ADMIN_EMAIL, "Giảng viên Lê Viết Hoài Nam", "teacher", "active", new Date().toISOString()]);
  }

  // 2. Tab Tien_Do_Hoc_Vien (Progress & Essays)
  let wsProgress = ss.getSheetByName("Tien_Do_Hoc_Vien");
  if (!wsProgress) {
    wsProgress = ss.insertSheet("Tien_Do_Hoc_Vien");
    wsProgress.appendRow([
      "Email",
      "Ho_Ten",
      "Cap_Nhat_Cuoi",
      "So_Cau_Da_Lam",
      "So_Cau_Dung",
      "Ty_Le_Dung",
      "Diem_Thi_Thu",
      "So_Bai_Viet",
      "Nhan_Xet_Giang_Vien",
      "Diem_Giang_Vien_Cham",
      "Du_Lieu_Chi_Tiet_JSON"
    ]);
    wsProgress.getRange("A1:K1").setFontWeight("bold").setBackground("#15803d").setFontColor("#ffffff");
  }
  return { wsAllowed, wsProgress };
}

function getAllowedList(wsAllowed) {
  const rows = wsAllowed.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const email = String(rows[i][0] || "").trim().toLowerCase();
    if (!email) continue;
    list.push({
      email: email,
      name: String(rows[i][1] || ""),
      role: email === ADMIN_EMAIL ? "teacher" : String(rows[i][2] || "student"),
      status: String(rows[i][3] || "active"),
      createdAt: String(rows[i][4] || "")
    });
  }
  // Đảm bảo admin luôn có trong danh sách
  if (!list.some(u => u.email === ADMIN_EMAIL)) {
    list.unshift({
      email: ADMIN_EMAIL,
      name: "Giảng viên Lê Viết Hoài Nam",
      role: "teacher",
      status: "active",
      createdAt: new Date().toISOString()
    });
  }
  return list;
}

function getAllStudentProgress(wsProgress) {
  const rows = wsProgress.getDataRange().getValues();
  const students = [];
  for (let i = 1; i < rows.length; i++) {
    const email = String(rows[i][0] || "").trim().toLowerCase();
    if (!email) continue;
    let parsedState = {};
    try {
      parsedState = JSON.parse(rows[i][10] || "{}");
    } catch (e) {}
    students.push({
      email: email,
      name: String(rows[i][1] || ""),
      updatedAt: String(rows[i][2] || ""),
      totalDone: Number(rows[i][3] || 0),
      totalCorrect: Number(rows[i][4] || 0),
      accuracy: String(rows[i][5] || "0%"),
      mockScore: String(rows[i][6] || "0.0"),
      essaysCount: Number(rows[i][7] || 0),
      teacherComment: String(rows[i][8] || ""),
      teacherGrade: String(rows[i][9] || ""),
      state: parsedState
    });
  }
  return students;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const { wsAllowed, wsProgress } = initSheets();
  const action = (e.parameter.action || "ping").toLowerCase();
  const email = (e.parameter.email || "").trim().toLowerCase();

  if (action === "check_user") {
    const allowed = getAllowedList(wsAllowed);
    const user = allowed.find(u => u.email === email && u.status === "active");
    if (!user && email !== ADMIN_EMAIL) {
      return jsonResponse({ ok: false, authorized: false, message: "Email chưa được giảng viên cấp quyền." });
    }
    const allProg = getAllStudentProgress(wsProgress);
    const myProg = allProg.find(p => p.email === email) || null;
    return jsonResponse({
      ok: true,
      authorized: true,
      role: email === ADMIN_EMAIL ? "teacher" : (user ? user.role : "student"),
      user: user || { email: ADMIN_EMAIL, name: "Giảng viên", role: "teacher" },
      progress: myProg,
      allAllowed: email === ADMIN_EMAIL ? allowed : undefined,
      allProgress: email === ADMIN_EMAIL ? allProg : undefined
    });
  }

  return jsonResponse({ ok: true, service: "HDU English 3 Google Sheets Backend", admin: ADMIN_EMAIL });
}

function doPost(e) {
  const { wsAllowed, wsProgress } = initSheets();
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: "Invalid JSON body" });
  }

  const action = (body.action || "").toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  const allowed = getAllowedList(wsAllowed);
  const isAuthorized = (email === ADMIN_EMAIL) || allowed.some(u => u.email === email && u.status === "active");

  if (!isAuthorized) {
    return jsonResponse({ ok: false, authorized: false, error: "Tài khoản Google này chưa được Giảng viên cấp quyền!" });
  }

  // 1. Học viên đẩy (push) tiến độ lên Google Sheets
  if (action === "save_progress") {
    const rows = wsProgress.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || "").trim().toLowerCase() === email) {
        rowIndex = i + 1;
        break;
      }
    }

    const nowStr = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const summary = body.summary || {};
    const existingComment = rowIndex > 0 ? wsProgress.getRange(rowIndex, 9).getValue() : "";
    const existingGrade = rowIndex > 0 ? wsProgress.getRange(rowIndex, 10).getValue() : "";

    const rowData = [
      email,
      body.name || email,
      nowStr,
      summary.totalDone || 0,
      summary.totalCorrect || 0,
      (summary.accuracy || 0) + "%",
      summary.mockScore || "0.0",
      summary.essaysCount || 0,
      existingComment,
      existingGrade,
      JSON.stringify(body.state || {})
    ];

    if (rowIndex > 0) {
      wsProgress.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      wsProgress.appendRow(rowData);
    }

    return jsonResponse({
      ok: true,
      savedAt: nowStr,
      teacherComment: existingComment,
      teacherGrade: existingGrade
    });
  }

  // 2. Giảng viên thêm hoặc xóa học viên khỏi Whitelist
  if (action === "manage_whitelist" && email === ADMIN_EMAIL) {
    const targetEmail = String(body.targetEmail || "").trim().toLowerCase();
    const targetName = String(body.targetName || targetEmail).trim();
    const subAction = body.subAction || "add"; // "add" or "remove"

    if (!targetEmail) return jsonResponse({ ok: false, error: "Thiếu email học viên" });

    const rows = wsAllowed.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || "").trim().toLowerCase() === targetEmail) {
        foundRow = i + 1;
        break;
      }
    }

    if (subAction === "add") {
      const nowStr = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      if (foundRow > 0) {
        wsAllowed.getRange(foundRow, 2, 1, 4).setValues([[targetName, "student", "active", nowStr]]);
      } else {
        wsAllowed.appendRow([targetEmail, targetName, "student", "active", nowStr]);
      }
    } else if (subAction === "remove" && foundRow > 0 && targetEmail !== ADMIN_EMAIL) {
      wsAllowed.deleteRow(foundRow);
    }

    return jsonResponse({
      ok: true,
      allAllowed: getAllowedList(wsAllowed),
      allProgress: getAllStudentProgress(wsProgress)
    });
  }

  // 3. Giảng viên chấm điểm & nhận xét bài làm của học viên
  if (action === "grade_student" && email === ADMIN_EMAIL) {
    const studentEmail = String(body.studentEmail || "").trim().toLowerCase();
    const comment = String(body.teacherComment || "");
    const grade = String(body.teacherGrade || "");

    const rows = wsProgress.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || "").trim().toLowerCase() === studentEmail) {
        wsProgress.getRange(i + 1, 9).setValue(comment);
        wsProgress.getRange(i + 1, 10).setValue(grade);
        break;
      }
    }

    return jsonResponse({
      ok: true,
      allProgress: getAllStudentProgress(wsProgress)
    });
  }

  return jsonResponse({ ok: false, error: "Unknown action" });
}
