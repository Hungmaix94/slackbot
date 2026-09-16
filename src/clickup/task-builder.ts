export function buildBugTaskDescription(params: {
  moduleName: string;
  environment: string;
  deviceInfo: string;
  severity: string;
  stepsToReproduce: string[];
  actualBehavior: string;
  expectedBehavior: string;
  slackThreadUrl?: string;
  slackMetadata?: string;
}): string {
  const stepsFormatted = params.stepsToReproduce
    .map((step, idx) => `${idx + 1}. ${step}`)
    .join("\n");

  return `# 🐛 BUG: [${params.moduleName}]

> [!WARNING]  
> - **Môi trường:** ${params.environment || "Staging"}  
> - **Thiết bị & Trình duyệt:** ${params.deviceInfo || "Chrome / Web"}  
> - **Mức độ:** ${params.severity || "Major"}

### 🔄 1. Các Bước Tái Hiện Lỗi (Steps to Reproduce)
${stepsFormatted || "1. Đăng nhập hệ thống\n2. Thao tác theo mô tả trong thread"}

### ❌ 2. Kết Quả Thực Tế (Actual Behavior)
- ${params.actualBehavior}

### 🟢 3. Kết Quả Mong Muốn (Expected Behavior)
- ${params.expectedBehavior}

### 📸 4. Hình Ảnh / Video (Evidence)
- Các file ảnh/video đính kèm đã được tự động tải từ Slack thread lên task này.

---
🔗 **Nguồn gốc thảo luận trên Slack:** [Xem thread](${params.slackThreadUrl || "#"})
${params.slackMetadata ? `\n\`${params.slackMetadata}\`` : ""}`;
}
