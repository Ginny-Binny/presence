const vscode = require('vscode')
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')

let timer = null
let statusBar = null

function readWakatimeCfg() {
  const cfgPath = path.join(os.homedir(), '.wakatime.cfg')
  try {
    const text = fs.readFileSync(cfgPath, 'utf8')
    const apiUrl = text.match(/api_url\s*=\s*(.+)/)?.[1]?.trim()
    const apiKey = text.match(/api_key\s*=\s*(.+)/)?.[1]?.trim()
    if (!apiUrl || !apiKey) return null
    return { apiUrl, apiKey }
  } catch {
    return null
  }
}

function getLanguageFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
    '.ts': 'TypeScript', '.tsx': 'TypeScript',
    '.py': 'Python', '.pyw': 'Python',
    '.go': 'Go',
    '.rs': 'Rust',
    '.php': 'PHP',
    '.rb': 'Ruby',
    '.java': 'Java',
    '.kt': 'Kotlin', '.kts': 'Kotlin',
    '.swift': 'Swift',
    '.c': 'C', '.h': 'C',
    '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.hpp': 'C++',
    '.cs': 'C#',
    '.html': 'HTML', '.htm': 'HTML',
    '.css': 'CSS', '.scss': 'SCSS', '.sass': 'Sass', '.less': 'Less',
    '.json': 'JSON',
    '.xml': 'XML',
    '.yaml': 'YAML', '.yml': 'YAML',
    '.toml': 'TOML',
    '.md': 'Markdown', '.mdx': 'Markdown',
    '.sql': 'SQL',
    '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell',
    '.ps1': 'PowerShell',
    '.dart': 'Dart',
    '.lua': 'Lua',
    '.r': 'R',
    '.vue': 'Vue',
    '.svelte': 'Svelte',
    '.dockerfile': 'Docker',
    '.graphql': 'GraphQL', '.gql': 'GraphQL',
    '.env': 'Ini',
    '.ini': 'Ini',
    '.cfg': 'Ini',
    '.txt': 'Text',
    '.csv': 'CSV',
  }
  return map[ext] || vscode.window.activeTextEditor?.document.languageId || 'Unknown'
}

function getProjectName() {
  const folders = vscode.workspace.workspaceFolders
  if (!folders || folders.length === 0) return 'unknown'
  return folders[0].name
}

function sendHeartbeat(cfg) {
  const editor = vscode.window.activeTextEditor
  if (!editor) return

  const filePath = editor.document.uri.fsPath
  const language = getLanguageFromExt(filePath)
  const project = getProjectName()

  const body = JSON.stringify({
    entity: filePath,
    type: 'file',
    time: Date.now() / 1000,
    project,
    language,
    is_write: false,
    category: 'coding',
    editor: 'VS Code',
    operating_system: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
    machine: os.hostname(),
  })

  const url = new URL(cfg.apiUrl.replace(/\/$/, '') + '/users/current/heartbeats')
  const auth = 'Basic ' + Buffer.from(cfg.apiKey).toString('base64')

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'Content-Length': Buffer.byteLength(body),
    },
  }

  const transport = url.protocol === 'https:' ? https : http
  const req = transport.request(options, (res) => {
    // Drain the response so the socket frees up.
    res.resume()
    if (res.statusCode >= 400) {
      console.log(`[presence-tracker] heartbeat ${res.statusCode}`)
    }
  })
  req.on('error', (err) => {
    console.log(`[presence-tracker] heartbeat error: ${err.message}`)
  })
  req.write(body)
  req.end()

  if (statusBar) {
    statusBar.text = `$(pulse) ${language}`
    statusBar.tooltip = `Presence Tracker: ${project} — ${language}`
  }
}

function activate(context) {
  const cfg = readWakatimeCfg()
  if (!cfg) {
    vscode.window.showWarningMessage('Presence Tracker: no .wakatime.cfg found with api_url and api_key')
    return
  }

  const intervalSec = vscode.workspace.getConfiguration('presenceTracker').get('intervalSeconds', 60)

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0)
  statusBar.text = '$(pulse) Presence'
  statusBar.tooltip = 'Presence Tracker active'
  statusBar.show()
  context.subscriptions.push(statusBar)

  // Send first heartbeat immediately, then every N seconds.
  sendHeartbeat(cfg)
  timer = setInterval(() => sendHeartbeat(cfg), intervalSec * 1000)

  // Also send on file focus change so language/project switches register instantly.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => sendHeartbeat(cfg))
  )

  console.log(`[presence-tracker] active — sending heartbeats every ${intervalSec}s to ${cfg.apiUrl}`)
}

function deactivate() {
  if (timer) { clearInterval(timer); timer = null }
}

module.exports = { activate, deactivate }
