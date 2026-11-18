using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Runtime.CompilerServices;

namespace AssetSchool.Master.ViewModels;

public enum ClassroomViewMode
{
    Grid,
    DetailedTable
}

public enum ClassroomFilterCriteria
{
    All,
    Windows,
    MacOS,
    Connected,
    Disconnected
}

public class ClassroomViewModel : INotifyPropertyChanged
{
    private string _currentClassroomId = "lab-informatica-01";
    private string _currentClassroomName = "Laboratorio 1 — Informática";
    private string _searchFilter = string.Empty;
    private ClassroomViewMode _viewMode = ClassroomViewMode.Grid;
    private ClassroomFilterCriteria _selectedFilter = ClassroomFilterCriteria.All;
    private bool _isBroadcasting;
    private string _broadcastMode = "fullscreen";
    private int _broadcastingCount;

    public ObservableCollection<ClassroomInfo> AvailableClassrooms { get; } = new()
    {
        new ClassroomInfo { Id = "lab-informatica-01", Name = "Laboratorio 1 — Informática" },
        new ClassroomInfo { Id = "lab-ciencias-02", Name = "Laboratorio 2 — Ciencias" },
        new ClassroomInfo { Id = "aula-magna", Name = "Aula Magna" }
    };

    public string CurrentClassroomId
    {
        get => _currentClassroomId;
        set => SetField(ref _currentClassroomId, value);
    }

    public string CurrentClassroomName
    {
        get => _currentClassroomName;
        set => SetField(ref _currentClassroomName, value);
    }

    public string SearchFilter
    {
        get => _searchFilter;
        set => SetField(ref _searchFilter, value);
    }

    public ClassroomViewMode ViewMode
    {
        get => _viewMode;
        set
        {
            if (SetField(ref _viewMode, value))
            {
                OnPropertyChanged(nameof(IsGridView));
                OnPropertyChanged(nameof(IsTableView));
            }
        }
    }

    public ClassroomFilterCriteria SelectedFilter
    {
        get => _selectedFilter;
        set => SetField(ref _selectedFilter, value);
    }

    public bool IsGridView => _viewMode == ClassroomViewMode.Grid;
    public bool IsTableView => _viewMode == ClassroomViewMode.DetailedTable;

    public bool IsBroadcasting
    {
        get => _isBroadcasting;
        set
        {
            if (SetField(ref _isBroadcasting, value))
            {
                OnPropertyChanged(nameof(BroadcastBannerVisibility));
            }
        }
    }

    public string BroadcastMode
    {
        get => _broadcastMode;
        set => SetField(ref _broadcastMode, value);
    }

    public int BroadcastingCount
    {
        get => _broadcastingCount;
        set => SetField(ref _broadcastingCount, value);
    }

    public bool BroadcastBannerVisibility => _isBroadcasting;

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

public class ClassroomInfo
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;

    public override string ToString() => Name;
}
