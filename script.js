// 在线 Markdown 编辑器脚本（增加坚果云 WebDAV 支持）
(function(){
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const statusEl = document.getElementById('status');
  const autosaveEl = document.getElementById('autosave');
  const newBtn = document.getElementById('newBtn');
  const openBtn = document.getElementById('openBtn');
  const openFileInput = document.getElementById('openFileInput');
  const saveBtn = document.getElementById('saveBtn');
  const gistBtn = document.getElementById('gistBtn');
  const clearBtn = document.getElementById('clearBtn');
  const togglePreviewBtn = document.getElementById('togglePreviewBtn');
  const gistModal = document.getElementById('gistModal');
  const gistToken = document.getElementById('gistToken');
  const gistDesc = document.getElementById('gistDesc');
  const gistPublic = document.getElementById('gistPublic');
  const createGistBtn = document.getElementById('createGistBtn');
  const cancelGistBtn = document.getElementById('cancelGistBtn');

  // WebDAV UI elements
  const webdavSettingsBtn = document.getElementById('webdavSettingsBtn');
  const saveWebdavBtn = document.getElementById('saveWebdavBtn');
  const loadWebdavBtn = document.getElementById('loadWebdavBtn');
  const listWebdavBtn = document.getElementById('listWebdavBtn');
  const webdavModal = document.getElementById('webdavModal');
  const webdavUrlInput = document.getElementById('webdavUrl');
  const webdavUserInput = document.getElementById('webdavUser');
  const webdavPassInput = document.getElementById('webdavPass');
  const webdavFolderInput = document.getElementById('webdavFolder');
  const webdavRememberInput = document.getElementById('webdavRemember');
  const webdavSaveSettingsBtn = document.getElementById('webdavSaveSettingsBtn');
  const webdavCancelBtn = document.getElementById('webdavCancelBtn');

  const AUTO_SAVE_KEY = 'md-editor-content';
  const AUTOSAVE_WEBDAV_CONFIG = 'md-webdav-config';
  const AUTOSAVE_WEBDAV_PASS = 'md-webdav-pass'; // sessionStorage for password by default
  const AUTO_SAVE_INTERVAL = 1000; // ms debounce for local
  let saveTimer = null;
  let renderTimer = null;
  let cloudSaveTimer = null;
  let currentWebdavFile = null;

  // 初始化 marked 配置
  if (window.marked) {
    marked.setOptions({ breaks: true, gfm: true });
  }

  function setStatus(text, timeout=3000){
    statusEl.textContent = text;
    if (timeout>0){
      setTimeout(()=>{ if(statusEl.textContent===text) statusEl.textContent='已就绪'; }, timeout);
    }
  }

  function render(){
    const md = editor.value || '';
    try{
      const raw = (window.marked) ? marked.parse(md) : md;
      const clean = (window.DOMPurify) ? DOMPurify.sanitize(raw) : raw;
      preview.innerHTML = clean;
    }catch(e){
      preview.innerHTML = '<pre style="color:red">渲染错误: '+String(e)+'</pre>';
    }
  }

  function debounceRender(){
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 150);
  }

  // WebDAV helpers
  function saveWebdavConfigToLocal(cfg, savePass=false){
    try{
      const toSave = { url: cfg.url, user: cfg.user, folder: cfg.folder, remember: !!cfg.remember };
      localStorage.setItem(AUTOSAVE_WEBDAV_CONFIG, JSON.stringify(toSave));
      if (savePass && cfg.pass){
        // store password in sessionStorage by default; if remember and savePass true, also store in localStorage
        sessionStorage.setItem(AUTOSAVE_WEBDAV_PASS, cfg.pass);
        if (cfg.remember) localStorage.setItem(AUTOSAVE_WEBDAV_PASS, cfg.pass);
      } else {
        sessionStorage.removeItem(AUTOSAVE_WEBDAV_PASS);
        localStorage.removeItem(AUTOSAVE_WEBDAV_PASS);
      }
    }catch(e){ console.warn('保存 WebDAV 配置失败', e); }
  }

  function loadWebdavConfigFromLocal(){
    try{
      const raw = localStorage.getItem(AUTOSAVE_WEBDAV_CONFIG);
      if (!raw) return null;
      const cfg = JSON.parse(raw);
      const pass = sessionStorage.getItem(AUTOSAVE_WEBDAV_PASS) || localStorage.getItem(AUTOSAVE_WEBDAV_PASS) || '';
      return { url: cfg.url || '', user: cfg.user || '', folder: cfg.folder || '/', remember: !!cfg.remember, pass };
    }catch(e){ return null; }
  }

  function buildAuthHeader(){
    const user = webdavUserInput.value || '';
    const pass = webdavPassInput.value || sessionStorage.getItem(AUTOSAVE_WEBDAV_PASS) || localStorage.getItem(AUTOSAVE_WEBDAV_PASS) || '';
    if (!user || !pass) return null;
    return 'Basic ' + btoa(user + ':' + pass);
  }

  function normalizeFolderUrl(url, folder){
    if (!url) return null;
    // ensure trailing slash
    if (!url.endsWith('/')) url += '/';
    // remove leading slash from folder
    folder = folder || '/';
    if (folder.startsWith('/')) folder = folder.substring(1);
  return url + folder.replace(/\\/g, '/') ;
  }

  async function putFile(remoteUrl, content){
    const auth = buildAuthHeader();
    if (!auth) throw new Error('未提供 WebDAV 凭据');
    const res = await fetch(remoteUrl, { method: 'PUT', headers: { 'Authorization': auth, 'Content-Type': 'text/markdown;charset=utf-8' }, body: content });
    if (!res.ok) throw new Error('上传失败: ' + res.status + ' ' + res.statusText);
    return res;
  }

  async function getFile(remoteUrl){
    const auth = buildAuthHeader();
    if (!auth) throw new Error('未提供 WebDAV 凭据');
    const res = await fetch(remoteUrl, { method: 'GET', headers: { 'Authorization': auth } });
    if (!res.ok) throw new Error('下载失败: ' + res.status + ' ' + res.statusText);
    return await res.text();
  }

  async function propfindList(folderUrl){
    const auth = buildAuthHeader();
    if (!auth) throw new Error('未提供 WebDAV 凭据');
    const body = `<?xml version="1.0"?>\n<D:propfind xmlns:D=\"DAV:\">\n  <D:allprop/>\n</D:propfind>`;
    const res = await fetch(folderUrl, { method:'PROPFIND', headers: { 'Authorization': auth, 'Content-Type': 'application/xml', 'Depth':'1' }, body });
    if (!res.ok) throw new Error('列出失败: ' + res.status + ' ' + res.statusText);
    const txt = await res.text();
    const doc = new DOMParser().parseFromString(txt, 'application/xml');
    const responses = Array.from(doc.getElementsByTagNameNS('DAV:', 'response'));
    const items = responses.map(r=>{
      const hrefEl = r.getElementsByTagNameNS('DAV:', 'href')[0];
      const href = hrefEl ? hrefEl.textContent : null;
      return href;
    }).filter(Boolean);
    return items;
  }

  // 自动保存到 WebDAV（autosave.md）
  async function autoSaveToWebdav(){
    try{
      const cfg = loadWebdavConfigFromLocal();
      if (!cfg || !cfg.url) return;
      // ensure password present in sessionStorage or input
      const pass = cfg.pass || webdavPassInput.value;
      if (!pass) return; // no credentials
      // prepare URL
      const folderUrl = normalizeFolderUrl(cfg.url, cfg.folder || '/');
      const remote = folderUrl.endsWith('/') ? folderUrl + 'autosave.md' : folderUrl + '/autosave.md';
      // ensure session password is set so buildAuthHeader can read it
      sessionStorage.setItem(AUTOSAVE_WEBDAV_PASS, pass);
      await putFile(remote, editor.value || '');
      currentWebdavFile = remote;
      setStatus('已自动保存到坚果云', 1500);
    }catch(e){ console.warn('自动保存到 WebDAV 失败', e); }
  }

  // schedule auto save (local + webdav)
  function scheduleAutoSave(){
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(()=>{
      try{ localStorage.setItem(AUTO_SAVE_KEY, editor.value || ''); setStatus('已自动保存到 localStorage', 1500); }catch(e){ setStatus('自动保存失败'); }
    }, AUTO_SAVE_INTERVAL);
    try{
      const cfg = loadWebdavConfigFromLocal();
      const pass = (cfg && cfg.pass) || webdavPassInput.value || sessionStorage.getItem(AUTOSAVE_WEBDAV_PASS);
      if (cfg && cfg.url && pass){
        if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
        cloudSaveTimer = setTimeout(async ()=>{ await autoSaveToWebdav(); }, 3000);
      }
    }catch(e){ /* ignore */ }
  }

  // 加载 localStorage
  function loadFromStorage(){
    try{
      const v = localStorage.getItem(AUTO_SAVE_KEY);
      if (v) { editor.value = v; setStatus('已从 localStorage 恢复内容', 1500); }
    }catch(e){ /* ignore */ }
    debounceRender();
  }

  // 新建
  newBtn.addEventListener('click', ()=>{
    if (editor.value && !confirm('当前内容未保存，确定要新建并清空吗？')) return;
    editor.value = '';
    render();
    setStatus('已新建');
    scheduleAutoSave();
  });

  // 打开本地文件
  openBtn.addEventListener('click', ()=> openFileInput.click());
  openFileInput.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function(){ editor.value = String(this.result || ''); render(); scheduleAutoSave(); setStatus('已载入本地文件',2000); };
    reader.readAsText(f, 'utf-8');
    openFileInput.value = '';
  });

  // 下载为 .md
  saveBtn.addEventListener('click', ()=>{
    const content = editor.value || '';
    const blob = new Blob([content], {type:'text/markdown;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'note.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus('已下载 .md 文件',1500);
  });

  // 清空
  clearBtn.addEventListener('click', ()=>{
    if (!confirm('确定要清空编辑器吗？此操作不可恢复（可从 localStorage 恢复）')) return;
    editor.value = '';
    render();
    scheduleAutoSave();
    setStatus('已清空');
  });

  // 切换预览（移动端模式）
  togglePreviewBtn.addEventListener('click', ()=>{
    document.querySelector('.left').classList.toggle('hidden');
    document.querySelector('.right').classList.toggle('hidden');
  });

  // 编辑器输入事件
  editor.addEventListener('input', ()=>{
    debounceRender();
    scheduleAutoSave();
  });

  // 右上保存为 Gist（弹窗）
  gistBtn.addEventListener('click', ()=>{ gistModal.setAttribute('aria-hidden','false'); });
  cancelGistBtn.addEventListener('click', ()=>{ gistModal.setAttribute('aria-hidden','true'); });

  createGistBtn.addEventListener('click', async ()=>{
    const token = gistToken.value.trim();
    const desc = gistDesc.value.trim();
    const isPublic = gistPublic.checked;
    const content = editor.value || '';
    if (!content) { alert('当前编辑器为空，无法创建 Gist。'); return; }

    setStatus('正在创建 Gist… 可能需要几秒钟');

    const payload = { description: desc || 'Created from Online Markdown Editor', public: !!isPublic, files: { 'note.md': { content } } };

    try{
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'token ' + token;
      const res = await fetch('https://api.github.com/gists', { method:'POST', headers, body: JSON.stringify(payload) });
      if (!res.ok) { const txt = await res.text(); setStatus('创建 Gist 失败'); alert('创建 Gist 失败：' + res.status + '\n' + txt); return; }
      const data = await res.json();
      const url = data.html_url || data.files && Object.values(data.files)[0] && data.files[Object.keys(data.files)[0]].raw_url;
      gistModal.setAttribute('aria-hidden','true');
      setStatus('Gist 已创建');
      if (url) { if (confirm('Gist 创建成功，是否打开？')) window.open(url, '_blank'); } else alert('Gist 创建成功，查看 GitHub。');
    }catch(e){ setStatus('创建 Gist 出错'); alert('创建 Gist 时出错：'+String(e)); }
  });

  // WebDAV settings modal wiring
  webdavSettingsBtn && webdavSettingsBtn.addEventListener('click', ()=>{
    // load saved config into modal
    const cfg = loadWebdavConfigFromLocal();
    if (cfg){ webdavUrlInput.value = cfg.url || ''; webdavUserInput.value = cfg.user || ''; webdavFolderInput.value = cfg.folder || '/'; webdavRememberInput.checked = !!cfg.remember; if (cfg.pass) webdavPassInput.value = cfg.pass; }
    webdavModal && webdavModal.setAttribute('aria-hidden','false');
  });
  webdavCancelBtn && webdavCancelBtn.addEventListener('click', ()=>{ webdavModal && webdavModal.setAttribute('aria-hidden','true'); });
  webdavSaveSettingsBtn && webdavSaveSettingsBtn.addEventListener('click', ()=>{
    const cfg = { url: webdavUrlInput.value.trim(), user: webdavUserInput.value.trim(), pass: webdavPassInput.value, folder: webdavFolderInput.value.trim() || '/', remember: webdavRememberInput.checked };
    saveWebdavConfigToLocal(cfg, !!cfg.pass);
    webdavModal && webdavModal.setAttribute('aria-hidden','true');
    setStatus('WebDAV 设置已保存（密码只保存在会话，除非选择记住）', 2000);
  });

  // WebDAV operations: save, list, load
  async function saveToWebdavInteractive(){
    try{
      let cfg = loadWebdavConfigFromLocal();
      // fallback to inputs on page (if config.json loaded into fields)
      if ((!cfg || !cfg.url) && webdavUrlInput){
        cfg = { url: (webdavUrlInput.value||'').trim(), user: (webdavUserInput.value||'').trim(), folder: (webdavFolderInput.value||'/').trim(), pass: webdavPassInput.value };
      }
      if (!cfg || !cfg.url) { alert('请先在 WebDAV 设置中配置服务器地址与用户名（或加载 config.json）'); return; }
      const name = prompt('请输入保存到坚果云的文件名：', 'note.md');
      if (!name) return;
      // ensure session password
  const pass = webdavPassInput.value || cfg.pass || prompt('请输入 WebDAV 密码以继续（仅会话）');
      if (!pass) { alert('需要密码才能保存到坚果云'); return; }
      sessionStorage.setItem(AUTOSAVE_WEBDAV_PASS, pass);
      const folderUrl = normalizeFolderUrl(cfg.url, cfg.folder || '/');
      const remote = folderUrl.endsWith('/') ? folderUrl + name : folderUrl + '/' + name;
      setStatus('正在保存到坚果云…');
      await putFile(remote, editor.value || '');
      currentWebdavFile = remote;
      setStatus('已保存到坚果云：' + name, 2000);
    }catch(e){ setStatus('保存到坚果云失败'); alert('保存失败：' + String(e)); }
  }

  async function listWebdavFilesInteractive(){
    try{
      let cfg = loadWebdavConfigFromLocal();
      if ((!cfg || !cfg.url) && webdavUrlInput){
        cfg = { url: (webdavUrlInput.value||'').trim(), user: (webdavUserInput.value||'').trim(), folder: (webdavFolderInput.value||'/').trim(), pass: webdavPassInput.value };
      }
      if (!cfg || !cfg.url) { alert('请先在 WebDAV 设置中配置服务器地址与用户名（或加载 config.json）'); return; }
      const pass = webdavPassInput.value || cfg.pass || sessionStorage.getItem(AUTOSAVE_WEBDAV_PASS);
      if (!pass){ alert('需要密码才能列出远程文件'); return; }
      sessionStorage.setItem(AUTOSAVE_WEBDAV_PASS, pass);
      const folderUrl = normalizeFolderUrl(cfg.url, cfg.folder || '/');
      setStatus('正在获取远程文件列表…');
      const items = await propfindList(folderUrl);
      // items are hrefs; convert to friendly names
  const base = folderUrl.replace(/\\/g, '/');
      const names = items.map(h=>decodeURIComponent(h)).filter(h=>h && h!=='' ).map(h=>{
        // remove base
        if (h.startsWith(base)) return h.substring(base.length);
        // try removing the host prefix
        try{ const u=new URL(h); return u.pathname.split('/').pop(); }catch(e){ return h; }
      }).filter(n=>n && n !== '' );
      if (!names.length){ alert('未发现任何文件（或服务器不支持 PROPFIND/CORS）'); return; }
      const list = names.map((n,i)=>`${i+1}. ${n}`).join('\n');
      const choice = prompt('请选择要加载的文件编号：\n' + list);
      const idx = parseInt(choice, 10);
      if (!isNaN(idx) && idx>=1 && idx<=names.length){
        const filename = names[idx-1];
        const remote = folderUrl.endsWith('/') ? folderUrl + filename : folderUrl + '/' + filename;
        await loadWebdavFile(remote);
      }
    }catch(e){ alert('列出远程文件失败：' + String(e)); }
  }

  async function loadWebdavFile(remoteUrl){
    try{
      setStatus('正在从坚果云加载…');
      const txt = await getFile(remoteUrl);
      editor.value = txt || '';
      render();
      currentWebdavFile = remoteUrl;
      setStatus('已从坚果云加载', 2000);
    }catch(e){ setStatus('加载失败'); alert('加载远程文件失败：' + String(e)); }
  }

  // wire buttons
  saveWebdavBtn && saveWebdavBtn.addEventListener('click', saveToWebdavInteractive);
  listWebdavBtn && listWebdavBtn.addEventListener('click', listWebdavFilesInteractive);
  loadWebdavBtn && loadWebdavBtn.addEventListener('click', ()=>{
    const id = prompt('请输入要加载的远程文件名（相对于设置的目录），或完整 URL：');
    if (!id) return;
    const cfg = loadWebdavConfigFromLocal();
    const folderUrl = cfg ? normalizeFolderUrl(cfg.url, cfg.folder||'/') : '';
    const remote = id.startsWith('http') ? id : (folderUrl.endsWith('/') ? folderUrl + id : folderUrl + '/' + id);
    loadWebdavFile(remote);
  });

  // 初始化内容（示例模板）
  function initialTemplate(){
    return `# 欢迎使用在线 Markdown 编辑器\n\n- 这是一个可以部署到 GitHub Pages 的静态站点。\n- 编辑左侧，右侧实时预览。\n- 自动保存到 localStorage；可下载为 .md 或创建 GitHub Gist。\n\n## 使用建议\n1. 编辑 -> 自动保存到 localStorage\n2. 点击“下载(.md)”以导出本地文件\n3. 若要云端保存，请点击【WebDAV 设置】配置坚果云并选择保存到坚果云\n`;
  }

  // 首次加载逻辑
  (function boot(){
    try{
      const v = localStorage.getItem(AUTO_SAVE_KEY);
      if (v && v.trim().length>0) editor.value = v;
      else editor.value = initialTemplate();
    }catch(e){ editor.value = initialTemplate(); }
    // load saved webdav config into hidden fields (but not password)
    const cfg = loadWebdavConfigFromLocal();
    if (cfg){ webdavUrlInput.value = cfg.url || ''; webdavUserInput.value = cfg.user || ''; webdavFolderInput.value = cfg.folder || '/'; webdavRememberInput.checked = !!cfg.remember; }
    render();
  })();
  // Expose a helper to apply config from external JSON (config.json)
  window.applyWebdavConfig = function(cfg){
    try{
      if (!cfg) return;
      if (cfg.url) webdavUrlInput.value = cfg.url;
      if (cfg.user) webdavUserInput.value = cfg.user;
      if (cfg.folder) webdavFolderInput.value = cfg.folder;
      if (cfg.remember || cfg.rememberUser) webdavRememberInput.checked = true;
      // if password provided, store in session for immediate use
      if (cfg.pass) {
        webdavPassInput.value = cfg.pass;
        sessionStorage.setItem(AUTOSAVE_WEBDAV_PASS, cfg.pass);
      }
      // persist url/user/folder to localStorage if remember flag
      if (cfg.remember || cfg.rememberUser) saveWebdavConfigToLocal({ url: cfg.url, user: cfg.user, folder: cfg.folder, remember: true }, !!cfg.pass);
      setStatus('已加载 config.json');
    }catch(e){ console.warn('applyWebdavConfig error', e); }
  };

  // If page has a config file input (index.html), wire it to load config.json
  const configFileInputMain = document.getElementById('configFileInputMain');
  if (configFileInputMain){
    configFileInputMain.addEventListener('change', (ev)=>{
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const cfg = JSON.parse(reader.result);
          window.applyWebdavConfig(cfg);
        }catch(e){ setStatus('解析 config.json 失败'); }
      };
      reader.readAsText(f, 'utf-8');
      configFileInputMain.value = '';
    });
    // wire the load button if exists
    const loadConfigBtn = document.getElementById('loadConfigBtn');
    if (loadConfigBtn) loadConfigBtn.addEventListener('click', ()=> configFileInputMain.click());
  }

})();
