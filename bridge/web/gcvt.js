// ============================================================
// G-code Convert — BambuStudio → OrcaSlicer Compatible
// Injected into webui.html #gcvt-content
// ============================================================

// ─── State ───
var gcvtState={originalGcodeName:null,convertedGcodeName:null};
var gcvtUploadedName=null;
var _gcvtInited=false;

// ─── HTML Injection (runs on load) ───
(function initGcvt(){
  var ct=document.getElementById('gcvt-content');
  if(!ct)return;
  ct.innerHTML='\
<div style="display:flex;flex-direction:column;width:100%;height:100%;">\
\
<!-- Header bar / Toolbar -->\
<div class="panel" style="margin-bottom:0;border-radius:0;border-bottom:1px solid var(--border);flex-shrink:0;">\
<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;flex-wrap:wrap;">\
\
<!-- Feature title -->\
<span style="font-size:14px;font-weight:600;color:var(--text);white-space:nowrap;">G-code 转换</span>\
<div style="width:1px;height:20px;background:var(--border);flex-shrink:0;"></div>\
\
<!-- Source tabs -->\
<div style="display:flex;gap:2px;">\
<button class="ai-opt-tab active" id="gcvtTabLocal" onclick="gcvtSwitchTab(\'local\')">本地文件</button>\
<button class="ai-opt-tab" id="gcvtTabUpload" onclick="gcvtSwitchTab(\'upload\')">上传</button>\
</div>\
\
<!-- Local file selector -->\
<div id="gcvtLocalPanel" style="display:flex;align-items:center;margin-left:8px;">\
<select id="gcvtGcodeSelect" onchange="if(this.value)gcvtLoadOriginal(this.value)" style="height:32px;border:1px solid var(--border);border-radius:6px;padding:0 8px;font-size:13px;background:var(--panel);color:var(--text);min-width:160px;">\
<option value="">-- 选择 G-code --</option></select>\
</div>\
\
<!-- Upload panel -->\
<div id="gcvtUploadPanel" style="display:none;align-items:center;gap:6px;margin-left:8px;">\
<button onclick="document.getElementById(\'gcvtFileInput\').click()" style="height:32px;padding:0 12px;border:1px dashed var(--border);border-radius:6px;background:var(--panel);color:var(--text2);cursor:pointer;font-size:12px;">选择文件</button>\
<input type="file" id="gcvtFileInput" accept=".gcode,.gco" style="display:none" onchange="gcvtUploadFile(this)">\
<span id="gcvtUploadInfo" style="display:none;font-size:12px;color:var(--success);"></span>\
</div>\
\
<span class="spacer" style="flex:1;"></span>\
\
<!-- Actions -->\
<button onclick="gcvtConvert()" class="ai-btn ai-btn-primary" id="gcvtBtn" style="padding:5px 14px;font-size:13px;">转换</button>\
<button onclick="gcvtOpenFolder()" class="ai-btn ai-btn-outline" style="font-size:12px;padding:4px 10px;" title="打开 G-code 文件夹">\
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>文件夹</button>\
</div>\
</div>\
\
<!-- Info banner -->\
<div style="padding:8px 16px;background:rgba(33,150,243,.06);border-bottom:1px solid rgba(33,150,243,.12);flex-shrink:0;font-size:12px;color:var(--text2);line-height:1.6;">\
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>\
将 <strong>BambuStudio + Snapmaker U1</strong> 生成的 G-code 转换为 <strong>OrcaSlicer U1</strong> 兼容格式，使 U1 设备触摸面板能识别并直接打印。主要转换：层标记 <code>; FEATURE:</code> → <code>;TYPE:</code>、重组文件结构、替换启动流程。\
</div>\
\
<!-- Convert result bar -->\
<div id="gcvtResult" style="display:none;padding:6px 16px;background:rgba(76,175,80,.06);border-bottom:1px solid rgba(76,175,80,.15);flex-shrink:0;">\
<div style="display:flex;align-items:center;gap:14px;font-size:12px;flex-wrap:wrap;">\
<span style="color:var(--success);font-weight:600;">转换完成</span>\
<span id="gcvtInfo" style="color:var(--text2);"></span>\
<span style="flex:1;min-width:8px;"></span>\
<span id="gcvtConversions" style="display:flex;gap:6px;flex-wrap:wrap;"></span>\
<a id="gcvtDownload" style="display:none;font-size:11px;padding:3px 10px;" class="ai-btn ai-btn-outline" download>下载</a>\
<button id="gcvtUploadBtn" style="display:none;font-size:11px;padding:3px 10px;" onclick="gcvtUploadToPrinter()" class="ai-btn ai-btn-primary">上传到打印机</button>\
</div>\
</div>\
\
<!-- Left-Right G-code panels -->\
<div style="flex:1;display:flex;overflow:hidden;min-height:0;">\
<!-- Left: Original -->\
<div style="flex:1;display:flex;flex-direction:column;min-width:0;border-right:1px solid var(--border);">\
<div style="padding:5px 12px;font-size:11px;font-weight:600;color:var(--text3);background:var(--panel2);border-bottom:1px solid var(--border);flex-shrink:0;">BambuStudio G-code</div>\
<div id="gcvtDiffOriginal" style="flex:1;overflow:auto;padding:6px 10px;font-size:11px;font-family:Cascadia Code,Consolas,monospace;line-height:1.55;white-space:pre;word-break:break-all;background:var(--bg);">\
<div style="text-align:center;padding:40px 20px;color:var(--text3);">选择 BambuStudio G-code 文件后在此预览</div></div>\
</div>\
<!-- Right: Converted -->\
<div style="flex:1;display:flex;flex-direction:column;min-width:0;">\
<div style="padding:5px 12px;font-size:11px;font-weight:600;color:var(--text3);background:var(--panel2);border-bottom:1px solid var(--border);flex-shrink:0;">OrcaSlicer 兼容 G-code</div>\
<div id="gcvtDiffConverted" style="flex:1;overflow:auto;padding:6px 10px;font-size:11px;font-family:Cascadia Code,Consolas,monospace;line-height:1.55;white-space:pre;word-break:break-all;background:var(--bg);font-style:italic;">\
<div style="text-align:center;padding:40px 20px;color:var(--text3);">转换后在此显示</div></div>\
</div>\
</div>\
</div>';
})();

// ─── Init (called by switchTab) ───
function gcvtInit(){
  if(_gcvtInited)return;
  _gcvtInited=true;
  gcvtListFiles();
}

// ─── Source Tab Switching ───
function gcvtSwitchTab(source){
  ['Local','Upload'].forEach(function(s){
    var btn=document.getElementById('gcvtTab'+s);
    var panel=document.getElementById('gcvt'+s+'Panel');
    if(btn){
      btn.className=s.toLowerCase()===source?'ai-opt-tab active':'ai-opt-tab';
    }
    if(panel){
      panel.style.display=s.toLowerCase()===source?'flex':'none';
    }
  });
  if(source==='local'){
    var sel=document.getElementById('gcvtGcodeSelect');
    if(!sel||sel.options.length<=1)gcvtListFiles();
  }
}

// ─── List Files ───
function gcvtListFiles(){
  var sel=document.getElementById('gcvtGcodeSelect');if(!sel)return;
  sel.innerHTML='<option value="">-- 加载中... --</option>';
  bridgeGET('/api/ai/list_gcode',function(d){
    if(!d||!d.ok){
      sel.innerHTML='<option value="">-- 加载失败 --</option>';
      return;
    }
    var files=d.files||[];
    sel.innerHTML='<option value="">-- 选择 G-code ('+files.length+') --</option>';
    for(var i=0;i<files.length;i++){
      var f=files[i];
      var fname=f.filename||f.name;
      var fsize=f.size?(f.size/1024).toFixed(1)+'KB':'';
      var fmt=f.format==='bambu'?' [Bambu]':f.format==='orca'?' [Orca]':'';
      var o=document.createElement('option');o.value=fname;o.textContent=fname+' ('+fsize+')'+fmt;
      sel.appendChild(o);
    }
  });
}

// ─── Load Original Preview ───
function gcvtLoadOriginal(gcodeName){
  gcvtState.originalGcodeName=gcodeName;
  gcvtState.convertedGcodeName=null;
  var left=document.getElementById('gcvtDiffOriginal');
  var right=document.getElementById('gcvtDiffConverted');
  if(left)left.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--primary);">加载中...</div>';
  if(right)right.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text3);">转换后在此显示</div>';
  bridgeGET('/api/ai/read_gcode?gcode_name='+encodeURIComponent(gcodeName)+'&max_lines=200',function(d){
    if(!d||!d.ok){
      if(left)left.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--danger);">加载失败: '+(d&&d.error||'未知错误')+'</div>';
      return;
    }
    if(left)left.textContent=d.content||'';
  });
}

// ─── Upload File ───
function gcvtUploadFile(input){
  if(!input.files||!input.files[0])return;
  var file=input.files[0];
  var info=document.getElementById('gcvtUploadInfo');
  var fd=new FormData();fd.append('gcode',file);
  fetch('/api/ai/upload_gcode',{method:'POST',body:fd}).then(function(r){return r.json();}).then(function(d){
    if(d&&d.ok){
      gcvtUploadedName=d.gcode_name||d.name;
      gcvtState.originalGcodeName=d.gcode_name||d.name;
      if(info){info.textContent=file.name+' 已上传';info.style.display='inline';}
      gcvtLoadOriginal(d.gcode_name||d.name);
    } else {
      if(info){info.textContent='上传失败: '+(d&&d.error||'未知错误');info.style.color='var(--danger)';info.style.display='inline';}
    }
  }).catch(function(e){
    if(info){info.textContent='上传失败';info.style.color='var(--danger)';info.style.display='inline';}
  });
  input.value='';
}

// ─── Execute Conversion ───
function gcvtConvert(){
  var gcodeName=gcvtState.originalGcodeName;
  if(!gcodeName){
    alert('请先选择一个 G-code 文件');
    return;
  }
  var resultBar=document.getElementById('gcvtResult');
  if(resultBar){resultBar.style.display='none';resultBar.dataset.show='none';}
  var btn=document.getElementById('gcvtBtn');
  if(btn){btn.disabled=true;btn.textContent='转换中...';}

  bridgeGET('/api/ai/convert_gcode?gcode_name='+encodeURIComponent(gcodeName),function(d){
    if(btn){btn.disabled=false;btn.textContent='转换';}
    if(!d||!d.ok){
      alert('G-code 转换失败: '+(d&&d.error||'未知错误'));
      return;
    }
    gcvtState.convertedGcodeName=d.converted_gcode_name;

    // Show result bar
    var info=document.getElementById('gcvtInfo');
    if(info){
      var inf=d.info||{};
      info.innerHTML='喷头: <b style="color:var(--primary);">'+inf.hotend_temp+'°C</b> 热床: <b style="color:var(--primary);">'+inf.bed_temp+'°C</b> 工具: <b>T'+inf.first_tool+'</b> 层数: <b>'+inf.total_layers+'</b>';
    }
    var convs=document.getElementById('gcvtConversions');
    if(convs&&d.conversions){
      var html='';
      var c=d.conversions;
      if(c.exec_block)html+='<span class="ai-tag">EXEC</span>';
      if(c.start_gcode)html+='<span class="ai-tag">Start</span>';
      if(c.end_gcode)html+='<span class="ai-tag">End</span>';
      if(c.layout)html+='<span class="ai-tag">布局</span>';
      convs.innerHTML=html;
    }
    // Download link
    var dl=document.getElementById('gcvtDownload');
    if(dl&&d.converted_gcode_name){
      dl.href='/api/ai/download_gcode?gcode_name='+encodeURIComponent(d.converted_gcode_name);
      dl.download=d.converted_gcode_name;dl.style.display='inline-block';
    }
    // Upload to printer button
    var upBtn=document.getElementById('gcvtUploadBtn');
    if(upBtn)upBtn.style.display='inline-block';

    if(resultBar){resultBar.style.display='block';resultBar.dataset.show='block';}

    // Load converted preview
    var right=document.getElementById('gcvtDiffConverted');
    if(right)right.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--primary);">加载中...</div>';
    bridgeGET('/api/ai/read_gcode?gcode_name='+encodeURIComponent(d.converted_gcode_name)+'&max_lines=200',function(d2){
      if(d2&&d2.ok&&right){
        right.textContent=d2.content||'';
        right.style.fontStyle='normal';
      }
    });
  });
}

// ─── Upload to Printer ───
function gcvtUploadToPrinter(){
  var gcodeName=gcvtState.convertedGcodeName;
  if(!gcodeName)return;
  var btn=document.getElementById('gcvtUploadBtn');
  if(btn){btn.disabled=true;btn.textContent='上传中...';}
  bridgeGET('/api/ai/upload_to_printer?gcode_name='+encodeURIComponent(gcodeName),function(d){
    if(btn){btn.disabled=false;btn.textContent='上传到打印机';}
    if(d&&d.ok){
      if(btn)btn.textContent='已上传';
    } else {
      alert('上传到打印机失败: '+(d&&d.error||'未知错误'));
    }
  });
}

// ─── Open G-code Folder ───
function gcvtOpenFolder(){
  bridgeGET('/api/ai/open_gcode_folder',function(d){
    if(!d||!d.ok){alert('打开文件夹失败: '+(d&&d.error||'未知错误'));}
  });
}
