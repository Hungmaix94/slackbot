export function buildPlaneBugHtmlDescription(params: {
  taskType?: "bug" | "task";
  moduleName: string;
  environment?: string;
  deviceInfo?: string;
  severity: string;
  stepsToReproduce: string[];
  actualBehavior: string;
  expectedBehavior: string;
  slackThreadUrl?: string;
  slackMetadata?: string;
  evidenceFiles?: { name: string; url: string }[];
}): string {
  const isTask = params.taskType === "task";
  const stepsItems =
    params.stepsToReproduce && params.stepsToReproduce.length > 0
      ? params.stepsToReproduce.map((step) => `<li>${escapeHtml(step)}</li>`).join("")
      : "<li>Thực hiện theo nội dung yêu cầu từ Slack</li>";

  let evidenceHtml = "";
  if (params.evidenceFiles && params.evidenceFiles.length > 0) {
    const fileItems = params.evidenceFiles
      .map(
        (f) =>
          `<li>📎 <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.name)}</a></li>`
      )
      .join("");
    evidenceHtml = `<p><strong>📸 Đính kèm:</strong></p><ul>${fileItems}</ul>`;
  }

  const threadLinkHtml = params.slackThreadUrl
    ? `<p>🔗 <a href="${escapeHtml(params.slackThreadUrl)}" target="_blank" rel="noopener noreferrer">Mở thảo luận trên Slack</a></p>`
    : "";

  if (isTask) {
    return `
<p><strong>📌 Phân hệ:</strong> ${escapeHtml(params.moduleName || "Chung")} | <strong>Ưu tiên:</strong> ${escapeHtml((params.severity || "medium").toUpperCase())}</p>
<h4>🎯 Nội dung yêu cầu</h4>
<p>${escapeHtml(params.actualBehavior)}</p>
<h4>📋 Chi tiết thực hiện</h4>
<ol>${stepsItems}</ol>
<h4>✅ Kết quả mong đợi</h4>
<p>${escapeHtml(params.expectedBehavior)}</p>
${evidenceHtml}
${threadLinkHtml}
`.trim();
  }

  return `
<p><strong>🐛 Phân hệ:</strong> ${escapeHtml(params.moduleName || "Hệ thống")} | <strong>Môi trường:</strong> ${escapeHtml(params.environment || "Staging")} | <strong>Ưu tiên:</strong> ${escapeHtml((params.severity || "high").toUpperCase())}</p>
<h4>🔄 Bước tái hiện</h4>
<ol>${stepsItems}</ol>
<h4>❌ Thực tế</h4>
<p>${escapeHtml(params.actualBehavior || "Lỗi phát sinh khi thao tác")}</p>
<h4>🟢 Mong đợi</h4>
<p>${escapeHtml(params.expectedBehavior || "Xử lý đúng quy tắc nghiệp vụ")}</p>
${evidenceHtml}
${threadLinkHtml}
`.trim();
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
