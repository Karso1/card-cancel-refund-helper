(() => {
  'use strict';
  if (document.getElementById('card-cancel-refund-helper')) return;
  const all = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = e => (e?.textContent || '').replace(/\s+/g, '').trim();
  const visible = e => !!e?.isConnected && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const enabled = e => visible(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && !/disabled|loading/.test(e.className || '');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const dialogs = () => all('.ant-modal-content,.el-dialog,[role="dialog"]').filter(visible);
  const refundDialog = () => dialogs().find(e => txt(e).includes('发起退款'));
  function button(root, label) {
    if (!root) return null;
    const controls = 'button,a,[role="button"],.ant-btn,.el-button,input[type="button"],input[type="submit"]';
    const matches = e => (e.matches('input') ? e.value : txt(e)) === label;
    const usable = e => enabled(e) && !e.closest('[disabled],[aria-disabled="true"],.ant-btn-loading,.el-button.is-loading,.is-disabled');
    const standard = all(controls, root).find(e => matches(e) && usable(e));
    if (standard) return standard;
    // Custom components often render a div/span with a delegated click handler.
    // Restrict fallback to the refund dialog and an exact, leaf-most label.
    if (label !== '确定' || !txt(root).includes('发起退款')) return null;
    const candidates = all('div,span', root).filter(e => matches(e) && usable(e)
      && !all('div,span', e).some(child => matches(child) && visible(child)));
    if (candidates.length !== 1) return null;
    const leaf = candidates[0];
    const control = leaf.closest(controls);
    return control && root.contains(control) ? (usable(control) ? control : null) : leaf;
  }
  // Accept truncation or decimal half-up rounding; avoid floating-point errors.
  function normalizeAmount(value, round = false) {
    const text = String(value ?? '').trim();
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const [integer, fraction = ''] = text.split('.');
    if (!/[1-9]/.test(text)) return null;
    let cents = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
    if (round && (fraction[2] || '0') >= '5') cents += 1n;
    return String(cents / 100n) + '.' + String(cents % 100n).padStart(2, '0');
  }
  function refundAmounts(dialog) {
    if (!dialog || !txt(dialog).includes('退款金额(卡片)') && !txt(dialog).includes('退款金额（卡片）')) return null;
    const inputs = all('input', dialog).filter(e => visible(e) && ['text','number',''].includes(e.type));
    // This refund form has exactly two amount fields; ambiguous forms must stop.
    if (inputs.length !== 2) return null;
    const upper = normalizeAmount(inputs[0].value);
    const lower = normalizeAmount(inputs[1].value);
    const roundedUpper = normalizeAmount(inputs[0].value, true);
    return upper && lower && (upper === lower || roundedUpper === lower) ? lower : null;
  }
  async function waitForAmounts(dialog) {
    const openedAt = Date.now();
    let last = null, stableSince = Date.now();
    return until(() => {
      if (notices.some(e => e.error)) return {error: '退款弹窗报错：' + notices.find(e => e.error).message};
      if (refundDialog() !== dialog) throw new Error('退款弹窗发生变化，未提交');
      const amount = loading() ? null : refundAmounts(dialog);
      if (!amount || amount !== last) { last = amount; stableSince = Date.now(); }
      return amount && Date.now() - openedAt >= 1000 && Date.now() - stableSince >= 1000
        && button(dialog, '确定') ? {amount, control:button(dialog, '确定')} : null;
    }, 20000);
  }
  function rows() {
    const result = new Map();
    for (const row of all('tbody tr')) {
      if (!visible(row) || !isListTable(row.closest('table'))) continue;
      const action = button(row, '退款');
      const cells = all('td', row);
      const key = txt(cells[0]);
      if (action && /^\d+$/.test(key) && cells.length >= 3) result.set(key, {key, action});
    }
    return [...result.values()];
  }
  const isListTable = e => !!e && visible(e) && txt(e.querySelector('thead')).includes('销卡时所属代理商');
  const onList = () => /\/cardManage\/cardCancelList(?:[?&#/]|$)/i.test(location.hash) && all('table').some(isListTable);
  const host = document.createElement('aside');
  host.id = 'card-cancel-refund-helper';
  host.style.cssText = 'position:fixed;left:16px;bottom:20px;z-index:2147483647;width:290px';
  const ui = host.attachShadow({mode:'closed'});
  ui.innerHTML = `<style>
    section{font:14px/1.6 system-ui;color:#172033;background:white;padding:16px;border:1px solid #ccd4e0;border-radius:12px;box-shadow:0 6px 28px #0003}
    h3{flex:1;margin:0;font-size:16px;cursor:move;touch-action:none;user-select:none}p{margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere}small{color:#64748b}
    button{background:#2563eb;color:white;border:0;border-radius:6px;padding:8px 10px;margin:5px 3px 0 0;cursor:pointer}button:disabled{opacity:.45}#stop{background:#dc2626}#export{background:#64748b}
    header{display:flex;align-items:center;gap:12px}#content{margin-top:8px}#content[hidden]{display:none}#toggle{margin:0;padding:0;width:25px;height:25px;line-height:25px;font-size:20px;flex-shrink:0}
    #status{background:#f1f5f9;padding:8px;border-radius:6px}
    </style><section><header><h3 title="按住这里拖动面板">销卡管理列表</h3><button id="toggle" type="button" aria-label="折叠窗口" aria-expanded="true" aria-controls="content" title="折叠窗口">−</button></header><div id="content"><small>自动遍历全部页：退款 → 确定。使用默认金额，处理当前筛选的全部页。</small>
    <p id="status">请在“注销成功，未退款”列表点击开始。</p><small id="count">尚未处理</small><p id="reasons" style="max-height:120px;overflow:auto;font-size:12px;color:#64748b" hidden></p><br>
    <button id="start">开始自动处理</button><button id="stop" disabled>停止</button><button id="export">导出日志</button></div></section>`;
  document.body.appendChild(host);
  const $ = id => ui.getElementById(id);
  const positionKey = 'card-cancel-refund-helper-position-v1';
  function place(x, y) {
    const rect = host.getBoundingClientRect();
    host.style.bottom = 'auto';
    host.style.left = Math.max(0, Math.min(x, innerWidth - rect.width)) + 'px';
    host.style.top = Math.max(0, Math.min(y, innerHeight - rect.height)) + 'px';
  }
  function savePosition() {
    const rect = host.getBoundingClientRect();
    try { localStorage.setItem(positionKey, JSON.stringify({x:rect.x,y:rect.y})); } catch {}
  }
  try {
    const saved = JSON.parse(localStorage.getItem(positionKey));
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) place(saved.x, saved.y);
  } catch {}
  const collapsedKey = 'card-cancel-refund-helper-collapsed-v1';
  function setCollapsed(collapsed) {
    const rect = host.getBoundingClientRect();
    $('content').hidden = collapsed;
    $('toggle').textContent = collapsed ? '+' : '−';
    $('toggle').setAttribute('aria-expanded', String(!collapsed));
    $('toggle').setAttribute('aria-label', collapsed ? '展开窗口' : '折叠窗口');
    $('toggle').title = collapsed ? '展开窗口' : '折叠窗口';
    place(rect.x, rect.y);
  }
  try { setCollapsed(localStorage.getItem(collapsedKey) === 'true'); } catch {}
  $('toggle').onclick = () => {
    const collapsed = !$('content').hidden;
    setCollapsed(collapsed);
    savePosition();
    try { localStorage.setItem(collapsedKey, String(collapsed)); } catch {}
  };
  const handle = ui.querySelector('h3');
  let drag = null;
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    drag = {id:event.pointerId,dx:event.clientX-rect.x,dy:event.clientY-rect.y};
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) place(event.clientX-drag.dx, event.clientY-drag.dy);
  });
  function endDrag(event) {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    savePosition();
  }
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('lostpointercapture', endDrag);
  addEventListener('resize', () => {
    if (host.hidden) return;
    const rect = host.getBoundingClientRect();
    place(rect.x,rect.y); savePosition();
  });
  const status = message => { $('status').textContent = message; };
  const logs = [], attempted = new Set();
  let running = false, stopped = false, route = '', notices = [], watching = false;
  const noticeState = new WeakMap();
  const noticeSelector = '.ant-message-notice-content,.ant-notification-notice,.el-message,.el-notification,.ant-form-item-explain-error,.el-form-item__error,[role="alert"]';
  function scanNotices() {
    for (const node of all(noticeSelector).filter(visible)) {
      const message = txt(node);
      if (noticeState.get(node) === message) continue;
      noticeState.set(node, message);
      if (!watching || !message) continue;
      const error = !!node.querySelector('.anticon-close-circle,.ant-message-error,.el-icon-error') || node.matches('.el-message--error,.ant-form-item-explain-error,.el-form-item__error') || /失败|错误|异常|不足|不允许|无法|超限|超过|请填写|必填|不能|无权限|error|failed/i.test(message);
      const success = !error && (!!node.querySelector('.anticon-check-circle,.ant-message-success') || node.matches('.el-message--success') || /成功/.test(message));
      if (error || success) notices.push({error, success, message});
    }
  }
  new MutationObserver(scanNotices).observe(document.body, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','style']});
  function check() {
    if (stopped || location.href !== route) throw new Error('STOP');
  }
  async function until(fn, timeout = 12000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      check(); scanNotices();
      const value = fn();
      if (value) return value;
      await sleep(150);
    }
    return null;
  }
  function record(key, outcome, detail, reason = detail) {
    logs.push({time:new Date().toISOString(), id:key, outcome, detail, reason});
    $('count').textContent = `成功 ${logs.filter(e=>e.outcome==='成功').length} · 跳过 ${logs.filter(e=>e.outcome==='跳过').length} · 待核实 ${logs.filter(e=>e.outcome==='待核实').length}`;
    const counts = new Map();
    for (const entry of logs.filter(e => e.outcome !== '成功')) counts.set(entry.reason, (counts.get(entry.reason) || 0) + 1);
    $('reasons').hidden = counts.size === 0;
    $('reasons').textContent = '跳过 / 待核实原因：\n' + [...counts].map(([reason, count]) => `${reason}：${count} 笔`).join('\n');
  }
  function amountDetails(dialog) {
    return all('input', dialog).filter(e => visible(e) && ['text','number',''].includes(e.type)).map(e => e.value || '(空)').join(' / ');
  }
  async function closeRefund() {
    const dialog = refundDialog();
    if (!dialog) return true;
    const close = button(dialog, '取消') || all('.ant-modal-close,.el-dialog__headerbtn,button[aria-label="Close"],button[aria-label="关闭"]', dialog).find(enabled);
    if (!close) return false;
    check(); close.click();
    return !!await until(() => !refundDialog(), 3500);
  }
  // Pure scheduler: drain replacement rows before advancing; rescan after mutations.
  function chooseAction(items, seen, page, hasNext, passWork) {
    const row = items.find(item => !seen.has(item.key));
    if (row) return {type:'process', row};
    if (hasNext) return {type:'next'};
    if (page > 1 && passWork > 0) return {type:'rewind'};
    return {type:'done'};
  }
  function pagination() {
    const table = all('table').find(isListTable);
    // Limit pagination to the table's nearest container when possible.
    let container = table?.parentElement;
    let pagers = [];
    while (container && !pagers.length) {
      pagers = all('.ant-pagination,.el-pagination', container).filter(visible);
      container = container.parentElement;
    }
    if (pagers.length > 1) throw new Error('识别到多个分页区域，已停止，请检查');
    const pager = pagers[0];
    if (!pager) throw new Error('未识别到分页控件，已停止，不能确认全部处理完成');
    const active = pager.querySelector('.ant-pagination-item-active,.el-pager .active,.el-pager .is-active');
    const page = Number(txt(active));
    if (!Number.isInteger(page) || page < 1) throw new Error('无法读取当前页码，已停止');
    const next = pager.querySelector('.ant-pagination-next,.btn-next');
    const prev = pager.querySelector('.ant-pagination-prev,.btn-prev');
    const available = node => enabled(node) && !node.querySelector('button:disabled,[aria-disabled="true"]');
    if (!next || !prev) throw new Error('无法识别上一页或下一页，已停止');
    return {page, next, prev, hasNext:available(next), hasPrev:available(prev)};
  }
  function loading() {
    return all('.ant-spin-spinning,.el-loading-mask,[aria-busy="true"]').some(visible);
  }
  async function settle() {
    let last = '', stableSince = Date.now();
    const ready = await until(() => {
      const signature = rows().map(e=>e.key).join(',');
      if (loading() || signature !== last) { last = signature; stableSince = Date.now(); }
      return !loading() && Date.now() - stableSince >= 1200;
    }, 15000);
    if (!ready) throw new Error('列表加载超时，已停止');
  }
  async function movePage(direction) {
    check();
    const before = pagination();
    if (direction === 'prev' ? !before.hasPrev : !before.hasNext) throw new Error('分页按钮不可用，已停止');
    const oldRows = rows().map(e=>e.key).join(',');
    const control = before[direction];
    const target = control.querySelector('button,a') || control;
    check(); target.click();
    const changed = await until(() => {
      const after = pagination();
      return after.page !== before.page && !loading() && rows().map(e=>e.key).join(',') !== oldRows;
    }, 15000);
    if (!changed) throw new Error('翻页后未检测到新列表，已停止，避免误处理旧页面');
    await settle();
  }
  async function firstPage() {
    while (pagination().page > 1) {
      check();
      await movePage('prev');
    }
  }
  async function run() {
    if (running) return;
    if (!onList()) return status('未识别到退款列表及“退款”按钮，请打开销卡管理列表。');
    if (dialogs().length) return status('请先关闭已打开的弹窗，再开始。');
    running = true; stopped = false; route = location.href;
    $('start').disabled = true; $('stop').disabled = false;
    let current = null, submitted = false, passWork = 0;
    try {
      await settle();
      await firstPage();
      while (true) {
        check();
        await settle();
        const state = pagination();
        const decision = chooseAction(rows(), attempted, state.page, state.hasNext, passWork);
        if (decision.type === 'done') break;
        if (decision.type === 'next') {
          status(`第 ${state.page} 页已处理，正在翻页……`);
          await movePage('next');
          continue;
        }
        if (decision.type === 'rewind') {
          status('正在从第一页复查，补处理列表缩短后移动的记录……');
          await firstPage(); passWork = 0;
          continue;
        }
        const row = decision.row, key = row.key;
        passWork++;
        if (dialogs().length) throw new Error('出现其他弹窗，已停止，请手动检查');
        current = key; submitted = false; attempted.add(key);
        notices = []; watching = false; scanNotices(); watching = true;
        status(`正在处理 ID ${key}：打开退款……`);
        row.action.click();
        const opened = await until(() => refundDialog() || notices.find(e => e.error));
        if (!opened || !refundDialog()) {
          record(key,'跳过',notices.find(e=>e.error)?.message || '未出现发起退款弹窗');
          current = null;
          if (opened?.error) {
            watching = false; await sleep(900); continue;
          }
          // An unexplained delayed dialog could belong to the previous order.
          throw new Error('退款弹窗未正常打开，已停止；请检查后再次开始');
        }
        status(`正在处理 ID ${key}：等待上下金额加载并核对至小数后两位……`);
        const dialog = refundDialog();
        const ready = await waitForAmounts(dialog);
        if (!ready || ready.error) {
          const reason = ready?.error || '金额为空、为零、前两位小数不一致或未稳定（等待20秒）';
          record(key, '跳过', reason + '；上下原始金额：' + amountDetails(dialog), reason);
          current = null;
          if (!await closeRefund()) throw new Error('无法关闭异常退款弹窗，已停止');
          watching = false;
          continue;
        }
        const agree = ready.control;
        notices = []; watching = false; scanNotices(); watching = true;
        status(`正在处理 ID ${key}：点击确定……`);
        check();
        if (!onList() || dialogs().some(d => !d.contains(agree))) throw new Error('页面或弹窗发生变化，已停止');
        if (refundDialog() !== dialog || loading() || refundAmounts(dialog) !== ready.amount || !enabled(agree)) throw new Error('提交前金额或按钮状态变化，已停止，未点确定');
        submitted = true; agree.click();
        const outcome = await until(() => notices.find(e=>e.error) || (notices.some(e=>e.success) && !refundDialog() ? {success:true} : null));
        if (outcome?.error) record(key,'跳过',outcome.message);
        else if (outcome?.success) record(key,'成功','已检测到成功提示且退款弹窗关闭');
        else {
          record(key,'待核实','未检测到明确成功提示；不重试此记录');
          current = null;
          // Do not retry this ID; close its dialog before continuing below.
        }
        current = null;
        if (!await closeRefund()) throw new Error('无法关闭退款弹窗，已停止');
        watching = false;
        await sleep(900);
      }
      status('全部页面处理结束。报错及待核实记录已跳过，可导出日志查看。');
    } catch (error) {
      if (current) record(current,submitted?'待核实':'跳过',submitted?'已点确定后停止，请人工核实结果':'已停止，未点确定');
      status(error.message === 'STOP' ? '已停止。已发出的提交不会撤回；未确认结果请查看日志。' : error.message);
    } finally {
      watching = false; running = false;
      $('start').disabled = false; $('stop').disabled = true;
    }
  }
  $('start').onclick = run;
  $('stop').onclick = () => { stopped = true; status('正在停止……'); };
  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify(logs,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = '发起退款日志.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  setInterval(() => { host.hidden = !running && !onList() && !refundDialog(); },1000);
})();
