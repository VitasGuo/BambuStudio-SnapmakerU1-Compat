// ============================================================
// AI Lab — G-code Optimization + Print QA Assistant
// Injected into webui.html #ailab-content
// ============================================================

// ─── State ───
var aiCfg={provider:'local',model:'',apiKey:'',customBaseUrl:''};
var aiProviders={};
var aiOptState={originalGcodeName:null,optimizedGcodeName:null};
var aiOptUploadedName=null;
var aiOptOrigLines=[];
var aiQAHistory=[];

// ─── HTML Injection (runs on load) ───
(function initAILab(){
  // --- Fill ailab-content with left-right split layout ---
  var ct=document.getElementById('ailab-content');
  if(!ct)return;
  ct.innerHTML='\
<div style="display:flex;flex-direction:column;width:100%;height:100%;">\
\
<!-- Header bar / Toolbar -->\
<div class="panel" style="margin-bottom:0;border-radius:0;border-bottom:1px solid var(--border);flex-shrink:0;">\
<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;flex-wrap:wrap;">\
\
<!-- Feature title -->\
<span style="font-size:14px;font-weight:600;color:var(--text);white-space:nowrap;">G-code 优化</span>\
<div style="width:1px;height:20px;background:var(--border);flex-shrink:0;"></div>\
\
<!-- Source tabs -->\
<div style="display:flex;gap:2px;">\
<button class="ai-opt-tab active" id="aiOptTabLocal" onclick="aiOptSwitchTab(\'local\')">本地文件</button>\
<button class="ai-opt-tab" id="aiOptTabPrinter" onclick="aiOptSwitchTab(\'printer\')">打印机</button>\
<button class="ai-opt-tab" id="aiOptTabUpload" onclick="aiOptSwitchTab(\'upload\')">上传</button>\
</div>\
\
<!-- Local file selector -->\
<div id="aiOptLocalPanel" style="display:flex;align-items:center;margin-left:8px;">\
<select id="aiOptGcodeSelect" onchange="if(this.value)aiOptLoadOriginal(this.value)" style="height:32px;border:1px solid var(--border);border-radius:6px;padding:0 8px;font-size:13px;background:var(--panel);color:var(--text);min-width:160px;">\
<option value="">-- 选择 G-code --</option></select>\
</div>\
\
<!-- Printer file selector -->\
<div id="aiOptPrinterPanel" style="display:none;align-items:center;margin-left:8px;">\
<select id="aiOptPrinterSelect" onchange="if(this.value)aiOptFetchAndPreview(this.value)" style="height:32px;border:1px solid var(--border);border-radius:6px;padding:0 8px;font-size:13px;background:var(--panel);color:var(--text);min-width:160px;">\
<option value="">-- 加载中... --</option></select>\
</div>\
\
<!-- Upload panel -->\
<div id="aiOptUploadPanel" style="display:none;align-items:center;gap:6px;margin-left:8px;">\
<button onclick="document.getElementById(\'aiOptFileInput\').click()" style="height:32px;padding:0 12px;border:1px dashed var(--border);border-radius:6px;background:var(--panel);color:var(--text2);cursor:pointer;font-size:12px;">选择文件</button>\
<input type="file" id="aiOptFileInput" accept=".gcode,.gco" style="display:none" onchange="aiOptUploadFile(this)">\
<span id="aiOptUploadInfo" style="display:none;font-size:12px;color:var(--success);"></span>\
</div>\
\
<span class="spacer" style="flex:1;"></span>\
\
<!-- Actions -->\
<button onclick="aiOptimizeGcode()" class="ai-btn ai-btn-primary" id="aiOptBtn" style="padding:5px 14px;font-size:13px;">优化</button>\
<button onclick="aiNewProject()" class="ai-btn ai-btn-outline" style="font-size:12px;padding:4px 10px;">\
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>新项目</button>\
<button onclick="aiOpenGcodeFolder()" class="ai-btn ai-btn-outline" style="font-size:12px;padding:4px 10px;" title="打开 G-code 文件夹">\
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>文件夹</button>\
<button onclick="showAiConfig()" class="ai-btn ai-btn-outline" style="font-size:12px;padding:4px 10px;">\
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>配置</button>\
</div>\
</div>\
\
<!-- Info banner -->\
<div style="padding:8px 16px;background:rgba(33,150,243,.06);border-bottom:1px solid rgba(33,150,243,.12);flex-shrink:0;font-size:12px;color:var(--text2);line-height:1.6;">\
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>\
基于 LLM 分析 G-code，诊断打印质量问题（如速度过快、回抽不足、温度不当等）并生成优化补丁。需要配置 LLM 连接后使用。\
</div>\
\
<!-- Optimize progress bar -->\
<div id="aiOptProgress" style="display:none;padding:6px 16px;background:rgba(33,150,243,.06);border-bottom:1px solid rgba(33,150,243,.15);flex-shrink:0;font-size:13px;color:var(--primary);font-weight:500;animation:aiPulse 1.5s infinite;">AI 诊断优化中...</div>\
\
<!-- Optimize result bar -->\
<div id="aiOptResult" style="display:none;padding:6px 16px;background:rgba(76,175,80,.06);border-bottom:1px solid rgba(76,175,80,.15);flex-shrink:0;">\
<div style="display:flex;align-items:center;gap:14px;font-size:12px;flex-wrap:wrap;">\
<span style="color:var(--success);font-weight:600;">优化完成</span>\
<span style="color:var(--text2);">问题: <b id="aiOptIssues" style="color:var(--primary);">-</b></span>\
<span style="color:var(--text2);">补丁: <b id="aiOptPatches" style="color:var(--success);">-</b></span>\
<span id="aiOptDiffInfo" style="color:var(--text3);"></span>\
<span style="flex:1;min-width:8px;"></span>\
<span id="aiOptOpsList" style="display:flex;gap:6px;flex-wrap:wrap;"></span>\
<a id="aiOptDownload" style="display:none;font-size:11px;padding:3px 10px;" class="ai-btn ai-btn-outline" download>下载</a>\
<button id="aiOptUploadBtn" style="display:none;font-size:11px;padding:3px 10px;" onclick="aiOptUploadToPrinter()" class="ai-btn ai-btn-primary">上传到打印机</button>\
<span id="aiOptUploadResult" style="display:none;color:var(--success);"></span>\
</div>\
<div id="aiOptDiagnosis" style="font-size:12px;color:var(--text2);margin-top:4px;line-height:1.5;display:none;"></div>\
<div id="aiOptSummary" style="font-size:12px;color:var(--text2);margin-top:2px;line-height:1.5;display:none;"></div>\
</div>\
\
<!-- Left-Right G-code panels -->\
<div style="flex:1;display:flex;overflow:hidden;min-height:0;">\
<!-- Left: Original -->\
<div style="flex:1;display:flex;flex-direction:column;min-width:0;border-right:1px solid var(--border);">\
<div style="padding:5px 12px;font-size:11px;font-weight:600;color:var(--text3);background:var(--panel2);border-bottom:1px solid var(--border);flex-shrink:0;">原始 G-code</div>\
<div id="aiOptDiffOriginal" style="flex:1;overflow:auto;padding:6px 10px;font-size:11px;font-family:Cascadia Code,Consolas,monospace;line-height:1.55;white-space:pre;word-break:break-all;background:var(--bg);">\
<div style="text-align:center;padding:40px 20px;color:var(--text3);">选择 G-code 文件后在此预览</div></div>\
</div>\
<!-- Right: Optimized -->\
<div style="flex:1;display:flex;flex-direction:column;min-width:0;">\
<div style="padding:5px 12px;font-size:11px;font-weight:600;color:var(--text3);background:var(--panel2);border-bottom:1px solid var(--border);flex-shrink:0;">优化后 G-code</div>\
<div id="aiOptDiffOptimized" style="flex:1;overflow:auto;padding:6px 10px;font-size:11px;font-family:Cascadia Code,Consolas,monospace;line-height:1.55;white-space:pre;word-break:break-all;background:var(--bg);font-style:italic;">\
<div style="text-align:center;padding:40px 20px;color:var(--text3);">优化后在此显示</div></div>\
</div>\
</div>\
</div>';

  // --- Inject AI Config Modal ---
  var cfgModal=document.createElement('div');
  cfgModal.id='aiConfigModal';
  cfgModal.className='ai-config-modal';
  cfgModal.style.display='none';
  cfgModal.innerHTML='\
<div class="panel">\
<h3 style="margin-top:0;">AI 配置</h3>\
<div style="margin-bottom:12px;"><label style="font-weight:600;font-size:13px;">服务商</label>\
<select id="aiCfgProvider" onchange="aiProviderChanged()" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;padding:0 10px;margin-top:4px;font-size:14px;background:var(--panel);color:var(--text);"></select></div>\
<div style="margin-bottom:12px;"><label style="font-weight:600;font-size:13px;">模型名称</label>\
<input id="aiCfgModel" type="text" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;padding:0 10px;margin-top:4px;font-size:14px;background:var(--panel);color:var(--text);" placeholder="google/gemma-4-e2b"></div>\
<div style="margin-bottom:12px;"><label style="font-weight:600;font-size:13px;">端点 URL (可选)</label>\
<input id="aiCfgEndpoint" type="text" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;padding:0 10px;margin-top:4px;font-size:14px;background:var(--panel);color:var(--text);" placeholder="http://127.0.0.1:1234/v1"></div>\
<div style="margin-bottom:12px;" id="aiCfgApiKeyRow"><label style="font-weight:600;font-size:13px;">API Key</label>\
<input id="aiCfgApiKey" type="password" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;padding:0 10px;margin-top:4px;font-size:14px;background:var(--panel);color:var(--text);" placeholder="sk-..."></div>\
<div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px;">\
<button onclick="aiTestConnection()" class="ai-btn ai-btn-outline">测试连接</button>\
<div style="display:flex;gap:8px;">\
<button onclick="hideAiConfig()" class="ai-btn ai-btn-outline">取消</button>\
<button onclick="aiSaveConfig()" class="ai-btn ai-btn-primary">保存</button></div></div>\
<div id="aiConfigStatus" style="margin-top:12px;font-size:12px;"></div></div>';
  document.body.appendChild(cfgModal);

  // --- Inject AI Error Modal ---
  var errModal=document.createElement('div');
  errModal.id='aiErrorModal';
  errModal.className='ai-config-modal';
  errModal.style.display='none';
  errModal.innerHTML='\
<div class="panel" style="max-width:420px;">\
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><h3 id="aiErrorTitle" style="margin:0;color:var(--danger);">错误</h3>\
<button onclick="hideAiError()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3);">&times;</button></div>\
<div id="aiErrorMsg" style="font-size:13px;color:var(--text);line-height:1.6;max-height:200px;overflow-y:auto;white-space:pre-wrap;font-family:Consolas,monospace;margin-bottom:12px;"></div>\
<div style="display:flex;gap:8px;justify-content:flex-end;">\
<button onclick="copyAiError()" class="ai-btn ai-btn-outline" style="font-size:12px;">复制错误</button>\
<button onclick="hideAiError()" class="ai-btn ai-btn-primary" style="font-size:12px;">关闭</button></div></div>';
  document.body.appendChild(errModal);

  // --- Inject Floating QA Assistant ---
  var qaFab=document.createElement('div');
  qaFab.id='qaFab';
  qaFab.setAttribute('onclick','toggleQaPopup()');
  qaFab.style.cssText='position:fixed;bottom:24px;left:80px;width:48px;height:48px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:900;';
  qaFab.innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
  document.body.appendChild(qaFab);

  var qaPopup=document.createElement('div');
  qaPopup.id='qaPopup';
  qaPopup.style.cssText='display:none;position:fixed;bottom:82px;left:80px;width:380px;max-height:520px;background:var(--panel);border-radius:12px;border:1px solid var(--border);box-shadow:0 8px 32px rgba(0,0,0,.3);z-index:901;overflow:hidden;flex-direction:column;';
  qaPopup.innerHTML='\
<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);">\
<div style="font-size:14px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:6px;">\
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>打印助手</div>\
<div style="display:flex;gap:6px;">\
<button onclick="aiClearQA()" style="background:none;border:1px solid var(--border);color:var(--text3);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;">清空</button>\
<button onclick="toggleQaPopup()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;">&times;</button></div></div>\
<div id="qaHistory" class="qa-history">\
<div class="qa-msg ai"><div class="qa-avatar">AI</div><div class="qa-bubble">你好！我是 3D 打印助手，帮你解答 FDM 打印问题。请问有什么可以帮你的？</div></div></div>\
<div style="display:flex;gap:8px;padding:10px 16px;border-top:1px solid var(--border);">\
<input type="text" class="qa-input" id="qaInput" placeholder="输入打印问题..." onkeydown="if(event.key===\'Enter\')aiSendQuestion()" style="flex:1;height:36px;">\
<button class="qa-send" id="qaSendBtn" onclick="aiSendQuestion()" style="width:36px;height:36px;">\
<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button></div>';
  document.body.appendChild(qaPopup);

  // --- Load config on init ---
  aiLoadConfig();
})();

// ─── AI Config ───
function aiLoadConfig(){
  bridgeGET('/api/ai/config',function(d){
    if(d&&d.aiConfig){
      aiCfg=d.aiConfig||aiCfg;
      aiCfg._hasKey=!!d.aiConfig.hasKey;
      aiProviders=d.providers||{};
      // Populate provider dropdown
      var sel=document.getElementById('aiCfgProvider');if(!sel)return;
      sel.innerHTML='';
      for(var k in aiProviders){
        var p=aiProviders[k];
        var o=document.createElement('option');o.value=k;
        o.textContent=p.name+(p.isLocal?' (本地)':'');
        if(k===aiCfg.provider)o.selected=true;
        sel.appendChild(o);
      }
      aiApplyProviderUI(aiCfg.provider);
    }
  });
}
function aiApplyProviderUI(provKey){
  var p=aiProviders[provKey];if(!p)return;
  var ep=document.getElementById('aiCfgEndpoint');
  var model=document.getElementById('aiCfgModel');
  var keyRow=document.getElementById('aiCfgApiKeyRow');
  var keyInput=document.getElementById('aiCfgApiKey');
  if(ep)ep.value=aiCfg.customBaseUrl||p.baseUrl||'';
  if(model)model.value=aiCfg.model||p.defaultModel||'';
  if(keyRow)keyRow.style.display=p.isLocal?'none':'block';
  if(keyInput&&aiCfg._hasKey&&!keyInput.value)keyInput.placeholder='已保存 (留空保持不变)';
}
function showAiConfig(){
  var m=document.getElementById('aiConfigModal');if(m)m.style.display='flex';
  // Refresh dropdown selection
  var sel=document.getElementById('aiCfgProvider');if(sel)sel.value=aiCfg.provider||'local';
  aiApplyProviderUI(aiCfg.provider||'local');
}
function hideAiConfig(){
  var m=document.getElementById('aiConfigModal');if(m)m.style.display='none';
}
function aiProviderChanged(){
  var sel=document.getElementById('aiCfgProvider');
  if(!sel)return;
  aiApplyProviderUI(sel.value);
}
function aiTestConnection(){
  var prov=document.getElementById('aiCfgProvider');
  var model=document.getElementById('aiCfgModel');
  var ep=document.getElementById('aiCfgEndpoint');
  var key=document.getElementById('aiCfgApiKey');
  var s=document.getElementById('aiConfigStatus');if(s){s.textContent='测试中...';s.style.color='var(--text2)';}
  fetch('/api/ai/test_connection',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      provider:prov?prov.value:'',
      model:model?model.value:'',
      customBaseUrl:ep?ep.value:'',
      apiKey:key?key.value:''
    })
  }).then(function(r){return r.json();}).then(function(d){
    var s=document.getElementById('aiConfigStatus');if(!s)return;
    if(d&&d.ok){
      s.textContent='连接成功';s.style.color='var(--success)';
      // 如果后端自动切换了模型，更新输入框
      if(d.currentModel&&model&&model.value!==d.currentModel){
        model.value=d.currentModel;
        s.textContent='连接成功（模型已自动更新为 '+d.currentModel+'）';
      }
    }
    else{s.textContent='连接失败: '+(d&&d.error||'未知错误');s.style.color='var(--danger)';}
  }).catch(function(e){
    var s=document.getElementById('aiConfigStatus');if(!s)return;
    s.textContent='连接失败: '+e.message;s.style.color='var(--danger)';
  });
}
function aiSaveConfig(){
  aiCfg.provider=document.getElementById('aiCfgProvider').value;
  aiCfg.model=document.getElementById('aiCfgModel').value;
  var newKey=document.getElementById('aiCfgApiKey').value;
  if(newKey)aiCfg.apiKey=newKey; // Only update if user entered a new key
  aiCfg.customBaseUrl=document.getElementById('aiCfgEndpoint').value;
  var s=document.getElementById('aiConfigStatus');if(s){s.textContent='保存中...';s.style.color='var(--text2)';}
  fetch('/api/ai/save_config',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      provider:aiCfg.provider,
      model:aiCfg.model,
      customBaseUrl:aiCfg.customBaseUrl,
      apiKey:aiCfg.apiKey
    })
  }).then(function(r){return r.json();}).then(function(d){
    var s=document.getElementById('aiConfigStatus');if(!s)return;
    if(d&&d.ok){s.textContent='已保存';s.style.color='var(--success)';hideAiConfig();}
    else{s.textContent='保存失败';s.style.color='var(--danger)';}
  }).catch(function(e){
    var s=document.getElementById('aiConfigStatus');if(!s)return;
    s.textContent='保存失败: '+e.message;s.style.color='var(--danger)';
  });
}

// ─── Error Modal ───
function showAiError(title,msg){
  var m=document.getElementById('aiErrorModal');if(!m)return;
  document.getElementById('aiErrorTitle').textContent=title||'错误';
  document.getElementById('aiErrorMsg').textContent=msg||'';
  m.style.display='flex';
}
function hideAiError(){
  var m=document.getElementById('aiErrorModal');if(m)m.style.display='none';
}
function copyAiError(){
  var t=document.getElementById('aiErrorMsg');if(!t)return;
  navigator.clipboard.writeText(t.textContent).then(function(){alert('已复制');}).catch(function(){});
}

// ─── G-code File List ───
function aiListGcodeFiles(){
  var sel=document.getElementById('aiOptGcodeSelect');if(!sel)return;
  sel.innerHTML='<option value="">-- 加载中... --</option>';
  bridgeGET('/api/ai/list_gcode',function(d){
    if(!d||!d.ok){sel.innerHTML='<option value="">-- 无文件 --</option>';return;}
    var files=d.files||[];
    sel.innerHTML='<option value="">-- 选择 G-code ('+files.length+') --</option>';
    for(var i=0;i<files.length;i++){
      var f=files[i];
      var name=f.filename||f.name||f;
      var size=f.size?(' ('+(f.size/1024).toFixed(1)+'KB)'):'';
      var fmt=f.format==='bambu'?' [Bambu]':f.format==='orca'?' [Orca]':'';
      var o=document.createElement('option');o.value=name;o.textContent=name+size+fmt;
      sel.appendChild(o);
    }
  });
}

// ─── Source Tab Switching ───
function aiOptSwitchTab(source){
  ['Local','Printer','Upload'].forEach(function(s){
    var btn=document.getElementById('aiOptTab'+s);
    var panel=document.getElementById('aiOpt'+s+'Panel');
    if(btn){
      if(s.toLowerCase()===source){btn.className='ai-opt-tab active';}
      else{btn.className='ai-opt-tab';}
    }
    if(panel){
      if(s.toLowerCase()===source){panel.style.display='flex';}
      else{panel.style.display='none';}
    }
  });
  if(source==='local'){
    var sel=document.getElementById('aiOptGcodeSelect');
    if(!sel||sel.options.length<=1)aiListGcodeFiles();
  }
  if(source==='printer'){
    var sel2=document.getElementById('aiOptPrinterSelect');
    if(!sel2||sel2.options.length<=1)aiOptLoadPrinterFiles();
  }
}

function aiOptLoadPrinterFiles(){
  var sel=document.getElementById('aiOptPrinterSelect');if(!sel)return;
  sel.innerHTML='<option value="">-- 加载中... --</option>';
  bridgeGET('/api/ai/list_printer_gcode',function(d){
    if(!d||!d.ok){
      sel.innerHTML='<option value="">-- 加载失败，点击重试 --</option>';
      return;
    }
    var files=d.files||[];
    sel.innerHTML='<option value="">-- 选择打印机 G-code ('+files.length+') --</option>';
    for(var i=0;i<files.length;i++){
      var f=files[i];
      var o=document.createElement('option');o.value=f.path;o.textContent=f.name+' ('+f.size+')';
      sel.appendChild(o);
    }
  });
}

var _fetchProgressTimer=null;
function aiOptFetchAndPreview(printerPath){
  if(!printerPath)return;
  var left=document.getElementById('aiOptDiffOriginal');
  if(!left)return;
  var info=document.getElementById('aiOptDiffInfo');
  var btn=document.getElementById('aiOptBtn');if(btn){btn.disabled=true;btn.textContent='下载中...';}
  if(info)info.textContent='从打印机下载...';
  // Show progress bar
  left.innerHTML='<div style="text-align:center;padding:40px 20px;">\
<div style="color:var(--text3);margin-bottom:12px;">从打印机下载中...</div>\
<div style="background:var(--border);border-radius:4px;height:8px;max-width:300px;margin:0 auto;overflow:hidden;">\
<div id="aiOptFetchBar" style="background:var(--primary);height:100%;width:0%;transition:width 0.3s;"></div>\
</div>\
<div id="aiOptFetchPct" style="color:var(--text3);font-size:12px;margin-top:6px;">0%</div>\
</div>';
  // Start progress polling
  if(_fetchProgressTimer)clearInterval(_fetchProgressTimer);
  _fetchProgressTimer=setInterval(function(){
    bridgeGET('/api/ai/fetch_printer_gcode_progress',function(p){
      if(!p||!p.ok)return;
      var bar=document.getElementById('aiOptFetchBar');
      var pctEl=document.getElementById('aiOptFetchPct');
      if(p.active&&p.bytesTotal>0){
        var pct=Math.round(p.bytesReceived/p.bytesTotal*100);
        if(bar)bar.style.width=pct+'%';
        if(pctEl)pctEl.textContent=pct+'% ('+Math.round(p.bytesReceived/1024)+'/'+Math.round(p.bytesTotal/1024)+' KB)';
      }else if(p.active){
        if(pctEl)pctEl.textContent=Math.round(p.bytesReceived/1024)+' KB';
      }
    });
  },500);
  // Start download
  bridgeGET('/api/ai/fetch_printer_gcode?path='+encodeURIComponent(printerPath),function(d){
    if(_fetchProgressTimer){clearInterval(_fetchProgressTimer);_fetchProgressTimer=null;}
    if(!d||!d.ok){
      var errMsg=d&&d.error?d.error:'未知错误';
      left.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--danger);">下载失败: '+errMsg+'</div>';
      if(info)info.textContent='下载失败';
      if(btn){btn.disabled=false;btn.textContent='优化';}
      return;
    }
    aiOptLoadOriginal(d.gcode_name);
    if(btn){btn.disabled=false;btn.textContent='优化';}
  });
}

function aiOptUploadFile(input){
  var file=input.files[0];if(!file)return;
  var info=document.getElementById('aiOptUploadInfo');
  var btn=document.getElementById('aiOptBtn');
  if(info){info.style.display='block';info.textContent='上传中...';info.style.color='var(--text2)';}
  if(btn){btn.disabled=true;btn.textContent='上传中...';}
  var formData=new FormData();formData.append('gcode',file);
  var xhr=new XMLHttpRequest();
  xhr.open('POST','/api/ai/upload_gcode');
  xhr.onload=function(){
    try{
      var d=JSON.parse(xhr.responseText);
      if(d&&d.ok){
        aiOptUploadedName=d.gcode_name;
        if(info){info.textContent='已上传: '+file.name;info.style.color='var(--success)';}
        if(btn){btn.disabled=false;btn.textContent='优化';}
        aiOptLoadOriginal(d.gcode_name);
      }else{showAiError('上传失败',d&&d.error||'未知错误');if(btn){btn.disabled=false;btn.textContent='优化';}}
    }catch(e){showAiError('上传失败',e.message);if(btn){btn.disabled=false;btn.textContent='优化';}}
  };
  xhr.onerror=function(){showAiError('上传失败','网络错误');if(btn){btn.disabled=false;btn.textContent='优化';}};
  xhr.send(formData);
  // Reset file input so same file can be re-selected
  input.value='';
}

// ─── G-code Optimize ───
function aiOptimizeGcode(){
  // Check LLM config before optimizing (local providers don't need API key)
  var isLocalProv=aiProviders[aiCfg.provider]&&aiProviders[aiCfg.provider].isLocal;
  if(!isLocalProv&&!aiCfg._hasKey&&!aiCfg.apiKey){showAiError('提示','请先配置 LLM 连接：点击 AI Lab 设置图标，填写 API Key 后保存。');return;}
  var gcodeName=aiOptState.originalGcodeName;
  if(!gcodeName){
    // Try to get from local select
    var sel=document.getElementById('aiOptGcodeSelect');
    if(sel&&sel.value)gcodeName=sel.value;
  }
  if(!gcodeName&&aiOptUploadedName)gcodeName=aiOptUploadedName;
  if(!gcodeName){showAiError('提示','请先选择 G-code 文件');return;}
  aiOptDoOptimize(gcodeName);
}

function aiOptDoOptimize(gcodeName){
  aiOptState.originalGcodeName=gcodeName;
  var btn=document.getElementById('aiOptBtn');if(!btn)return;
  btn.disabled=true;btn.textContent='优化中...';
  var prog=document.getElementById('aiOptProgress');if(prog)prog.style.display='block';
  var res=document.getElementById('aiOptResult');if(res)res.style.display='none';

  var params='?gcode_name='+encodeURIComponent(gcodeName);
  if(aiCfg.provider)params+='&provider='+encodeURIComponent(aiCfg.provider);
  if(aiCfg.customBaseUrl)params+='&customBaseUrl='+encodeURIComponent(aiCfg.customBaseUrl);
  if(aiCfg.model)params+='&model='+encodeURIComponent(aiCfg.model);
  if(aiCfg.apiKey)params+='&api_key='+encodeURIComponent(aiCfg.apiKey);

  bridgeGET('/api/ai/optimize_gcode'+params,function(r){
    if(prog)prog.style.display='none';
    btn.disabled=false;btn.textContent='优化';
    if(!r||!r.ok){
      showAiError('优化失败',r&&r.error||'未知错误');
      return;
    }
    // Show result
    if(res)res.style.display='block';
    var iss=document.getElementById('aiOptIssues');
    var pat=document.getElementById('aiOptPatches');
    var diag=document.getElementById('aiOptDiagnosis');
    var summ=document.getElementById('aiOptSummary');
    var ops=document.getElementById('aiOptOpsList');

    if(iss)iss.textContent=r.issues_found||0;
    if(pat)pat.textContent=r.patches_applied||0;
    if(diag&&r.diagnosis){diag.style.display='block';diag.textContent=r.diagnosis;}
    if(summ&&r.summary){summ.style.display='block';summ.textContent=r.summary;}
    if(ops&&r.applied_operations){
      ops.innerHTML='';
      for(var i=0;i<r.applied_operations.length;i++){
        var op=r.applied_operations[i];var tag=document.createElement('span');
        tag.style.cssText='display:inline-block;padding:1px 8px;border-radius:4px;font-size:10px;background:var(--bg);color:var(--text2);border:1px solid var(--border);';
        tag.textContent=op;ops.appendChild(tag);
      }
    }
    // Download + upload buttons
    if(r.optimized_gcode_name){
      var dl=document.getElementById('aiOptDownload');if(dl){dl.style.display='inline-flex';dl.href='/api/ai/download/'+encodeURIComponent(r.optimized_gcode_name);}
      var upBtn=document.getElementById('aiOptUploadBtn');if(upBtn)upBtn.style.display='inline-flex';
      aiOptState.optimizedGcodeName=r.optimized_gcode_name;
      aiOptLoadOptimized();
    }
  });
}

// ─── G-code Preview & Diff ───
function aiOptLoadOriginal(gcodeName){
  if(!gcodeName)return;
  aiOptState.originalGcodeName=gcodeName;
  var left=document.getElementById('aiOptDiffOriginal');if(!left)return;
  var right=document.getElementById('aiOptDiffOptimized');if(!right)return;
  var info=document.getElementById('aiOptDiffInfo');

  if(info)info.textContent='加载中...';
  left.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text3);">加载中...</div>';
  right.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text3);font-style:italic;">等待优化...</div>';

  bridgeGET('/api/ai/read_gcode?gcode_name='+encodeURIComponent(gcodeName)+'&max_lines=2000',function(d){
    if(!d||!d.ok){
      left.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--danger);">加载失败</div>';
      if(info)info.textContent='加载失败';
      return;
    }
    aiOptOrigLines=d.content.split('\n');
    var html='';
    for(var i=0;i<aiOptOrigLines.length;i++){
      var esc=aiOptOrigLines[i].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      html+='<div class="diff-ctx"><span class="diff-line-num">'+(i+1)+'</span>'+esc+'</div>';
    }
    left.innerHTML=html;
    if(info)info.textContent='原始: '+d.total_lines+' 行 (显示 '+d.shown_lines+' 行)';
  });
}

// ─── LCS Diff Algorithm ───
function aiOptComputeDiff(origLines,optLines){
  var m=origLines.length,n=optLines.length;
  // Fallback: hash-based block diff for very large files (>3000 lines)
  if(m>3000||n>3000){
    return aiOptHashDiff(origLines,optLines);
  }
  // Standard LCS DP
  var dp=[];
  for(var i=0;i<=m;i++){dp[i]=[];for(var j=0;j<=n;j++)dp[i][j]=0;}
  for(var i=1;i<=m;i++){
    for(var j=1;j<=n;j++){
      dp[i][j]=origLines[i-1]===optLines[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
    }
  }
  // Backtrack to produce diff entries
  var entries=[];
  var i=m,j=n;
  while(i>0||j>0){
    if(i>0&&j>0&&origLines[i-1]===optLines[j-1]){
      entries.push({type:'equal',origIdx:i-1,optIdx:j-1});
      i--;j--;
    }else if(j>0&&(i===0||dp[i][j-1]>=dp[i-1][j])){
      entries.push({type:'insert',optIdx:j-1});
      j--;
    }else{
      entries.push({type:'delete',origIdx:i-1});
      i--;
    }
  }
  entries.reverse();
  // Merge consecutive delete+insert at same position into 'change'
  var merged=[];
  for(var k=0;k<entries.length;k++){
    var e=entries[k];
    if(e.type==='delete'&&k+1<entries.length&&entries[k+1].type==='insert'){
      merged.push({type:'change',origIdx:e.origIdx,optIdx:entries[k+1].optIdx});
      k++;
    }else{
      merged.push(e);
    }
  }
  return merged;
}

// Hash-based block diff fallback for large files
function aiOptHashDiff(origLines,optLines){
  var entries=[];
  var m=origLines.length,n=optLines.length;
  var i=0,j=0;
  while(i<m&&j<n){
    if(origLines[i]===optLines[j]){
      entries.push({type:'equal',origIdx:i,optIdx:j});
      i++;j++;
    }else{
      // Look ahead for match in next few lines
      var foundO=-1,foundN=-1;
      for(var scan=1;scan<=20;scan++){
        if(i+scan<m&&origLines[i+scan]===optLines[j]){foundO=scan;break;}
        if(j+scan<n&&origLines[i]===optLines[j+scan]){foundN=scan;break;}
      }
      if(foundO>0&&foundN>0){
        // Both sides have match; emit the shorter skip as deletes/inserts
        if(foundO<=foundN){
          for(var s=0;s<foundO;s++)entries.push({type:'delete',origIdx:i+s});
          i+=foundO;
        }else{
          for(var s=0;s<foundN;s++)entries.push({type:'insert',optIdx:j+s});
          j+=foundN;
        }
      }else if(foundO>0){
        for(var s=0;s<foundO;s++)entries.push({type:'delete',origIdx:i+s});
        i+=foundO;
      }else if(foundN>0){
        for(var s=0;s<foundN;s++)entries.push({type:'insert',optIdx:j+s});
        j+=foundN;
      }else{
        entries.push({type:'change',origIdx:i,optIdx:j});
        i++;j++;
      }
    }
  }
  while(i<m){entries.push({type:'delete',origIdx:i});i++;}
  while(j<n){entries.push({type:'insert',optIdx:j});j++;}
  return entries;
}

function aiOptLoadOptimized(){
  var optName=aiOptState.optimizedGcodeName;if(!optName)return;
  var left=document.getElementById('aiOptDiffOriginal');if(!left)return;
  var right=document.getElementById('aiOptDiffOptimized');if(!right)return;
  var info=document.getElementById('aiOptDiffInfo');

  if(info)info.textContent='加载优化结果...';
  bridgeGET('/api/ai/read_gcode?gcode_name='+encodeURIComponent(optName)+'&max_lines=2000',function(d){
    if(!d||!d.ok){
      right.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--danger);">加载失败</div>';
      return;
    }
    var optLines=d.content.split('\n');
    var diffEntries=aiOptComputeDiff(aiOptOrigLines,optLines);

    // Count diff types
    var insertCount=0,deleteCount=0,changeCount=0;
    for(var k=0;k<diffEntries.length;k++){
      var t=diffEntries[k].type;
      if(t==='insert')insertCount++;
      else if(t==='delete')deleteCount++;
      else if(t==='change')changeCount++;
    }
    var totalChanges=insertCount+deleteCount+changeCount;

    // Render both sides from diff entries
    var origHtml='',optHtml='';
    var origLineNum=0,optLineNum=0;
    for(var k=0;k<diffEntries.length;k++){
      var e=diffEntries[k];
      if(e.type==='equal'){
        origLineNum=e.origIdx+1;optLineNum=e.optIdx+1;
        var escO=aiOptOrigLines[e.origIdx].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        var escN=optLines[e.optIdx].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        origHtml+='<div class="diff-ctx"><span class="diff-line-num">'+origLineNum+'</span>'+escO+'</div>';
        optHtml+='<div class="diff-ctx"><span class="diff-line-num">'+optLineNum+'</span>'+escN+'</div>';
      }else if(e.type==='delete'){
        origLineNum=e.origIdx+1;
        var escO=aiOptOrigLines[e.origIdx].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        origHtml+='<div class="diff-del"><span class="diff-line-num">'+origLineNum+'</span>'+escO+'</div>';
        optHtml+='<div class="diff-ctx"><span class="diff-line-num"></span></div>';
      }else if(e.type==='insert'){
        optLineNum=e.optIdx+1;
        var escN=optLines[e.optIdx].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        origHtml+='<div class="diff-ctx"><span class="diff-line-num"></span></div>';
        optHtml+='<div class="diff-add"><span class="diff-line-num">'+optLineNum+'</span>'+escN+'</div>';
      }else if(e.type==='change'){
        origLineNum=e.origIdx+1;optLineNum=e.optIdx+1;
        var escO=aiOptOrigLines[e.origIdx].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        var escN=optLines[e.optIdx].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        origHtml+='<div class="diff-del"><span class="diff-line-num">'+origLineNum+'</span>'+escO+'</div>';
        optHtml+='<div class="diff-add"><span class="diff-line-num">'+optLineNum+'</span>'+escN+'</div>';
      }
    }
    left.innerHTML=origHtml;
    right.innerHTML=optHtml;
    if(info)info.textContent='差异: '+totalChanges+' 处 ('+insertCount+' 新增, '+deleteCount+' 删除, '+changeCount+' 修改) | 原始 '+aiOptOrigLines.length+' → 优化后 '+optLines.length;
    aiOptSetupSyncScroll();
  });
}

function aiOptSetupSyncScroll(){
  var left=document.getElementById('aiOptDiffOriginal');if(!left)return;
  var right=document.getElementById('aiOptDiffOptimized');if(!right)return;
  var syncing=false;
  left.onscroll=function(){
    if(syncing)return;syncing=true;
    try{
      var ratio=(left.scrollHeight-left.clientHeight)||1;
      right.scrollTop=Math.round(left.scrollTop*(right.scrollHeight-right.clientHeight)/ratio);
    }finally{syncing=false;}
  };
  right.onscroll=function(){
    if(syncing)return;syncing=true;
    try{
      var ratio=(right.scrollHeight-right.clientHeight)||1;
      left.scrollTop=Math.round(right.scrollTop*(left.scrollHeight-left.clientHeight)/ratio);
    }finally{syncing=false;}
  };
}

function aiOptUploadToPrinter(){
  if(!aiOptState.optimizedGcodeName)return;
  var btn=document.getElementById('aiOptUploadBtn');if(!btn)return;
  btn.disabled=true;btn.textContent='上传中...';
  bridgeGET('/api/ai/upload_to_printer?gcode_name='+encodeURIComponent(aiOptState.optimizedGcodeName),function(d){
    btn.disabled=false;btn.textContent='上传到打印机';
    if(!d||!d.ok){showAiError('上传失败',d&&d.error||'未知错误');return;}
    var rs=document.getElementById('aiOptUploadResult');if(!rs)return;
    rs.style.display='block';rs.textContent='上传成功: '+d.path;
  });
}

function aiOpenGcodeFolder(){
  bridgeGET('/api/ai/open_gcode_folder',function(d){
    if(!d||!d.ok){showAiError('打开文件夹失败',d&&d.error||'未知错误');return;}
  });
}

function aiNewProject(){
  aiOptUploadedName=null;
  aiOptState={originalGcodeName:null,optimizedGcodeName:null};
  aiOptOrigLines=[];
  var prog=document.getElementById('aiOptProgress');if(prog)prog.style.display='none';
  var res=document.getElementById('aiOptResult');if(res)res.style.display='none';
  var btn=document.getElementById('aiOptBtn');if(btn){btn.disabled=false;btn.textContent='优化';}
  var info=document.getElementById('aiOptUploadInfo');if(info)info.style.display='none';
  var dl=document.getElementById('aiOptDownload');if(dl)dl.style.display='none';
  var upBtn=document.getElementById('aiOptUploadBtn');if(upBtn)upBtn.style.display='none';
  var upRes=document.getElementById('aiOptUploadResult');if(upRes)upRes.style.display='none';
  var left=document.getElementById('aiOptDiffOriginal');if(left)left.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text3);">选择 G-code 文件后在此预览</div>';
  var right=document.getElementById('aiOptDiffOptimized');if(right)right.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text3);font-style:italic;">优化后在此显示</div>';
  var diffInfo=document.getElementById('aiOptDiffInfo');if(diffInfo)diffInfo.textContent='';
}

// ─── Print QA Chat ───
function toggleQaPopup(){
  var p=document.getElementById('qaPopup');if(!p)return;
  p.style.display=p.style.display==='none'?'flex':'none';
}

function aiClearQA(){
  aiQAHistory=[];
  var hist=document.getElementById('qaHistory');if(!hist)return;
  hist.innerHTML='<div class="qa-msg ai"><div class="qa-avatar">AI</div><div class="qa-bubble">你好！我是 3D 打印助手，帮你解答 FDM 打印问题。请问有什么可以帮你的？</div></div>';
}

function aiSendQuestion(){
  var input=document.getElementById('qaInput');if(!input||!input.value.trim())return;
  // Check LLM config before sending (local providers don't need API key)
  var isLocalProv=aiProviders[aiCfg.provider]&&aiProviders[aiCfg.provider].isLocal;
  if(!isLocalProv&&!aiCfg._hasKey&&!aiCfg.apiKey){
    var noKeyMsg='请先配置 LLM 连接：点击 AI Lab 设置图标，填写 API Key 后保存。';
    var hist=document.getElementById('qaHistory');if(hist){
      hist.innerHTML+=aiRenderChatMessage('user',input.value.trim());
      hist.innerHTML+=aiRenderChatMessage('ai',noKeyMsg);
      hist.scrollTop=hist.scrollHeight;
    }
    input.value='';
    return;
  }
  var q=input.value.trim();input.value='';input.disabled=true;
  var btn=document.getElementById('qaSendBtn');if(btn)btn.disabled=true;
  var hist=document.getElementById('qaHistory');if(!hist)return;

  // Add user message
  aiQAHistory.push({role:'user',content:q});
  hist.innerHTML+=aiRenderChatMessage('user',q);
  // Add typing indicator
  var typingId='qaTyping'+Date.now();
  hist.innerHTML+='<div class="qa-msg ai" id="'+typingId+'"><div class="qa-avatar">AI</div><div class="qa-bubble"><div class="qa-typing"><span></span><span></span><span></span></div></div></div>';
  hist.scrollTop=hist.scrollHeight;

  // Build context from history
  var ctx=aiQAHistory.filter(function(m){return m.role==='user';}).slice(-3).map(function(m){return m.content;}).join('\n');

  bridgeGET('/api/ai/print_qa?question='+encodeURIComponent(q)+'&context='+encodeURIComponent(ctx)+'&provider='+encodeURIComponent(aiCfg.provider||'')+'&customBaseUrl='+encodeURIComponent(aiCfg.customBaseUrl||'')+'&model='+encodeURIComponent(aiCfg.model||''),function(d){
    var typing=document.getElementById(typingId);if(typing)typing.remove();
    input.disabled=false;
    if(btn)btn.disabled=false;
    input.focus();

    if(!d||!d.ok){
      var errMsg=d&&d.error||'抱歉，无法连接 AI 服务，请检查配置。';
      aiQAHistory.push({role:'ai',content:errMsg});
      hist.innerHTML+=aiRenderChatMessage('ai',errMsg);
    }else{
      var reply=d.answer||d.response||(d.text||'');
      if(!reply)reply='AI 返回了空响应，请重试。';
      aiQAHistory.push({role:'ai',content:reply});
      hist.innerHTML+=aiRenderChatMessage('ai',reply);
    }
    hist.scrollTop=hist.scrollHeight;
  });
}

function aiRenderChatMessage(role,content){
  var isUser=role==='user';
  var cls=isUser?'user':'ai';
  var label=isUser?'你':'AI';
  var html=content
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```([\s\S]*?)```/g,function(m,code){return '<pre><code>'+code.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')+'</code></pre>';})
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^### (.+)$/gm,'<div style="font-size:14px;font-weight:700;margin:8px 0 4px;">$1</div>')
    .replace(/^## (.+)$/gm,'<div style="font-size:15px;font-weight:700;margin:10px 0 4px;">$1</div>')
    .replace(/^# (.+)$/gm,'<div style="font-weight:700;margin:8px 0 4px;">$1</div>')
    .replace(/^(\d+)\.\s+(.+)$/gm,'<div style="padding-left:16px;text-indent:-16px;margin:2px 0;">$1. $2</div>')
    .replace(/^[•\-*]\s+(.+)$/gm,'<div style="padding-left:14px;text-indent:-14px;margin:2px 0;">&bull; $1</div>')
    .replace(/\n{2,}/g,'<div style="height:6px;"></div>')
    .replace(/\n/g,'<br>');
  return '<div class="qa-msg '+cls+'"><div class="qa-avatar">'+label+'</div><div class="qa-bubble">'+html+'</div></div>';
}
