# ==============================================================================
# AssetSchool — Agente Windows Autónomo (PowerShell / .NET Native)
# Conexión LAN Directa, Descubrimiento UDP y Pausa Pedagógica
# ==============================================================================

param(
    [string]$Server = ""
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " AssetSchool Windows Native Agent (PowerShell)" -ForegroundColor Cyan
Write-Host " Plataforma Institucional de Control de Aula LAN" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$Hostname = $env:COMPUTERNAME
$DeviceId = [guid]::NewGuid().ToString()
$LocalIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" } | Select-Object -First 1).IPAddress
if (-not $LocalIp) { $LocalIp = "127.0.0.1" }

Write-Host "[INFO] Hostname: $Hostname" -ForegroundColor Gray
Write-Host "[INFO] IP Local: $LocalIp" -ForegroundColor Gray
Write-Host "[INFO] Device ID: $DeviceId" -ForegroundColor Gray

# 1. Resolve Server URL
$ServerUrl = $Server
if (-not $ServerUrl) {
    Write-Host "[DESCUBRIMIENTO LAN] Buscando servidor AssetSchool en la red local (UDP 48500)..." -ForegroundColor Yellow
    try {
        $Udp = New-Object System.Net.Sockets.UdpClient(48500)
        $Udp.Client.ReceiveTimeout = 4000
        $Endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
        $Bytes = $Udp.Receive([ref]$Endpoint)
        $Json = [System.Text.Encoding]::UTF8.GetString($Bytes) | ConvertFrom-Json
        if ($Json.payload.httpUrl) {
            $ServerUrl = $Json.payload.httpUrl
        } elseif ($Json.payload.serverHost) {
            $ServerUrl = "http://" + $Json.payload.serverHost
        }
        $Udp.Close()
    } catch {
        # Fallback default IP of teacher server
        $ServerUrl = "http://192.168.50.60:3000"
    }
}

Write-Host "[CONEXIÓN] Servidor de aula fijado en: $ServerUrl" -ForegroundColor Green

# 2. Setup WPF Lock Window
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$Global:CurtainWindow = $null

function Show-LockCurtain($Message, $TeacherName, $InstitutionName) {
    [System.Windows.Application]::Current.Dispatcher.Invoke([Action]{
        if ($Global:CurtainWindow) { return }

        $Win = New-Object System.Windows.Window
        $Win.WindowStyle = [System.Windows.WindowStyle]::None
        $Win.WindowState = [System.Windows.WindowState]::Maximized
        $Win.Topmost = $true
        $Win.ShowInTaskbar = $false
        $Win.Background = [System.Windows.Media.Brushes]::Black

        $Grid = New-Object System.Windows.Controls.Grid
        $Grid.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#020617") # Slate-950

        $Stack = New-Object System.Windows.Controls.StackPanel
        $Stack.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        $Stack.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center

        $Icon = New-Object System.Windows.Controls.TextBlock
        $Icon.Text = [char]::ConvertFromUtf32(0x1F512) # Padlock
        $Icon.FontSize = 72
        $Icon.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
        $Icon.Margin = New-Object System.Windows.Thickness(0, 0, 0, 15)
        $Stack.Children.Add($Icon) | Out-Null

        $Title = New-Object System.Windows.Controls.TextBlock
        $Title.Text = "ATENCIÓN AL FRENTE"
        $Title.FontSize = 36
        $Title.FontWeight = [System.Windows.FontWeights]::Bold
        $Title.Foreground = [System.Windows.Media.Brushes]::White
        $Title.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
        $Stack.Children.Add($Title) | Out-Null

        $Sub = New-Object System.Windows.Controls.TextBlock
        $Sub.Text = "PAUSA PEDAGÓGICA ACTIVA"
        $Sub.FontSize = 14
        $Sub.FontWeight = [System.Windows.FontWeights]::SemiBold
        $Sub.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#F59E0B") # Amber-500
        $Sub.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
        $Sub.Margin = New-Object System.Windows.Thickness(0, 5, 0, 20)
        $Stack.Children.Add($Sub) | Out-Null

        $Msg = New-Object System.Windows.Controls.TextBlock
        $Msg.Text = "`"$Message`""
        $Msg.FontSize = 20
        $Msg.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#CBD5E1") # Slate-300
        $Msg.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
        $Msg.TextWrapping = [System.Windows.TextWrapping]::Wrap
        $Msg.MaxWidth = 800
        $Msg.TextAlignment = [System.Windows.TextAlignment]::Center
        $Stack.Children.Add($Msg) | Out-Null

        $Footer = New-Object System.Windows.Controls.TextBlock
        $Footer.Text = "Docente: $TeacherName  •  $InstitutionName  •  AssetSchool LAN"
        $Footer.FontSize = 12
        $Footer.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#64748B")
        $Footer.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
        $Footer.Margin = New-Object System.Windows.Thickness(0, 40, 0, 0)
        $Stack.Children.Add($Footer) | Out-Null

        $Grid.Children.Add($Stack) | Out-Null
        $Win.Content = $Grid

        $Global:CurtainWindow = $Win
        $Win.Show()
    })
    Write-Host "[PAUSA PEDAGÓGICA] 🔒 Pantalla bloqueada: $Message" -ForegroundColor Yellow
}

function Hide-LockCurtain {
    [System.Windows.Application]::Current.Dispatcher.Invoke([Action]{
        if ($Global:CurtainWindow) {
            $Global:CurtainWindow.Close()
            $Global:CurtainWindow = $null
        }
    })
    Write-Host "[PAUSA PEDAGÓGICA] 🟢 Pantalla desbloqueada." -ForegroundColor Green
}

# 3. Connect via ClientWebSocket
$WsUri = New-Object System.Uri("$($ServerUrl.Replace('http', 'ws'))/socket.io/?EIO=4&transport=websocket")
Write-Host "[CONECTANDO] Enlace WebSocket: $WsUri" -ForegroundColor Cyan

$Ws = New-Object System.Net.WebSockets.ClientWebSocket
$Cts = New-Object System.Threading.CancellationTokenSource

try {
    $Ws.ConnectAsync($WsUri, $Cts.Token).Wait()
    Write-Host "[ENLACE ÉXITO] Conectado a la consola docente!" -ForegroundColor Green

    $Buffer = New-Object byte[] 65536
    $Segment = New-Object System.ArraySegment[byte]($Buffer, 0, $Buffer.Length)

    # Handshake Engine.IO / Socket.IO
    function Send-WsText($Text) {
        $Bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        $Seg = New-Object System.ArraySegment[byte]($Bytes, 0, $Bytes.Length)
        $Ws.SendAsync($Seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).Wait()
    }

    # Listen loop
    while ($Ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $Result = $Ws.ReceiveAsync($Segment, $Cts.Token).Result
        if ($Result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }

        $Msg = [System.Text.Encoding]::UTF8.GetString($Buffer, 0, $Result.Count)

        if ($Msg.StartsWith("0")) {
            Send-WsText "40"
        }
        elseif ($Msg.StartsWith("40")) {
            Write-Host "[REGISTRO] Enviando AGENT_HELLO..." -ForegroundColor Cyan
            $Hello = @{
                packetId = [guid]::NewGuid().ToString()
                packetType = "AGENT_HELLO"
                timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                senderId = $DeviceId
                target = "server"
                payload = @{
                    hostname = $Hostname
                    macAddress = "00:50:56:C0:00:01"
                    localIp = $LocalIp
                    osType = "windows"
                    osVersion = "Windows 11 / .NET 8"
                    architecture = "x64"
                    agentVersion = "1.0.0"
                    publicKey = "win_agent_key"
                    enrolledDeviceId = $DeviceId
                }
            } | ConvertTo-Json -Depth 5 -Compress
            Send-WsText "42[`"AGENT_HELLO`",$Hello]"
        }
        elseif ($Msg.StartsWith("2")) {
            Send-WsText "3" # Heartbeat pong
        }
        elseif ($Msg.StartsWith("42")) {
            $PayloadStr = $Msg.Substring(2)
            $Arr = $PayloadStr | ConvertFrom-Json
            $EventName = $Arr[0]
            $EventData = $Arr[1]

            if ($EventName -eq "COMMAND_DISPATCH") {
                $Cmd = $EventData.payload
                Write-Host "[COMANDO] Tipo recibido: $($Cmd.commandType)" -ForegroundColor Magenta
                if ($Cmd.commandType -eq "LOCK_SCREEN") {
                    $MsgTxt = if ($Cmd.params.message) { $Cmd.params.message } else { "Atención al frente." }
                    $Teacher = if ($Cmd.params.teacherName) { $Cmd.params.teacherName } else { "Docente" }
                    Show-LockCurtain $MsgTxt $Teacher "AssetSchool LAN"

                    $Res = @{
                        packetId = [guid]::NewGuid().ToString()
                        packetType = "COMMAND_RESULT"
                        timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                        senderId = $DeviceId
                        target = "server"
                        payload = @{
                            commandId = $Cmd.commandId
                            success = $true
                            completedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                        }
                    } | ConvertTo-Json -Depth 5 -Compress
                    Send-WsText "42[`"COMMAND_RESULT`",$Res]"
                }
                elseif ($Cmd.commandType -eq "UNLOCK_SCREEN") {
                    Hide-LockCurtain
                    $Res = @{
                        packetId = [guid]::NewGuid().ToString()
                        packetType = "COMMAND_RESULT"
                        timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                        senderId = $DeviceId
                        target = "server"
                        payload = @{
                            commandId = $Cmd.commandId
                            success = $true
                            completedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                        }
                    } | ConvertTo-Json -Depth 5 -Compress
                    Send-WsText "42[`"COMMAND_RESULT`",$Res]"
                }
            }
        }
    }
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($Ws) { $Ws.Dispose() }
}
