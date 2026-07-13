---
name: auto-load-project-standards
description: >
  GLOBAL MANDATORY SKILL: MUST BE LOADED AUTOMATICALLY FOR ALL TASKS IN THIS PROJECT.
  BẠN PHẢI LUÔN LUÔN áp dụng skill này mỗi khi làm việc, phân tích, viết code, tạo Component, Form, API Service hay CRUD trong project MVL Web này! 
  Skill này chứa toàn bộ các tiêu chuẩn BẮT BUỘC về Code of Conduct, kiến trúc UI, form, validation.
---

# Feature Builder Workflow

Khi tạo mới hoặc chỉnh sửa một tính năng (Feature) CRUD trong dự án, bạn (Agent) PHẢI thực hiện tuần tự các bước sau đây. Chỉ đọc chi tiết các file trong thư mục `references/` nếu cần làm đến bước đó. 

*(Quy tắc chung về UI: Đọc file [references/styling-css.md](references/styling-css.md) để biết cách dùng TailwindCSS và ShadCN UI của dự án)*

## Luồng công việc (Workflow)

### 1. Xây dựng API Service & Types
Mở và đọc file [references/api-service-pattern.md](references/api-service-pattern.md) để biết cách:
- Định nghĩa Types, Enums kế thừa từ schema chung của dự án.
- Viết Service class dựa trên `BaseApiService`.
- Cấu hình Query Keys và tạo các hook React Query.

### 2. Đăng ký Route & Điều hướng
Mở và đọc file [references/routing-pattern.md](references/routing-pattern.md) để biết cách:
- Khai báo route theo mô hình **nested feature-Outlet** (theo mẫu Accounting) trong `src/routes/AppRoute.tsx` — group `element: <Outlet />`, `index: true` cho List page hoặc `IndexRedirect`, khai `permission` trên từng route.
- Cập nhật đồng bộ `APP_PATH` (AppRoute.constant.ts), `menu-items.ts`, `query-keys.ts`.

### 3. Xây dựng List Page (Màn hình Danh sách)
Mở và đọc file [references/list-page-pattern.md](references/list-page-pattern.md) để biết cách dựng Filter Component và Table. 
- Mở file [references/dropdown.md](references/dropdown.md) nếu cần xử lý Dropdown Async hoặc Dialog Filter nâng cao. **BẮT BUỘC [4]**: dropdown danh sách dài phải dùng async load-on-scroll + server-side search (hook `useXSelect`), KHÔNG load tĩnh `page_size: 1000`.
- **BẮT BUỘC [4] (Search Input)**: KHÔNG trim giá trị search khi user đang gõ; chỉ trim (+`encodeURIComponent` nếu build URL thủ công) lúc gửi request API. Chi tiết mục 10 của list-page-pattern.md.

### 4. Xây dựng Form & Validation (Màn hình Thêm mới / Cập nhật)
Mở và đọc file [references/form-validation-pattern.md](references/form-validation-pattern.md) để biết cách:
- Khai báo Schema validation với `zod`.
- Xác định UI form theo cấu trúc section-based.
- **BẮT BUỘC [5] (Quy chuẩn xây dựng Editable Table / Bảng nhập liệu động)**: Khi thiết kế form có các bảng nhập liệu trực tiếp (ví dụ: chia giao dịch, hoa hồng):
  - **Quản lý Form State**: Dùng mảng (`useFieldArray`) kết hợp `<Controller>` của `react-hook-form` để bám theo chuẩn UI thay vì state tự do.
  - **Component Input ở Row**: Bọc input vào `<Table.Cell className="!p-0 border-r bg-white align-top">`. Thuộc tính className của input (như `FullCellNumberInput`, `Input`) phải luôn có `h-full min-h-[44px] w-full bg-transparent px-3 outline-none ring-inset focus-within:bg-white hover:ring-1 focus:ring-1 focus:ring-neutral-100` để input liền mạch, phủ toàn bộ diện tích ô và đổi nền/border khi có chuột tương tác.
  - **Cột Số/Phần trăm**: Các cột chứa giá trị số phải căn phải (`text-right` cho input/header, `justify-end` cho div chứa content).
    - **Cột Phần trăm**: Component ô nhập (vd: `FullCellNumberInput`) phải dùng thuộc tính `suffix="%"`. Điểm mấu chốt: Cả dữ liệu lúc xem (read-only), header, và input đều căn phải `text-right` nhưng có offset padding phải đủ lớn (ví dụ: `py-3 pl-3 pr-8`) để chừa chỗ cho ký hiệu `%` luôn thẳng hàng hàng dọc.
    - **Cột Tiền tệ**: Header và nội dung căn phải (`text-right` / `justify-end px-3`) để đồng bộ tiêu chuẩn hiển thị số tiền.
  - **Row Tổng cộng (Summary Footer)**: Bảng nhập giá trị phân bổ phải có một row phụ ở bottom cùng (**Tổng**) để cộng dồn Tỷ lệ doanh thu/Hoa hồng/Thành tiền (Thường Tỷ lệ doanh thu sẽ được validate bắt buộc đủ 100%).

  - **BẮT BUỘC [3] (Quy chuẩn Form Field % / VNĐ Toggle)**: Đối với các form nhập liệu thông thường (không nằm trong editable table), khi cần gộp 2 field nhập % và Số tiền (VNĐ) vào chung một ô UI, **KHÔNG dùng `FullCellNumberInput`** (vì nó ép style của table không có viền bọc ngoài). BẮT BUỘC dùng component form chuẩn của dự án là `TextField` hoặc `CurrencyInput`, kết hợp với truyền prop `suffix`. Prop `suffix` sẽ chứa 1 custom node có button đổi đơn vị. (Tham khảo pattern dùng `const suffixNode = <div className="-mr-3 flex items-center"><button ...>{isPct ? '%' : 'VNĐ'}</button></div>`).

  - **BẮT BUỘC [5] (Dynamic Time-Bound Commission Table Pattern)**: Khi xây dựng bảng hoa hồng/phí có cột theo khoảng thời gian (ví dụ: TBC, F2, Targets tab), PHẢI tuân thủ pattern sau:

    **1. Header cell cho period column (cột thời gian):**
    ```tsx
    <Table.ColumnHeaderCell className="border-border-1 min-w-[200px] border-r px-3 py-3 align-middle">
      <div className="flex items-center justify-between px-2">
        <span className="typo-body-base-medium font-medium text-[#4B4B4B]">
          {formatDate(from)} - {to ? formatDate(to) : 'Nay'}
        </span>
        {isEditing && (
          <div className="flex gap-1">
            <Button type="button" variant="secondary" onClick={() => handleEditPeriod(i)} className="bg-neutral-30 h-9 w-9 p-2.5"><IconPencil className="h-4 w-4" /></Button>
            <Button type="button" variant="secondary" onClick={() => remove(i)} className="bg-neutral-30 text-data-red-default hover:text-data-red-hover h-9 w-9 p-2.5"><IconTrash className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
    </Table.ColumnHeaderCell>
    ```
    - **KHÔNG dùng** `flex-col gap-2` hay `justify-center` trong header cell
    - Buttons đặt cùng hàng với text (**inline**), right-aligned

    **2. Value cell với toggle % / VNĐ (CommissionValueCell pattern):**
    - Mỗi hạng mục chỉ có **1 hàng** (KHÔNG tách 2 hàng % và VNĐ riêng)
    - Cell dùng `CommissionValueCell` (hoặc `MgmtValueCell`/`F2CommissionValueCell` tùy component):
    ```tsx
    // Component cục bộ — dùng useFormContext() hoặc nhận control/setValue như props
    const [isToggled, setIsToggled] = useState(() =>
      initialAmtValue !== null && initialAmtValue !== undefined && initialAmtValue !== ''
    )
    // Wrapper cell
    <div className="hover:ring-neutral-80 flex h-full w-full min-w-[150px] items-center transition-colors ring-inset focus-within:ring-1 focus-within:ring-neutral-100 hover:ring-1">
      <Controller name={isToggled ? amtField : pctField} ... render={({ field }) => (
        <FullCellNumberInput disabled={isReadOnly} variant="ghost"
          suffix={isReadOnly ? (isToggled ? 'VNĐ' : '%') : ''}
          max={isToggled ? Number.MAX_SAFE_INTEGER : 100}
          className={`rounded-none border-none text-right shadow-none hover:ring-0 ... ${isReadOnly ? (isToggled ? 'pr-12' : 'pr-8') : 'pr-3'}`}
        />
      )} />
      {!isReadOnly && (
        <button type="button" tabIndex={-1} onClick={handleToggle}
          className="typo-body-base-regular ml-1 cursor-pointer border-l pr-2 pl-2 text-blue-500 hover:text-blue-700">
          {isToggled ? 'VNĐ' : '%'}
        </button>
      )}
    </div>
    ```
    - Toggle xóa field còn lại (`setValue(amtField, null)` khi toggle về %, ngược lại)
    - **KHÔNG tách 2 row** (pct row + amt row riêng) — đây là pattern cũ sai

    **3. Add period button (cột cuối khi editing):**
    ```tsx
    {isEditing && (
      <Table.ColumnHeaderCell className="border-border-1 min-w-[80px] border-r px-3 py-3 text-center align-middle">
        <Button type="button" variant="secondary" onClick={handleAddPeriod} className="bg-neutral-30 mx-auto h-9 w-9 p-2.5"><Plus className="h-4 w-4" /></Button>
      </Table.ColumnHeaderCell>
    )}
    ```

### 5. Xây dựng Detail & History Page (Màn hình Chi tiết)
Mở và đọc file [references/detail-history-pattern.md](references/detail-history-pattern.md) để biết cách:
- Xây dựng giao diện trang Chi tiết và Lịch sử thay đổi.
- Tham khảo [references/common-components.md](references/common-components.md) để dùng các component chuẩn hóa (như `DetailPageWrapper`, `DetailRow`, `AppDialog`).
- Tham khảo [references/breadcrumb.md](references/breadcrumb.md) để thiết lập thẻ Breadcrumb điều hướng UI chính xác.
- **BẮT BUỘC [4] (Naming/Logic)**: KHÔNG BAO GIỜ so sánh hoặc hardcode string text tiếng Việt trên UI (ví dụ: `if (status === 'Tiền mặt')`). Luôn dùng Enum/Constant từ API Schema (như `BookingSaleSale_type`) để thực hiện các phép kiểm tra logic.
- **BẮT BUỘC [4] (Label Display)**: Để hiển thị text ra giao diện, BẮT BUỘC dùng hook `useAppConstant` kết hợp với `APP_CONSTANT_KEY` tương ứng để tìm và lấy `label` chuẩn. KHÔNG BAO GIỜ viết hardcode switch/case hay Record<Enum, string> cho label. Luôn truyền `module` param (ví dụ: `module: 'sales'`).
- **BẮT BUỘC [4] (Schema Types)**: Ưu tiên dùng types/enums từ `@/api/schema` (ví dụ: `BookingSaleSale_type`, `components['schemas']['DepositContract']`). Chỉ định nghĩa enum thủ công khi generated schema thiếu giá trị. Khi re-export, dùng `export const X = GeneratedEnum; export type X = GeneratedEnum;` để tạo alias ngắn gọn.
- **BẮT BUỘC [5] (API Fields & Reporting)**: Nếu API thiếu field hoặc không hỗ trợ trường thông tin cần thiết (ví dụ: thiếu field trên schema hoặc thiếu query param trong API dropdown), BẮT BUỘC phải ghi nhận, báo cáo lại (report) cho người dùng ngay lập tức, và cập nhật tài liệu liên quan (như `docs/backend_updates_required.md`). TUYỆT ĐỐI KHÔNG sử dụng mock data, hardcode giá trị giả lập, hoặc dùng `as any` để bypass lỗi TypeScript.
  
- **BẮT BUỘC [3] (Code of Conduct - Cấu trúc Variables)**: KHÔNG hardcode arrays hoặc cấu hình static data (ví dụ như `const roleOptions = [{...}]`) bên trong thân Function Component. Mọi static options phải đưa vào Constant App qua `APP_CONSTANT_KEY` hoặc export constant ở đầu file/thư mục `constants/` để có tính tái sử dụng và dọn dẹp functional scope.
- **BẮT BUỘC [4] (Format Tiền Tệ)**: KHÔNG tự ý sử dụng `new Intl.NumberFormat` hay các hàm format số thủ công. LUÔN LUÔN sử dụng hàm `formatCurrencyVND` từ `@/utils/common` (kết hợp với string template `${...} VNĐ` nếu cần hiển thị đơn vị) để đảm bảo đồng nhất định dạng tiền tệ trên toàn hệ thống.

### 6. Dọn dẹp Code và Review (BẮT BUỘC)
Trước khi coi code là hoàn thành, mở file [references/post-task-review-pattern.md](references/post-task-review-pattern.md) và chạy checklist kiểm tra:
- Dọn dẹp dead code, các hook không dùng đến.
- Kiểm tra các linter errors phổ biến (TypeScript, ESLint).
- **BẮT BUỘC [3] (DRY & Utils Extraction)**: Khi phát hiện logic bị lặp lại ở nhiều Component (đặc biệt là các đoạn logic phức tạp như check object type, mapping id, format data), BẮT BUỘC phải tách (extract) chúng thành các hàm helpers/utilities độc lập (vd: `getRecipientIdentity()`, `getParticipantName()`) đặt trong thư mục `utils/` của module đó để dùng chung. TUYỆT ĐỐI KHÔNG copy-paste code dài dòng.

### 7. Viết Kiểm thử (E2E Tests)
Nếu Feature yêu cầu testing, đọc [references/e2e-testing.md](references/e2e-testing.md) để áp dụng mô hình Page Object Model (POM) và Playwright spec.

### 8. Tạo Commit Giữ Git Lịch Sử Chuẩn
Đọc [references/commit-rule.md](references/commit-rule.md) để sử dụng Convention Commit formatting trước khi xác nhận commit.
