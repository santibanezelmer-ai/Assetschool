using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Media.Imaging;

namespace AssetSchool.Master.ViewModels;

public class StudentDeviceViewModel : INotifyPropertyChanged
{
    private string _id = string.Empty;
    private string _hostname = string.Empty;
    private string _osType = "windows";
    private string _localIp = "127.0.0.1";
    private string _status = "online";
    private bool _isLocked;
    private bool _isSelected;
    private string? _currentStudentName;
    private BitmapSource? _thumbnail;

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
        set => SetField(ref _osType, value);
    }

    public string LocalIp
    {
        get => _localIp;
        set => SetField(ref _localIp, value);
    }

    public string Status
    {
        get => _status;
        set => SetField(ref _status, value);
    }

    public bool IsLocked
    {
        get => _isLocked;
        set
        {
            if (SetField(ref _isLocked, value))
            {
                OnPropertyChanged(nameof(LockButtonText));
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
