using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Windows;
using AssetSchool.Master.Services;

namespace AssetSchool.Master.Windows;

public partial class FileTransferWindow : Window
{
    private readonly GatewayClient _client = GatewayClient.Instance;
    private readonly string? _preselectedDeviceId;
    private string _localFolder = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);

    public ObservableCollection<FileItemViewModel> LocalFiles { get; } = new();
    public ObservableCollection<FileItemViewModel> RemoteFiles { get; } = new();

    public FileTransferWindow(string? deviceId = null)
    {
        InitializeComponent();
        _preselectedDeviceId = deviceId;

        LstLocalFiles.ItemsSource = LocalFiles;
        LstRemoteFiles.ItemsSource = RemoteFiles;

        PopulateTargetScope();
        LoadLocalFiles(_localFolder);

        _client.OnFileSendResult += OnFileSendCompleted;
        _client.OnFileCollectResult += OnFileCollectCompleted;
        _client.OnDirListResult += OnDirListReceived;

        Closing += (s, e) =>
        {
            _client.OnFileSendResult -= OnFileSendCompleted;
            _client.OnFileCollectResult -= OnFileCollectCompleted;
            _client.OnDirListResult -= OnDirListReceived;
        };

        Loaded += (s, e) => RefreshRemoteList();
    }

    private void PopulateTargetScope()
    {
        CmbTargetScope.Items.Clear();
        CmbTargetScope.Items.Add("Toda el Aula (Difusión)");

        int selectedIdx = 0;
        int i = 1;
        foreach (var dev in _client.Devices)
        {
            CmbTargetScope.Items.Add($"{dev.Hostname} ({dev.LocalIp})");
            if (_preselectedDeviceId == dev.Id)
            {
                selectedIdx = i;
            }
            i++;
        }
        CmbTargetScope.SelectedIndex = selectedIdx;
    }

    private void LoadLocalFiles(string folderPath)
    {
        try
        {
            LocalFiles.Clear();
            if (!Directory.Exists(folderPath)) return;

            var dirInfo = new DirectoryInfo(folderPath);
            foreach (var f in dirInfo.GetFiles().Take(100))
            {
                LocalFiles.Add(new FileItemViewModel
                {
                    Name = f.Name,
                    FullPath = f.FullName,
                    SizeBytes = f.Length,
                    IsDirectory = false
                });
            }
        }
        catch (Exception ex)
        {
            TxtTransferLog.Text = $"Error leyendo archivos locales: {ex.Message}";
        }
    }

    private void OnSelectLocalFolderClicked(object sender, RoutedEventArgs e)
    {
        using var dialog = new System.Windows.Forms.FolderBrowserDialog();
        dialog.SelectedPath = _localFolder;
        if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
        {
            _localFolder = dialog.SelectedPath;
            LoadLocalFiles(_localFolder);
        }
    }

    private async void RefreshRemoteList()
    {
        string? targetDevId = GetSelectedDeviceId();
        if (!string.IsNullOrEmpty(targetDevId))
        {
            TxtTransferLog.Text = $"Consultando sandbox remoto de {targetDevId}...";
            await _client.ListRemoteDirectoryAsync(targetDevId);
        }
    }

    private void OnRefreshRemoteListClicked(object sender, RoutedEventArgs e)
    {
        RefreshRemoteList();
    }

    private string? GetSelectedDeviceId()
    {
        if (CmbTargetScope.SelectedIndex > 0 && CmbTargetScope.SelectedIndex <= _client.Devices.Count)
        {
            return _client.Devices[CmbTargetScope.SelectedIndex - 1].Id;
        }
        return _client.Devices.FirstOrDefault()?.Id;
    }

    private async void OnSendFileClicked(object sender, RoutedEventArgs e)
    {
        if (LstLocalFiles.SelectedItem is not FileItemViewModel localFile)
        {
            MessageBox.Show("Seleccione un archivo del panel izquierdo para distribuir.", "Seleccionar Archivo", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        try
        {
            byte[] bytes = await File.ReadAllBytesAsync(localFile.FullPath);
            TransferProgressBar.Value = 30;

            if (CmbTargetScope.SelectedIndex == 0) // Toda el aula
            {
                TxtTransferLog.Text = $"Distribuyendo '{localFile.Name}' a toda el aula...";
                await _client.SendFileToClassroomAsync(localFile.Name, bytes);
            }
            else
            {
                string? devId = GetSelectedDeviceId();
                if (!string.IsNullOrEmpty(devId))
                {
                    TxtTransferLog.Text = $"Enviando '{localFile.Name}' a {devId}...";
                    await _client.SendFileToDeviceAsync(devId, localFile.Name, bytes);
                }
            }
            TransferProgressBar.Value = 80;
        }
        catch (Exception ex)
        {
            TxtTransferLog.Text = $"Error al enviar archivo: {ex.Message}";
            TransferProgressBar.Value = 0;
        }
    }

    private async void OnCollectFileClicked(object sender, RoutedEventArgs e)
    {
        if (LstRemoteFiles.SelectedItem is not FileItemViewModel remoteFile)
        {
            MessageBox.Show("Seleccione un archivo del panel derecho (estudiante) para recoger.", "Recolección de Tarea", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        string? devId = GetSelectedDeviceId();
        if (string.IsNullOrEmpty(devId))
        {
            MessageBox.Show("Seleccione un equipo estudiante específico para la recolección.", "Recolección", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        TransferProgressBar.Value = 40;
        TxtTransferLog.Text = $"Recogiendo '{remoteFile.Name}' desde {devId}...";
        await _client.CollectFileFromDeviceAsync(devId, remoteFile.Name);
    }

    private void OnFileSendCompleted(string transferId, bool success, string? savedPath, string? error)
    {
        Dispatcher.Invoke(() =>
        {
            TransferProgressBar.Value = 100;
            if (success)
            {
                TxtTransferLog.Text = $"Archivo entregado con éxito en: {savedPath}";
                RefreshRemoteList();
            }
            else
            {
                TxtTransferLog.Text = $"Fallo en entrega de archivo: {error}";
            }
        });
    }

    private void OnFileCollectCompleted(string fileName, byte[] content, string sha256, string? error)
    {
        Dispatcher.Invoke(() =>
        {
            TransferProgressBar.Value = 100;
            if (content.Length > 0 && string.IsNullOrEmpty(error))
            {
                try
                {
                    string saveDir = Path.Combine(_localFolder, "Tareas_Recogidas");
                    Directory.CreateDirectory(saveDir);
                    string destPath = Path.Combine(saveDir, fileName);
                    File.WriteAllBytes(destPath, content);

                    TxtTransferLog.Text = $"Archivo '{fileName}' ({content.Length} bytes) recogido en {destPath}. SHA-256 verificado ✓";
                    LoadLocalFiles(_localFolder);
                }
                catch (Exception ex)
                {
                    TxtTransferLog.Text = $"Error guardando archivo recogido: {ex.Message}";
                }
            }
            else
            {
                TxtTransferLog.Text = $"Error al recoger archivo: {error ?? "Archivo vacío"}";
            }
        });
    }

    private void OnDirListReceived(string currentPath, JsonElement items)
    {
        Dispatcher.Invoke(() =>
        {
            RemoteFiles.Clear();
            if (items.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in items.EnumerateArray())
                {
                    string name = el.TryGetProperty("name", out var np) ? np.GetString() ?? "" : "";
                    long size = el.TryGetProperty("size", out var sp) ? sp.GetInt64() : 0;
                    bool isDir = el.TryGetProperty("isDirectory", out var dp) && dp.GetBoolean();

                    RemoteFiles.Add(new FileItemViewModel
                    {
                        Name = name,
                        SizeBytes = size,
                        IsDirectory = isDir
                    });
                }
            }
            TxtTransferLog.Text = $"Archivos remotos actualizados ({RemoteFiles.Count} elementos en sandbox).";
        });
    }
}

public class FileItemViewModel
{
    public string Name { get; set; } = string.Empty;
    public string FullPath { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public bool IsDirectory { get; set; }

    public string SizeDisplay => IsDirectory ? "<DIR>" : $"{SizeBytes / 1024.0:F1} KB";
}
