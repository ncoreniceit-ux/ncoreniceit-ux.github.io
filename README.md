# 📖 LitRead PDF Assistant

**Mô tả**: Ứng dụng đọc sách PDF nền web thông minh được thiết kế theo phong cách Dark Mode chuyên nghiệp. Tích hợp sâu công cụ dịch thuật tiện lợi, hệ thống quản lý mục tiêu (KPI) và ghi chú trực tiếp ngay trên trang. Hỗ trợ đa nền tảng nhờ sức mạnh của PWA (Progressive Web App - có thể cài đặt như app độc lập trên mọi thiết bị).

## 🚀 1. Danh sách tính năng (Core Features)

### 📚 1.1. Trình đọc PDF siêu mượt (Continuous Reading)
- **Tải và hiển thị mượt mà**: Hỗ trợ Kéo/Thả (Drag & Drop) hoặc tải file PDF trực tiếp.
- **Continuous Scroll (Cuộn liên tục)**: Toàn bộ trang PDF được dàn dựng liền mạch theo dạng cuộn dọc. Cơ chế `IntersectionObserver` chỉ tải đồ họa (render lazy) khi trang lọt vào tầm nhìn, đảm bảo app không bao giờ bị đứng hình dù tài liệu có cả ngàn trang.
- **Ghi nhớ vị trí (Smart Resume)**: Tự động lưu lại trang cuối cùng mà người dùng vừa đọc và đưa họ trở lại đúng vị trí đó vào lần mở file kế tiếp.
- **Thanh điều hướng** và hình thu nhỏ (Thumbnails) luôn trỏ và cập nhật động theo trang đang đọc. Cung cấp tùy chọn Thu phóng (+ / -) chuẩn xác.

### 🌐 1.2. Dịch thuật song ngôn (Smart Translate 2.0)
Người dùng có 2 tuỳ chọn sử dụng dựa trên nhu cầu:
- **Chế độ 👆 Click (Mặc định)**: App tự động phân tích và đóng khung các đoạn văn trên PDF. Chỉ cần nhấp vào bất cứ đoạn văn nào (thay vì phải bôi đen khó khăn), popup dịch ngay lập tức nổi lên với kết quả tiếng Việt bên cạnh, có thể copy nhanh nội dung.
- **Chế độ 📄 Song song (Parallel)**: Tách màn hình làm 2 cột. Các đoạn văn trên trang đang đọc sẽ tự động được phân tách, chuyển ngữ và đổ song song trực tiếp lên bên phải trang đó.
  - Hỗ trợ *View Split* (Tuỳ chọn xem): Giữa "Chỉ xem PDF", "Xem cả hai", và "Chỉ xem Tiếng Việt".
  - *Google Translate (GTX) Engine*: App sử dụng hệ thống gọi API kết hợp việc chẻ nhỏ dữ liệu (thành từng câu < 450 kí tự) giúp miễn nhiễm hoàn toàn với các hạn chế giới hạn (quota) và không bao giờ rớt chữ.

### 📝 1.3. Ghi chú cá nhân (Notes on Page)
- Chấm màu đánh dấu nhanh theo 4 lựa chọn (Vàng, Xanh, Đỏ, Tím) cho mọi trang PDF đang xem.
- Quản lý tập trung bằng thanh Panel Notes bên phải: Lọc nhanh note theo từng trang hoặc "Tất cả".

### 🎯 1.4. Quản lý Mục tiêu & Động lực (KPI Tracking)
- Quản lý định mức tối thiểu đọc bao nhiêu trang/ngày, và trang/tuần.
- Hệ thống báo cáo đo lường, cho biết phần trăm hoàn thành vòng Dashboard và bảng dữ liệu thống kê mỗi ngày. Theo dõi chuỗi (Streak) đọc sách kéo dài bao nhiêu ngày.

### 🔔 1.5. Nhắc nhở qua PWA (Service Worker Notifications)
- Form cài đặt lịch nhắc nhở đọc sách hằng ngày. Hỗ trợ chạy ngầm Service Worker để tự động bắn thông báo Push về máy tính/điện thoại người dùng bất chấp trình duyệt đang đóng, yêu cầu bật *PWA Notifications*.

---

## 🕒 2. Lịch sử thay đổi (Changelog & Revisions)

**[v1.0] Khởi tạo dự án & Mockup UI**
- Thiết kế layout tổng quan hỗ trợ phong cách thiết kế Dark & Glassmorphism cao cấp thay thế cho giao diện PDF thuần túy. Ứng dụng mô hình Vanilla JS gọn nhẹ nhưng có năng lực linh hoạt.

**[v1.1] Tính năng xử lí Text PDF cốt lõi**
- Tích hợp PDF.js và áp layer Text mặc định của thư viện.
- Setup tính năng ghi nhớ bộ nhớ qua _LocalStorage_, hệ thống Ghi chú Panel và tracking KPI cơ bản.

**[v1.2] Khắc phục UX trải nghiệm Dịch thuật**
- *Review*: Tính năng bôi đen (Highlight-to-translate) nguyên bản của PDF.js hoạt động phập phù, bị đứt đoạn từ khi làm việc với Tiếng Việt/văn bản phức tạp.
- *Fix*: Áp dụng thuật toán **Click-block**: tự động xây dựng lớp overlay gồm các mảng div trong suốt chồng khít lên văn bản PDF gốc.

**[v1.3] Giới thiệu Dịch Song Song & Heuristics Tracking**
- *Feature*: Ra mắt Translation Panel bên góc phải màn hình, có Toggle View (Cả Hai/Tiếng Việt).
- *Fix Spacing*: Sửa lỗi nhận diện chữ tồi tệ của PDF.js (vốn đánh rớt các dấu cách - Space) bằng một heuristic quét khoảng trống quang học `> 25% height` giữa các chữ giúp phục hồi hoàn hảo các cụm từ (fix rách chữ - exibility -> flexibility).
- *Fix Paragraphing*: Áp dụng ngưỡng xuống dòng thông minh `gap > 40% height` giữa các đoạn (line) để phục hồi toàn bộ cấu trúc đoạn văn, phân tách nội dung song song chuẩn chỉ y như thiết kế gốc của tác giả sách.

**[v1.4] Tái cấu trúc (Refactor): Continuous Scroll & Quota-Free Translation**
- *Feature*: Di dời triệt để mô hình Page-by-Page sang "Webtoon-style" Cuộn trơn tru bất tận. Sử dụng `IntersectionObserver` tối ưu hoá bộ nhớ canvas thay cho việc vẽ mọi trang.
- *Feature*: Ứng dụng chẻ nhỏ bộ công cụ API MyMemory (bị giới hạn 500 kí tự), sau đó loại bỏ hoàn toàn và di cư sang free API của Google Translate (GTX endpoint) cho phép không giới hạn độ dài dịch.
- Liên kết chặt chẽ chế độ dịch song song và scroll: tự động debounce 300ms và chỉ dịch trang ngay trước mặt người dùng đang dừng mắt, giúp ứng dụng không bị spam API.
