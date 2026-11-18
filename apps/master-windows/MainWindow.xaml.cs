using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using AssetSchool.Master.Services;

namespace AssetSchool.Master;

public partial class MainWindow : Window
{
    private readonly GatewayClient _client = GatewayClient.Instance;

    public MainWindow()
    {
        InitializeComponent();

        DevicesItemsControl.ItemsSource = _client.Devices;
        _client.OnConnectionChanged += isConn =>
        {
            Dispatcher.Invoke(() =>
            {
                StatusDot.Fill = new SolidColorBrush(isConn ? (Color)ColorConverter.ConvertFromString("#10B981") : (Color)ColorConverter.ConvertFromString("#EF4444"));
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

        Loaded += async (s, e) =>
        {
            await _client.ConnectAsync();
        };
    }

    private async void OnLockAllClicked(object sender, RoutedEventArgs e)
    {
        await _client.LockAllAsync();
    }

    private async void OnUnlockAllClicked(object sender, RoutedEventArgs e)
    {
        await _client.UnlockAllAsync();
    }

    private async void OnBroadcastClicked(object sender, RoutedEventArgs e)
    {
        if (_client.IsBroadcasting)
        {
            await _client.StopBroadcastAsync();
        }
        else
        {
            await _client.StartBroadcastAsync();
        }
    }

    private async void OnMessageClicked(object sender, RoutedEventArgs e)
    {
        var input = ShowInputDialog("Escriba el mensaje para toda el aula:", "Mensaje a Estudiantes", "Por favor presten atención al frente.");
        if (!string.IsNullOrWhiteSpace(input))
        {
            await _client.SendPopupMessageAsync("Aviso del Profesor", input);
        }
    }

    private static string? ShowInputDialog(string prompt, string title, string defaultValue = "")
    {
        var dialog = new Window
        {
            Title = title,
            Width = 420,
            Height = 180,
            WindowStartupLocation = WindowStartupLocation.CenterScreen,
            ResizeMode = ResizeMode.NoResize,
            Background = (SolidColorBrush)new BrushConverter().ConvertFrom("#0F172A")!,
            WindowStyle = WindowStyle.ToolWindow
        };

        var stack = new StackPanel { Margin = new Thickness(16) };
        stack.Children.Add(new TextBlock { Text = prompt, Foreground = Brushes.White, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 8) });

        var textBox = new TextBox { Text = defaultValue, Height = 28, Background = (SolidColorBrush)new BrushConverter().ConvertFrom("#1E293B")!, Foreground = Brushes.White, BorderThickness = new Thickness(1), BorderBrush = (SolidColorBrush)new BrushConverter().ConvertFrom("#334155")!, Margin = new Thickness(0, 0, 0, 14) };
        stack.Children.Add(textBox);

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        var okBtn = new Button { Content = "Enviar", Width = 80, Height = 28, Background = (SolidColorBrush)new BrushConverter().ConvertFrom("#0284C7")!, Foreground = Brushes.White, IsDefault = true, Margin = new Thickness(0, 0, 8, 0) };
        var cancelBtn = new Button { Content = "Cancelar", Width = 80, Height = 28, Background = (SolidColorBrush)new BrushConverter().ConvertFrom("#334155")!, Foreground = Brushes.White, IsCancel = true };

        string? result = null;
        okBtn.Click += (s, e) => { result = textBox.Text; dialog.Close(); };
        cancelBtn.Click += (s, e) => { dialog.Close(); };

        buttons.Children.Add(okBtn);
        buttons.Children.Add(cancelBtn);
        stack.Children.Add(buttons);

        dialog.Content = stack;
        dialog.ShowDialog();
        return result;
    }

    private async void OnPowerClicked(object sender, RoutedEventArgs e)
    {
        var res = MessageBox.Show("¿Desea reiniciar todas las computadoras del aula?", "Administración de Energía", MessageBoxButton.YesNoCancel, MessageBoxImage.Warning);
        if (res == MessageBoxResult.Yes)
        {
            await _client.PowerActionAsync("reboot", delaySeconds: 5);
        }
    }

    private async void OnReconnectClicked(object sender, RoutedEventArgs e)
    {
        await _client.ConnectAsync();
    }

    private void OnInspectDeviceClicked(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string devId)
        {
            var dev = _client.Devices.FirstOrDefault(d => d.Id == devId);
            if (dev != null)
            {
                MessageBox.Show($"Abriendo sesión de inspección y control remoto para {dev.Hostname} ({dev.LocalIp})...", "Control Remoto Veyon");
            }
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
            }
        }
    }
}
