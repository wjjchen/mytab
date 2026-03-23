// iTab Chrome Extension - 网址导航
// 使用 chrome.storage 替代服务器存储

// 网站数据
let sitesData = null;
let currentCategory = null;
let editingCategory = null;
let editingSiteIndex = null;
let currentIconSize = 'normal';
let sidebarCollapsed = false;

// 拖拽排序相关变量
let draggedItem = null;
let draggedType = null;

// 右键菜单相关
let contextMenuTarget = null;

// 加密密钥（基于扩展ID生成）
let encryptionKey = null;

// 初始化加密密钥
async function initEncryptionKey() {
  if (encryptionKey) return encryptionKey;
  
  // 使用 Chrome 扩展的 ID 作为密钥种子
  const extensionId = chrome.runtime.id;
  // 生成一个 32 字节的密钥
  const encoder = new TextEncoder();
  const data = encoder.encode(extensionId + '-itab-webdav-key');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  encryptionKey = await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  return encryptionKey;
}

// 加密文本
async function encryptText(text) {
  if (!text) return text;
  
  try {
    const key = await initEncryptionKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // 生成随机 IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );
    
    // 将 IV 和加密数据合并，并用 base64 编码
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('加密失败:', error);
    return text;
  }
}

// 解密文本
async function decryptText(encryptedText) {
  if (!encryptedText) return encryptedText;
  
  // 检查是否是加密数据（尝试解密）
  try {
    const key = await initEncryptionKey();
    
    // Base64 解码
    const combined = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
    
    // 提取 IV 和加密数据
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    // 如果解密失败，可能是未加密的旧数据，直接返回
    return encryptedText;
  }
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

// 默认数据
const DEFAULT_DATA = {
  settings: {
    background: '',
    bgColor: '#667eea',
    iconSize: 'normal',
    logoIcon: '🚀',
    logoText: 'iTab',
    sidebarCollapsed: false,
    textColor: '#ffffff'
  },
  categories: []
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadSitesData();
  applySettings();
  initSearchEngine();
  renderNavMenu();
  updateTime();
  setInterval(updateTime, 1000);
  
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
  
  // WebDAV 相关
  document.getElementById('webdavSettingsBtn')?.addEventListener('click', openWebdavModal);
  document.getElementById('closeWebdavBtn')?.addEventListener('click', closeWebdavModal);
  document.getElementById('testWebdavBtn')?.addEventListener('click', testWebdavConnection);
  document.getElementById('uploadToWebdavBtn')?.addEventListener('click', uploadToWebdav);
  document.getElementById('downloadFromWebdavBtn')?.addEventListener('click', downloadFromWebdav);
  document.getElementById('saveWebdavBtn')?.addEventListener('click', saveWebdavConfig);
  
  // 弹窗关闭按钮
  document.getElementById('closeSettingsBtn')?.addEventListener('click', closeSettingsModal);
  document.getElementById('cancelSettingsBtn')?.addEventListener('click', closeSettingsModal);
  document.getElementById('closeCategoryBtn')?.addEventListener('click', closeCategoryModal);
  document.getElementById('cancelCategoryBtn')?.addEventListener('click', closeCategoryModal);
  document.getElementById('closeSiteBtn')?.addEventListener('click', closeSiteModal);
  document.getElementById('cancelSiteBtn')?.addEventListener('click', closeSiteModal);
  document.getElementById('closeMoveBtn')?.addEventListener('click', closeMoveModal);
  document.getElementById('cancelMoveBtn')?.addEventListener('click', closeMoveModal);
  document.getElementById('closeDeleteBtn')?.addEventListener('click', closeDeleteModal);
  document.getElementById('cancelDeleteBtn')?.addEventListener('click', closeDeleteModal);
  
  // 右键菜单
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

// ========== 数据存储（使用 chrome.storage）==========

// 加载网站数据
async function loadSitesData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['itabData'], (result) => {
      if (result.itabData) {
        sitesData = result.itabData;
      } else {
        sitesData = JSON.parse(JSON.stringify(DEFAULT_DATA));
      }
      resolve();
    });
  });
}

// 保存网站数据
async function saveSitesData() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ itabData: sitesData }, resolve);
  });
}

// 应用设置
function applySettings() {
  const settings = sitesData.settings || DEFAULT_DATA.settings;
  
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
    const img = document.createElement('img');
    img.src = logoIcon;
    img.alt = 'Logo';
    img.onerror = function() {
      this.parentElement.textContent = '🚀';
    };
    logoIconEl.innerHTML = '';
    logoIconEl.appendChild(img);
  } else {
    logoIconEl.textContent = logoIcon;
  }
  document.getElementById('logoText').textContent = logoText;
  document.title = logoText + ' - 新标签页';
  
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
  sitesData.settings.sidebarCollapsed = sidebarCollapsed;
  await saveSitesData();
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
  
  const radioBtn = document.querySelector(`input[name="iconSize"][value="${currentIconSize}"]`);
  if (radioBtn) radioBtn.checked = true;
}

// 切换图标大小
async function toggleIconSize() {
  currentIconSize = currentIconSize === 'normal' ? 'small' : 'normal';
  updateIconSizeUI();
  sitesData.settings.iconSize = currentIconSize;
  await saveSitesData();
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
    const safeName = escapeHtml(category.name);
    navItem.innerHTML = `
      <div class="nav-item-left">
        <span class="nav-icon">${getIconHtml(category.icon)}</span>
        <span class="nav-text">${safeName}</span>
      </div>
      <div class="nav-item-actions">
        <button class="nav-action-btn edit-cat-btn" data-category-id="${category.id}" title="编辑">✏️</button>
        <button class="nav-action-btn delete delete-cat-btn" data-category-id="${category.id}" title="删除">🗑️</button>
      </div>
    `;
    navItem.addEventListener('click', () => selectCategory(category.id));
    
    // 绑定编辑/删除按钮事件
    navItem.querySelector('.edit-cat-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openCategoryModal(category.id);
    });
    navItem.querySelector('.delete-cat-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCategory(category.id);
    });
    
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
    // 返回一个占位符，图片加载后替换
    return `<img src="${escapeHtml(icon)}" alt="" class="site-icon-img">`;
  }
  return icon;
}

// 选择分类
function selectCategory(categoryId) {
  currentCategory = categoryId;
  
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.categoryId === categoryId);
  });
  
  renderSites(categoryId);
  saveCurrentCategory(categoryId);
}

// 保存当前分类
async function saveCurrentCategory(categoryId) {
  if (!sitesData.settings) sitesData.settings = {};
  sitesData.settings.lastCategory = categoryId;
  await saveSitesData();
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
  
  // 初始化网站卡片拖拽、点击和右键菜单
  document.querySelectorAll('.site-card').forEach((card) => {
    const cardIndex = parseInt(card.dataset.siteIndex);
    const cardCategoryId = card.dataset.categoryId;
    
    initSiteDrag(card);
    
    // 点击打开网站
    card.addEventListener('click', () => {
      const site = category.sites[cardIndex];
      if (site) {
        window.open(site.url, '_blank');
      }
    });
    
    // 右键菜单
    card.addEventListener('contextmenu', (e) => showContextMenu(e, cardCategoryId, cardIndex));
  });
  
  updateIconSizeUI();
}

// 创建网站卡片HTML
function createSiteCard(site, categoryId, index) {
  const iconHtml = getIconHtml(site.icon, site.labelText, site.labelBgColor);
  const safeName = escapeHtml(site.name);
  const safeDesc = escapeHtml(site.description);
  
  return `
    <div class="site-card" data-site-index="${index}" data-category-id="${categoryId}">
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

// 渲染站内搜索结果
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
    
    card.addEventListener('contextmenu', (e) => {
      const categoryId = card.dataset.categoryId;
      const siteIndex = parseInt(card.dataset.siteIndex);
      if (categoryId && !isNaN(siteIndex)) {
        showContextMenu(e, categoryId, siteIndex);
      }
    });
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
        if (!sitesData.settings) sitesData.settings = {};
        sitesData.settings.searchEngine = value;
        await saveSitesData();
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

// ========== 右键菜单 ==========

function showContextMenu(e, categoryId, siteIndex) {
  e.preventDefault();
  e.stopPropagation();
  
  contextMenuTarget = { categoryId, siteIndex };
  
  const menu = document.getElementById('contextMenu');
  menu.style.display = 'block';
  menu.style.left = e.pageX + 'px';
  menu.style.top = e.pageY + 'px';
}

function hideContextMenu() {
  document.getElementById('contextMenu').style.display = 'none';
}

async function handleContextMenuAction(action) {
  if (!contextMenuTarget) return;
  
  const { categoryId, siteIndex } = contextMenuTarget;
  hideContextMenu();
  
  switch (action) {
    case 'edit':
      openSiteModal(categoryId, siteIndex);
      break;
    case 'move':
      openMoveModal(categoryId);
      break;
    case 'delete':
      deleteSite(categoryId, siteIndex);
      break;
  }
}

function openMoveModal(categoryId) {
  const select = document.getElementById('targetCategorySelect');
  select.innerHTML = sitesData.categories
    .filter(c => c.id !== categoryId)
    .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');
  
  document.getElementById('moveModal').classList.add('show');
}

function closeMoveModal() {
  document.getElementById('moveModal').classList.remove('show');
}

async function confirmMoveSite() {
  const targetCategoryId = document.getElementById('targetCategorySelect').value;
  if (!targetCategoryId || !contextMenuTarget) return;
  
  const { categoryId, siteIndex } = contextMenuTarget;
  
  const sourceCategory = sitesData.categories.find(c => c.id === categoryId);
  const targetCategory = sitesData.categories.find(c => c.id === targetCategoryId);
  
  if (sourceCategory && targetCategory) {
    const site = sourceCategory.sites.splice(siteIndex, 1)[0];
    targetCategory.sites.push(site);
    await saveSitesData();
    renderNavMenu();
    selectCategory(categoryId);
  }
  
  closeMoveModal();
}

// ========== 设置管理 ==========

function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const settings = sitesData.settings || DEFAULT_DATA.settings;
  
  document.getElementById('backgroundUrl').value = settings.background || '';
  document.getElementById('logoIconInput').value = settings.logoIcon || '🚀';
  document.getElementById('logoTextInput').value = settings.logoText || 'iTab';
  document.querySelector(`input[name="iconSize"][value="${settings.iconSize || 'normal'}"]`).checked = true;
  
  const textColorPicker = document.getElementById('textColorPicker');
  textColorPicker.value = settings.textColor || '#ffffff';
  
  updateColorPresetButtons(settings.textColor || '#ffffff');
  
  textColorPicker.addEventListener('input', (e) => updateColorPresetButtons(e.target.value));
  document.querySelectorAll('.color-preset-btn:not(.bg-color-preset)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.target.dataset.color;
      document.getElementById('textColorPicker').value = color;
      updateColorPresetButtons(color);
    });
  });
  
  // 背景颜色选择器
  const bgColorPicker = document.getElementById('bgColorPicker');
  bgColorPicker.value = settings.bgColor || '#667eea';
  updateBgColorPresetButtons(settings.bgColor || '#667eea');
  
  bgColorPicker.addEventListener('input', (e) => updateBgColorPresetButtons(e.target.value));
  document.querySelectorAll('.bg-color-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.target.dataset.color;
      document.getElementById('bgColorPicker').value = color;
      updateBgColorPresetButtons(color);
      // 预览背景颜色
      const bgLayer = document.getElementById('bgLayer');
      bgLayer.style.background = `linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -20)} 100%)`;
    });
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

function updateBgColorPresetButtons(activeColor) {
  document.querySelectorAll('.bg-color-preset').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === activeColor);
  });
}

function updateColorPresetButtons(activeColor) {
  document.querySelectorAll('.color-preset-btn:not(.bg-color-preset)').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === activeColor);
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
  
  sitesData.settings = {
    ...sitesData.settings,
    background,
    bgColor,
    iconSize,
    logoIcon,
    logoText,
    textColor
  };
  
  await saveSitesData();
  applySettings();
  initSearchEngine();
  closeSettingsModal();
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
    
    sitesData = importData;
    await saveSitesData();
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

// ========== WebDAV 云同步功能 ==========

// 打开 WebDAV 设置弹窗
async function openWebdavModal() {
  const modal = document.getElementById('webdavModal');
  const webdavConfig = sitesData.settings?.webdav || {};
  
  // 解密密码
  const decryptedPassword = webdavConfig.password ? await decryptText(webdavConfig.password) : '';
  
  document.getElementById('webdavUrl').value = webdavConfig.url || '';
  document.getElementById('webdavUsername').value = webdavConfig.username || '';
  document.getElementById('webdavPassword').value = decryptedPassword;
  document.getElementById('webdavPath').value = webdavConfig.path || '/itab-backup/';
  
  updateWebdavStatus();
  
  modal.classList.add('show');
}

// 关闭 WebDAV 设置弹窗
function closeWebdavModal() {
  document.getElementById('webdavModal').classList.remove('show');
}

// 更新 WebDAV 状态显示
function updateWebdavStatus() {
  const statusEl = document.getElementById('webdavStatus');
  const webdavConfig = sitesData.settings?.webdav;
  
  if (webdavConfig && webdavConfig.url && webdavConfig.username) {
    const lastSync = webdavConfig.lastSync;
    if (lastSync) {
      statusEl.innerHTML = `<span style="color:#00b894;">✓ 已配置</span><br><small>上次同步: ${new Date(lastSync).toLocaleString()}</small>`;
    } else {
      statusEl.innerHTML = `<span style="color:#00b894;">✓ 已配置</span><br><small>尚未同步</small>`;
    }
  } else {
    statusEl.innerHTML = '未配置';
  }
}

// 保存 WebDAV 设置
async function saveWebdavConfig() {
  const url = document.getElementById('webdavUrl').value.trim();
  const username = document.getElementById('webdavUsername').value.trim();
  const password = document.getElementById('webdavPassword').value;
  const path = document.getElementById('webdavPath').value.trim() || '/itab-backup/';
  
  if (!url || !username || !password) {
    alert('请填写完整的 WebDAV 配置信息');
    return;
  }
  
  // 加密密码
  const encryptedPassword = await encryptText(password);
  
  sitesData.settings = sitesData.settings || {};
  sitesData.settings.webdav = {
    url: url.endsWith('/') ? url : url + '/',
    username,
    password: encryptedPassword,
    path: path.startsWith('/') ? path : '/' + path,
    lastSync: sitesData.settings.webdav?.lastSync
  };
  
  await saveSitesData();
  updateWebdavStatus();
  alert('WebDAV 设置已保存');
}

// 获取解密后的 WebDAV 凭证
async function getWebdavCredentials() {
  const webdavConfig = sitesData.settings?.webdav;
  if (!webdavConfig) return null;
  
  return {
    url: webdavConfig.url,
    username: webdavConfig.username,
    password: webdavConfig.password ? await decryptText(webdavConfig.password) : '',
    path: webdavConfig.path
  };
}

// 测试 WebDAV 连接
async function testWebdavConnection() {
  const url = document.getElementById('webdavUrl').value.trim();
  const username = document.getElementById('webdavUsername').value.trim();
  const password = document.getElementById('webdavPassword').value;
  
  if (!url || !username || !password) {
    alert('请填写完整的 WebDAV 配置信息');
    return;
  }
  
  const statusEl = document.getElementById('webdavStatus');
  statusEl.innerHTML = '<span style="color:#667eea;">正在测试连接...</span>';
  
  try {
    const response = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        'Authorization': 'Basic ' + btoa(username + ':' + password),
        'Depth': '0',
        'Content-Type': 'application/xml'
      },
      body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop></prop></propfind>'
    });
    
    if (response.ok || response.status === 207) {
      statusEl.innerHTML = '<span style="color:#00b894;">✓ 连接成功</span>';
    } else if (response.status === 401) {
      statusEl.innerHTML = '<span style="color:#e74c3c;">✗ 认证失败，请检查用户名和密码</span>';
    } else {
      statusEl.innerHTML = `<span style="color:#e74c3c;">✗ 连接失败: ${response.status}</span>`;
    }
  } catch (error) {
    statusEl.innerHTML = `<span style="color:#e74c3c;">✗ 连接失败: ${error.message}</span>`;
  }
}

// 上传配置到 WebDAV
async function uploadToWebdav() {
  const credentials = await getWebdavCredentials();
  
  if (!credentials || !credentials.url) {
    alert('请先配置 WebDAV 设置');
    return;
  }
  
  const statusEl = document.getElementById('webdavStatus');
  statusEl.innerHTML = '<span style="color:#667eea;">正在上传配置...</span>';
  
  try {
    // 生成带时间戳的文件名
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const configPath = credentials.path + `itab-config-${timestamp}.json`;
    const configUrl = credentials.url + configPath.replace(/^\/+/, '');
    
    // 先确保目录存在
    await ensureWebdavDirectory(credentials);
    
    // 深拷贝并排除 webdav 配置项
    const uploadData = JSON.parse(JSON.stringify(sitesData));
    if (uploadData.settings?.webdav) {
      delete uploadData.settings.webdav;
    }
    
    const response = await fetch(configUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'Basic ' + btoa(credentials.username + ':' + credentials.password),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(uploadData, null, 2)
    });
    
    if (response.ok || response.status === 201 || response.status === 204) {
      sitesData.settings.webdav.lastSync = new Date().toISOString();
      await saveSitesData();
      statusEl.innerHTML = '<span style="color:#00b894;">✓ 上传成功</span>';
      updateWebdavStatus();
    } else {
      throw new Error(`上传失败: ${response.status}`);
    }
  } catch (error) {
    statusEl.innerHTML = `<span style="color:#e74c3c;">✗ 上传失败: ${error.message}</span>`;
  }
}

// 确保 WebDAV 目录存在
async function ensureWebdavDirectory(credentials) {
  const dirPath = credentials.path.replace(/^\/+/, '').replace(/\/+$/, '');
  const dirUrl = credentials.url + dirPath + '/';
  
  try {
    // 尝试创建目录（如果已存在会返回错误，但不影响）
    await fetch(dirUrl, {
      method: 'MKCOL',
      headers: {
        'Authorization': 'Basic ' + btoa(credentials.username + ':' + credentials.password)
      }
    });
  } catch (e) {
    // 忽略错误，目录可能已存在
  }
}

// 列出 WebDAV 目录中的配置文件并返回最新的
async function listWebdavFiles(credentials) {
  const dirPath = credentials.path.replace(/^\/+/, '').replace(/\/+$/, '');
  const dirUrl = credentials.url + dirPath + '/';
  
  const response = await fetch(dirUrl, {
    method: 'PROPFIND',
    headers: {
      'Authorization': 'Basic ' + btoa(credentials.username + ':' + credentials.password),
      'Depth': '1',
      'Content-Type': 'application/xml'
    },
    body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>'
  });
  
  if (!response.ok && response.status !== 207) {
    throw new Error(`无法列出目录: ${response.status}`);
  }
  
  const text = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  
  // 尝试使用命名空间和非命名空间两种方式查找 response 元素
  let responses = doc.getElementsByTagNameNS('DAV:', 'response');
  if (responses.length === 0) {
    responses = doc.getElementsByTagName('response');
  }
  
  const files = [];
  
  for (const resp of responses) {
    // 尝试多种方式获取 href
    let href = resp.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent;
    if (!href) {
      href = resp.getElementsByTagName('href')[0]?.textContent || '';
    }
    
    // 尝试多种方式获取修改时间
    let lastModified = resp.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent;
    if (!lastModified) {
      lastModified = resp.getElementsByTagName('getlastmodified')[0]?.textContent;
    }
    
    // 只匹配配置文件 (itab-config-xxx.json 或 itab-config.json)
    const fileName = decodeURIComponent(href.split('/').pop() || '');
    if (fileName.match(/^itab-config(-[\d-T]+)?\.json$/)) {
      files.push({
        href: href,
        fileName: fileName,
        lastModified: lastModified ? new Date(lastModified).getTime() : 0
      });
    }
  }
  
  // 按修改时间降序排序，返回最新的
  files.sort((a, b) => b.lastModified - a.lastModified);
  return files;
}

// 从 WebDAV 下载配置
async function downloadFromWebdav() {
  const credentials = await getWebdavCredentials();
  
  if (!credentials || !credentials.url) {
    alert('请先配置 WebDAV 设置');
    return;
  }
  
  const statusEl = document.getElementById('webdavStatus');
  statusEl.innerHTML = '<span style="color:#667eea;">正在查找最新配置...</span>';
  
  try {
    // 列出目录中的配置文件
    const files = await listWebdavFiles(credentials);
    
    if (files.length === 0) {
      statusEl.innerHTML = '<span style="color:#e74c3c;">✗ 远程配置文件不存在，请先上传</span>';
      return;
    }
    
    // 获取最新的配置文件
    const latestFile = files[0];
    const configUrl = credentials.url + latestFile.href.replace(/^\/+/, '');
    
    statusEl.innerHTML = `<span style="color:#667eea;">正在下载: ${latestFile.fileName}...</span>`;
    
    const response = await fetch(configUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + btoa(credentials.username + ':' + credentials.password)
      }
    });
    
    if (response.ok) {
      const importData = await response.json();
      
      if (!importData.categories || !Array.isArray(importData.categories)) {
        throw new Error('无效的配置文件格式');
      }
      
      // 保留当前 WebDAV 配置
      const currentWebdavConfig = sitesData.settings?.webdav;
      
      sitesData = importData;
      sitesData.settings = sitesData.settings || {};
      sitesData.settings.webdav = currentWebdavConfig;
      sitesData.settings.webdav.lastSync = new Date().toISOString();
      
      await saveSitesData();
      applySettings();
  initSearchEngine();
      renderNavMenu();
      
      if (sitesData.categories.length > 0) {
        selectCategory(sitesData.categories[0].id);
      }
      
      statusEl.innerHTML = `<span style="color:#00b894;">✓ 下载成功 (${latestFile.fileName})</span>`;
      updateWebdavStatus();
    } else if (response.status === 404) {
      statusEl.innerHTML = '<span style="color:#e74c3c;">✗ 远程配置文件不存在，请先上传</span>';
    } else {
      throw new Error(`下载失败: ${response.status}`);
    }
  } catch (error) {
    statusEl.innerHTML = `<span style="color:#e74c3c;">✗ 下载失败: ${error.message}</span>`;
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
  
  if (editingCategory) {
    const category = sitesData.categories.find(c => c.id === editingCategory);
    if (category) {
      category.name = name;
      category.icon = icon;
    }
  } else {
    const newCategory = {
      id: 'cat_' + Date.now(),
      name,
      icon,
      sites: []
    };
    sitesData.categories.push(newCategory);
  }
  
  await saveSitesData();
  renderNavMenu();
  
  if (!editingCategory && sitesData.categories.length > 0) {
    selectCategory(sitesData.categories[sitesData.categories.length - 1].id);
  } else if (editingCategory) {
    selectCategory(editingCategory);
  }
  
  closeCategoryModal();
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
  
  const category = sitesData.categories.find(c => c.id === categoryId);
  if (!category) return;
  
  const siteData = { name, url, icon, description, labelText, labelBgColor };
  
  if (editingSiteIndex !== null) {
    category.sites[editingSiteIndex] = siteData;
  } else {
    category.sites.push(siteData);
  }
  
  await saveSitesData();
  renderNavMenu();
  selectCategory(categoryId);
  closeSiteModal();
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
  
  if (deleteTarget.type === 'category') {
    const index = sitesData.categories.findIndex(c => c.id === deleteTarget.id);
    if (index !== -1) {
      sitesData.categories.splice(index, 1);
    }
    await saveSitesData();
    renderNavMenu();
    
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
    const category = sitesData.categories.find(c => c.id === deleteTarget.categoryId);
    if (category) {
      category.sites.splice(deleteTarget.siteIndex, 1);
    }
    await saveSitesData();
    renderNavMenu();
    selectCategory(deleteTarget.categoryId);
  }
  
  closeDeleteModal();
}

// ========== 拖拽排序功能 ==========

function initDragAndDrop() {
  // 分类拖拽在 renderNavMenu 中处理
  // 网站卡片拖拽在 renderSites 中处理
}

function initCategoryDrag(item) {
  item.draggable = true;
  
  item.addEventListener('dragstart', (e) => {
    draggedItem = item;
    draggedType = 'category';
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  
  item.addEventListener('dragend', async () => {
    item.classList.remove('dragging');
    draggedItem = null;
    draggedType = null;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('drag-over'));
  });
  
  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (draggedType === 'category' && draggedItem !== item) {
      item.classList.add('drag-over');
    }
  });
  
  item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
  
  item.addEventListener('drop', async (e) => {
    e.preventDefault();
    item.classList.remove('drag-over');
    
    if (draggedType !== 'category' || draggedItem === item) return;
    
    const navItems = Array.from(document.querySelectorAll('.nav-item'));
    const fromIndex = navItems.indexOf(draggedItem);
    const toIndex = navItems.indexOf(item);
    
    if (fromIndex !== -1 && toIndex !== -1) {
      const [movedCategory] = sitesData.categories.splice(fromIndex, 1);
      sitesData.categories.splice(toIndex, 0, movedCategory);
      await saveSitesData();
      renderNavMenu();
    }
  });
}

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
    document.querySelectorAll('.site-card').forEach(c => c.classList.remove('drag-over'));
    e.stopPropagation();
  });
  
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
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
    
    const categoryId = card.dataset.categoryId;
    const category = sitesData.categories.find(c => c.id === categoryId);
    if (!category) return;
    
    const cards = Array.from(document.querySelectorAll('.site-card'));
    const fromIndex = parseInt(draggedItem.dataset.siteIndex);
    const toIndex = parseInt(card.dataset.siteIndex);
    
    if (fromIndex !== toIndex) {
      const [movedSite] = category.sites.splice(fromIndex, 1);
      category.sites.splice(toIndex, 0, movedSite);
      await saveSitesData();
      selectCategory(categoryId);
    }
  });
}
