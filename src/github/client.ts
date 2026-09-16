export const REPO_ALIASES: Record<string, string> = {
  backend: "MVL-ERP/backend",
  web: "MVL-ERP/web",
  mobile: "MaiVietLand/mobile",
  chat: "MVL-ERP/chat",
  "app-sale": "MaiVietLand/app-sale-backend",
  "app-sale-backend": "MaiVietLand/app-sale-backend",
  "app-sale-frontend": "MaiVietLand/app-sale-frontend",
  srs: "MVL-ERP/srs",
  toolkit: "MaiVietLand/mvl_toolkit",
};

export interface GitHubFileResult {
  path: string;
  repo: string;
  ref: string;
  content: string;
  totalLines: number;
  startLine?: number;
  endLine?: number;
}

export class GitHubClient {
  private token: string;
  private baseUrl = "https://api.github.com";

  constructor(token: string) {
    this.token = token;
  }

  private resolveRepo(aliasOrName: string): string {
    const clean = aliasOrName.trim().toLowerCase();
    if (REPO_ALIASES[clean]) {
      return REPO_ALIASES[clean];
    }
    // Nếu đã có định dạng owner/repo thì giữ nguyên
    if (aliasOrName.includes("/")) {
      return aliasOrName;
    }
    // Mặc định thuộc organization MVL-ERP
    return `MVL-ERP/${aliasOrName}`;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "MVL-Assistant-Slackbot",
    };
  }

  /**
   * Chuyển đổi từ khóa nghiệp vụ tiếng Việt sang từ khóa kỹ thuật trong codebase
   */
  private normalizeSearchQuery(rawQuery: string): string {
    const trimmed = rawQuery.trim();
    const q = trimmed.toLowerCase();

    // 0. Nếu query đã là cụm từ code/lỗi tiếng Anh (hoặc trong ngoặc kép), giữ nguyên từ khóa kỹ thuật
    const hasVietnameseAccent = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(trimmed);
    if (!hasVietnameseAccent && (trimmed.includes(" ") || /^[a-zA-Z0-9_\.\-]+$/.test(trimmed))) {
      // Loại bỏ các ký tự đặc biệt gây lỗi cú pháp GitHub Search, chỉ giữ từ và ngoặc kép
      const cleanEnglish = trimmed.replace(/[^\w\s\.\_\-]/g, " ").trim();
      if (cleanEnglish.length > 3) {
        return cleanEnglish;
      }
    }

    // 1. Phức hợp: Đối chiếu CĐT & Hóa đơn bán ra / Kỳ hoa hồng
    const hasRecon = q.includes("đối chiếu") || q.includes("doi chieu") || q.includes("đối soát") || q.includes("doi soat") || q.includes("reconciliation") || q.includes("pdcdt");
    const hasInvoice = q.includes("hóa đơn") || q.includes("hoa don") || q.includes("invoice") || q.includes("bán ra") || q.includes("ban ra");
    const hasCdt = q.includes("cđt") || q.includes("cdt") || q.includes("chủ đầu tư") || q.includes("chu dau tu") || q.includes("investor");
    const hasPeriod = q.includes("kỳ") || q.includes("ky") || q.includes("hoa hồng") || q.includes("hoa hong") || q.includes("tháng 8") || q.includes("tháng 9") || q.includes("thang 8") || q.includes("thang 9");
    const hasSlk = q.includes("sàn liên kết") || q.includes("san lien ket") || q.includes("linked_exchange") || q.includes("linked-exchange") || q.includes("slk");

    if (hasSlk) {
      if (q.includes("ghi sổ") || q.includes("post") || q.includes("draft") || q.includes("nháp")) {
        return "linked_exchange_dept_commission_service _attach_summary_line";
      }
      return "linked_exchange";
    }

    if (hasRecon && (hasInvoice || hasPeriod)) {
      return "create_from_pdcdt sales_invoice";
    }

    if (hasRecon && hasCdt) {
      return "investor_reconciliation_sheet";
    }

    if (hasInvoice) {
      return "sales_invoice";
    }

    if (hasRecon) {
      return "reconciliation";
    }

    if (q.includes("tạm ứng") || q.includes("tam ung") || q.includes("hoàn ứng") || q.includes("hoan ung") || q.includes("advance")) {
      return "commission_advance";
    }

    if (q.includes("tạm giữ") || q.includes("tam giu") || q.includes("hold")) {
      return "commission_hold";
    }

    if (hasPeriod) {
      return "accounting_period commission";
    }

    if (q.includes("bảng tính") || q.includes("bang tinh") || q.includes("chiết tính") || q.includes("chiet tinh")) {
      return "worksheet";
    }

    const clean = rawQuery.replace(/[^\w\s\.\_\-]/g, " ").trim();
    return clean || rawQuery;
  }

  /**
   * Tìm kiếm file hoặc biểu thức trong repository
   */
  async searchCode(
    repoAlias: string,
    query: string
  ): Promise<{ path: string; url: string; repo: string }[]> {
    let fullRepo = this.resolveRepo(repoAlias);
    const effectiveQuery = this.normalizeSearchQuery(query);
    let searchQuery = `${effectiveQuery} repo:${fullRepo}`;
    let url = new URL(`${this.baseUrl}/search/code`);
    url.searchParams.set("q", searchQuery);
    url.searchParams.set("per_page", "10");

    let res = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GitHub search error (${res.status}): ${err}`);
    }

    let data: any = await res.json();
    let items = data.items || [];

    // Fallback: Nếu không có kết quả và repo không phải là backend (ví dụ AI chọn app-sale), thử tìm lại trong backend
    if (items.length === 0 && fullRepo !== "MVL-ERP/backend") {
      fullRepo = "MVL-ERP/backend";
      searchQuery = `${effectiveQuery} repo:${fullRepo}`;
      url = new URL(`${this.baseUrl}/search/code`);
      url.searchParams.set("q", searchQuery);
      url.searchParams.set("per_page", "10");

      res = await fetch(url.toString(), {
        method: "GET",
        headers: this.headers,
      });
      if (res.ok) {
        data = await res.json();
        items = data.items || [];
      }
    }

    // Ưu tiên sắp xếp file mã nguồn thực tế (.py, .ts, .tsx, .js) trước file tài liệu (.md, .po)
    items.sort((a: any, b: any) => {
      const isCodeA = /\.(py|ts|tsx|js|jsx)$/i.test(a.path);
      const isCodeB = /\.(py|ts|tsx|js|jsx)$/i.test(b.path);
      if (isCodeA && !isCodeB) return -1;
      if (!isCodeA && isCodeB) return 1;
      return 0;
    });

    return items.map((item: any) => ({
      path: item.path,
      url: item.html_url,
      repo: fullRepo,
    }));
  }

  /**
   * Đọc nội dung của một file code cụ thể từ GitHub
   */
  async readFile(
    repoAlias: string,
    filePath: string,
    options?: { ref?: string; startLine?: number; endLine?: number; searchKeyword?: string }
  ): Promise<GitHubFileResult> {
    const fullRepo = this.resolveRepo(repoAlias);
    const ref = options?.ref || "master";
    const cleanPath = filePath.replace(/^\/+/, "");

    const url = new URL(`${this.baseUrl}/repos/${fullRepo}/contents/${cleanPath}`);
    url.searchParams.set("ref", ref);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      if (res.status === 404 && ref === "master") {
        return this.readFile(repoAlias, filePath, { ...options, ref: "phrase3" });
      }
      if (res.status === 404 && ref === "phrase3") {
        return this.readFile(repoAlias, filePath, { ...options, ref: "main" });
      }
      const err = await res.text();
      throw new Error(`GitHub get file error (${res.status}) for ${cleanPath}: ${err}`);
    }

    const data: any = await res.json();
    if (data.type !== "file" || !data.content) {
      throw new Error(`Path ${cleanPath} is not a valid file on GitHub.`);
    }

    // Decode Base64 UTF-8 an toàn trên Cloudflare Workers
    const binaryString = atob(data.content.replace(/\n/g, ""));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const fullContent = new TextDecoder("utf-8").decode(bytes);

    const lines = fullContent.split("\n");
    const totalLines = lines.length;

    let computedStart = options?.startLine;
    let computedEnd = options?.endLine;

    // Nếu có từ khóa tìm kiếm và chưa có dòng chỉ định, tự động định vị dòng chứa từ khóa
    if (options?.searchKeyword && computedStart === undefined && computedEnd === undefined) {
      const kw = options.searchKeyword.toLowerCase();
      const matchIdx = lines.findIndex((l) => l.toLowerCase().includes(kw));
      if (matchIdx !== -1) {
        computedStart = Math.max(1, matchIdx - 20);
        computedEnd = Math.min(totalLines, matchIdx + 45);
      }
    }

    let outputLines = lines;
    let note = "";
    if (computedStart !== undefined || computedEnd !== undefined) {
      const start = Math.max(1, computedStart || 1);
      const end = Math.min(totalLines, computedEnd || totalLines);
      outputLines = lines.slice(start - 1, end);
    } else if (totalLines > 250) {
      outputLines = lines.slice(0, 250);
      note = `\n\n[LƯU Ý: File này có ${totalLines} dòng. Hệ thống chỉ hiển thị 250 dòng đầu tiên. Hãy gọi read_code_file với startLine và endLine để đọc các phần tiếp theo nếu cần].`;
    }

    return {
      path: cleanPath,
      repo: fullRepo,
      ref,
      content: outputLines.join("\n") + note,
      totalLines,
      startLine: computedStart || 1,
      endLine: computedEnd || outputLines.length,
    };
  }

  /**
   * Lấy cây thư mục (Git Trees) để tra cứu vị trí file
   */
  async listFiles(
    repoAlias: string,
    options?: { ref?: string; prefix?: string }
  ): Promise<string[]> {
    const fullRepo = this.resolveRepo(repoAlias);
    const ref = options?.ref || "main";

    const url = `${this.baseUrl}/repos/${fullRepo}/git/trees/${ref}?recursive=1`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      return [];
    }

    const data: any = await res.json();
    const tree: any[] = data.tree || [];

    const prefix = options?.prefix?.replace(/^\/+/, "") || "";
    return tree
      .filter((item) => item.type === "blob")
      .map((item) => item.path as string)
      .filter((p) => (prefix ? p.startsWith(prefix) : true))
      .slice(0, 100);
  }
}
