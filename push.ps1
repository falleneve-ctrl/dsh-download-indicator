# 推送 dsh-download-indicator 到 GitHub（token 改好权限后运行）
# 用法: .\push.ps1 -Token "github_pat_xxx"
param(
    [Parameter(Mandatory = $true)]
    [string]$Token
)

$ErrorActionPreference = 'Stop'
$repo = 'falleneve-ctrl/dsh-download-indicator'
$dir = 'F:\training\dsh-download-indicator'

Write-Host "=== 1) 验证 token 与仓库访问 ===" -ForegroundColor Cyan
$H = @{ Authorization = "Bearer $Token"; 'User-Agent' = 'dsh-agent'; Accept = 'application/vnd.github+json' }
try {
    $me = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $H -TimeoutSec 30
    Write-Host "  token 用户: $($me.login)"
} catch {
    Write-Host "  token 无效: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 检查可否写该仓库（permissions.push 是权威判断）
try {
    $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo" -Headers $H -TimeoutSec 30
    $canPush = $r.permissions.push
    Write-Host "  仓库: $($r.full_name)  可写: $canPush"
    if (-not $canPush) {
        Write-Host "  token 仍无该仓库写权限 —— 请把 token 的 Repository access 改为 All repositories，或勾选本仓库" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "  读仓库失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== 2) 推送 ===" -ForegroundColor Cyan
Set-Location $dir
$remote = "https://x-access-token:$Token@github.com/$repo.git"
& git remote remove origin 2>$null | Out-Null
& git remote add origin $remote
& git branch -M main
$out = & git -c credential.helper= push -u origin main --force 2>&1
$out | Select-Object -Last 6 | ForEach-Object { Write-Host "  $_" }

if ($LASTEXITCODE -ne 0) {
    Write-Host "  推送失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== 3) 打 dsh-plugin topic（目录靠它做无 token 发现）===" -ForegroundColor Cyan
$body = @{ names = @('dsh-plugin','dsh','deepseek-harness','comfyui','download-monitor') } | ConvertTo-Json
try {
    $null = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/topics" -Method Put `
        -Headers (@{ Authorization = "Bearer $Token"; 'User-Agent' = 'dsh-agent'; Accept = 'application/vnd.github+json' }) `
        -Body $body -ContentType 'application/json' -TimeoutSec 30
    Write-Host "  ✓ topics 已设置"
} catch {
    Write-Host "  topics 设置失败（不影响投稿）: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== 4) 清理：把 token 从 remote URL 里去掉 ===" -ForegroundColor Cyan
& git remote set-url origin "https://github.com/$repo.git"
Write-Host "  ✓ remote 已还原为不含 token 的地址"
Write-Host ""
Write-Host "完成。仓库: https://github.com/$repo" -ForegroundColor Green
