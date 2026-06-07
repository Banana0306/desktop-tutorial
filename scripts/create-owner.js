#!/usr/bin/env node
// CLI script to create the initial owner account
require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });

const readline = require('readline');
const bcrypt = require('bcrypt');
const { createUser, findUserByUsername } = require('../backend/src/db/users');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

function hiddenInput(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    stdin.on('data', function handler(ch) {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.removeListener('data', handler);
        process.stdout.write('\n');
        resolve(value);
      } else if (ch === '') {
        process.exit();
      } else if (ch === '') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        value += ch;
        process.stdout.write('*');
      }
    });
  });
}

async function main() {
  console.log('=== 瑞城 ERP - 建立 Owner 帳號 ===\n');

  while (true) {
    const username = await question('使用者名稱 (6-50 英數字): ');
    if (!/^[a-zA-Z0-9_]{6,50}$/.test(username)) {
      console.log('❌ 使用者名稱格式錯誤,請使用 6-50 個英數字或底線');
      continue;
    }

    const existing = await findUserByUsername(username).catch(() => null);
    if (existing) {
      console.log(`❌ 使用者名稱 "${username}" 已存在,請換一個`);
      continue;
    }

    const password = await hiddenInput('密碼 (最少 8 字): ');
    if (password.length < 8) {
      console.log('❌ 密碼至少需要 8 個字元');
      continue;
    }

    const confirm = await hiddenInput('確認密碼: ');
    if (password !== confirm) {
      console.log('❌ 兩次密碼不一致');
      continue;
    }

    const fullName = await question('全名: ');
    const email = await question('Email (可留空): ');

    console.log('\n正在建立帳號...');
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await createUser({
      username,
      password_hash: passwordHash,
      full_name: fullName,
      email:     email || null,
      role:      'owner',
    });

    console.log(`\n✅ Owner 帳號建立成功: user_id=${user.id}, username=${user.username}`);
    break;
  }

  rl.close();
  process.exit(0);
}

main().catch(err => {
  console.error('錯誤:', err.message);
  process.exit(1);
});
