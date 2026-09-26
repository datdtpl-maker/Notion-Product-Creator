const fs = require('node:fs/promises');

async function runImageSequence(prompts, startIndex, generate, onProgress = () => {}) {
  const completed = [];
  for (let index = startIndex; index <= prompts.length; index++) {
    if (!prompts[index - 1]?.trim()) throw new Error(`Prompt ${index} đang trống. Đã dừng chuỗi tạo ảnh.`);
    onProgress(index, completed);
    const filePath = await generate(index, prompts[index - 1]);
    const bytes = await fs.readFile(filePath);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error(`Ảnh ${index} chưa được lưu thành PNG hợp lệ; không chuyển prompt tiếp theo.`);
    }
    completed.push(index);
  }
  return completed;
}

module.exports = { runImageSequence };
