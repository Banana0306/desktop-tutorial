#!/bin/bash
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "首次執行，安裝套件中..."
  npm install
fi

( sleep 2 && open "http://localhost:3000/pump-finder/index.html" ) &

echo "啟動伺服器中，請勿關閉這個視窗..."
node server.js
