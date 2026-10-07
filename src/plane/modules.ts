export interface PlaneModuleInfo {
  id: string;
  name: string;
  aliases: string[];
}

export const KNOWN_PLANE_MODULES: PlaneModuleInfo[] = [
  {
    id: "3a04e90c-a3b4-454f-9a66-9b3dfc5df66e",
    name: "Test phase 3.1",
    aliases: ["p31", "test31", "phase 3.1", "phase31", "phase3.1", "p3.1", "test phase 3.1"],
  },
  {
    id: "be359244-fdc3-46d5-8151-46ffa6506bff",
    name: "App Sale",
    aliases: ["as", "appsale", "app sale", "app_sale", "app-sale"],
  },
  {
    id: "4bc93124-68cf-47ed-99c7-08129d31148c",
    name: "CRM",
    aliases: ["crm", "khách hàng", "khach hang"],
  },
  {
    id: "bec0f2bc-7fb4-4992-86fd-3eb7072f8e97",
    name: "Trợ lý AI",
    aliases: ["ai", "tro ly ai", "trợ lý ai", "bot"],
  },
  {
    id: "d87a9da8-738c-414f-ab93-0d93a2173925",
    name: "Design Revamp",
    aliases: ["ui", "revamp", "design", "design revamp", "giao dien", "giao diện"],
  },
];

/**
 * Phân giải module ID từ văn bản / cờ lệnh / tag
 * Ưu tiên exact match cho các alias ngắn (p31, as, crm, ai, ui) để tránh va chạm substring
 */
export function resolvePlaneModule(text?: string, defaultModuleId?: string): PlaneModuleInfo | null {
  if (!text || !text.trim()) {
    if (defaultModuleId) {
      return KNOWN_PLANE_MODULES.find(m => m.id === defaultModuleId || m.name.toLowerCase() === defaultModuleId.toLowerCase()) || null;
    }
    return null;
  }

  const textLower = text.toLowerCase().trim();

  // 1. Kiểm tra cờ tường minh: -m <alias>, --module <alias>, module: <alias>
  const flagMatch = textLower.match(/(?:-m|--module|module\s*[:=])\s*([a-z0-9_\-\.]+)/i);
  if (flagMatch && flagMatch[1]) {
    const rawAlias = flagMatch[1].trim();
    const found = KNOWN_PLANE_MODULES.find(
      (m) => m.aliases.includes(rawAlias) || m.id.toLowerCase() === rawAlias || m.name.toLowerCase() === rawAlias
    );
    if (found) return found;
  }

  // 2. Kiểm tra tag trong ngoặc: [p31], [as], [crm], [ai], [ui]
  const tagMatches = textLower.match(/\[([a-z0-9_\-\.\s]+)\]/g);
  if (tagMatches) {
    for (const tag of tagMatches) {
      const cleanTag = tag.replace(/[\[\]]/g, "").trim();
      const found = KNOWN_PLANE_MODULES.find(
        (m) => m.aliases.includes(cleanTag) || m.id.toLowerCase() === cleanTag || m.name.toLowerCase() === cleanTag
      );
      if (found) return found;
    }
  }

  // 3. So khớp chính xác từ (word boundary) cho các alias ngắn (p31, as, crm, ai, ui)
  for (const mod of KNOWN_PLANE_MODULES) {
    for (const alias of mod.aliases) {
      if (alias.length <= 4) {
        const regex = new RegExp(`(?:^|[^a-z0-9_])${alias.replace('.', '\\.')}(?:[^a-z0-9_]|$)`, "i");
        if (regex.test(textLower)) {
          return mod;
        }
      }
    }
  }

  // 4. So khớp chuỗi con cho các alias dài (> 4 ký tự)
  for (const mod of KNOWN_PLANE_MODULES) {
    for (const alias of mod.aliases) {
      if (alias.length > 4 && textLower.includes(alias)) {
        return mod;
      }
    }
  }

  // 5. Fallback nếu có default
  if (defaultModuleId) {
    return KNOWN_PLANE_MODULES.find(m => m.id === defaultModuleId || m.name.toLowerCase() === defaultModuleId.toLowerCase()) || null;
  }

  return null;
}
