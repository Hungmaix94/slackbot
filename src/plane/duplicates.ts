import { PlaneClient, PlaneIssue } from "./client";

export interface PlaneDuplicateCheckResult {
  hasDuplicate: boolean;
  duplicateIssues: {
    id: string;
    sequenceId?: number;
    name: string;
    state?: string;
    url: string;
    assigneeName?: string;
  }[];
}

const STOP_WORDS = new Set([
  "lỗi", "không", "được", "trên", "phân", "hệ", "khi", "bị", "trong", "vào",
  "cho", "với", "tại", "màn", "hình", "button", "nút", "thì", "đang", "báo",
  "bug", "task", "chức", "năng", "phát", "hiện", "từ", "slack", "thread",
  "ngày", "chi", "tiết", "link", "thảo", "luận", "xem", "chung"
]);

/**
 * Kiểm tra các issue/task trùng lặp trên Plane trước khi tạo mới
 */
export async function checkDuplicatePlaneIssues(
  client: PlaneClient,
  projectId: string,
  taskTitle: string,
  projectIdentifier?: string
): Promise<PlaneDuplicateCheckResult> {
  try {
    const existingIssues = await client.getIssues(projectId, { per_page: 60, order_by: "-created_at" });
    const titleLower = taskTitle.toLowerCase();

    // Bỏ qua nếu tiêu đề là template generic
    if (titleLower.includes("lỗi phát hiện từ slack thread")) {
      return { hasDuplicate: false, duplicateIssues: [] };
    }

    const words = titleLower
      .split(/[\s,.:;!?/()_-]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    if (words.length < 2) {
      return { hasDuplicate: false, duplicateIssues: [] };
    }

    const matched: PlaneDuplicateCheckResult["duplicateIssues"] = [];

    for (const issue of existingIssues) {
      const issueNameLower = (issue.name || "").toLowerCase();

      // Bỏ qua các issue cũ có tiêu đề generic
      if (issueNameLower.includes("lỗi phát hiện từ slack thread")) {
        continue;
      }

      let matchCount = 0;
      for (const word of words) {
        if (issueNameLower.includes(word)) {
          matchCount++;
        }
      }

      // Trùng >= 70% số từ khóa thực sự có nghĩa hoặc tên chứa trọn vẹn cụm từ
      if (
        (matchCount / words.length >= 0.7 && matchCount >= 2) ||
        (words.length >= 3 && issueNameLower.includes(titleLower))
      ) {
        const issueUrl = client.getIssueWebUrl(
          projectId,
          issue.id,
          projectIdentifier,
          issue.sequence_id
        );

        matched.push({
          id: issue.id,
          sequenceId: issue.sequence_id,
          name: issue.name,
          state: issue.state_detail?.name || "Open",
          url: issueUrl,
        });
      }
    }

    return {
      hasDuplicate: matched.length > 0,
      duplicateIssues: matched.slice(0, 3),
    };
  } catch (err) {
    console.warn("Lỗi kiểm tra trùng lặp trên Plane:", err);
    return { hasDuplicate: false, duplicateIssues: [] };
  }
}
