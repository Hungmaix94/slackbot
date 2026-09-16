export function buildPlaneBugHtmlDescription(params: {
  moduleName: string;
  environment: string;
  deviceInfo: string;
  severity: string;
  stepsToReproduce: string[];
  actualBehavior: string;
  expectedBehavior: string;
  slackThreadUrl?: string;
  slackMetadata?: string;
  evidenceFiles?: { name: string; url: string }[];
}): string {
  const stepsItems = params.stepsToReproduce && params.stepsToReproduce.length > 0
    ? params.stepsToReproduce.map((step) => `<li>${escapeHtml(step)}</li>`).join("")
    : "<li>Đăng nhập hệ thống</li><li>Thao tác theo mô tả trong Slack thread</li>";

  let evidenceHtml = "<p><em>Không có hình ảnh đính kèm từ Slack.</em></p>";
  if (params.evidenceFiles && params.evidenceFiles.length > 0) {
    const fileItems = params.evidenceFiles
      .map(
        (f) =>
          `<li>📎 <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.name)}</a></li>`
      )
      .join("");
    evidenceHtml = `<ul>${fileItems}</ul>`;
  }

  const threadLinkHtml = params.slackThreadUrl
    ? `<p>🔗 <strong>Nguồn thảo luận trên Slack:</strong> <a href="${escapeHtml(params.slackThreadUrl)}" target="_blank" rel="noopener noreferrer">Mở thread</a></p>`
    : "";

  const metadataHtml = params.slackMetadata
    ? `<p><code>${escapeHtml(params.slackMetadata)}</code></p>`
    : "";

  return `
<h3>🐛 BUG: [${escapeHtml(params.moduleName || "Hệ thống")}]</h3>
<blockquote>
  <p>
    • <strong>Môi trường:</strong> ${escapeHtml(params.environment || "Staging")}<br/>
    • <strong>Thiết bị & Trình duyệt:</strong> ${escapeHtml(params.deviceInfo || "Chrome / Web")}<br/>
    • <strong>Mức độ nghiêm trọng:</strong> ${escapeHtml(params.severity || "Major")}
  </p>
</blockquote>

<h4>🔄 1. Các Bước Tái Hiện Lỗi (Steps to Reproduce)</h4>
<ol>
  ${stepsItems}
</ol>

<h4>❌ 2. Kết Quả Thực Tế (Actual Behavior)</h4>
<ul>
  <li>${escapeHtml(params.actualBehavior || "Lỗi phát sinh trong quá trình thao tác")}</li>
</ul>

<h4>🟢 3. Kết Quả Mong Muốn (Expected Behavior)</h4>
<ul>
  <li>${escapeHtml(params.expectedBehavior || "Hệ thống xử lý đúng quy tắc nghiệp vụ")}</li>
</ul>

<h4>📸 4. Hình Ảnh / Bằng Chứng (Evidence)</h4>
${evidenceHtml}

<hr/>
${threadLinkHtml}
${metadataHtml}
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
