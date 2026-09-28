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

## Nhận và lưu ảnh ChatGPT

Mỗi lần bấm sinh ảnh chỉ gửi một prompt. Tool ghi nhận cuộc hội thoại và các lượt cũ trước khi gửi, xác minh đúng nội dung prompt mới, rồi chỉ lấy ảnh ở câu trả lời tiếp theo. Ảnh được lưu thành `1.png`–`4.png` trong thư mục sản phẩm đã chọn; không tự chạy prompt kế tiếp.

Bộ nhận diện hỗ trợ dấu nhận diện lượt chat, nhãn người nói và khung ảnh có nút chỉnh sửa/tải xuống/chia sẻ khi bố cục không còn dấu cũ. Ảnh mẫu, logo, kết quả cũ và ảnh đang xử lý không được coi là kết quả mới. Nếu chuyển cuộc hội thoại, tải lại trang hoặc gửi thêm prompt trong lúc chờ, tool dừng thay vì lưu nhầm. Trước khi ghi file, tool kiểm tra lại lượt trả lời; file tạm được đổi tên sau khi xác minh xong để bảo toàn ảnh đã có.

Nhật ký phân biệt: chưa nhận diện prompt đã gửi, đã khóa prompt và chờ ảnh, hoặc đã tìm thấy ảnh và đang lưu. Giao diện ChatGPT có thể thay đổi; kiểm thử mô phỏng không thay thế kiểm tra trên tài khoản/máy thực tế.

Từ v1.2.22, tool nhận diện cả bố cục ChatGPT mới dùng tiêu đề `h4`, mã tin nhắn tìm kiếm và khối `display: contents`. Một khối tìm kiếm có thể chứa cả prompt lẫn câu trả lời; tool tách riêng từng người nói, không lấy ảnh đính kèm làm kết quả. Đã kiểm chứng nhận và lưu một ảnh kết quả thật ở độ phân giải nguồn trên Windows, cùng kiểm thử tự động lưu `1.png`–`4.png`. macOS dùng cùng logic nhưng vẫn cần kiểm tra trên tài khoản/máy thực tế.

v1.2.23 sửa thêm lỗi nhận canvas hiệu ứng đang tạo ảnh là kết quả. Tool không tải canvas hoặc chụp khung chờ; chỉ nhận ảnh đã tải với nút chỉnh sửa/chia sẻ/tải xuống của ảnh hoàn chỉnh. Khi còn nút Dừng, trạng thái Creating image hoặc thanh tiến độ, tool tiếp tục chờ kể cả đã có ảnh xem trước. Trước khi ghi file, tool kiểm tra lại trạng thái và nguồn ảnh; PNG hoàn toàn trong suốt bị từ chối, file đã có được giữ nguyên nếu xác minh thất bại. Kiểm thử API bao gồm khung Creating image 31%: chưa ghi file, chưa báo thành công; sau khi thay bằng ảnh hoàn chỉnh mới lưu theo số prompt.

URL được ChatGPT cập nhật sau khi gửi không còn tự động bị coi là đổi cuộc trò chuyện: tool đối chiếu danh tính tin nhắn (message ID hoặc phần tử prompt đã khóa) trong đúng tab trước khi tiếp tục. Trùng nội dung prompt hoặc trùng số thứ tự lượt chat không đủ để chấp nhận một cuộc hội thoại khác. Tải lại trang hay thay nội dung cuộc hội thoại vẫn bị chặn.

## Build

### Giao diện v1.2.24

Danh mục sản phẩm có sẵn 12 lựa chọn theo website Derma. Giao diện Website/Facebook dùng chung cấu hình có thể thu gọn, hỗ trợ sáng/tối và không giới hạn nội dung trong các cột cuộn chật. Mỗi dòng ảnh có nút sinh riêng, chỉ thông báo thành công sau khi backend lưu ảnh xong. Luồng xử lý ChatGPT/Google Drive/Notion/Facebook được giữ nguyên.

Logo PC mới được áp dụng trên Windows và macOS. Nguồn ảnh và cách tạo lại định dạng icon ở [docs/APP_ICON.md](docs/APP_ICON.md).

### Tạo bộ cài

```bash
npm run electron-build
npm run electron-build-mac
```

`electron-build-mac` phải chạy trên macOS. Workflow GitHub Actions tự tạo file `.dmg` trên runner macOS khi push tag `v*` hoặc chạy thủ công từ tab Actions.

## Hiệu năng kết nối

Ứng dụng cache cấu hình chỉ đọc trong thời gian ngắn và tự vô hiệu cache sau mỗi lần lưu. Client OpenAI/Notion được tái sử dụng với HTTP keep-alive, timeout 30 giây và retry hữu hạn; luồng thao tác và dữ liệu nghiệp vụ không thay đổi.
