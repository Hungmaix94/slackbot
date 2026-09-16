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
  "bug", "task", "chức", "năng"
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
    const words = titleLower
      .split(/[\s,.:;!?/()_-]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    if (words.length === 0) {
      return { hasDuplicate: false, duplicateIssues: [] };
    }

    const matched: PlaneDuplicateCheckResult["duplicateIssues"] = [];

    for (const issue of existingIssues) {
      const issueNameLower = (issue.name || "").toLowerCase();

      let matchCount = 0;
      for (const word of words) {
        if (issueNameLower.includes(word)) {
          matchCount++;
        }
      }

      // Nếu trùng >= 50% số từ khóa quan trọng hoặc tên chứa nhau
      if (matchCount / words.length >= 0.5 || (words.length >= 2 && issueNameLower.includes(titleLower))) {
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
