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

// 右键菜单相关
let contextMenuTarget = null; // { categoryId, siteIndex }

// WebDAV备份定时器
let backupTimer = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadSitesData();
  applySettings();
  initSearchEngine();
  renderNavMenu();
  updateTime();
  setInterval(updateTime, 1000); // 每秒更新时间
  
  // 恢复上次打开的分类
  const lastCategory = sitesData.settings?.lastCategory;
  if (lastCategory && sitesData.categories.find(c => c.id === lastCategory)) {
    selectCategory(lastCategory);
  } else if (sitesData.categories.length > 0) {
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
  
  // WebDAV备份相关
  document.getElementById('webdavSettingsBtn').addEventListener('click', openWebdavModal);
  document.getElementById('saveWebdavBtn').addEventListener('click', saveWebdavSettings);
  document.getElementById('menuEditSite').addEventListener('click', () => handleContextMenuAction('edit'));
  document.getElementById('menuMoveCategory').addEventListener('click', () => handleContextMenuAction('move'));
  document.getElementById('menuDeleteSite').addEventListener('click', () => handleContextMenuAction('delete'));
  document.getElementById('confirmMoveBtn').addEventListener('click', confirmMoveSite);
  
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
  
  // 点击其他地方隐藏右键菜单
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.site-card')) {
      hideContextMenu();
    }
  });
  
  // 初始化拖拽功能
  initDragAndDrop();
  
  // 初始化WebDAV定时备份
  initWebdavBackup();
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
  const settings = sitesData.settings || { background: '', bgColor: '#667eea', iconSize: 'normal', logoIcon: '🚀', logoText: 'iTab', textColor: '#ffffff' };
  
  // 应用背景
  const bgLayer = document.getElementById('bgLayer');
  const bgColor = settings.bgColor || '#667eea';
  
  if (settings.background) {
    bgLayer.classList.add('custom-bg');
    bgLayer.style.backgroundImage = `url(${settings.background})`;
    bgLayer.style.background = `url(${settings.background}) center/cover fixed`;
    document.getElementById('backgroundUrl').value = settings.background;
  } else {
    bgLayer.classList.remove('custom-bg');
    bgLayer.style.backgroundImage = '';
    bgLayer.style.background = `linear-gradient(135deg, ${bgColor} 0%, ${adjustColor(bgColor, -20)} 100%)`;
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
    // XSS 防护 - 转义分类名称
    const safeName = escapeHtml(category.name);
    navItem.innerHTML = `
      <div class="nav-item-left">
        <span class="nav-icon">${getIconHtml(category.icon)}</span>
        <span class="nav-text">${safeName}</span>
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

// 获取图标HTML（支持文本标签）
function getIconHtml(icon, labelText, labelBgColor) {
  // 优先显示文本标签
  if (labelText && labelText.trim()) {
    const bg = labelBgColor || '#667eea';
    return `<span class="site-text-label" style="background:${escapeHtml(bg)};">${escapeHtml(labelText.trim())}</span>`;
  }
  if (!icon) return '🌐';
  if (icon.startsWith('http')) {
    return `<img src="${icon}" alt="" onerror="this.parentElement.innerHTML='🌐'">`;
  }
  return icon;
}

// XSS 防护 - HTML 转义函数
function escapeHtml(text) {
  if (typeof text !== 'string') return text || '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
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
  
  // 保存当前分类到设置
  saveCurrentCategory(categoryId);
}

// 保存当前分类
async function saveCurrentCategory(categoryId) {
  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastCategory: categoryId })
    });
  } catch (error) {
    console.error('保存当前分类失败:', error);
  }
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
  
  // 初始化网站卡片拖拽和右键菜单
  document.querySelectorAll('.site-card').forEach(card => {
    initSiteDrag(card);
    initSiteContextMenu(card);
  });
}

// 创建网站卡片HTML
function createSiteCard(site, categoryId, index) {
  const iconHtml = getIconHtml(site.icon, site.labelText, site.labelBgColor);
  // XSS 防护 - 转义用户输入
  const safeName = escapeHtml(site.name);
  const safeDesc = escapeHtml(site.description);
  const safeUrl = encodeURI(site.url); // URL 编码防止注入
  
  return `
    <div class="site-card" onclick="window.open('${safeUrl}', '_blank')" data-site-index="${index}" data-category-id="${categoryId}">
      <div class="site-icon">${iconHtml}</div>
      <div class="site-name">${safeName}</div>
      <div class="site-desc">${safeDesc}</div>
    </div>
  `;
}


// 搜索引擎配置
const SEARCH_ENGINES = {
  baidu: 'https://www.baidu.com/s?wd=',
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q='
};

const SEARCH_ENGINE_PLACEHOLDERS = {
  baidu: '百度搜索...',
  google: 'Google 搜索...',
  bing: 'Bing 搜索...'
};

const SITE_SEARCH_PLACEHOLDER = '搜索收藏的网站... (Ctrl+F)';

let currentSearchEngine = 'baidu';
let isSiteSearchMode = false; // 站内搜索模式

// 初始化搜索引擎（从存储中恢复）
async function initSearchEngine() {
  const savedEngine = sitesData.settings?.searchEngine || 'baidu';
  currentSearchEngine = savedEngine;
  
  const select = document.getElementById('searchEngineSelect');
  const searchInput = document.getElementById('searchInput');
  
  if (select) {
    // 更新自定义下拉组件显示
    const selectedDiv = select.querySelector('.select-selected');
    const options = select.querySelectorAll('.select-option');
    
    if (selectedDiv) {
      selectedDiv.dataset.value = savedEngine;
      selectedDiv.textContent = savedEngine === 'google' ? '谷歌' : (savedEngine === 'bing' ? 'Bing' : '百度');
    }
    
    options.forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === savedEngine);
    });
  }
  if (searchInput) {
    searchInput.placeholder = SEARCH_ENGINE_PLACEHOLDERS[savedEngine];
  }
}

// 切换到站内搜索模式
function enterSiteSearchMode() {
  isSiteSearchMode = true;
  const searchInput = document.getElementById('searchInput');
  const customSelect = document.getElementById('searchEngineSelect');
  
  if (searchInput) {
    searchInput.placeholder = SITE_SEARCH_PLACEHOLDER;
    searchInput.focus();
  }
  
  // 隐藏搜索引擎选择器
  if (customSelect) {
    customSelect.style.display = 'none';
  }
}

// 退出站内搜索模式
function exitSiteSearchMode() {
  isSiteSearchMode = false;
  const searchInput = document.getElementById('searchInput');
  const customSelect = document.getElementById('searchEngineSelect');
  
  if (searchInput) {
    searchInput.placeholder = SEARCH_ENGINE_PLACEHOLDERS[currentSearchEngine];
  }
  
  // 显示搜索引擎选择器
  if (customSelect) {
    customSelect.style.display = '';
  }
}

// 站内搜索功能
function searchSites(keyword) {
  if (!sitesData || !sitesData.categories) {
    console.warn('网站数据未加载');
    return;
  }
  
  if (!keyword) {
    if (currentCategory) {
      renderSites(currentCategory);
    }
    return;
  }
  
  const results = [];
  sitesData.categories.forEach(category => {
    category.sites.forEach((site, siteIndex) => {
      if (site.name.toLowerCase().includes(keyword) || 
          site.description.toLowerCase().includes(keyword) ||
          site.url.toLowerCase().includes(keyword)) {
        results.push({ 
          ...site, 
          categoryId: category.id,
          siteIndex: siteIndex,
          categoryName: category.name, 
          categoryIcon: category.icon 
        });
      }
    });
  });
  
  renderSearchResults(results, keyword);
}

// 渲染搜索结果
function renderSearchResults(results, keyword) {
  const contentArea = document.getElementById('contentArea');
  const safeKeyword = escapeHtml(keyword);
  
  if (results.length === 0) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <span class="icon">🔍</span>
        <span class="text">未找到 "${safeKeyword}" 相关网站</span>
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
      ${results.map((site, idx) => `
        <div class="site-card search-result" data-url="${escapeHtml(site.url)}" data-category-id="${escapeHtml(site.categoryId)}" data-site-index="${site.siteIndex}">
          <div class="site-icon">${getIconHtml(site.icon, site.labelText, site.labelBgColor)}</div>
          <div class="site-name">${escapeHtml(site.name)}</div>
          <div class="site-desc">${escapeHtml(site.description)}</div>
        </div>
      `).join('')}
    </div>
  `;
  
  // 绑定搜索结果点击事件和右键菜单
  document.querySelectorAll('.site-card.search-result').forEach(card => {
    card.addEventListener('click', () => {
      const url = card.dataset.url;
      if (url) {
        window.open(url, '_blank');
      }
    });
    
    initSiteContextMenu(card);
  });
}

// 快捷键监听
document.addEventListener('keydown', (e) => {
  // Ctrl+F (Windows) 或 Cmd+F (macOS)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    enterSiteSearchMode();
  }
  
  // ESC 退出站内搜索模式
  if (e.key === 'Escape' && isSiteSearchMode) {
    exitSiteSearchMode();
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.value = '';
    }
    if (currentCategory) {
      renderSites(currentCategory);
    }
  }
});

// 自定义下拉组件交互
document.addEventListener('DOMContentLoaded', () => {
  const customSelect = document.getElementById('searchEngineSelect');
  
  if (customSelect) {
    const selectedDiv = customSelect.querySelector('.select-selected');
    const options = customSelect.querySelectorAll('.select-option');
    
    // 点击展开/收起下拉菜单
    selectedDiv?.addEventListener('click', (e) => {
      e.stopPropagation();
      customSelect.classList.toggle('open');
    });
    
    // 点击选项
    options.forEach(option => {
      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        const value = option.dataset.value;
        currentSearchEngine = value;
        
        // 更新显示
        selectedDiv.dataset.value = value;
        selectedDiv.textContent = option.textContent;
        
        // 更新选中状态
        options.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        
        // 关闭下拉菜单
        customSelect.classList.remove('open');
        
        // 更新 placeholder
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
          searchInput.placeholder = SEARCH_ENGINE_PLACEHOLDERS[value];
          searchInput.focus();
        }
        
        
        // 保存到设置
        try {
          await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchEngine: value })
          });
        } catch (error) {
          console.error('保存搜索引擎设置失败:', error);
        }
      });
    });
  }
  
  // 点击其他地方关闭下拉菜单
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select.open').forEach(el => {
      el.classList.remove('open');
    });
  });
});

// 搜索功能
document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const keyword = e.target.value.trim();
    if (keyword) {
      if (isSiteSearchMode) {
        // 站内搜索模式：搜索收藏的网站
        searchSites(keyword.toLowerCase());
      } else {
        // 网络搜索模式：使用搜索引擎
        const searchUrl = SEARCH_ENGINES[currentSearchEngine] + encodeURIComponent(keyword);
        window.open(searchUrl, '_blank');
      }
    }
  }
});

// 输入时实时站内搜索
document.getElementById('searchInput')?.addEventListener('input', (e) => {
  if (isSiteSearchMode) {
    const keyword = e.target.value.toLowerCase().trim();
    searchSites(keyword);
  }
});

// 搜索按钮点击
document.querySelector('.search-btn')?.addEventListener('click', () => {
  const keyword = document.getElementById('searchInput')?.value.trim();
  if (keyword) {
    if (isSiteSearchMode) {
      searchSites(keyword.toLowerCase());
    } else {
      const searchUrl = SEARCH_ENGINES[currentSearchEngine] + encodeURIComponent(keyword);
      window.open(searchUrl, '_blank');
    }
  }
});

// ========== 设置管理 ==========

function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const settings = sitesData.settings || { background: '', bgColor: '#667eea', iconSize: 'normal', logoIcon: '🚀', logoText: 'iTab', textColor: '#ffffff' };
  
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
  
  // 绑定预设颜色按钮事件（文字颜色）
  document.querySelectorAll('.color-preset-btn:not(.bg-color-preset)').forEach(btn => {
    btn.removeEventListener('click', handleColorPresetClick);
    btn.addEventListener('click', handleColorPresetClick);
  });
  
  // 初始化背景颜色选择器
  const bgColorPicker = document.getElementById('bgColorPicker');
  bgColorPicker.value = settings.bgColor || '#667eea';
  updateBgColorPresetButtons(settings.bgColor || '#667eea');
  
  bgColorPicker.removeEventListener('input', handleBgColorPickerChange);
  bgColorPicker.addEventListener('input', handleBgColorPickerChange);
  
  // 绑定背景颜色预设按钮事件
  document.querySelectorAll('.bg-color-preset').forEach(btn => {
    btn.removeEventListener('click', handleBgColorPresetClick);
    btn.addEventListener('click', handleBgColorPresetClick);
  });
  
  modal.classList.add('show');
}

// 调整颜色亮度
function adjustColor(color, amount) {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;
  
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

// 背景颜色选择器变化处理
function handleBgColorPickerChange(e) {
  updateBgColorPresetButtons(e.target.value);
}

// 背景颜色预设按钮点击处理
function handleBgColorPresetClick(e) {
  const color = e.target.dataset.color;
  document.getElementById('bgColorPicker').value = color;
  updateBgColorPresetButtons(color);
  // 预览背景颜色
  const bgLayer = document.getElementById('bgLayer');
  bgLayer.style.background = `linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -20)} 100%)`;
}

// 更新背景颜色预设按钮状态
function updateBgColorPresetButtons(activeColor) {
  document.querySelectorAll('.bg-color-preset').forEach(btn => {
    if (btn.dataset.color === activeColor) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
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
  document.querySelectorAll('.color-preset-btn:not(.bg-color-preset)').forEach(btn => {
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
  const bgColor = document.getElementById('bgColorPicker').value || '#667eea';
  const iconSize = document.querySelector('input[name="iconSize"]:checked').value;
  const logoIcon = document.getElementById('logoIconInput').value.trim() || '🚀';
  const logoText = document.getElementById('logoTextInput').value.trim() || 'iTab';
  const textColor = document.getElementById('textColorPicker').value || '#ffffff';
  
  try {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ background, bgColor, iconSize, logoIcon, logoText, textColor })
    });
    
    if (!response.ok) throw new Error('保存失败');
    
    await loadSitesData();
    applySettings();
  initSearchEngine();
    closeSettingsModal();
  } catch (error) {
    alert('保存设置失败: ' + error.message);
  }
}

// 导出配置
function exportConfig() {
  // 深拷贝并排除敏感信息
  const exportData = JSON.parse(JSON.stringify(sitesData));
  if (exportData.settings?.webdav) {
    delete exportData.settings.webdav;
  }
  
  const dataStr = JSON.stringify(exportData, null, 2);
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
  initSearchEngine();
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
    document.getElementById('siteLabelText').value = site.labelText || '';
    document.getElementById('siteLabelBgColor').value = site.labelBgColor || '#667eea';
  } else {
    title.textContent = '添加网站';
    document.getElementById('siteName').value = '';
    document.getElementById('siteUrl').value = '';
    document.getElementById('siteIcon').value = '🌐';
    document.getElementById('siteDesc').value = '';
    document.getElementById('siteLabelText').value = '';
    document.getElementById('siteLabelBgColor').value = '#667eea';
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
  const labelText = document.getElementById('siteLabelText').value.trim();
  const labelBgColor = document.getElementById('siteLabelBgColor').value || '#667eea';
  
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
        body: JSON.stringify({ name, url, icon, description, labelText, labelBgColor })
      });
    } else {
      response = await fetch(`/api/categories/${categoryId}/sites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, icon, description, labelText, labelBgColor })
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

// ========== 右键菜单功能 ==========

// 初始化网站卡片右键菜单
function initSiteContextMenu(card) {
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const categoryId = card.dataset.categoryId;
    const siteIndex = parseInt(card.dataset.siteIndex);
    
    contextMenuTarget = { categoryId, siteIndex };
    
    const menu = document.getElementById('contextMenu');
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.classList.add('show');
  });
}

// 隐藏右键菜单
function hideContextMenu() {
  document.getElementById('contextMenu').classList.remove('show');
}

// 处理右键菜单操作
function handleContextMenuAction(action) {
  if (!contextMenuTarget) return;
  
  const { categoryId, siteIndex } = contextMenuTarget;
  hideContextMenu();
  
  switch (action) {
    case 'edit':
      openSiteModal(categoryId, siteIndex);
      break;
    case 'move':
      openMoveCategoryModal(categoryId, siteIndex);
      break;
    case 'delete':
      deleteSite(categoryId, siteIndex);
      break;
  }
}

// ========== 移动网站到其他分类 ==========

// 打开移动分类弹窗
function openMoveCategoryModal(categoryId, siteIndex) {
  const modal = document.getElementById('moveCategoryModal');
  const select = document.getElementById('targetCategorySelect');
  
  // 填充分类选项
  select.innerHTML = sitesData.categories
    .filter(c => c.id !== categoryId)
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join('');
  
  if (select.options.length === 0) {
    alert('没有其他分类可移动');
    return;
  }
  
  contextMenuTarget = { categoryId, siteIndex };
  modal.classList.add('show');
}

function closeMoveCategoryModal() {
  document.getElementById('moveCategoryModal').classList.remove('show');
}

// 确认移动网站
async function confirmMoveSite() {
  if (!contextMenuTarget) return;
  
  const { categoryId, siteIndex } = contextMenuTarget;
  const targetCategoryId = document.getElementById('targetCategorySelect').value;
  
  if (!targetCategoryId) {
    alert('请选择目标分类');
    return;
  }
  
  try {
    const response = await fetch(`/api/categories/${categoryId}/sites/${siteIndex}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetCategoryId })
    });
    
    if (!response.ok) throw new Error('移动失败');
    
    await loadSitesData();
    renderNavMenu();
    selectCategory(categoryId);
    closeMoveCategoryModal();
  } catch (error) {
    alert('移动失败: ' + error.message);
  }
}

// ========== WebDAV 备份功能 ==========

// 初始化 WebDAV 定时备份
function initWebdavBackup() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
  
  const webdav = sitesData.settings?.webdav;
  if (webdav && webdav.interval > 0) {
    backupTimer = setInterval(() => {
      autoBackup();
    }, webdav.interval * 60 * 1000);
  }
}

// 打开 WebDAV 设置弹窗
function openWebdavModal() {
  const modal = document.getElementById('webdavModal');
  const webdav = sitesData.settings?.webdav || {};
  
  document.getElementById('webdavUrl').value = webdav.url || '';
  document.getElementById('webdavUsername').value = webdav.username || '';
  document.getElementById('webdavPassword').value = webdav.password || '';
  document.getElementById('webdavPath').value = webdav.path || '/itab-backup/';
  document.getElementById('backupInterval').value = webdav.interval || 0;
  
  updateBackupStatus();
  modal.classList.add('show');
}

function closeWebdavModal() {
  document.getElementById('webdavModal').classList.remove('show');
}

// 更新备份状态显示
function updateBackupStatus() {
  const statusEl = document.getElementById('backupStatus');
  const webdav = sitesData.settings?.webdav;
  
  if (!webdav || !webdav.url) {
    statusEl.innerHTML = '<span style="color:#999;">未配置</span>';
    return;
  }
  
  const lastBackup = webdav.lastBackup;
  if (lastBackup) {
    const date = new Date(lastBackup);
    statusEl.innerHTML = `<span style="color:#4caf50;">✓ 上次备份: ${date.toLocaleString()}</span>`;
  } else {
    statusEl.innerHTML = '<span style="color:#ff9800;">已配置，等待备份</span>';
  }
}

// 保存 WebDAV 设置
async function saveWebdavSettings() {
  const webdav = {
    url: document.getElementById('webdavUrl').value.trim(),
    username: document.getElementById('webdavUsername').value.trim(),
    password: document.getElementById('webdavPassword').value,
    path: document.getElementById('webdavPath').value.trim() || '/itab-backup/',
    interval: parseInt(document.getElementById('backupInterval').value)
  };
  
  try {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webdav })
    });
    
    if (!response.ok) throw new Error('保存失败');
    
    await loadSitesData();
    initWebdavBackup();
    updateBackupStatus();
    closeWebdavModal();
    alert('WebDAV 设置已保存');
  } catch (error) {
    alert('保存失败: ' + error.message);
  }
}

// 测试 WebDAV 连接
async function testWebdavConnection() {
  const webdav = {
    url: document.getElementById('webdavUrl').value.trim(),
    username: document.getElementById('webdavUsername').value.trim(),
    password: document.getElementById('webdavPassword').value,
    path: document.getElementById('webdavPath').value.trim() || '/itab-backup/'
  };
  
  if (!webdav.url) {
    alert('请输入 WebDAV 服务器地址');
    return;
  }
  
  try {
    const response = await fetch('/api/webdav/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webdav)
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('✓ 连接成功！');
    } else {
      alert('✗ 连接失败: ' + (result.error || '未知错误'));
    }
  } catch (error) {
    alert('连接测试失败: ' + error.message);
  }
}

// 手动备份
async function manualBackup() {
  try {
    const response = await fetch('/api/webdav/backup', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      await loadSitesData();
      updateBackupStatus();
      alert('备份成功！');
    } else {
      alert('备份失败: ' + (result.error || '未知错误'));
    }
  } catch (error) {
    alert('备份失败: ' + error.message);
  }
}

// 自动备份（静默执行）
async function autoBackup() {
  try {
    await fetch('/api/webdav/backup', { method: 'POST' });
    await loadSitesData();
  } catch (error) {
    console.error('自动备份失败:', error);
  }
}