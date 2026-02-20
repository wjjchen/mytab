const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const app = express();
const PORT = 3001;

// ========== 安全配置 ==========

// XSS 防护 - HTML 转义函数
function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// 递归转义对象中的所有字符串
function sanitizeObject(obj) {
  if (typeof obj === 'string') {
    return escapeHtml(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const key in obj) {
      // 排除不需要转义的字段（如 URL）
      if (key === 'url' || key === 'background' || key === 'icon') {
        // 对 URL 字段只进行基本验证，不转义
        sanitized[key] = obj[key];
      } else {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  return obj;
}

// SSRF 防护 - 验证 URL 是否安全
function isSafeUrl(urlString) {
  try {
    const urlObj = new URL(urlString);
    // 只允许 http 和 https 协议
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }
    // 阻止访问内网地址
    const hostname = urlObj.hostname.toLowerCase();
    const blockedPatterns = [
      'localhost', '127.', '0.0.0.0', '192.168.', '10.', '172.16.', '172.17.',
      '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.',
      '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
      '172.30.', '172.31.', '::1', '0:0:0:0:0:0:0:1'
    ];
    for (const pattern of blockedPatterns) {
      if (hostname === pattern || hostname.startsWith(pattern)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

// 请求频率限制
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1分钟
const RATE_LIMIT_MAX = 100; // 每分钟最多100次请求

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const record = rateLimitMap.get(ip);
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  record.count++;
  if (record.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  
  next();
}

// 加密密钥（基于机器特征生成，重启后不变）
const ENCRYPTION_KEY = crypto.createHash('sha256')
  .update(require('os').hostname() + 'itab-secret-key')
  .digest();
const IV_LENGTH = 16;

// 加密函数
function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// 解密函数
function decrypt(text) {
  if (!text || !text.includes(':')) return text;
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return text; // 解密失败返回原文
  }
}

// 加密 WebDAV 配置
function encryptWebdav(webdav) {
  if (!webdav) return webdav;
  const encrypted = { ...webdav };
  if (encrypted.password) {
    encrypted.password = encrypt(encrypted.password);
    encrypted._encrypted = true;
  }
  return encrypted;
}

// 解密 WebDAV 配置
function decryptWebdav(webdav) {
  if (!webdav || !webdav._encrypted) return webdav;
  const decrypted = { ...webdav };
  if (decrypted.password) {
    decrypted.password = decrypt(decrypted.password);
  }
  delete decrypted._encrypted;
  return decrypted;
}

// 中间件
app.use(express.json({ limit: '1mb' })); // 限制请求体大小
app.use(express.static('public'));
// 注意：不再直接暴露 data 目录，防止敏感数据泄露

// 安全响应头
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.removeHeader('X-Powered-By');
  next();
});

// API 请求频率限制
app.use('/api/', rateLimit);

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'data', 'sites.json');

// 读取数据
function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { settings: { background: '', iconSize: 'normal' }, categories: [] };
  }
}

// 写入数据
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== API 接口 ==========

// 获取所有数据
app.get('/api/sites', (req, res) => {
  const data = readData();
  // 解密 WebDAV 密码
  if (data.settings?.webdav) {
    data.settings.webdav = decryptWebdav(data.settings.webdav);
  }
  res.json(data);
});

// 更新设置
app.put('/api/settings', (req, res) => {
  const data = readData();
  const { background, iconSize, logoIcon, logoText, sidebarCollapsed, textColor, lastCategory, webdav } = req.body;
  
  if (!data.settings) {
    data.settings = { background: '', iconSize: 'normal', logoIcon: '🚀', logoText: 'iTab', sidebarCollapsed: false, textColor: '#ffffff' };
  }
  
  if (background !== undefined) data.settings.background = background;
  if (iconSize !== undefined) data.settings.iconSize = iconSize;
  if (logoIcon !== undefined) data.settings.logoIcon = logoIcon;
  if (logoText !== undefined) data.settings.logoText = logoText;
  if (sidebarCollapsed !== undefined) data.settings.sidebarCollapsed = sidebarCollapsed;
  if (textColor !== undefined) data.settings.textColor = textColor;
  if (lastCategory !== undefined) data.settings.lastCategory = lastCategory;
  if (webdav !== undefined) {
    // 加密 WebDAV 密码后存储
    const encryptedWebdav = encryptWebdav(webdav);
    data.settings.webdav = { ...data.settings.webdav, ...encryptedWebdav };
  }
  
  writeData(data);
  // 返回前解密
  const responseSettings = { ...data.settings };
  if (responseSettings.webdav) {
    responseSettings.webdav = decryptWebdav(responseSettings.webdav);
  }
  res.json(responseSettings);
});

// 导入配置
app.post('/api/import', (req, res) => {
  try {
    const importData = req.body;
    
    if (!importData.categories || !Array.isArray(importData.categories)) {
      return res.status(400).json({ error: '无效的配置文件格式' });
    }
    
    writeData(importData);
    res.json({ success: true, message: '导入成功' });
  } catch (error) {
    res.status(500).json({ error: '导入失败: ' + error.message });
  }
});

// 添加分类
app.post('/api/categories', (req, res) => {
  const data = readData();
  const { name, icon } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: '分类名称不能为空' });
  }
  
  const newCategory = {
    id: 'cat_' + Date.now(),
    name,
    icon: icon || '📁',
    sites: []
  };
  
  data.categories.push(newCategory);
  writeData(data);
  res.json(newCategory);
});

// 更新分类排序（必须在 /api/categories/:id 之前）
app.put('/api/categories/reorder', (req, res) => {
  const data = readData();
  const { categoryIds } = req.body;
  
  if (!Array.isArray(categoryIds)) {
    return res.status(400).json({ error: '无效的排序数据' });
  }
  
  // 按新顺序重新排列分类
  const reorderedCategories = [];
  categoryIds.forEach(id => {
    const category = data.categories.find(c => c.id === id);
    if (category) reorderedCategories.push(category);
  });
  
  // 添加未被包含的分类（防止数据丢失）
  data.categories.forEach(category => {
    if (!categoryIds.includes(category.id)) {
      reorderedCategories.push(category);
    }
  });
  
  data.categories = reorderedCategories;
  writeData(data);
  res.json({ success: true });
});

// 编辑分类
app.put('/api/categories/:id', (req, res) => {
  const data = readData();
  const { id } = req.params;
  const { name, icon } = req.body;
  
  const category = data.categories.find(c => c.id === id);
  if (!category) {
    return res.status(404).json({ error: '分类不存在' });
  }
  
  if (name) category.name = name;
  if (icon !== undefined) category.icon = icon;
  
  writeData(data);
  res.json(category);
});

// 删除分类
app.delete('/api/categories/:id', (req, res) => {
  const data = readData();
  const { id } = req.params;
  
  const index = data.categories.findIndex(c => c.id === id);
  if (index === -1) {
    return res.status(404).json({ error: '分类不存在' });
  }
  
  data.categories.splice(index, 1);
  writeData(data);
  res.json({ success: true });
});

// 添加网站
app.post('/api/categories/:categoryId/sites', (req, res) => {
  const data = readData();
  const { categoryId } = req.params;
  const { name, url, icon, description } = req.body;
  
  if (!name || !url) {
    return res.status(400).json({ error: '网站名称和URL不能为空' });
  }
  
  const category = data.categories.find(c => c.id === categoryId);
  if (!category) {
    return res.status(404).json({ error: '分类不存在' });
  }
  
  const newSite = {
    name,
    url,
    icon: icon || '🌐',
    description: description || ''
  };
  
  category.sites.push(newSite);
  writeData(data);
  res.json(newSite);
});

// 更新网站排序（必须在 /api/categories/:categoryId/sites/:siteIndex 之前）
app.put('/api/categories/:categoryId/sites/reorder', (req, res) => {
  const data = readData();
  const { categoryId } = req.params;
  const { siteIndices } = req.body; // 新的索引顺序数组
  
  const category = data.categories.find(c => c.id === categoryId);
  if (!category) {
    return res.status(404).json({ error: '分类不存在' });
  }
  
  if (!Array.isArray(siteIndices)) {
    return res.status(400).json({ error: '无效的排序数据' });
  }
  
  // 按新顺序重新排列网站
  const reorderedSites = [];
  siteIndices.forEach(index => {
    if (index >= 0 && index < category.sites.length) {
      reorderedSites.push(category.sites[index]);
    }
  });
  
  // 添加未被包含的网站
  category.sites.forEach((site, index) => {
    if (!siteIndices.includes(index)) {
      reorderedSites.push(site);
    }
  });
  
  category.sites = reorderedSites;
  writeData(data);
  res.json({ success: true });
});

// 更新网站排序（直接传入完整网站数组）
app.put('/api/categories/:categoryId/sites/reorder-full', (req, res) => {
  const data = readData();
  const { categoryId } = req.params;
  const { sites } = req.body;
  
  const category = data.categories.find(c => c.id === categoryId);
  if (!category) {
    return res.status(404).json({ error: '分类不存在' });
  }
  
  if (!Array.isArray(sites)) {
    return res.status(400).json({ error: '无效的排序数据' });
  }
  
  category.sites = sites;
  writeData(data);
  res.json({ success: true });
});

// 编辑网站
app.put('/api/categories/:categoryId/sites/:siteIndex', (req, res) => {
  const data = readData();
  const { categoryId, siteIndex } = req.params;
  const { name, url, icon, description } = req.body;
  
  const category = data.categories.find(c => c.id === categoryId);
  if (!category) {
    return res.status(404).json({ error: '分类不存在' });
  }
  
  const site = category.sites[parseInt(siteIndex)];
  if (!site) {
    return res.status(404).json({ error: '网站不存在' });
  }
  
  if (name) site.name = name;
  if (url) site.url = url;
  if (icon) site.icon = icon;
  if (description !== undefined) site.description = description;
  
  writeData(data);
  res.json(site);
});

// 删除网站
app.delete('/api/categories/:categoryId/sites/:siteIndex', (req, res) => {
  const data = readData();
  const { categoryId, siteIndex } = req.params;
  
  const category = data.categories.find(c => c.id === categoryId);
  if (!category) {
    return res.status(404).json({ error: '分类不存在' });
  }
  
  const index = parseInt(siteIndex);
  if (index < 0 || index >= category.sites.length) {
    return res.status(404).json({ error: '网站不存在' });
  }
  
  category.sites.splice(index, 1);
  writeData(data);
  res.json({ success: true });
});

// 移动网站到其他分类
app.put('/api/categories/:categoryId/sites/:siteIndex/move', (req, res) => {
  const data = readData();
  const { categoryId, siteIndex } = req.params;
  const { targetCategoryId } = req.body;
  
  if (!targetCategoryId) {
    return res.status(400).json({ error: '目标分类不能为空' });
  }
  
  const sourceCategory = data.categories.find(c => c.id === categoryId);
  const targetCategory = data.categories.find(c => c.id === targetCategoryId);
  
  if (!sourceCategory || !targetCategory) {
    return res.status(404).json({ error: '分类不存在' });
  }
  
  const index = parseInt(siteIndex);
  if (index < 0 || index >= sourceCategory.sites.length) {
    return res.status(404).json({ error: '网站不存在' });
  }
  
  // 移动网站
  const site = sourceCategory.sites.splice(index, 1)[0];
  targetCategory.sites.push(site);
  
  writeData(data);
  res.json({ success: true });
});

// 自动获取网站 favicon
app.get('/api/favicon', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL 不能为空' });
  }
  
  // SSRF 防护 - 验证 URL 安全性
  if (!isSafeUrl(url)) {
    return res.status(400).json({ error: '不允许访问该地址' });
  }
  
  try {
    const urlObj = new URL(url);
    // 只返回公开的 favicon 服务地址，不直接请求
    const faviconUrls = [
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(urlObj.hostname)}&sz=64`,
      `https://favicon.im/${encodeURIComponent(urlObj.hostname)}?larger=true`
    ];
    
    res.json({ favicons: faviconUrls, domain: urlObj.hostname });
  } catch (error) {
    res.status(400).json({ error: '无效的 URL' });
  }
});

// 数据备份 - 获取带时间戳的备份
app.get('/api/backup', (req, res) => {
  const data = readData();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Disposition', `attachment; filename="itab-backup-${timestamp}.json"`);
  res.json(data);
});

// 数据恢复 - 从备份文件恢复
app.post('/api/restore', (req, res) => {
  try {
    const backupData = req.body;
    
    // 验证备份数据格式
    if (!backupData || typeof backupData !== 'object') {
      return res.status(400).json({ error: '无效的备份数据' });
    }
    
    // 确保必要字段存在
    if (!backupData.settings) {
      backupData.settings = { background: '', iconSize: 'normal', logoIcon: '🚀', logoText: 'iTab', sidebarCollapsed: false, textColor: '#ffffff' };
    }
    if (!backupData.categories) {
      backupData.categories = [];
    }
    
    // 创建当前数据的备份
    const currentData = readData();
    const backupBeforeRestore = {
      ...currentData,
      _backupTime: new Date().toISOString()
    };
    
    // 写入恢复的数据
    writeData(backupData);
    
    res.json({ 
      success: true, 
      message: '数据恢复成功',
      previousBackup: backupBeforeRestore
    });
  } catch (error) {
    res.status(500).json({ error: '恢复失败: ' + error.message });
  }
});

// ========== WebDAV 备份功能 ==========

// WebDAV 请求辅助函数
function webdavRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(options.url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${options.username}:${options.password}`).toString('base64'),
        ...options.headers
      }
    };
    
    const req = lib.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, status: res.statusCode, body });
        } else {
          resolve({ success: false, status: res.statusCode, body, error: `HTTP ${res.statusCode}` });
        }
      });
    });
    
    req.on('error', (err) => reject(err));
    
    if (data) req.write(data);
    req.end();
  });
}

// 测试 WebDAV 连接
app.post('/api/webdav/test', async (req, res) => {
  const { url, username, password, path: webdavPath } = req.body;
  
  if (!url || !username || !password) {
    return res.status(400).json({ success: false, error: '缺少必要参数' });
  }
  
  // SSRF 防护 - 只允许 HTTPS 的 WebDAV 服务
  if (!url.startsWith('https://')) {
    return res.status(400).json({ success: false, error: '只支持 HTTPS 协议的 WebDAV 服务' });
  }
  
  if (!isSafeUrl(url)) {
    return res.status(400).json({ success: false, error: '不允许访问该地址' });
  }
  
  try {
    // 尝试创建目录
    const testUrl = url.replace(/\/$/, '') + (webdavPath || '/itab-backup/');
    const result = await webdavRequest({
      url: testUrl,
      username,
      password,
      method: 'MKCOL'
    });
    
    // 201 = 创建成功, 405 = 已存在
    if (result.success || result.status === 405) {
      res.json({ success: true, message: '连接成功' });
    } else {
      res.json({ success: false, error: result.error || '无法访问目录' });
    }
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// 执行 WebDAV 备份
app.post('/api/webdav/backup', async (req, res) => {
  const data = readData();
  const webdav = decryptWebdav(data.settings?.webdav); // 解密密码
  
  if (!webdav || !webdav.url) {
    return res.status(400).json({ success: false, error: '未配置 WebDAV' });
  }
  
  // SSRF 防护
  if (!webdav.url.startsWith('https://') || !isSafeUrl(webdav.url)) {
    return res.status(400).json({ success: false, error: 'WebDAV 配置无效' });
  }
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `itab-backup-${timestamp}.json`;
    const backupUrl = webdav.url.replace(/\/$/, '') + (webdav.path || '/itab-backup/') + fileName;
    
    // 先确保目录存在
    const dirUrl = webdav.url.replace(/\/$/, '') + (webdav.path || '/itab-backup/');
    await webdavRequest({
      url: dirUrl,
      username: webdav.username,
      password: webdav.password,
      method: 'MKCOL'
    }).catch(() => {}); // 忽略目录已存在的错误
    
    // 深拷贝并排除WebDAV敏感信息
    const exportData = JSON.parse(JSON.stringify(data));
    if (exportData.settings?.webdav) {
      delete exportData.settings.webdav;
    }
    
    // 上传备份文件
    const backupData = JSON.stringify(exportData, null, 2);
    const result = await webdavRequest({
      url: backupUrl,
      username: webdav.username,
      password: webdav.password,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(backupData)
      }
    }, backupData);
    
    if (result.success) {
      // 更新上次备份时间（保持加密状态）
      const storedWebdav = data.settings?.webdav;
      if (!data.settings) data.settings = {};
      data.settings.webdav = { ...storedWebdav, lastBackup: new Date().toISOString() };
      writeData(data);
      
      res.json({ success: true, message: '备份成功', fileName });
    } else {
      res.json({ success: false, error: result.error || '上传失败' });
    }
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`网址导航网站运行在 http://localhost:${PORT}`);
});
