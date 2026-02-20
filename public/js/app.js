// 网站数据
let sitesData = null;
let currentCategory = null;
let editingCategory = null;
let editingSiteIndex = null;
let currentIconSize = 'normal';
let sidebarCollapsed = false;

// 拖拽排序相关变量
let draggedItem = null;
let draggedType = null; // 'category' 或 'site'

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadSitesData();
  applySettings();
  renderNavMenu();
  updateTime();
  setInterval(updateTime, 1000); // 每秒更新时间
  
  // 默认选中第一个分类
  if (sitesData.categories.length > 0) {
    selectCategory(sitesData.categories[0].id);
  }

  // 绑定事件
  document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal());
  document.getElementById('addSiteBtn').addEventListener('click', () => openSiteModal());
  document.getElementById('saveCategoryBtn').addEventListener('click', saveCategory);
  document.getElementById('saveSiteBtn').addEventListener('click', saveSite);
  document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
  
  // 设置相关
  document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('previewBgBtn').addEventListener('click', previewBackground);
  document.getElementById('iconSizeBtn').addEventListener('click', toggleIconSize);
  document.getElementById('exportBtn').addEventListener('click', exportConfig);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importConfig);
  document.getElementById('backupBtn').addEventListener('click', createBackup);
  document.getElementById('restoreBtn').addEventListener('click', () => document.getElementById('restoreFile').click());
  document.getElementById('restoreFile').addEventListener('change', restoreBackup);
  
  // 侧边栏收起按钮
  document.getElementById('collapseBtn').addEventListener('click', toggleSidebar);
  
  // 点击弹窗背景关闭
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    });
  });
  
  // 初始化拖拽功能
  initDragAndDrop();
});

// 更新时间显示
function updateTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  document.getElementById('timeDisplay').textContent = `${hours}:${minutes}`;
  
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = weekdays[now.getDay()];
  
  document.getElementById('dateDisplay').textContent = `${month}月${date}日 ${weekday}`;
}

// 加载网站数据
async function loadSitesData() {
  try {
    const response = await fetch('/api/sites');
    sitesData = await response.json();
  } catch (error) {
    console.error('加载数据失败:', error);
    sitesData = { settings: { background: '', iconSize: 'normal', logoIcon: '🚀', logoText: 'iTab' }, categories: [] };
  }
}

// 应用设置
function applySettings() {
  const settings = sitesData.settings || { background: '', iconSize: 'normal', logoIcon: '🚀', logoText: 'iTab', textColor: '#ffffff' };
  
  // 应用背景
  const bgLayer = document.getElementById('bgLayer');
  if (settings.background) {
    bgLayer.classList.add('custom-bg');
    bgLayer.style.backgroundImage = `url(${settings.background})`;
    document.getElementById('backgroundUrl').value = settings.background;
  } else {
    bgLayer.classList.remove('custom-bg');
    bgLayer.style.backgroundImage = '';
  }
  
  // 应用Logo和标题
  const logoIcon = settings.logoIcon || '🚀';
  const logoText = settings.logoText || 'iTab';
  
  const logoIconEl = document.getElementById('logoIcon');
  if (logoIcon.startsWith('http')) {
    logoIconEl.innerHTML = `<img src="${logoIcon}" alt="Logo" onerror="this.parentElement.innerHTML='🚀'">`;
  } else {
    logoIconEl.textContent = logoIcon;
  }
  document.getElementById('logoText').textContent = logoText;
  
  // 更新网页标题
  document.title = logoText + ' - 网址导航';
  
  // 应用文字颜色
  const textColor = settings.textColor || '#ffffff';
  document.documentElement.style.setProperty('--text-color', textColor);
  
  // 应用图标大小
  currentIconSize = settings.iconSize || 'normal';
  updateIconSizeUI();
  
  // 应用侧边栏状态
  sidebarCollapsed = settings.sidebarCollapsed || false;
  updateSidebarUI();
}

// 切换侧边栏
async function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  updateSidebarUI();
  
  // 保存状态
  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sidebarCollapsed })
    });
  } catch (error) {
    console.error('保存设置失败:', error);
  }
}

// 更新侧边栏UI
function updateSidebarUI() {
  const sidebar = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('collapseBtn');
  
  if (sidebarCollapsed) {
    sidebar.classList.add('collapsed');
    collapseBtn.textContent = '▶';
  } else {
    sidebar.classList.remove('collapsed');
    collapseBtn.textContent = '◀';
  }
}

// 更新图标大小UI
function updateIconSizeUI() {
  const btn = document.getElementById('iconSizeBtn');
  const grids = document.querySelectorAll('.sites-grid');
  
  if (currentIconSize === 'small') {
    btn.classList.add('active');
    btn.textContent = '🔳';
    grids.forEach(grid => grid.classList.add('small-mode'));
  } else {
    btn.classList.remove('active');
    btn.textContent = '🔲';
    grids.forEach(grid => grid.classList.remove('small-mode'));
  }
  
  // 更新设置弹窗中的单选框
  const radioBtn = document.querySelector(`input[name="iconSize"][value="${currentIconSize}"]`);
  if (radioBtn) radioBtn.checked = true;
}

// 切换图标大小
async function toggleIconSize() {
  currentIconSize = currentIconSize === 'normal' ? 'small' : 'normal';
  updateIconSizeUI();
  
  // 保存设置
  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iconSize: currentIconSize })
    });
  } catch (error) {
    console.error('保存设置失败:', error);
  }
}

// 预览背景
function previewBackground() {
  const url = document.getElementById('backgroundUrl').value.trim();
  const bgLayer = document.getElementById('bgLayer');
  if (url) {
    bgLayer.classList.add('custom-bg');
    bgLayer.style.backgroundImage = `url(${url})`;
  }
}

// 渲染导航菜单
function renderNavMenu() {
  const navMenu = document.getElementById('navMenu');
  navMenu.innerHTML = '';
  
  sitesData.categories.forEach(category => {
    const navItem = document.createElement('div');
    navItem.className = 'nav-item' + (currentCategory === category.id ? ' active' : '');
    navItem.dataset.categoryId = category.id;
    navItem.innerHTML = `
      <div class="nav-item-left">
        <span class="nav-icon">${getIconHtml(category.icon)}</span>
        <span class="nav-text">${category.name}</span>
      </div>
      <div class="nav-item-actions">
        <button class="nav-action-btn" onclick="event.stopPropagation(); openCategoryModal('${category.id}')" title="编辑">✏️</button>
        <button class="nav-action-btn delete" onclick="event.stopPropagation(); deleteCategory('${category.id}')" title="删除">🗑️</button>
      </div>
    `;
    navItem.addEventListener('click', () => selectCategory(category.id));
    
    // 添加拖拽功能
    initCategoryDrag(navItem);
    
    navMenu.appendChild(navItem);
  });
}

// 获取图标HTML
function getIconHtml(icon) {
  if (!icon) return '🌐';
  if (icon.startsWith('http')) {
    return `<img src="${icon}" alt="" onerror="this.parentElement.innerHTML='🌐'">`;
  }
  return icon;
}

// 选择分类
function selectCategory(categoryId) {
  currentCategory = categoryId;
  
  // 更新导航激活状态
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.categoryId === categoryId);
  });
  
  // 渲染网站卡片
  renderSites(categoryId);
}

// 渲染网站卡片
function renderSites(categoryId) {
  const contentArea = document.getElementById('contentArea');
  const category = sitesData.categories.find(c => c.id === categoryId);
  
  if (!category || category.sites.length === 0) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <span class="icon">📭</span>
        <span class="text">暂无网站，点击上方"添加网站"按钮</span>
      </div>
    `;
    updateIconSizeUI();
    return;
  }
  
  contentArea.innerHTML = `
    <div class="sites-grid ${currentIconSize === 'small' ? 'small-mode' : ''}">
      ${category.sites.map((site, index) => createSiteCard(site, categoryId, index)).join('')}
    </div>
  `;
  
  // 初始化网站卡片拖拽
  document.querySelectorAll('.site-card').forEach(card => {
    initSiteDrag(card);
  });
}

// 创建网站卡片HTML
function createSiteCard(site, categoryId, index) {
  const iconHtml = getIconHtml(site.icon);
  
  return `
    <div class="site-card" onclick="window.open('${site.url}', '_blank')" data-site-index="${index}" data-category-id="${categoryId}">
      <div class="site-card-actions">
        <button class="card-action-btn" onclick="event.stopPropagation(); openSiteModal('${categoryId}', ${index})" title="编辑">✏️</button>
        <button class="card-action-btn delete" onclick="event.stopPropagation(); deleteSite('${categoryId}', ${index})" title="删除">🗑️</button>
      </div>
      <div class="site-icon">${iconHtml}</div>
      <div class="site-name">${site.name}</div>
      <div class="site-desc">${site.description}</div>
    </div>
  `;
}

// 搜索功能
document.getElementById('searchInput')?.addEventListener('input', (e) => {
  const keyword = e.target.value.toLowerCase().trim();
  
  if (!keyword) {
    if (currentCategory) {
      renderSites(currentCategory);
    }
    return;
  }
  
  const results = [];
  sitesData.categories.forEach(category => {
    category.sites.forEach(site => {
      if (site.name.toLowerCase().includes(keyword) || 
          site.description.toLowerCase().includes(keyword) ||
          site.url.toLowerCase().includes(keyword)) {
        results.push({ ...site, categoryName: category.name, categoryIcon: category.icon });
      }
    });
  });
  
  renderSearchResults(results, keyword);
});

// 渲染搜索结果
function renderSearchResults(results, keyword) {
  const contentArea = document.getElementById('contentArea');
  
  if (results.length === 0) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <span class="icon">🔍</span>
        <span class="text">未找到 "${keyword}" 相关网站</span>
      </div>
    `;
    return;
  }
  
  contentArea.innerHTML = `
    <h2 class="category-title">
      <span class="icon">🔍</span>
      搜索结果 (${results.length})
    </h2>
    <div class="sites-grid ${currentIconSize === 'small' ? 'small-mode' : ''}">
      ${results.map(site => `
        <div class="site-card" onclick="window.open('${site.url}', '_blank')">
          <div class="site-icon">${getIconHtml(site.icon)}</div>
          <div class="site-name">${site.name}</div>
          <div class="site-desc">${site.description}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ========== 设置管理 ==========

function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const settings = sitesData.settings || { background: '', iconSize: 'normal', logoIcon: '🚀', logoText: 'iTab', textColor: '#ffffff' };
  
  document.getElementById('backgroundUrl').value = settings.background || '';
  document.getElementById('logoIconInput').value = settings.logoIcon || '🚀';
  document.getElementById('logoTextInput').value = settings.logoText || 'iTab';
  document.querySelector(`input[name="iconSize"][value="${settings.iconSize || 'normal'}"]`).checked = true;
  
  // 初始化文字颜色
  const textColorPicker = document.getElementById('textColorPicker');
  textColorPicker.value = settings.textColor || '#ffffff';
  
  // 更新预设按钮状态
  updateColorPresetButtons(settings.textColor || '#ffffff');
  
  // 绑定颜色选择器事件
  textColorPicker.removeEventListener('input', handleColorPickerChange);
  textColorPicker.addEventListener('input', handleColorPickerChange);
  
  // 绑定预设颜色按钮事件
  document.querySelectorAll('.color-preset-btn').forEach(btn => {
    btn.removeEventListener('click', handleColorPresetClick);
    btn.addEventListener('click', handleColorPresetClick);
  });
  
  modal.classList.add('show');
}

// 颜色选择器变化处理
function handleColorPickerChange(e) {
  updateColorPresetButtons(e.target.value);
}

// 预设颜色按钮点击处理
function handleColorPresetClick(e) {
  const color = e.target.dataset.color;
  document.getElementById('textColorPicker').value = color;
  updateColorPresetButtons(color);
}

// 更新预设颜色按钮状态
function updateColorPresetButtons(activeColor) {
  document.querySelectorAll('.color-preset-btn').forEach(btn => {
    if (btn.dataset.color === activeColor) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('show');
}

async function saveSettings() {
  const background = document.getElementById('backgroundUrl').value.trim();
  const iconSize = document.querySelector('input[name="iconSize"]:checked').value;
  const logoIcon = document.getElementById('logoIconInput').value.trim() || '🚀';
  const logoText = document.getElementById('logoTextInput').value.trim() || 'iTab';
  const textColor = document.getElementById('textColorPicker').value || '#ffffff';
  
  try {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ background, iconSize, logoIcon, logoText, textColor })
    });
    
    if (!response.ok) throw new Error('保存失败');
    
    await loadSitesData();
    applySettings();
    closeSettingsModal();
  } catch (error) {
    alert('保存设置失败: ' + error.message);
  }
}

// 导出配置
function exportConfig() {
  const dataStr = JSON.stringify(sitesData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `itab-config-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 导入配置
async function importConfig(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const importData = JSON.parse(text);
    
    if (!importData.categories || !Array.isArray(importData.categories)) {
      throw new Error('无效的配置文件格式');
    }
    
    const response = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: text
    });
    
    if (!response.ok) throw new Error('导入失败');
    
    await loadSitesData();
    applySettings();
    renderNavMenu();
    
    if (sitesData.categories.length > 0) {
      selectCategory(sitesData.categories[0].id);
    }
    
    alert('导入成功！');
    closeSettingsModal();
  } catch (error) {
    alert('导入失败: ' + error.message);
  }
  
  e.target.value = '';
}

// ========== 数据备份与恢复 ==========

// 创建备份
async function createBackup() {
  try {
    const response = await fetch('/api/backup');
    const data = await response.json();
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `itab-backup-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('备份创建成功！');
  } catch (error) {
    alert('备份失败: ' + error.message);
  }
}

// 恢复备份
async function restoreBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!confirm('恢复备份将覆盖当前所有数据，是否继续？')) {
    e.target.value = '';
    return;
  }
  
  try {
    const text = await file.text();
    const backupData = JSON.parse(text);
    
    const response = await fetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: text
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '恢复失败');
    }
    
    const result = await response.json();
    
    await loadSitesData();
    applySettings();
    renderNavMenu();
    
    if (sitesData.categories.length > 0) {
      selectCategory(sitesData.categories[0].id);
    }
    
    alert('恢复成功！');
    closeSettingsModal();
  } catch (error) {
    alert('恢复失败: ' + error.message);
  }
  
  e.target.value = '';
}

// ========== 分类管理 ==========

function openCategoryModal(categoryId = null) {
  editingCategory = categoryId;
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('categoryModalTitle');
  
  if (categoryId) {
    const category = sitesData.categories.find(c => c.id === categoryId);
    title.textContent = '编辑分类';
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryIcon').value = category.icon;
  } else {
    title.textContent = '添加分类';
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryIcon').value = '📁';
  }
  
  modal.classList.add('show');
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('show');
  editingCategory = null;
}

async function saveCategory() {
  const name = document.getElementById('categoryName').value.trim();
  const icon = document.getElementById('categoryIcon').value.trim() || '📁';
  
  if (!name) {
    alert('请输入分类名称');
    return;
  }
  
  try {
    let response;
    if (editingCategory) {
      response = await fetch(`/api/categories/${editingCategory}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon })
      });
    } else {
      response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon })
      });
    }
    
    if (!response.ok) throw new Error('保存失败');
    
    await loadSitesData();
    renderNavMenu();
    if (!editingCategory && sitesData.categories.length > 0) {
      selectCategory(sitesData.categories[sitesData.categories.length - 1].id);
    } else if (editingCategory) {
      selectCategory(editingCategory);
    }
    closeCategoryModal();
  } catch (error) {
    alert('保存失败: ' + error.message);
  }
}

let deleteTarget = null;

function deleteCategory(categoryId) {
  const category = sitesData.categories.find(c => c.id === categoryId);
  document.getElementById('deleteMessage').textContent = `确定要删除分类"${category.name}"吗？该分类下的所有网站也将被删除。`;
  deleteTarget = { type: 'category', id: categoryId };
  document.getElementById('deleteModal').classList.add('show');
}

// ========== 网站管理 ==========

function openSiteModal(categoryId = null, siteIndex = null) {
  const modal = document.getElementById('siteModal');
  const title = document.getElementById('siteModalTitle');
  
  editingSiteIndex = siteIndex;
  
  // 确定目标分类
  const targetCategoryId = categoryId || currentCategory;
  if (!targetCategoryId) {
    alert('请先选择一个分类');
    return;
  }
  
  modal.dataset.categoryId = targetCategoryId;
  
  if (siteIndex !== null) {
    const category = sitesData.categories.find(c => c.id === targetCategoryId);
    const site = category.sites[siteIndex];
    title.textContent = '编辑网站';
    document.getElementById('siteName').value = site.name;
    document.getElementById('siteUrl').value = site.url;
    document.getElementById('siteIcon').value = site.icon;
    document.getElementById('siteDesc').value = site.description;
  } else {
    title.textContent = '添加网站';
    document.getElementById('siteName').value = '';
    document.getElementById('siteUrl').value = '';
    document.getElementById('siteIcon').value = '🌐';
    document.getElementById('siteDesc').value = '';
  }
  
  modal.classList.add('show');
}

function closeSiteModal() {
  document.getElementById('siteModal').classList.remove('show');
  editingSiteIndex = null;
}

async function saveSite() {
  const categoryId = document.getElementById('siteModal').dataset.categoryId;
  const name = document.getElementById('siteName').value.trim();
  const url = document.getElementById('siteUrl').value.trim();
  const icon = document.getElementById('siteIcon').value.trim() || '🌐';
  const description = document.getElementById('siteDesc').value.trim();
  
  if (!name || !url) {
    alert('请输入网站名称和地址');
    return;
  }
  
  try {
    let response;
    if (editingSiteIndex !== null) {
      response = await fetch(`/api/categories/${categoryId}/sites/${editingSiteIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, icon, description })
      });
    } else {
      response = await fetch(`/api/categories/${categoryId}/sites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, icon, description })
      });
    }
    
    if (!response.ok) throw new Error('保存失败');
    
    await loadSitesData();
    renderNavMenu();
    selectCategory(categoryId);
    closeSiteModal();
  } catch (error) {
    alert('保存失败: ' + error.message);
  }
}

function deleteSite(categoryId, siteIndex) {
  const category = sitesData.categories.find(c => c.id === categoryId);
  const site = category.sites[siteIndex];
  document.getElementById('deleteMessage').textContent = `确定要删除网站"${site.name}"吗？`;
  deleteTarget = { type: 'site', categoryId, siteIndex };
  document.getElementById('deleteModal').classList.add('show');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('show');
  deleteTarget = null;
}

async function confirmDelete() {
  if (!deleteTarget) return;
  
  try {
    let response;
    if (deleteTarget.type === 'category') {
      response = await fetch(`/api/categories/${deleteTarget.id}`, { method: 'DELETE' });
    } else {
      response = await fetch(`/api/categories/${deleteTarget.categoryId}/sites/${deleteTarget.siteIndex}`, { method: 'DELETE' });
    }
    
    if (!response.ok) throw new Error('删除失败');
    
    await loadSitesData();
    renderNavMenu();
    
    if (deleteTarget.type === 'category') {
      if (sitesData.categories.length > 0) {
        selectCategory(sitesData.categories[0].id);
      } else {
        currentCategory = null;
        document.getElementById('contentArea').innerHTML = `
          <div class="empty-state">
            <span class="icon">📭</span>
            <span class="text">暂无分类，请添加分类</span>
          </div>
        `;
      }
    } else {
      selectCategory(deleteTarget.categoryId);
    }
    
    closeDeleteModal();
  } catch (error) {
    alert('删除失败: ' + error.message);
  }
}

// ========== 拖拽排序功能 ==========

function initDragAndDrop() {
  // 分类拖拽在 renderNavMenu 中处理
  // 网站卡片拖拽在 renderSites 中处理
}

// 分类拖拽排序
function initCategoryDrag(item) {
  item.draggable = true;
  
  item.addEventListener('dragstart', (e) => {
    draggedItem = item;
    draggedType = 'category';
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    draggedItem = null;
    draggedType = null;
    
    // 清除所有拖拽状态
    document.querySelectorAll('.nav-item').forEach(i => {
      i.classList.remove('drag-over');
    });
  });
  
  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedType === 'category' && draggedItem !== item) {
      item.classList.add('drag-over');
    }
  });
  
  item.addEventListener('dragleave', () => {
    item.classList.remove('drag-over');
  });
  
  item.addEventListener('drop', async (e) => {
    e.preventDefault();
    item.classList.remove('drag-over');
    
    if (draggedType !== 'category' || draggedItem === item) return;
    
    // 在 DOM 中移动元素
    const navMenu = item.parentElement;
    const allItems = Array.from(navMenu.querySelectorAll('.nav-item'));
    const draggedIndex = allItems.indexOf(draggedItem);
    const targetIndex = allItems.indexOf(item);
    
    if (draggedIndex < targetIndex) {
      item.after(draggedItem);
    } else {
      item.before(draggedItem);
    }
    
    // 获取新的排序
    const navItems = Array.from(document.querySelectorAll('.nav-item'));
    const categoryIds = navItems.map(i => i.dataset.categoryId);
    
    // 保存排序
    try {
      const response = await fetch('/api/categories/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryIds })
      });
      
      if (response.ok) {
        await loadSitesData();
        // 保持当前选中状态
        renderNavMenu();
        if (currentCategory) {
          selectCategory(currentCategory);
        }
      }
    } catch (error) {
      console.error('排序保存失败:', error);
      // 恢复原顺序
      renderNavMenu();
    }
  });
}

// 网站卡片拖拽排序
function initSiteDrag(card) {
  card.draggable = true;
  
  card.addEventListener('dragstart', (e) => {
    draggedItem = card;
    draggedType = 'site';
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  });
  
  card.addEventListener('dragend', (e) => {
    card.classList.remove('dragging');
    draggedItem = null;
    draggedType = null;
    
    document.querySelectorAll('.site-card').forEach(c => {
      c.classList.remove('drag-over');
    });
    e.stopPropagation();
  });
  
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedType === 'site' && draggedItem !== card) {
      card.classList.add('drag-over');
    }
    e.stopPropagation();
  });
  
  card.addEventListener('dragleave', (e) => {
    card.classList.remove('drag-over');
    e.stopPropagation();
  });
  
  card.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove('drag-over');
    
    if (draggedType !== 'site' || draggedItem === card) return;
    
    const grid = card.parentElement;
    const cards = Array.from(grid.querySelectorAll('.site-card'));
    const draggedIndex = cards.indexOf(draggedItem);
    const targetIndex = cards.indexOf(card);
    
    // 在 DOM 中移动元素
    if (draggedIndex < targetIndex) {
      card.after(draggedItem);
    } else {
      card.before(draggedItem);
    }
    
    // 获取新的排序 - 使用网站名称和URL作为标识
    const newCards = Array.from(grid.querySelectorAll('.site-card'));
    const categoryId = card.dataset.categoryId;
    const category = sitesData.categories.find(c => c.id === categoryId);
    
    if (!category) return;
    
    // 根据 DOM 顺序重建网站数组
    const reorderedSites = [];
    newCards.forEach(c => {
      const siteName = c.querySelector('.site-name')?.textContent;
      const site = category.sites.find(s => s.name === siteName);
      if (site) reorderedSites.push(site);
    });
    
    // 保存排序
    try {
      const response = await fetch(`/api/categories/${categoryId}/sites/reorder-full`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sites: reorderedSites })
      });
      
      if (response.ok) {
        await loadSitesData();
        selectCategory(categoryId);
      }
    } catch (error) {
      console.error('排序保存失败:', error);
      selectCategory(categoryId);
    }
  });
}

// ========== Favicon 自动获取功能 ==========

async function fetchFavicon(url) {
  try {
    const response = await fetch(`/api/favicon?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    
    if (data.favicons && data.favicons.length > 0) {
      // 返回 Google favicon 服务作为首选（最可靠）
      return data.favicons[3] || data.favicons[4] || data.favicons[0];
    }
  } catch (error) {
    console.error('获取 favicon 失败:', error);
  }
  return null;
}

// 自动填充 favicon
document.getElementById('siteUrl')?.addEventListener('blur', async function() {
  const url = this.value.trim();
  const iconInput = document.getElementById('siteIcon');
  
  // 如果已经有图标，不自动填充
  if (iconInput.value.trim() && iconInput.value.trim() !== '🌐') {
    return;
  }
  
  if (url) {
    const favicon = await fetchFavicon(url);
    if (favicon) {
      iconInput.value = favicon;
    }
  }
});