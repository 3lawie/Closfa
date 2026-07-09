# Notification hook: fires a Windows toast notification when Claude needs attention.
# Requires BurntToast module: Install-Module -Name BurntToast -Force
# Falls back to a basic .NET toast if BurntToast is not installed.

param()

$title = "Claude Code"
$body = "Task requires your attention."

# Read stdin for notification context (Claude passes JSON)
$input = $null
try {
    $rawInput = [Console]::In.ReadToEnd()
    if ($rawInput) {
        $input = $rawInput | ConvertFrom-Json -ErrorAction SilentlyContinue
    }
} catch {
    # stdin may be empty for some notification events
}

# Extract message if available
if ($input -and $input.message) {
    $body = $input.message
}

# Try BurntToast first (rich notifications with buttons)
try {
    Import-Module BurntToast -ErrorAction Stop
    New-BurntToastNotification -Text $title, $body -UniqueIdentifier "claude-code-notify"
    exit 0
} catch {
    # BurntToast not installed — fall back to basic .NET toast
}

# Fallback: .NET balloon tip notification
try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    $notify = New-Object System.Windows.Forms.NotifyIcon
    $notify.Icon = [System.Drawing.SystemIcons]::Information
    $notify.Visible = $true
    $notify.BalloonTipTitle = $title
    $notify.BalloonTipText = $body
    $notify.ShowBalloonTip(5000)
    Start-Sleep -Milliseconds 5500
    $notify.Dispose()
} catch {
    # If all else fails, just write to stderr as a visual cue
    Write-Host "[$title] $body" -ForegroundColor Cyan
}

exit 0
