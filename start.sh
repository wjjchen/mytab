#!/bin/bash

# iTab 后台运行脚本

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/itab.log"
PID_FILE="$SCRIPT_DIR/itab.pid"

# 检查是否已经在运行
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo "iTab 已在运行中 (PID: $OLD_PID)"
        exit 1
    else
        rm -f "$PID_FILE"
    fi
fi

# 进入项目目录
cd "$SCRIPT_DIR"

# 后台启动服务
echo "正在启动 iTab..."
nohup node server.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "iTab 已启动 (PID: $(cat $PID_FILE))"
echo "日志文件: $LOG_FILE"
echo "访问地址: http://localhost:3001"
