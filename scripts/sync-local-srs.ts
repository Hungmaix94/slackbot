import fs from "node:fs";
import path from "node:path";

/**
 * Script đọc toàn bộ file Markdown từ repo srs và gửi qua API /sync/github của Worker
 * Sử dụng:
 *   npx tsx scripts/sync-local-srs.ts [ENDPOINT_URL] [SECRET]
 */
async function main() {
  const endpoint = process.argv[2] || "http://localhost:8787/sync/github";
  const secret = process.argv[3] || "";

  // Tìm đường dẫn srs
  const candidatePaths = [
    path.resolve(process.cwd(), "../srs/docs"),
    path.resolve(process.cwd(), "../srs"),
    path.resolve(process.cwd(), "docs"),
    "/Users/phamhung/D/Work/MVL/srs/docs",
  ];

  let srsDir = "";
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      srsDir = p;
      break;
    }
  }

  if (!srsDir) {
    console.error("❌ Không tìm thấy thư mục tài liệu SRS.");
    process.exit(1);
  }

  console.log(`📂 Đang quét tài liệu SRS từ: ${srsDir}`);

  const documents: { path: string; content: string }[] = [];

  function scanDir(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (file.endsWith(".md") && !file.startsWith("_")) {
        const relPath = path.relative(srsDir, fullPath);
        const content = fs.readFileSync(fullPath, "utf-8");
        documents.push({ path: relPath, content });
      }
    }
  }

  scanDir(srsDir);
  console.log(`📄 Tìm thấy ${documents.length} tệp tài liệu Markdown.`);

  // Gửi theo từng batch 5 documents
  const batchSize = 5;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    console.log(`🚀 Đang nạp batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}...`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (secret) {
      headers["x-sync-secret"] = secret;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ documents: batch }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ Lỗi khi đồng bộ batch: ${res.status} - ${err}`);
    } else {
      const data = await res.json();
      console.log(`✅ Batch hoàn tất:`, data);
    }
  }

  console.log("🎉 Hoàn tất đồng bộ toàn bộ tài liệu SRS vào Cloudflare!");
}

main().catch(console.error);
