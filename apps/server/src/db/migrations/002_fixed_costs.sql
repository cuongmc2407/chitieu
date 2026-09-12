-- Chi phí cố định hàng tháng (tiền nhà, internet, gói cước, bảo hiểm…):
-- khai báo một lần, server tự ghi vào sổ mỗi tháng khi đến ngày đến hạn.

CREATE TABLE fixed_costs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  category_id TEXT NOT NULL REFERENCES categories (id),
  -- 1–31; tháng nào ngắn hơn thì lùi về ngày cuối tháng (31 -> 28/02).
  day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  note TEXT NOT NULL DEFAULT '',
  -- 0 = chỉ theo dõi/nhắc, không tự ghi vào sổ.
  auto_post INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  -- 'yyyy-mm' của tháng gần nhất đã ghi; chặn ghi trùng khi job chạy lại
  -- (cùng với UNIQUE(user_id, client_id) bên transactions).
  last_posted_period TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, name)
);
CREATE INDEX idx_fixed_costs_user ON fixed_costs (user_id);

-- Đánh dấu giao dịch nào do chi phí cố định sinh ra, để hiển thị nhãn "tự
-- động" và truy ngược. Cột thêm mới (nullable) nên không phải dựng lại bảng.
ALTER TABLE transactions ADD COLUMN fixed_cost_id TEXT REFERENCES fixed_costs (id);
