-- 建立管理員帳號
-- 帳號: admin1
-- 密碼: erp20261
DELETE FROM users WHERE username = 'admin1';
INSERT INTO users (username, password_hash, full_name, role, is_active)
VALUES (
  'admin1',
  '$2b$12$e/VKqxoXoNrL7EJMAHjPTOKhhLV8cbkiynB1UY8UvgADLjxLOOCum',
  '系統管理員',
  'owner',
  TRUE
);
SELECT id, username, role, is_active FROM users WHERE username = 'admin1';
