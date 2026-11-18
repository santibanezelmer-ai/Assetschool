using System;
using System.ComponentModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using AssetSchool.Master.Services;
using AssetSchool.Master.ViewModels;
using AssetSchool.Master.Windows;

namespace AssetSchool.Master;

public partial class MainWindow : Window
{
    private readonly GatewayClient _client = GatewayClient.Instance;
    private readonly ClassroomViewModel _classroomVm = new();
    private ICollectionView? _devicesView;

    public MainWindow()
    {
        InitializeComponent();

        DataContext = _classroomVm;

        // Bind Classroom Picker
        CmbClassroom.ItemsSource = _classroomVm.AvailableClassrooms;
        CmbClassroom.SelectedIndex = 0;

        // Bind Devices Collection View
        _devicesView = CollectionViewSource.GetDefaultView(_client.Devices);
        _devicesView.Filter = FilterDevice;

        DevicesItemsControl.ItemsSource = _devicesView;
        DevicesDataGrid.ItemsSource = _devicesView;

        // Gateway connection callbacks
        _client.OnConnectionChanged += isConn =>
        {
            Dispatcher.Invoke(() =>
            {
                StatusDot.Fill = new SolidColorBrush(isConn
                    ? (Color)ColorConverter.ConvertFromString("#10B981")
                    : (Color)ColorConverter.ConvertFromString("#EF4444"));
                StatusText.Text = isConn ? "Conectado (:3000)" : "Desconectado";
            });
        };

        _client.OnLog += log =>
        {
            Dispatcher.Invoke(() =>
            {
                FooterLogText.Text = log;
            });
        };

        _client.Devices.CollectionChanged += (s, e) =>
        {
            Dispatcher.Invoke(UpdateStatsCounter);
        };

        Loaded += async (s, e) =>
        {
            await _client.ConnectAsync();
            UpdateStatsCounter();
        };
    }

    private bool FilterDevice(object item)
    {
        if (item is not StudentDeviceViewModel dev) return false;

        // 1. Multiplatform OS and Connection State Filter
        bool matchesCriteria = _classroomVm.SelectedFilter switch
        {
            ClassroomFilterCriteria.All => true,
            ClassroomFilterCriteria.Windows => dev.OsType.Equals("windows", StringComparison.OrdinalIgnoreCase),
            ClassroomFilterCriteria.MacOS => dev.OsType.Equals("macos", StringComparison.OrdinalIgnoreCase),
            ClassroomFilterCriteria.Connected => !dev.IsDisconnected,
            ClassroomFilterCriteria.Disconnected => dev.IsDisconnected,
            _ => true
        };

        if (!matchesCriteria) return false;

        // 2. Search Text Filter
        string query = TxtSearch?.Text?.Trim().ToLowerInvariant() ?? "";
        if (string.IsNullOrEmpty(query)) return true;

        return dev.Hostname.ToLowerInvariant().Contains(query) ||
               dev.LocalIp.Contains(query) ||
               dev.OsType.ToLowerInvariant().Contains(query) ||
               dev.MacAddress.ToLowerInvariant().Contains(query) ||
               (dev.CurrentStudentName != null && dev.CurrentStudentName.ToLowerInvariant().Contains(query));
    }

    private void OnFilterCriteriaSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (CmbFilterCriteria?.SelectedItem is ComboBoxItem item && item.Tag is string tag)
        {
            _classroomVm.SelectedFilter = tag switch
            {
                "Windows" => ClassroomFilterCriteria.Windows,
                "MacOS" => ClassroomFilterCriteria.MacOS,
                "Connected" => ClassroomFilterCriteria.Connected,
                "Disconnected" => ClassroomFilterCriteria.Disconnected,
                _ => ClassroomFilterCriteria.All
            };
            _devicesView?.Refresh();
            UpdateStatsCounter();
        }
    }

    private void OnSearchTextChanged(object sender, TextChangedEventArgs e)
    {
        _devicesView?.Refresh();
        UpdateStatsCounter();
    }

    private void UpdateStatsCounter()
    {
        int total = _client.Devices.Count;
        int online = _client.Devices.Count(d => d.Status == "online");
        int locked = _client.Devices.Count(d => d.IsLocked);

        TxtStatsCounter.Text = $"Total: {total} • En línea: {online} • Bloqueados: {locked}";
    }

    private void OnViewModeChanged(object sender, RoutedEventArgs e)
    {
        if (GridScrollViewer == null || DevicesDataGrid == null) return;

        bool isGrid = RbGridView.IsChecked == true;
        GridScrollViewer.Visibility = isGrid ? Visibility.Visible : Visibility.Collapsed;
        DevicesDataGrid.Visibility = isGrid ? Visibility.Collapsed : Visibility.Visible;
    }

    private async void OnClassroomSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (CmbClassroom.SelectedItem is ClassroomInfo selected)
        {
            _classroomVm.CurrentClassroomId = selected.Id;
            _classroomVm.CurrentClassroomName = selected.Name;
            await _client.JoinClassroomAsync(selected.Id);
        }
    }

    private async void OnLockAllClicked(object sender, RoutedEventArgs e)
    {
        await _client.LockAllAsync();
        UpdateStatsCounter();
    }

    private async void OnUnlockAllClicked(object sender, RoutedEventArgs e)
    {
        await _client.UnlockAllAsync();
        UpdateStatsCounter();
    }

    private async void OnBroadcastClicked(object sender, RoutedEventArgs e)
    {
        if (_client.IsBroadcasting)
        {
            await StopBroadcastAsync();
        }
        else
        {
            await StartBroadcastAsync();
        }
    }

    private async Task StartBroadcastAsync()
    {
        await _client.StartBroadcastAsync("fullscreen");
        BroadcastBanner.Visibility = Visibility.Visible;
        TxtBroadcastBtn.Text = "Detener Emisión";
        BtnBroadcast.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#DC2626"));
    }

    private async Task StopBroadcastAsync()
    {
        await _client.StopBroadcastAsync();
        BroadcastBanner.Visibility = Visibility.Collapsed;
        TxtBroadcastBtn.Text = "Transmitir Pantalla";
        BtnBroadcast.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#7C3AED"));
    }

    private async void OnStopBroadcastClicked(object sender, RoutedEventArgs e)
    {
        await StopBroadcastAsync();
    }

    private void OnMessageClicked(object sender, RoutedEventArgs e)
    {
        var msgWin = new MessageWindow();
        msgWin.Owner = this;
        msgWin.ShowDialog();
    }

    private void OnFileTransferClicked(object sender, RoutedEventArgs e)
    {
        var fileWin = new FileTransferWindow();
        fileWin.Owner = this;
        fileWin.ShowDialog();
    }

    private async void OnPowerClicked(object sender, RoutedEventArgs e)
    {
        var dialog = new Window
        {
            Title = "Administración de Energía — Aula Completa",
            Width = 380,
            Height = 220,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Owner = this,
            Background = (SolidColorBrush)new BrushConverter().ConvertFrom("#0F172A")!,
            WindowStyle = WindowStyle.ToolWindow,
            ResizeMode = ResizeMode.NoResize
        };

        var stack = new StackPanel { Margin = new Thickness(16) };
        stack.Children.Add(new TextBlock
        {
            Text = "Seleccione la acción de energía para las computadoras del aula:",
            Foreground = Brushes.White,
            FontWeight = FontWeights.SemiBold,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 14)
        });

        var btnReboot = new Button
        {
            Content = "🔄 Reiniciar Todos los Equipos",
            Height = 32,
            Background = (SolidColorBrush)new BrushConverter().ConvertFrom("#D97706")!,
            Foreground = Brushes.White,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 8)
        };
        btnReboot.Click += async (s, ev) =>
        {
            dialog.Close();
            await _client.PowerActionAsync("reboot", delaySeconds: 5);
        };
        stack.Children.Add(btnReboot);

        var btnShutdown = new Button
        {
            Content = "⚡ Apagar Todos los Equipos",
            Height = 32,
            Background = (SolidColorBrush)new BrushConverter().ConvertFrom("#DC2626")!,
            Foreground = Brushes.White,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 8)
        };
        btnShutdown.Click += async (s, ev) =>
        {
            dialog.Close();
            await _client.PowerActionAsync("shutdown", delaySeconds: 5);
        };
        stack.Children.Add(btnShutdown);

        var btnLogout = new Button
        {
            Content = "🚪 Cerrar Sesión de Estudiantes",
            Height = 32,
            Background = (SolidColorBrush)new BrushConverter().ConvertFrom("#334155")!,
            Foreground = Brushes.White,
            FontWeight = FontWeights.SemiBold
        };
        btnLogout.Click += async (s, ev) =>
        {
            dialog.Close();
            await _client.PowerActionAsync("logout", delaySeconds: 0);
        };
        stack.Children.Add(btnLogout);

        dialog.Content = stack;
        dialog.ShowDialog();
    }

    private async void OnReconnectClicked(object sender, RoutedEventArgs e)
    {
        await _client.ConnectAsync();
    }

    private void OnInspectDeviceClicked(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string devId)
        {
            OpenDeviceInspection(devId);
        }
    }

    private void OnDeviceThumbnailMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.Tag is string devId)
        {
            OpenDeviceInspection(devId);
        }
    }

    private void OnDataGridRowDoubleClicked(object sender, MouseButtonEventArgs e)
    {
        if (DevicesDataGrid.SelectedItem is StudentDeviceViewModel dev)
        {
            OpenDeviceInspection(dev.Id);
        }
    }

    private void OpenDeviceInspection(string deviceId)
    {
        var dev = _client.Devices.FirstOrDefault(d => d.Id == deviceId);
        if (dev != null)
        {
            var inspectionWin = new DeviceInspectionWindow(dev);
            inspectionWin.Owner = this;
            inspectionWin.Show();
        }
    }

    private async void OnToggleDeviceLockClicked(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string devId)
        {
            var dev = _client.Devices.FirstOrDefault(d => d.Id == devId);
            if (dev != null)
            {
                if (dev.IsLocked)
                {
                    await _client.UnlockDeviceAsync(devId);
                }
                else
                {
                    await _client.LockDeviceAsync(devId);
                }
                UpdateStatsCounter();
            }
        }
    }
}
