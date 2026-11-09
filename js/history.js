/* ==========================================================
   历史记录（按功能页独立）
   - 存储键由当前页面文件名决定，各功能互不干扰
   - 每条记录保存输入快照与结果摘要，最多保留 20 条
   - 面板自动挂到主列的末尾；支持回填并重算、单条删除、整体清空
   - 只保存在本机浏览器（localStorage），不上传任何内容
   ========================================================== */

var NCHistory = (function () {
  var LIMIT = 20;

  // 页面标识：文件名去掉 .html，例如 “常微分方程”“线性方程组”
  var pageKey = (function () {
    var name = location.pathname.split("/").pop() || "index.html";
    var plain = name.replace(/\.html?$/i, "");
    try { plain = decodeURIComponent(plain); } catch (e) { /* 保持原样 */ }
    return plain || "index";
  })();

  var storeKey = "ncHistory:" + pageKey;

  // localStorage 不可用时（隐私模式等）退回内存，至少本次会话内可用
  var memory = [];
  var drawerEl = null;
  var listEl = null;
  var badgeEl = null;

  // 失败提示也会写进结果区，这类文本不进历史
  var ERROR_HINT = /(请|无法|失败|错误|必须|不能|没有|不可信|超出|过大|未求得|提醒|已被|呵呵)/;

  function readStore() {
    try {
      var raw = localStorage.getItem(storeKey);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Object.prototype.toString.call(data) === "[object Array]" ? data : [];
    } catch (e) {
      return memory.slice();
    }
  }

  function writeStore(list) {
    memory = list.slice();
    try { localStorage.setItem(storeKey, JSON.stringify(list)); } catch (e) { /* 存不下就只留内存 */ }
  }

  /* ---------- 记录内容 ---------- */

  // 结果区纯文本：优先 #result，符号计算页用 #solution
  function resultText() {
    var el = document.getElementById("result") || document.getElementById("solution");
    if (!el) return "";
    var html = el.innerHTML || "";
    var text = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "");
    return text.replace(/\u00a0/g, " ").trim();
  }

  function firstLine(text, max) {
    var line = (text.split("\n")[0] || "").trim();
    return line.length > max ? line.substring(0, max - 1) + "…" : line;
  }

  // 可见输入框的当前值（隐藏字段不存，避免把别的算法的参数记进来）
  function snapshot() {
    var nodes = document.querySelectorAll("input[type=text], input[type=number], textarea");
    var list = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.id || el.offsetParent === null) continue;
      list.push({ id: el.id, v: el.value });
    }
    return list;
  }

  function summarize(inputs) {
    var parts = [];
    for (var i = 0; i < inputs.length && parts.length < 3; i++) {
      var value = (inputs[i].v || "").trim();
      if (!value) continue;

      var el = document.getElementById(inputs[i].id);
      var label = "";
      if (el && typeof getFieldLabel === "function") label = getFieldLabel(el);
      if (!label) label = inputs[i].id;

      parts.push(label + " " + value);
    }

    var text = parts.join(" · ");
    if (!text) text = "（未填写输入）";
    return text.length > 80 ? text.substring(0, 79) + "…" : text;
  }

  function record() {
    var text = resultText();
    if (!text) return;
    if (ERROR_HINT.test(firstLine(text, 40))) return;

    var inputs = snapshot();
    var entry = {
      t: Date.now(),
      s: summarize(inputs),
      r: firstLine(text, 60),
      d: text.length > 300 ? text.substring(0, 300) : text,
      i: inputs
    };

    var list = readStore();
    // 同样的输入与结果（例如回填后重算）只刷新时间，不重复堆叠
    if (list.length && list[0].s === entry.s && list[0].d === entry.d) {
      list[0].t = entry.t;
    } else {
      list.unshift(entry);
      if (list.length > LIMIT) list.length = LIMIT;
    }

    writeStore(list);
    render();
  }

  function removeAt(index) {
    var list = readStore();
    if (index < 0 || index >= list.length) return;
    list.splice(index, 1);
    writeStore(list);
    render();
  }

  function clearAll() {
    writeStore([]);
    render();
    if (typeof showToast === "function") showToast("历史记录已清空");
  }

  function fillAt(index) {
    var entry = readStore()[index];
    if (!entry || !entry.i) return;

    for (var i = 0; i < entry.i.length; i++) {
      var el = document.getElementById(entry.i[i].id);
      if (el && "value" in el) el.value = entry.i[i].v;
    }

    if (typeof syncEcho === "function") syncEcho();

    // 主按钮里就是本页的计算函数，直接触发一次
    var btn = document.querySelector(".btn-primary");
    var onclick = btn ? btn.getAttribute("onclick") || "" : "";
    var match = /^\s*([A-Za-z_$][\w$]*)\s*\(\s*\)/.exec(onclick);

    if (match && typeof window[match[1]] === "function") {
      window[match[1]]();
      if (typeof showToast === "function") showToast("已回填并重新计算");
    } else if (typeof showToast === "function") {
      showToast("已回填输入");
    }

    // 回填后收起抽屉，直接看结果
    closeDrawer();
  }

  /* ---------- 渲染 ---------- */

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatTime(ms) {
    var d = new Date(ms);
    var now = new Date();
    var hm = pad(d.getHours()) + ":" + pad(d.getMinutes());

    var sameDay = d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) return hm;

    var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    var isYesterday = d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate();
    if (isYesterday) return "昨天 " + hm;

    return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + hm;
  }

  function itemNode(entry, index) {
    var wrap = document.createElement("article");
    wrap.className = "history-item";
    wrap.setAttribute("data-index", String(index));

    var head = document.createElement("div");
    head.className = "history-head";

    var time = document.createElement("span");
    time.className = "history-time";
    time.textContent = formatTime(entry.t);

    var result = document.createElement("span");
    result.className = "history-result";
    result.textContent = entry.r || "—";

    head.appendChild(time);
    head.appendChild(result);

    var summary = document.createElement("p");
    summary.className = "history-summary";
    summary.textContent = entry.s || "（未记录输入）";

    var ops = document.createElement("div");
    ops.className = "history-ops";

    var fillBtn = document.createElement("button");
    fillBtn.type = "button";
    fillBtn.className = "history-btn";
    fillBtn.setAttribute("data-act", "fill");
    fillBtn.textContent = "回填并重算";

    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "history-btn history-btn-ghost";
    delBtn.setAttribute("data-act", "delete");
    delBtn.textContent = "删除";

    ops.appendChild(fillBtn);
    ops.appendChild(delBtn);

    wrap.appendChild(head);
    wrap.appendChild(summary);
    wrap.appendChild(ops);
    return wrap;
  }

  function render() {
    updateBadge();
    if (!listEl) return;
    var list = readStore();

    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

    if (!list.length) {
      var empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "还没有记录。计算一次后，这里会保存本次的输入与结果。";
      listEl.appendChild(empty);
      return;
    }

    for (var i = 0; i < list.length; i++) listEl.appendChild(itemNode(list[i], i));
  }

  /* ---------- 挂载 ---------- */

  function onListClick(event) {
    var btn = event.target.closest ? event.target.closest(".history-btn") : null;
    if (!btn || !listEl.contains(btn)) return;

    var item = btn.closest(".history-item");
    if (!item) return;

    var index = Number(item.getAttribute("data-index"));
    var act = btn.getAttribute("data-act");

    if (act === "delete") removeAt(index);
    else if (act === "fill") fillAt(index);
  }

  function openDrawer() {
    if (!drawerEl) mount();
    if (!drawerEl) return;

    // display 直接改一份，避免个别浏览器里 class 切换没生效
    drawerEl.style.display = "block";
    drawerEl.classList.add("open");
    drawerEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("history-open");
    render();
  }

  function closeDrawer() {
    if (!drawerEl) return;
    drawerEl.style.display = "none";
    drawerEl.classList.remove("open");
    drawerEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("history-open");
  }

  function updateBadge() {
    if (!badgeEl) return;
    var count = readStore().length;
    badgeEl.textContent = count ? String(count) : "";
    badgeEl.style.display = count ? "" : "none";
  }

  /* 顶栏右上角的「历史」按钮 */
  function buildToggle() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "back-btn history-toggle";
    btn.setAttribute("aria-label", "查看历史记录");
    btn.setAttribute("aria-expanded", "false");

    var text = document.createElement("span");
    text.textContent = "历史";

    var badge = document.createElement("span");
    badge.className = "history-count";

    btn.appendChild(text);
    btn.appendChild(badge);

    // 用 onclick 属性而不是 addEventListener：部分手机 WebView 里更稳，
    // 且重复绑定也只会保留最后一次
    btn.onclick = function (event) {
      if (event && event.preventDefault) event.preventDefault();
      if (drawerEl && drawerEl.classList.contains("open")) closeDrawer();
      else openDrawer();
    };

    return { btn: btn, badge: badge };
  }

  /* 右侧抽屉：遮罩 + 面板 */
  function buildDrawer() {
    var drawer = document.createElement("div");
    drawer.className = "history-drawer";
    drawer.setAttribute("aria-hidden", "true");

    var mask = document.createElement("div");
    mask.className = "history-mask";

    var panel = document.createElement("aside");
    panel.className = "history-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "历史记录");

    var head = document.createElement("div");
    head.className = "history-panel-head";

    var title = document.createElement("h2");
    title.className = "history-panel-title";
    title.textContent = "历史记录";

    var ops = document.createElement("div");
    ops.className = "history-panel-ops";

    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "history-panel-btn";
    clearBtn.textContent = "清空";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "history-panel-btn history-panel-close";
    closeBtn.setAttribute("aria-label", "关闭历史记录");
    closeBtn.textContent = "✕";

    ops.appendChild(clearBtn);
    ops.appendChild(closeBtn);

    head.appendChild(title);
    head.appendChild(ops);

    var note = document.createElement("p");
    note.className = "card-note history-note";
    note.textContent = "只保存在本机浏览器，最多 20 条；本页的记录与其它功能分开存放。";

    var list = document.createElement("div");
    list.className = "history-list";

    panel.appendChild(head);
    panel.appendChild(note);
    panel.appendChild(list);
    drawer.appendChild(mask);
    drawer.appendChild(panel);

    clearBtn.addEventListener("click", clearAll);
    closeBtn.addEventListener("click", closeDrawer);
    mask.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeDrawer();
    });

    return { drawer: drawer, list: list };
  }

  function mount() {
    if (drawerEl) return;

    var parts = buildDrawer();
    document.body.appendChild(parts.drawer);
    drawerEl = parts.drawer;
    listEl = parts.list;
    listEl.addEventListener("click", onListClick);

    var bar = document.querySelector(".topbar-inner") || document.querySelector(".topbar");
    var existed = bar ? bar.querySelector(".history-toggle") : null;

    if (existed) {
      badgeEl = existed.querySelector(".history-count");
    } else {
      var toggle = buildToggle();
      badgeEl = toggle.badge;

      if (bar) {
        bar.appendChild(toggle.btn);
      } else {
        // 没有顶栏的页面：按钮固定在右上角
        toggle.btn.classList.add("history-toggle-floating");
        document.body.appendChild(toggle.btn);
      }
    }

    render();
    updateBadge();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  return {
    key: pageKey,
    record: record,
    clear: clearAll,
    open: openDrawer,
    close: closeDrawer,
    mount: mount,
    refresh: render
  };
})();
