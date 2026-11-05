/* DSH 下载进度浮窗
 * 固定右上角起步、可拖动、位置记在 localStorage、只在有活跃下载时出现。
 * 数据来自同插件提供的 /dsh-download/status（服务端按文件增长算速度）。
 */
(function () {
  if (window.__DSH_DL_INDICATOR__) return
  window.__DSH_DL_INDICATOR__ = true

  var POLL_MS = 2000
  var HIDE_AFTER_EMPTY = 2      // 连续几次空结果后隐藏，避免抖动
  var POS_KEY = 'dsh-dl-indicator-pos-v1'
  var DRAG_THRESHOLD = 3        // 超过这个位移才算拖动，避免误触

  var el = null
  var emptyStreak = 0
  var visible = false
  var dragging = false
  var dragMoved = false
  var startX = 0, startY = 0, startLeft = 0, startTop = 0

  function fmtBytes(n) {
    if (!n || n < 0) return '0 B'
    var u = ['B', 'KB', 'MB', 'GB', 'TB']
    var i = 0
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
    return (i === 0 ? n.toFixed(0) : n.toFixed(n < 10 ? 2 : 1)) + ' ' + u[i]
  }

  function fmtSpeed(bps) {
    if (!bps || bps <= 0) return '—'
    return fmtBytes(bps) + '/s'
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    })
  }

  function shortName(n) {
    if (n.length <= 34) return n
    var ext = ''
    var dot = n.lastIndexOf('.')
    if (dot > 0 && n.length - dot <= 12) ext = n.slice(dot)
    return n.slice(0, 30 - ext.length) + '…' + ext
  }

  // ── 位置持久化 ────────────────────────────────────────────────
  function loadPos() {
    try {
      var raw = localStorage.getItem(POS_KEY)
      if (!raw) return null
      var p = JSON.parse(raw)
      if (!p || typeof p.left !== 'number' || typeof p.top !== 'number') return null
      return p
    } catch (e) { return null }
  }

  function savePos() {
    if (!el) return
    try {
      var r = el.getBoundingClientRect()
      localStorage.setItem(POS_KEY, JSON.stringify({
        left: Math.round(r.left),
        top: Math.round(r.top)
      }))
    } catch (e) {}
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

  /** 贴到保存的位置；超界的会被拉回可见区域 */
  function applyPos() {
    if (!el) return
    var p = loadPos()
    var w = el.offsetWidth || 260
    var h = el.offsetHeight || 80
    if (!p) {
      el.style.left = 'auto'
      el.style.right = '18px'
      el.style.top = '56px'
      return
    }
    el.style.right = 'auto'
    el.style.left = clamp(p.left, 4, Math.max(4, window.innerWidth - w - 4)) + 'px'
    el.style.top = clamp(p.top, 4, Math.max(4, window.innerHeight - h - 4)) + 'px'
  }

  // ── 拖动 ──────────────────────────────────────────────────────
  function onDown(e) {
    if (e.button !== 0) return
    var r = el.getBoundingClientRect()
    dragging = true
    dragMoved = false
    startX = e.clientX
    startY = e.clientY
    startLeft = r.left
    startTop = r.top
    el.style.cursor = 'grabbing'
    el.style.transition = 'none'   // 拖动时关掉过渡，否则跟手会飘
    e.preventDefault()
  }

  function onMove(e) {
    if (!dragging) return
    var dx = e.clientX - startX
    var dy = e.clientY - startY
    if (!dragMoved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
    dragMoved = true
    var w = el.offsetWidth, h = el.offsetHeight
    el.style.right = 'auto'
    el.style.left = clamp(startLeft + dx, 4, Math.max(4, window.innerWidth - w - 4)) + 'px'
    el.style.top = clamp(startTop + dy, 4, Math.max(4, window.innerHeight - h - 4)) + 'px'
  }

  function onUp() {
    if (!dragging) return
    dragging = false
    if (el) {
      el.style.cursor = 'grab'
      el.style.transition = 'opacity .22s ease, transform .22s ease'
    }
    if (dragMoved) savePos()
  }

  window.addEventListener('resize', function () { if (visible && !dragging) applyPos() })

  // ── 构建 ──────────────────────────────────────────────────────
  function build() {
    if (el) return el
    el = document.createElement('div')
    el.id = 'dsh-dl-indicator'
    // pointer-events 必须是 auto，否则收不到 mousedown、拖不动
    el.style.cssText = [
      'position:fixed', 'right:18px', 'top:56px', 'z-index:2147483000',
      'min-width:230px', 'max-width:340px',
      'padding:10px 12px',
      'border-radius:12px',
      'background:rgba(24,26,32,0.62)',
      '-webkit-backdrop-filter:blur(14px) saturate(140%)',
      'backdrop-filter:blur(14px) saturate(140%)',
      'border:1px solid rgba(255,255,255,0.12)',
      'box-shadow:0 8px 28px rgba(0,0,0,0.38)',
      'color:#e8eaed',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'font-size:11.5px', 'line-height:1.45',
      'pointer-events:auto',
      'cursor:grab',
      'user-select:none', '-webkit-user-select:none',
      'opacity:0', 'transform:translateY(-6px)',
      'transition:opacity .22s ease, transform .22s ease',
      'display:none'
    ].join(';')
    el.addEventListener('mousedown', onDown)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.appendChild(el)
    applyPos()
    return el
  }

  function render(items) {
    var box = build()
    if (!items || !items.length) {
      if (visible) {
        emptyStreak++
        if (emptyStreak >= HIDE_AFTER_EMPTY) {
          visible = false
          box.style.opacity = '0'
          box.style.transform = 'translateY(-6px)'
          setTimeout(function () { if (!visible) box.style.display = 'none' }, 240)
        }
      }
      return
    }
    emptyStreak = 0
    if (dragging) return   // 拖动过程中不重绘

    var totalSpeed = 0
    var rows = items.map(function (it) {
      totalSpeed += (it.speed || 0)
      var pct = it.total > 0 ? Math.max(0, Math.min(100, it.percent)) : -1
      var bar = pct >= 0
        ? '<div style="height:3px;border-radius:2px;background:rgba(255,255,255,0.13);overflow:hidden;margin:4px 0 3px">' +
          '<div style="height:100%;width:' + pct.toFixed(1) + '%;border-radius:2px;' +
          'background:linear-gradient(90deg,#4f8cff,#7ad0ff);transition:width .5s ease"></div></div>'
        : '<div style="height:3px;border-radius:2px;background:rgba(255,255,255,0.08);overflow:hidden;margin:4px 0 3px">' +
          '<div style="height:100%;width:100%;background:linear-gradient(90deg,rgba(79,140,255,.55),rgba(122,208,255,.55));' +
          'animation:dsh-dl-slide 1.4s linear infinite"></div></div>'
      var meta = []
      if (pct >= 0) {
        meta.push(pct.toFixed(1) + '%')
        meta.push(fmtBytes(it.size) + ' / ' + fmtBytes(it.total))
      } else {
        meta.push(fmtBytes(it.size))
      }
      meta.push(fmtSpeed(it.speed))
      return '<div style="margin-top:6px">' +
        '<div style="color:#cfd4dc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' +
        esc(it.name) + '">' + esc(shortName(it.name)) + '</div>' + bar +
        '<div style="color:#8f97a3;font-size:10.5px">' + meta.join(' · ') + '</div></div>'
    }).join('')

    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;color:#9fb4d4;font-size:10.5px;' +
      'letter-spacing:.04em;text-transform:uppercase">' +
      '<span style="width:6px;height:6px;border-radius:50%;background:#4fd18b;' +
      'box-shadow:0 0 7px #4fd18b;animation:dsh-dl-pulse 1.3s ease-in-out infinite"></span>' +
      'downloading' +
      '<span style="margin-left:auto;color:#7ad0ff;font-size:10.5px;text-transform:none">' +
      fmtSpeed(totalSpeed) + '</span></div>' + rows

    if (!visible) {
      visible = true
      box.style.display = 'block'
      applyPos()            // 首次出现时按保存的位置摆好
      void box.offsetHeight
      box.style.opacity = '1'
      box.style.transform = 'translateY(0)'
    }
  }

  function injectKeyframes() {
    if (document.getElementById('dsh-dl-kf')) return
    var st = document.createElement('style')
    st.id = 'dsh-dl-kf'
    st.textContent =
      '@keyframes dsh-dl-slide{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}' +
      '@keyframes dsh-dl-pulse{0%,100%{opacity:1}50%{opacity:.35}}'
    document.head.appendChild(st)
  }

  function poll() {
    fetch('/dsh-download/status', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (d) { if (d) render(d.active) })
      .catch(function () { /* 路由不在就静默 */ })
      .then(function () { setTimeout(poll, POLL_MS) })
  }

  function start() {
    if (!document.body) { setTimeout(start, 200); return }
    injectKeyframes()
    poll()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
})()
