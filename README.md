# Chrome 扩展安装说明

## 安装方法

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension` 文件夹
5. 打开新标签页即可使用

## 功能特性

- ✅ 分类管理网站书签
- ✅ 拖拽排序
- ✅ 右键菜单编辑/移动/删除
- ✅ 搜索网站
- ✅ 自定义背景/Logo/颜色
- ✅ 导入/导出配置
- ✅ 记住上次打开的分类
- ✅ 数据本地存储（chrome.storage）

## 从 Web 版本迁移

如果你之前使用 Web 版本，可以：
1. 在 Web 版本中导出配置
2. 在扩展中导入配置


# Docker 安装说明

## 快速开始

1. 拉取镜像
```bash
docker pull wjjchen/mytab
```

2. 运行容器
```bash
docker run -d \
  --name mytab \
  -p 3001:3001 \
  -v ./data:/app/data \
  wjjchen/mytab:latest
```

3. 访问应用
打开浏览器访问 `http://localhost:3001`

## 配置说明

### 端口配置

默认端口为 `3001`，如需修改：

**Docker Compose 方式**：编辑 `docker-compose.yml` 文件中的 `ports` 配置
```yaml
ports:
  - "8080:3001"  # 将 8080 改为你想要的端口
```

**Docker 命令方式**：修改 `-p` 参数
```bash
docker run -d -p 8080:3001 wjjchen/mytab:latest
```

### 数据持久化

数据存储在容器内的 `/app/data` 目录，建议挂载到宿主机以实现数据持久化：

```bash
docker run -d \
  -p 3001:3001 \
  -v /path/to/your/data:/app/data \
  wjjchen/mytab:latest
```

扩展支持 WebDAV 云同步功能，可跨设备同步配置。

## WebDAV 云同步配置

支持坚果云、Nextcloud 等 WebDAV 服务：

1. 打开设置 → 点击"配置云同步"
2. 填写 WebDAV 服务器信息：
   - **坚果云**：`https://dav.jianguoyun.com/dav/`
   - **Nextcloud**：`https://your-nextcloud.com/remote.php/dav/files/username/`
3. 填写用户名和应用密码（坚果云需要在设置中生成应用密码）
4. 点击"测试连接"验证配置
5. 使用"上传配置"和"下载配置"进行同步

## 故障排除

### 端口被占用
```bash
# 查看端口占用
lsof -i :3001
# 或使用其他端口
docker-compose up -d -p 8080:3001
```

### 数据丢失
确保使用数据卷挂载：
```bash
docker run -d -p 3001:3001 -v ./data:/app/data wjjchen/mytab:latest
```

![截图](https://raw.githubusercontent.com/wjjchen/mytab/refs/heads/main/1.png)
