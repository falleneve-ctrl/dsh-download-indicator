import fs from 'node:fs'
import path from 'node:path'

// ── 配置 ──────────────────────────────────────────────────────────────
// 监控哪些目录、关心哪些扩展名、多大的文件才算「下载」
// 用环境变量 DSH_DOWNLOAD_WATCH 可以覆盖目录（分号分隔）
const DIRS = String(process.env.DSH_DOWNLOAD_WATCH || '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)
const DEFAULT_DIRS = [
  'F:\\ComfyUI\\models',
  'F:\\training\\downloads',
]
const WATCH_DIRS = DIRS.length ? DIRS : DEFAULT_DIRS

const EXTS = new Set([
  '.safetensors', '.gguf', '.whl', '.zip', '.tar', '.gz', '.xz', '.zst',
  '.mp4', '.bin', '.pth', '.ckpt', '.7z', '.rar', '.onnx', '.pt',
])
const MIN_SIZE = 20 * 1024 * 1024   // 20 MB 以下不关心
const MAX_DEPTH = 3
const ACTIVE_WINDOW_MS = 6000       // 采样间隔超过这个就当过期
const MIN_GROWTH = 128 * 1024       // 至少涨 128KB 才算在下载

// 已知目标总大小：命中就显示百分比。键是文件名（小写）
// 这是可选的——没有匹配时只显示已下载量和速度，不影响使用
const KNOWN_TOTALS = new Map(Object.entries({
  'qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors': 15680000000,
  'minimax_h3_fl2va_pruned_w6a8.safetensors': 15980000000,
  'minimax_h3_video_vae_int8_convrot.safetensors': 2810000000,
  'minimax_h3_audio_vae_fp32.safetensors': 610000000,
  'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors': 1960000000,
  'minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors': 1960000000,
  'torch-2.11.0+cu130-cp312-cp312-win_amd64.whl': 1915200000,
  'mossrefinedrealism_v20_bf16.safetensors': 10164695272,
}))

// ── 采样 ──────────────────────────────────────────────────────────────
// 上一次看到的 size，用来算速度
const lastSeen = new Map()   // absPath -> { size, ts }
// 每个文件的最近速度样本（做平滑，避免一次抖动就跳）
const speedHist = new Map()  // absPath -> number[]

function listFiles(dir, depth = 0, out = []) {
  if (depth > MAX_DEPTH) return out
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      // 跳过明显无关的目录，减少扫描开销
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '__pycache__') continue
      listFiles(full, depth + 1, out)
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase()
      if (!EXTS.has(ext)) continue
      try {
        const st = fs.statSync(full)
        if (st.size >= MIN_SIZE) {
          out.push({ abs: full, name: e.name, size: st.size, mtime: st.mtimeMs })
        }
      } catch { /* 文件可能正在被写/删除，忽略 */ }
    }
  }
  return out
}

/** 采样一次，返回活跃下载列表 */
function sample() {
  const now = Date.now()
  const files = []
  for (const d of WATCH_DIRS) listFiles(d, 0, files)

  const active = []
  for (const f of files) {
    const prev = lastSeen.get(f.abs)
    lastSeen.set(f.abs, { size: f.size, ts: now })
    if (!prev) continue
    const dt = (now - prev.ts) / 1000
    if (dt <= 0) continue
    const delta = f.size - prev.size
    // 只在采样间隔不太长、且有实际增长时才算速度
    if (dt > ACTIVE_WINDOW_MS / 1000) continue

    const inst = delta > 0 ? delta / dt : 0
    // 平滑：保留最近 3 次
    const hist = speedHist.get(f.abs) || []
    hist.push(inst)
    while (hist.length > 3) hist.shift()
    speedHist.set(f.abs, hist)
    const speed = hist.reduce((a, b) => a + b, 0) / hist.length

    if (delta >= MIN_GROWTH) {
      const total = KNOWN_TOTALS.get(f.name.toLowerCase()) || 0
      active.push({
        name: f.name,
        size: f.size,
        total,
        percent: total > 0 ? Math.min(100, (f.size / total) * 100) : 0,
        speed,
        dir: path.dirname(f.abs),
      })
    }
  }

  // 清理掉已经很久没出现的记录，防止 Map 无限增长
  for (const [k, v] of lastSeen) {
    if (now - v.ts > 120000) { lastSeen.delete(k); speedHist.delete(k) }
  }

  active.sort((a, b) => b.speed - a.speed)
  return { ts: now, active }
}

// ── 路由 ──────────────────────────────────────────────────────────────
const PACKAGE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')

function readWidgetJs() {
  try {
    return fs.readFileSync(path.join(PACKAGE_ROOT, 'assets', 'widget.js'), 'utf8')
  } catch {
    return ''
  }
}

const BOOT_TEXT =
  '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
  'if(window.__DSH_DL_INDICATOR__)return;var s=document.createElement("script");' +
  's.src="/dsh-download/widget.js";s.onerror=function(){};d.appendChild(s)}catch(e){}})()'

export default {
  name: 'dsh-download-indicator',
  apply(root) {
    const rowDisposers = []
    root.effect(() => () => { for (const d of rowDisposers) { try { d() } catch {} } })

    // ① 桌面端唯一生效的注入通道：结构化内联 script 行
    //    （用内联行而不是 script-src 行，否则路由万一不在会 reject 整个 boot）
    rowDisposers.push(root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        for (const row of table) {
          if (!row) continue
          if (row.kind === 'script-src' && row.src === '/dsh-download/widget.js') return
          if (row.kind === 'script' && typeof row.text === 'string'
            && row.text.indexOf('/dsh-download/widget.js') >= 0) return
        }
        table.push({ kind: 'script', placement: 'body', text: BOOT_TEXT })
      } catch {}
    }))

    // ② 路由要等 webServer 就绪
    root.inject(['webServer'], (ctx) => {
      const disposers = []

      const register = (route) => {
        try {
          return ctx.webServer.register(route)
        } catch {
          return () => {}
        }
      }

      disposers.push(register({
        kind: 'exact',
        path: '/dsh-download/status',
        handler: async (req, res) => {
          try {
            const data = sample()
            const body = JSON.stringify(data)
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
              'Content-Length': String(Buffer.byteLength(body)),
            })
            res.end(body)
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ ts: Date.now(), active: [], error: String(err && err.message || err) }))
          }
        },
      }))

      disposers.push(register({
        kind: 'exact',
        path: '/dsh-download/widget.js',
        handler: (req, res) => {
          try {
            const js = readWidgetJs()
            res.writeHead(200, {
              'Content-Type': 'application/javascript; charset=utf-8',
              'Cache-Control': 'no-store',
              'Content-Length': String(Buffer.byteLength(js)),
            })
            res.end(js)
          } catch {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('widget unavailable')
          }
        },
      }))

      root.effect(() => () => {
        for (const d of disposers) { try { d() } catch {} }
      })
    })
  },
}
