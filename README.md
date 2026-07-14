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
3. Mở Chrome/Facebook Debug và đăng nhập các tài khoản cần thiết.

Các khóa chỉ được lưu trong cấu hình cục bộ của máy, không được đưa vào Git hay bản phát hành.

## Build

```bash
npm run electron-build
npm run electron-build-mac
```

`electron-build-mac` phải chạy trên macOS. Workflow GitHub Actions tự tạo file `.dmg` trên runner macOS khi push tag `v*` hoặc chạy thủ công từ tab Actions.
