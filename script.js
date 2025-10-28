// 在线 Markdown 编辑器脚本
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

  const AUTO_SAVE_KEY = 'md-editor-content';
  const AUTO_SAVE_INTERVAL = 1000; // ms debounce
  let saveTimer = null;
  let renderTimer = null;

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

  // 自动保存到 localStorage
  function scheduleAutoSave(){
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(()=>{
      try{ localStorage.setItem(AUTO_SAVE_KEY, editor.value || ''); setStatus('已自动保存到 localStorage', 1500); }catch(e){ setStatus('自动保存失败'); }
    }, AUTO_SAVE_INTERVAL);
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
  gistBtn.addEventListener('click', ()=>{
    gistModal.setAttribute('aria-hidden','false');
  });
  cancelGistBtn.addEventListener('click', ()=>{ gistModal.setAttribute('aria-hidden','true'); });

  createGistBtn.addEventListener('click', async ()=>{
    const token = gistToken.value.trim();
    const desc = gistDesc.value.trim();
    const isPublic = gistPublic.checked;
    const content = editor.value || '';
    if (!content) { alert('当前编辑器为空，无法创建 Gist。'); return; }

    setStatus('正在创建 Gist… 可能需要几秒钟');

    const payload = {
      description: desc || 'Created from Online Markdown Editor',
      public: !!isPublic,
      files: { 'note.md': { content } }
    };

    try{
      const headers = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = 'token ' + token;

      const res = await fetch('https://api.github.com/gists', { method:'POST', headers, body: JSON.stringify(payload) });
      if (!res.ok) {
        const txt = await res.text();
        setStatus('创建 Gist 失败');
        alert('创建 Gist 失败：' + res.status + '\n' + txt);
        return;
      }
      const data = await res.json();
      const url = data.html_url || data.files && Object.values(data.files)[0] && data.files[Object.keys(data.files)[0]].raw_url;
      gistModal.setAttribute('aria-hidden','true');
      setStatus('Gist 已创建');
      if (url) {
        if (confirm('Gist 创建成功，是否打开？')) window.open(url, '_blank');
      } else alert('Gist 创建成功，查看 GitHub。');
    }catch(e){
      setStatus('创建 Gist 出错');
      alert('创建 Gist 时出错：'+String(e));
    }
  });

  // 初始化内容（示例模板）
  function initialTemplate(){
    return `# 欢迎使用在线 Markdown 编辑器\n\n- 这是一个可以部署到 GitHub Pages 的静态站点。\n- 编辑左侧，右侧实时预览。\n- 自动保存到 localStorage；可下载为 .md 或创建 GitHub Gist。\n\n## 使用建议\n1. 编辑 -> 自动保存到 localStorage\n2. 点击“下载(.md)”以导出本地文件\n3. 如需将内容保存到 GitHub，请选择“保存为 Gist”并提供 PAT（可选）\n`;
  }

  // 首次加载逻辑
  (function boot(){
    // 如果 localStorage 有内容，则使用，否则填入模板
    try{
      const v = localStorage.getItem(AUTO_SAVE_KEY);
      if (v && v.trim().length>0) editor.value = v;
      else editor.value = initialTemplate();
    }catch(e){ editor.value = initialTemplate(); }
    render();
  })();

})();
