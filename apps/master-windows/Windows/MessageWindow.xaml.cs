using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using AssetSchool.Master.Services;

namespace AssetSchool.Master.Windows;

public partial class MessageWindow : Window
{
    private readonly GatewayClient _client = GatewayClient.Instance;
    private readonly string? _preselectedDeviceId;

    public ObservableCollection<AckItemViewModel> Acks { get; } = new();

    public MessageWindow(string? deviceId = null)
    {
        InitializeComponent();
        _preselectedDeviceId = deviceId;
        LstAcks.ItemsSource = Acks;

        PopulateTargets();

        _client.OnMessageAck += OnMessageAckReceived;
        Closing += (s, e) => _client.OnMessageAck -= OnMessageAckReceived;
    }

    private void PopulateTargets()
    {
        CmbTarget.Items.Clear();
        CmbTarget.Items.Add("Toda el Aula (Difusión)");

        int selectedIdx = 0;
        int i = 1;
        foreach (var dev in _client.Devices)
        {
            CmbTarget.Items.Add($"{dev.Hostname} ({dev.LocalIp})");
            if (_preselectedDeviceId == dev.Id)
            {
                selectedIdx = i;
            }
            i++;
        }
        CmbTarget.SelectedIndex = selectedIdx;
    }

    private string? GetSelectedDeviceId()
    {
        if (CmbTarget.SelectedIndex > 0 && CmbTarget.SelectedIndex <= _client.Devices.Count)
        {
            return _client.Devices[CmbTarget.SelectedIndex - 1].Id;
        }
        return null;
    }

    private async void OnSendMessageClicked(object sender, RoutedEventArgs e)
    {
        string title = TxtTitle.Text.Trim();
        string body = TxtBody.Text.Trim();
        if (string.IsNullOrEmpty(body))
        {
            MessageBox.Show("El mensaje no puede estar vacío.", "Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        string priority = (CmbPriority.SelectedItem as ComboBoxItem)?.Content?.ToString()?.ToLowerInvariant() ?? "normal";
        string? targetDevId = GetSelectedDeviceId();

        Acks.Clear();
        await _client.SendPopupMessageAsync(title, body, targetDevId, priority);
    }

    private void OnClearClicked(object sender, RoutedEventArgs e)
    {
        TxtBody.Clear();
        Acks.Clear();
    }

    private void OnMessageAckReceived(string deviceId, string messageId, string hostname)
    {
        Dispatcher.Invoke(() =>
        {
            var existing = Acks.FirstOrDefault(a => a.DeviceId == deviceId);
            if (existing == null)
            {
                Acks.Insert(0, new AckItemViewModel
                {
                    DeviceId = deviceId,
                    Hostname = hostname,
                    Timestamp = DateTime.Now
                });
            }
        });
    }
}

public class AckItemViewModel
{
    public string DeviceId { get; set; } = string.Empty;
    public string Hostname { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }

    public string TimeDisplay => Timestamp.ToString("HH:mm:ss");
}
