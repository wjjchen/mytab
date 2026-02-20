#!/bin/bash

# iTab 停止脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/itab.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        kill $PID
        echo "iTab 已停止 (PID: $PID)"
    else
        echo "iTab 未运行"
    fi
    rm -f "$PID_FILE"
else
    echo "未找到 PID 文件，iTab 可能未运行"
    # 尝试查找并杀死进程
    pkill -f "node server.js" 2>/dev/null && echo "已终止相关进程"
fi
