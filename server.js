const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3001;

// 中间件
app.use(express.json());
app.use(express.static('public'));
app.use('/data', express.static('data'));

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
  res.json(readData());
});

// 更新设置
app.put('/api/settings', (req, res) => {
  const data = readData();
  const { background, iconSize, logoIcon, logoText, sidebarCollapsed, textColor } = req.body;
  
  if (!data.settings) {
    data.settings = { background: '', iconSize: 'normal', logoIcon: '🚀', logoText: 'iTab', sidebarCollapsed: false, textColor: '#ffffff' };
  }
  
  if (background !== undefined) data.settings.background = background;
  if (iconSize !== undefined) data.settings.iconSize = iconSize;
  if (logoIcon !== undefined) data.settings.logoIcon = logoIcon;
  if (logoText !== undefined) data.settings.logoText = logoText;
  if (sidebarCollapsed !== undefined) data.settings.sidebarCollapsed = sidebarCollapsed;
  if (textColor !== undefined) data.settings.textColor = textColor;
  
  writeData(data);
  res.json(data.settings);
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

// 更新分类排序
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

// 更新网站排序
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

// 自动获取网站 favicon
app.get('/api/favicon', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL 不能为空' });
  }
  
  try {
    const urlObj = new URL(url);
    const faviconUrls = [
      `${urlObj.origin}/favicon.ico`,
      `${urlObj.origin}/favicon.png`,
      `${urlObj.origin}/apple-touch-icon.png`,
      `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`,
      `https://favicon.im/${urlObj.hostname}?larger=true`
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

// 启动服务器
app.listen(PORT, () => {
  console.log(`网址导航网站运行在 http://localhost:${PORT}`);
});
