/**
 * A made-up Vietnamese office handbook (no real people or data) and twenty
 * questions, each answered by exactly one section. Used to measure how well
 * the embedding model finds the right passage (recall@4).
 */
export const HANDBOOK_SECTIONS = [
  'Giờ làm việc: văn phòng mở cửa từ 8 giờ sáng đến 17 giờ 30 chiều, từ thứ Hai đến thứ Sáu. Thứ Bảy làm việc buổi sáng theo lịch trực luân phiên.',
  'Nghỉ phép năm: mỗi nhân viên có 14 ngày phép năm. Đơn xin nghỉ cần gửi cho quản lý trực tiếp ít nhất ba ngày làm việc trước ngày nghỉ.',
  'Nghỉ ốm: khi bị ốm, nhân viên báo cho quản lý trước 9 giờ sáng. Nghỉ từ hai ngày trở lên cần nộp giấy khám bệnh trong vòng một tuần.',
  'Làm việc từ xa: mỗi tuần được làm từ xa tối đa hai ngày, cần đăng ký trên lịch chung trước thứ Sáu của tuần trước.',
  'Thiết bị: công ty cấp một máy tính xách tay và một màn hình rời. Máy hỏng thì báo bộ phận IT qua email, không tự mang đi sửa bên ngoài.',
  'Mật khẩu: mật khẩu phải dài ít nhất 12 ký tự và đổi ba tháng một lần. Không dùng lại năm mật khẩu gần nhất.',
  'Phòng họp: đặt phòng họp trên lịch chung. Phòng lớn ở tầng ba chứa được 20 người và có máy chiếu.',
  'Bãi xe: xe máy gửi ở tầng hầm B1, ô tô ở tầng B2. Thẻ gửi xe làm tại lễ tân trong tuần đầu tiên đi làm.',
  'Căng tin: căng tin ở tầng hai phục vụ bữa trưa từ 11 giờ 30 đến 13 giờ. Công ty hỗ trợ 30 nghìn đồng mỗi bữa.',
  'Công tác phí: chi phí đi công tác được thanh toán khi nộp hoá đơn đỏ trong vòng mười ngày sau chuyến đi.',
  'Đào tạo: mỗi năm nhân viên có ngân sách đào tạo 10 triệu đồng cho khoá học hoặc hội thảo liên quan đến công việc.',
  'Đánh giá: đánh giá hiệu quả công việc diễn ra hai lần mỗi năm, vào tháng Sáu và tháng Mười hai.',
  'Lương thưởng: lương được trả vào ngày 5 hằng tháng. Thưởng tháng mười ba trả cùng kỳ lương tháng Một.',
  'Bảo hiểm: công ty mua bảo hiểm sức khoẻ cho nhân viên chính thức, bao gồm khám răng tối đa hai lần mỗi năm.',
  'An toàn cháy nổ: khi có chuông báo cháy, đi theo cầu thang bộ ở hai đầu toà nhà và tập trung ở sân trước. Không dùng thang máy.',
  'Khách đến làm việc: khách phải đăng ký ở lễ tân và đeo thẻ khách trong suốt thời gian ở toà nhà.',
  'Bảo mật tài liệu: tài liệu mật không được gửi qua ứng dụng nhắn tin cá nhân. Dùng hộp thư công ty và mã hoá tệp đính kèm.',
  'Máy in: máy in màu ở tầng hai. In trên 50 trang cần xin phép trưởng bộ phận để tiết kiệm giấy.',
  'Sự kiện: tiệc cuối năm tổ chức vào tuần cuối tháng Mười hai. Mỗi phòng ban chuẩn bị một tiết mục văn nghệ.',
  'Nghỉ việc: khi muốn nghỉ việc, nhân viên chính thức báo trước 30 ngày và bàn giao công việc theo danh sách của quản lý.',
] as const;

/** Question → index of the section that answers it. */
export const HANDBOOK_QUESTIONS: readonly [string, number][] = [
  ['Văn phòng đóng cửa lúc mấy giờ?', 0],
  ['Một năm tôi được nghỉ phép bao nhiêu ngày?', 1],
  ['Nghỉ ốm ba ngày thì cần giấy tờ gì?', 2],
  ['Tôi có thể làm ở nhà mấy ngày một tuần?', 3],
  ['Laptop bị hỏng thì phải làm sao?', 4],
  ['Mật khẩu cần dài tối thiểu bao nhiêu ký tự?', 5],
  ['Phòng nào có máy chiếu cho cuộc họp đông người?', 6],
  ['Gửi ô tô ở đâu?', 7],
  ['Bữa trưa được hỗ trợ bao nhiêu tiền?', 8],
  ['Bao lâu sau chuyến công tác phải nộp hoá đơn?', 9],
  ['Ngân sách học khoá học mỗi năm là bao nhiêu?', 10],
  ['Khi nào có đợt đánh giá năng lực?', 11],
  ['Ngày nào nhận lương?', 12],
  ['Bảo hiểm có chi trả khám răng không?', 13],
  ['Có chuông báo cháy thì đi đường nào?', 14],
  ['Khách tới công ty cần làm thủ tục gì?', 15],
  ['Có được gửi tài liệu mật qua Zalo không?', 16],
  ['Muốn in 100 trang có cần xin phép ai không?', 17],
  ['Tiệc tất niên tổ chức khi nào?', 18],
  ['Muốn nghỉ việc phải báo trước bao lâu?', 19],
];

/** The handbook as one Markdown document, for attaching in tests. */
export function handbookMarkdown(): string {
  return [
    '# Sổ tay nhân viên (ví dụ)',
    ...HANDBOOK_SECTIONS.map((section, i) => `## Mục ${i + 1}\n\n${section}`),
  ].join('\n\n');
}
