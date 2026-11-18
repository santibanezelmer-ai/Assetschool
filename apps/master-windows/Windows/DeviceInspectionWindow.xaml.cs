using System;
using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using AssetSchool.Master.Services;
using AssetSchool.Master.ViewModels;

namespace AssetSchool.Master.Windows;

public partial class DeviceInspectionWindow : Window
{
    private readonly StudentDeviceViewModel _device;
    private readonly GatewayClient _client = GatewayClient.Instance;
    private bool _isRemoteControlActive;

    public DeviceInspectionWindow(StudentDeviceViewModel device)
    {
        InitializeComponent();
        _device = device;

        TxtHostname.Text = device.Hostname;
        TxtIpAndOs.Text = $"{device.LocalIp} • {device.OsType.ToUpperInvariant()}";
        TxtMac.Text = device.MacAddress;
        TxtStatus.Text = device.StatusDisplay;
        TxtStudent.Text = device.CurrentStudentName ?? "Sesión interactiva activa";
        ViewportImage.Source = device.Thumbnail;
        UpdateLockUi();

        // Subscribe to property changes
        _device.PropertyChanged += OnDevicePropertyChanged;
        Closing += (s, e) => _device.PropertyChanged -= OnDevicePropertyChanged;
    }

    private void OnDevicePropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        Dispatcher.Invoke(() =>
        {
            if (e.PropertyName == nameof(StudentDeviceViewModel.Thumbnail))
            {
                ViewportImage.Source = _device.Thumbnail;
            }
            else if (e.PropertyName == nameof(StudentDeviceViewModel.Status))
            {
                TxtStatus.Text = _device.StatusDisplay;
                UpdateLockUi();
            }
        });
    }

    private void UpdateLockUi()
    {
        BtnLock.Content = _device.IsLocked ? "🔓 Desbloquear Pantalla" : "🔒 Bloquear Pantalla";
    }

    private void OnRemoteControlToggled(object sender, RoutedEventArgs e)
    {
        _isRemoteControlActive = ChkRemoteControl.IsChecked == true;
        ControlOverlay.Visibility = _isRemoteControlActive ? Visibility.Collapsed : Visibility.Visible;
        TxtLog.Text = _isRemoteControlActive
            ? "🎮 Control remoto interactivo activado. Mueva o haga clic en la pantalla."
            : "👁️ Modo observación activado.";

        if (_isRemoteControlActive)
        {
            ViewportImage.Focus();
        }
    }

    private (double relX, double relY) GetNormalizedCoordinates(MouseEventArgs e)
    {
        var pos = e.GetPosition(ViewportImage);
        double relX = Math.Clamp(pos.X / ViewportImage.ActualWidth, 0.0, 1.0);
        double relY = Math.Clamp(pos.Y / ViewportImage.ActualHeight, 0.0, 1.0);
        return (relX, relY);
    }

    private async void OnViewportMouseMove(object sender, MouseEventArgs e)
    {
        if (!_isRemoteControlActive || ViewportImage.ActualWidth <= 0 || ViewportImage.ActualHeight <= 0) return;
        var (relX, relY) = GetNormalizedCoordinates(e);
        await _client.SendRemoteInputAsync(_device.Id, "mousemove", relX, relY);
    }

    private async void OnViewportMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (!_isRemoteControlActive || ViewportImage.ActualWidth <= 0 || ViewportImage.ActualHeight <= 0) return;
        var (relX, relY) = GetNormalizedCoordinates(e);
        string btn = e.ChangedButton == MouseButton.Right ? "right" : (e.ChangedButton == MouseButton.Middle ? "middle" : "left");

        if (e.ClickCount >= 2)
        {
            await _client.SendRemoteInputAsync(_device.Id, "doubleclick", relX, relY, btn);
        }
        else
        {
            await _client.SendRemoteInputAsync(_device.Id, "mousedown", relX, relY, btn);
        }
    }

    private async void OnViewportMouseUp(object sender, MouseButtonEventArgs e)
    {
        if (!_isRemoteControlActive || ViewportImage.ActualWidth <= 0 || ViewportImage.ActualHeight <= 0) return;
        var (relX, relY) = GetNormalizedCoordinates(e);
        string btn = e.ChangedButton == MouseButton.Right ? "right" : "left";
        await _client.SendRemoteInputAsync(_device.Id, "click", relX, relY, btn);
    }

    private async void OnViewportMouseWheel(object sender, MouseWheelEventArgs e)
    {
        if (!_isRemoteControlActive) return;
        var (relX, relY) = GetNormalizedCoordinates(e);
        await _client.SendRemoteInputAsync(_device.Id, "wheel", relX, relY, keyCode: e.Delta);
    }

    private async void OnViewportKeyDown(object sender, KeyEventArgs e)
    {
        if (!_isRemoteControlActive) return;
        int vk = KeyInterop.VirtualKeyFromKey(e.Key);
        await _client.SendRemoteInputAsync(_device.Id, "keydown", 0.5, 0.5, keyCode: vk);
        e.Handled = true;
    }

    private async void OnViewportKeyUp(object sender, KeyEventArgs e)
    {
        if (!_isRemoteControlActive) return;
        int vk = KeyInterop.VirtualKeyFromKey(e.Key);
        await _client.SendRemoteInputAsync(_device.Id, "keyup", 0.5, 0.5, keyCode: vk);
        e.Handled = true;
    }

    private async void OnToggleLockClicked(object sender, RoutedEventArgs e)
    {
        if (_device.IsLocked)
        {
            await _client.UnlockDeviceAsync(_device.Id);
        }
        else
        {
            await _client.LockDeviceAsync(_device.Id);
        }
        UpdateLockUi();
    }

    private void OnSendMessageClicked(object sender, RoutedEventArgs e)
    {
        var msgWin = new MessageWindow(_device.Id);
        msgWin.Owner = this;
        msgWin.ShowDialog();
    }

    private void OnFileTransferClicked(object sender, RoutedEventArgs e)
    {
        var fileWin = new FileTransferWindow(_device.Id);
        fileWin.Owner = this;
        fileWin.ShowDialog();
    }

    private async void OnRebootClicked(object sender, RoutedEventArgs e)
    {
        var res = MessageBox.Show($"¿Desea reiniciar el equipo {_device.Hostname}?", "Reiniciar Equipo", MessageBoxButton.YesNo, MessageBoxImage.Warning);
        if (res == MessageBoxResult.Yes)
        {
            await _client.PowerActionAsync("reboot", _device.Id, delaySeconds: 5);
            TxtLog.Text = "Comando de reinicio enviado.";
        }
    }
}
