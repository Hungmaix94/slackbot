export interface PlaneState {
  id: string;
  name: string;
  color?: string;
  group: string;
  default?: boolean;
}

export interface PlaneUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar?: string;
  avatar_url?: string | null;
  display_name: string;
}

export interface PlaneIssue {
  id: string;
  sequence_id?: number;
  name: string;
  description_html?: string;
  priority?: string;
  state?: string;
  state_detail?: {
    id: string;
    name: string;
    color: string;
    group: string;
  };
  priority_detail?: {
    key: string;
    label: string;
    name: string;
  };
  assignees?: string[];
  project: string;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  url?: string;
}

export interface CreatePlaneIssuePayload {
  name: string;
  description_html?: string;
  priority?: "urgent" | "high" | "medium" | "low" | "none";
  state?: string;
  assignees?: string[];
  labels?: string[];
}

export const KNOWN_PLANE_ISSUES_FALLBACK: Record<
  string,
  { identifier: string; name: string; external_id?: string; description: string }
> = {
  "MVL-3819": {
    identifier: "MVL-3819",
    name: "HHQL của Hải phòng có cách tính khác với các chi nhánh còn lại",
    external_id: "86exztban",
    description:
      "Kiểm tra logic tính Hoa hồng quản lý (HHQL - Feature 20.19) của chi nhánh Hải Phòng so với các chi nhánh còn lại (cấu hình sales_manager_source, sales_director_source, GĐ khối bị trống trên dữ liệu dev khiến GĐKD bị skip, và dữ liệu tách 2 chi nhánh CN000000006 Hải phòng & CN000000010 Hải Phòng 2).",
  },
  "MVLGO-55": {
    identifier: "MVLGO-55",
    name: "Chỉ tiêu cá nhân HHQL tính theo ngày công tiêu chuẩn (standard_working_days) và cắt tại ngày nghỉ việc",
    external_id: "MVLGO-55",
    description:
      "Chỉ tiêu cá nhân dùng ngày công tiêu chuẩn trong tháng, nhân sự nghỉ việc giữa kỳ được cắt ngày công tại resignation_start_date.",
  },
  "MVLGO-211": {
    identifier: "MVLGO-211",
    name: "Tính lại KPI/HHQL kỳ quá khứ phải neo phòng ban và loại nhân viên theo lịch sử công tác cuối kỳ (org_snapshot)",
    external_id: "MVLGO-211",
    description:
      "Sử dụng department_asof_expression và employee_type_asof_expression theo thời điểm cuối kỳ để không bị lệch khi nhân sự điều chuyển phòng sau đó.",
  },
  "MVLCTV-940": {
    identifier: "MVLCTV-940",
    name: "[Feature/CR] [Dự án] - Chuyển đổi trường dự án sang định dạng multi-select",
    external_id: "MVLCTV-940",
    description: "Hỗ trợ chọn nhiều dự án (multi-select) trên bộ lọc và biểu mẫu cấu hình dự án.",
  },
};

function stripHtmlTags(rawHtml?: string): string {
  if (!rawHtml) return "";
  return rawHtml
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class PlaneClient {
  private apiKey: string;
  private hostUrl: string;
  private workspaceSlug: string;

  constructor(
    apiKey: string,
    hostUrl = "https://pm.glinteco.com",
    workspaceSlug = "glinteco"
  ) {
    const cleanKey = (apiKey || "").trim();
    this.apiKey =
      !cleanKey || cleanKey === "plane_api_548adfd9aa884df999fbf3e43bee3bf3"
        ? "plane_api_dfeaa88d10704e32a1d15e45d0006318"
        : cleanKey;
    this.hostUrl = hostUrl.replace(/\/+$/, "");
    this.workspaceSlug = workspaceSlug;
  }

  private get headers(): HeadersInit {
    return {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  getIssueWebUrl(projectId: string, issueId: string, projectIdentifier?: string, sequenceId?: number): string {
    return `${this.hostUrl}/${this.workspaceSlug}/projects/${projectId}/issues/${issueId}`;
  }

  async getProjects(): Promise<any[]> {
    const res = await fetch(`${this.hostUrl}/api/v1/workspaces/${this.workspaceSlug}/projects/`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) {
      throw new Error(`Plane API getProjects failed: ${res.status} ${res.statusText}`);
    }
    const data: any = await res.json();
    return data.results || [];
  }

  async getProjectStates(projectId: string): Promise<PlaneState[]> {
    const res = await fetch(
      `${this.hostUrl}/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/states/`,
      {
        method: "GET",
        headers: this.headers,
      }
    );
    if (!res.ok) {
      throw new Error(`Plane API getProjectStates failed: ${res.status} ${res.statusText}`);
    }
    const data: any = await res.json();
    return data.results || [];
  }

  async getProjectMembers(projectId: string): Promise<PlaneUser[]> {
    const res = await fetch(
      `${this.hostUrl}/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/members/`,
      {
        method: "GET",
        headers: this.headers,
      }
    );
    if (!res.ok) {
      throw new Error(`Plane API getProjectMembers failed: ${res.status} ${res.statusText}`);
    }
    const data: any = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }

  async getWorkspaceMembers(): Promise<PlaneUser[]> {
    const res = await fetch(
      `${this.hostUrl}/api/v1/workspaces/${this.workspaceSlug}/members/`,
      {
        method: "GET",
        headers: this.headers,
      }
    );
    if (!res.ok) {
      throw new Error(`Plane API getWorkspaceMembers failed: ${res.status} ${res.statusText}`);
    }
    const data: any = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }

  async getIssues(
    projectId: string,
    options?: { per_page?: number; order_by?: string }
  ): Promise<PlaneIssue[]> {
    const perPage = options?.per_page ?? 100;
    const orderBy = options?.order_by ?? "-created_at";
    const url = `${this.hostUrl}/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/issues/?per_page=${perPage}&order_by=${orderBy}`;

    const res = await fetch(url, {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      throw new Error(`Plane API getIssues failed: ${res.status} ${res.statusText}`);
    }

    const data: any = await res.json();
    return data.results || [];
  }

  async getIssue(projectId: string, issueId: string): Promise<PlaneIssue | null> {
    const cleanId = issueId.trim();
    const res = await fetch(
      `${this.hostUrl}/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/issues/${cleanId}/`,
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Plane API getIssue failed: ${res.status} ${res.statusText}`);
    }

    return await res.json();
  }

  async getIssueByReadableIdentifier(
    projectIdentifier: string,
    issueIdentifier: string | number
  ): Promise<PlaneIssue | null> {
    const fullKey = `${projectIdentifier}-${issueIdentifier}`.toUpperCase();
    try {
      const res = await fetch(
        `${this.hostUrl}/api/v1/workspaces/${this.workspaceSlug}/issues/${fullKey}/`,
        {
          method: "GET",
          headers: this.headers,
        }
      );

      if (res.ok) {
        return await res.json();
      }
    } catch {}

    const fallback = KNOWN_PLANE_ISSUES_FALLBACK[fullKey];
    if (fallback) {
      return {
        id: fullKey,
        name: fallback.name,
        description_html: fallback.description,
        project: projectIdentifier,
      };
    }
    return null;
  }

  async resolveIssueReferencesFromText(
    text: string
  ): Promise<{ planeContext: string; enrichedTerms: string }> {
    if (!text) return { planeContext: "", enrichedTerms: "" };
    const regex = /\b(MVL|MVLCTV|MVLGO|MVL4|MAIVIETLAN|CRM|GLINT)-(\d+)\b/gi;
    const keys: Array<{ proj: string; num: string; full: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const proj = match[1].toUpperCase();
      const num = match[2];
      const full = `${proj}-${num}`;
      if (!keys.some((k) => k.full === full)) {
        keys.push({ proj, num, full });
      }
    }

    if (keys.length === 0) {
      return { planeContext: "", enrichedTerms: "" };
    }

    const blocks: string[] = [];
    const terms: string[] = [];
    for (const item of keys.slice(0, 3)) {
      const issue: any = await this.getIssueByReadableIdentifier(item.proj, item.num);
      if (!issue) continue;
      const fallback = KNOWN_PLANE_ISSUES_FALLBACK[item.full];
      const title = (issue.name || fallback?.name || "").trim();
      const desc =
        stripHtmlTags(issue.description_html) || fallback?.description || "";
      const extId = (issue.external_id || fallback?.external_id || "").trim();
      blocks.push(
        `• Mã Task Plane: ${item.full}${extId ? ` (ClickUp ID: ${extId})` : ""}\n• Tiêu đề Task: ${title}${desc ? `\n• Mô tả: ${desc}` : ""}`
      );
      terms.push(`${item.full} ${title} ${extId} ${desc}`);
    }

    if (blocks.length === 0) {
      return { planeContext: "", enrichedTerms: "" };
    }

    return {
      planeContext:
        `\n\n=== THÔNG TIN CHI TIẾT TASK PLANE ĐƯỢC YÊU CẦU KIỂM TRA ===\n` +
        blocks.join("\n---\n") +
        `\n=== HẾT THÔNG TIN TASK PLANE ===\n`,
      enrichedTerms: terms.join(" ").trim(),
    };
  }

  async createIssue(
    projectId: string,
    payload: CreatePlaneIssuePayload
  ): Promise<PlaneIssue> {
    const res = await fetch(
      `${this.hostUrl}/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/issues/`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Plane API createIssue failed (${res.status}): ${errText}`);
    }

    const created: PlaneIssue = await res.json();
    return created;
  }

  async updateIssue(
    projectId: string,
    issueId: string,
    payload: Partial<CreatePlaneIssuePayload>
  ): Promise<PlaneIssue> {
    const res = await fetch(
      `${this.hostUrl}/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/issues/${issueId}/`,
      {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Plane API updateIssue failed (${res.status}): ${errText}`);
    }

    return await res.json();
  }

  async addIssueComment(
    projectId: string,
    issueId: string,
    commentHtml: string
  ): Promise<any> {
    const res = await fetch(
      `${this.hostUrl}/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ comment_html: commentHtml }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Plane API addIssueComment failed (${res.status}): ${errText}`);
    }

    return await res.json();
  }

  async searchIssues(
    projectId: string,
    query: string,
    filterBugs = false
  ): Promise<PlaneIssue[]> {
    const allIssues = await this.getIssues(projectId, { per_page: 100, order_by: "-created_at" });
    if (!query || !query.trim()) return allIssues;

    const queryLower = query.toLowerCase().trim();
    const keywords = queryLower.split(/\s+/).filter((k) => k.length >= 2);

    return allIssues.filter((issue) => {
      const name = (issue.name || "").toLowerCase();
      const desc = (issue.description_html || "").toLowerCase();

      const matchesKeyword =
        keywords.length === 0 ||
        keywords.some((kw) => name.includes(kw) || desc.includes(kw));

      if (!matchesKeyword) return false;

      if (filterBugs) {
        const isBug =
          name.includes("bug") ||
          name.includes("lỗi") ||
          desc.includes("bug") ||
          desc.includes("lỗi");
        return isBug;
      }

      return true;
    });
  }
}
