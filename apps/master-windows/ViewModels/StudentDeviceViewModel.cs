using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace AssetSchool.Master.ViewModels;

public class StudentDeviceViewModel : INotifyPropertyChanged
{
    private string _id = string.Empty;
    private string _hostname = string.Empty;
    private string _osType = "windows";
    private string _localIp = "127.0.0.1";
    private string _macAddress = "00:00:00:00:00:00";
    private string _status = "online";
    private bool _isLocked;
    private bool _isSelected;
    private string? _currentStudentName;
    private BitmapSource? _thumbnail;
    private DateTime _lastHeartbeat = DateTime.UtcNow;
    private bool _isConnectionStale;
    private bool _isDisconnected;
    private string _agentVersion = "1.0.0";
    private bool _isBroadcasting;

    public string Id
    {
        get => _id;
        set => SetField(ref _id, value);
    }

    public string Hostname
    {
        get => _hostname;
        set => SetField(ref _hostname, value);
    }

    public string OsType
    {
        get => _osType;
        set
        {
            if (SetField(ref _osType, value))
            {
                OnPropertyChanged(nameof(OsBadge));
                OnPropertyChanged(nameof(OsIcon));
            }
        }
    }

    public string OsBadge => _osType.ToLowerInvariant() switch
    {
        "windows" => "🪟 Windows",
        "macos" => "🍎 macOS",
        "linux" => "🐧 Linux",
        "chromeos" => "🌐 ChromeOS",
        _ => "🖥️ " + _osType
    };

    public string OsIcon => _osType.ToLowerInvariant() switch
    {
        "windows" => "🪟",
        "macos" => "🍎",
        "linux" => "🐧",
        "chromeos" => "🌐",
        _ => "🖥️"
    };

    public string AgentVersion
    {
        get => _agentVersion;
        set => SetField(ref _agentVersion, value);
    }

    public bool IsBroadcasting
    {
        get => _isBroadcasting;
        set => SetField(ref _isBroadcasting, value);
    }

    public string LocalIp
    {
        get => _localIp;
        set => SetField(ref _localIp, value);
    }

    public string MacAddress
    {
        get => _macAddress;
        set => SetField(ref _macAddress, value);
    }

    public string Status
    {
        get => _status;
        set
        {
            if (SetField(ref _status, value))
            {
                OnPropertyChanged(nameof(StatusColor));
                OnPropertyChanged(nameof(StatusDisplay));
            }
        }
    }

    public bool IsLocked
    {
        get => _isLocked;
        set
        {
            if (SetField(ref _isLocked, value))
            {
                OnPropertyChanged(nameof(LockButtonText));
                OnPropertyChanged(nameof(StatusColor));
            }
        }
    }

    public string LockButtonText => _isLocked ? "🔓 Desbloquear" : "🔒 Bloquear";

    public bool IsSelected
    {
        get => _isSelected;
        set => SetField(ref _isSelected, value);
    }

    public string? CurrentStudentName
    {
        get => _currentStudentName;
        set => SetField(ref _currentStudentName, value);
    }

    public BitmapSource? Thumbnail
    {
        get => _thumbnail;
        set => SetField(ref _thumbnail, value);
    }

    public DateTime LastHeartbeat
    {
        get => _lastHeartbeat;
        set
        {
            if (SetField(ref _lastHeartbeat, value))
            {
                CheckHealth();
            }
        }
    }

    public bool IsConnectionStale
    {
        get => _isConnectionStale;
        set
        {
            if (SetField(ref _isConnectionStale, value))
            {
                OnPropertyChanged(nameof(StatusColor));
            }
        }
    }

    public bool IsDisconnected
    {
        get => _isDisconnected;
        set
        {
            if (SetField(ref _isDisconnected, value))
            {
                OnPropertyChanged(nameof(StatusColor));
                OnPropertyChanged(nameof(StatusDisplay));
            }
        }
    }

    public string StatusDisplay
    {
        get
        {
            if (IsDisconnected) return "Desconectado";
            if (IsConnectionStale) return "Conexión Lenta";
            if (IsLocked) return "Bloqueado";
            return "En línea";
        }
    }

    public Brush StatusColor
    {
        get
        {
            if (IsDisconnected) return new SolidColorBrush(Color.FromRgb(239, 68, 68)); // Red #EF4444
            if (IsConnectionStale) return new SolidColorBrush(Color.FromRgb(245, 158, 11)); // Amber #F59E0B
            if (IsLocked) return new SolidColorBrush(Color.FromRgb(217, 119, 6)); // Dark amber #D97706
            return new SolidColorBrush(Color.FromRgb(16, 185, 129)); // Green #10B981
        }
    }

    public void CheckHealth()
    {
        var elapsed = (DateTime.UtcNow - _lastHeartbeat).TotalSeconds;
        IsConnectionStale = elapsed > 10 && elapsed <= 25;
        IsDisconnected = elapsed > 25;
    }

    public void UpdateThumbnailFromBase64(string base64)
    {
        try
        {
            byte[] bytes = Convert.FromBase64String(base64);
            Application.Current?.Dispatcher.Invoke(() =>
            {
                using var ms = new MemoryStream(bytes);
                var image = new BitmapImage();
                image.BeginInit();
                image.CacheOption = BitmapCacheOption.OnLoad;
                image.StreamSource = ms;
                image.EndInit();
                image.Freeze(); // Make cross-thread safe
                Thumbnail = image;
                LastHeartbeat = DateTime.UtcNow;
            });
        }
        catch { }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    protected bool SetField<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (Equals(field, value)) return false;
        field = value;
        OnPropertyChanged(propertyName);
        return true;
    }
}
