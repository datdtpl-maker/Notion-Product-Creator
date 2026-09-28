# Biểu tượng Product Creator

Biểu tượng PC màu xanh emerald được tạo bằng công cụ imagegen tích hợp cho bản v1.2.24. Đây là nhận diện riêng của ứng dụng, không phải logo chính thức của Notion hay Facebook.

## Tài nguyên

- `public/app-icon.png`: ảnh gốc, dùng cho giao diện và cửa sổ ngoài Windows.
- `public/favicon.ico`: icon đa kích thước cho Windows, bộ cài và favicon.
- `public/app-icon.icns`: icon macOS trong gói `.app`/DMG.
- `app_icon.ico`: bản tương thích với script đóng gói Windows cũ.

Chạy `npm run icons` để chuyển lại PNG thành ICO và ICNS bằng bộ chuyển đổi có sẵn của Electron Builder. Không cần cài thêm thư viện đồ họa. Giữ nguyên thiết kế khi chuyển định dạng.

## Prompt tạo ảnh

```text
Use case: logo-brand. Deliver ONE finished production desktop app icon for Notion Product Creator, a professional content and product-image workspace. Square 1024x1024 icon with edge-to-edge solid deep emerald teal #0b7562 background, no surrounding white canvas. Center a distinctive bold ivory-white geometric interlocking P/C monogram: one unified precise modern symbol suggesting a content page, rounded corners, generous open negative space, professional premium productivity software identity. Mark occupies about 60 percent of canvas width, perfectly optically balanced and legible at 16/32/48 pixels. Flat vector-like crisp edges, minimal original design, no fine details, no text outside the P/C monogram, no border, no drop shadow, no shiny 3D, no gradients, no sparkle, no Notion N or any existing brand logo. Straight-on final icon asset only; no presentation board, no mockup, no device, no watermark. This will be converted into Windows ICO and macOS ICNS and also used in the application header.
```

Ảnh dùng nền đặc vì công cụ tạo ảnh ở phiên này không hỗ trợ đầu ra trong suốt. Không cần API key của người dùng để tạo tài nguyên này.
