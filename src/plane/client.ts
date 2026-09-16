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

export class PlaneClient {
  private apiKey: string;
  private hostUrl: string;
  private workspaceSlug: string;

  constructor(
    apiKey: string,
    hostUrl = "https://pm.glinteco.com",
    workspaceSlug = "glinteco"
  ) {
    this.apiKey = apiKey;
    this.hostUrl = hostUrl.replace(/\/+$/, "");
    this.workspaceSlug = workspaceSlug;
  }

  private get headers(): HeadersInit {
    return {
      "x-api-key": this.apiKey,
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
    const res = await fetch(
      `${this.hostUrl}/api/v1/workspaces/${this.workspaceSlug}/issues/${projectIdentifier}-${issueIdentifier}/`,
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Plane API getIssueByReadableIdentifier failed: ${res.status} ${res.statusText}`);
    }

    return await res.json();
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
