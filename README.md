# Notion Product Creator

Ứng dụng desktop Electron hỗ trợ tạo nội dung sản phẩm, tạo ảnh bằng ChatGPT, đồng bộ Notion và chuẩn bị bài đăng Facebook.

## Cài đặt và chạy source

```bash
npm ci
npm start
```

## Cấu hình lần đầu trên từng máy

1. Nhập **OpenAI API Key** và **Notion API Key** trong ứng dụng, sau đó lưu.
2. Chọn thư mục gốc ảnh đã đồng bộ bằng Google Drive for Desktop.
3. Với ChatGPT: bấm **Mở Chrome đăng nhập** để đăng nhập thủ công trong profile của tool, chưa có kết nối tự động hóa.
4. Đăng nhập xong, đóng các cửa sổ của profile đó (không đăng xuất), rồi bấm **Kết nối Chrome Debug**. Những lần sau có thể kết nối Debug trực tiếp.
5. Nếu trang còn tải, khi ô nhập ChatGPT xuất hiện hãy bấm **Kiểm tra và khóa tab**. Chỉ trạng thái **ChatGPT: Sẵn sàng** mới cho phép sinh ảnh.
6. Với Facebook: mở Facebook Debug và đăng nhập như trước.

Khi nâng cấp từ bản cũ, đóng Chrome Debug cũ trước khi mở bước đăng nhập thủ công. Không cần xóa profile, cookie hoặc API key. Tool không tự mở tab thay thế khi ChatGPT chuyển sang trang đăng nhập và không tự xử lý xác minh Cloudflare; bước xác minh cần do người dùng thực hiện.

Các khóa chỉ được lưu trong cấu hình cục bộ của máy, không được đưa vào Git hay bản phát hành.

## Build

```bash
npm run electron-build
npm run electron-build-mac
```

`electron-build-mac` phải chạy trên macOS. Workflow GitHub Actions tự tạo file `.dmg` trên runner macOS khi push tag `v*` hoặc chạy thủ công từ tab Actions.

## Hiệu năng kết nối

Ứng dụng cache cấu hình chỉ đọc trong thời gian ngắn và tự vô hiệu cache sau mỗi lần lưu. Client OpenAI/Notion được tái sử dụng với HTTP keep-alive, timeout 30 giây và retry hữu hạn; luồng thao tác và dữ liệu nghiệp vụ không thay đổi.
