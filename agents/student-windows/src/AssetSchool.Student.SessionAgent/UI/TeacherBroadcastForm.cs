using System;
using System.Drawing;
using System.Windows.Forms;

namespace AssetSchool.Student.SessionAgent.UI;

public class TeacherBroadcastForm : Form
{
    private static TeacherBroadcastForm? _instance;
    public static TeacherBroadcastForm Instance => _instance ??= new TeacherBroadcastForm();

    private PictureBox _videoBox;
    private Label _headerLabel;
    private Label _connectingBanner;
    private bool _hasReceivedRealFrame = false;
    private string _currentTeacherName = "Profesor";

    public bool HasReceivedRealFrame => _hasReceivedRealFrame;

    public TeacherBroadcastForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        TopMost = true;
        BackColor = Color.FromArgb(15, 23, 42); // Slate dark

        _headerLabel = new Label
        {
            Text = "📡 TRANSMISIÓN DOCENTE — Conectando...",
            Font = new Font("Segoe UI", 12, FontStyle.Bold),
            ForeColor = Color.FromArgb(56, 189, 248),
            BackColor = Color.FromArgb(30, 41, 59),
            Dock = DockStyle.Top,
            Height = 36,
            TextAlign = ContentAlignment.MiddleCenter
        };
        Controls.Add(_headerLabel);

        _connectingBanner = new Label
        {
            Text = "⏳ Estableciendo conexión WebRTC con el servidor escolar...\nEsperando primera trama de video del docente.",
            Font = new Font("Segoe UI", 14, FontStyle.Regular),
            ForeColor = Color.FromArgb(203, 213, 225),
            BackColor = Color.FromArgb(15, 23, 42),
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter
        };
        Controls.Add(_connectingBanner);

        _videoBox = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.Black,
            Visible = false
        };
        Controls.Add(_videoBox);
    }

    public void StartBroadcast(string teacherName, string mode)
    {
        _currentTeacherName = teacherName;
        _hasReceivedRealFrame = false;
        _headerLabel.Text = $"📡 TRANSMISIÓN DOCENTE — Sintonizando señal de {teacherName}...";
        _connectingBanner.Visible = true;
        _videoBox.Visible = false;
        _videoBox.Image = null;

        if (mode == "windowed")
        {
            FormBorderStyle = FormBorderStyle.Sizable;
            WindowState = FormWindowState.Normal;
            Size = new Size(1024, 600);
            StartPosition = FormStartPosition.CenterScreen;
            TopMost = false;
        }
        else
        {
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Maximized;
            TopMost = true;
        }

        Show();
    }

    public void StopBroadcast()
    {
        _hasReceivedRealFrame = false;
        _videoBox.Visible = false;
        if (_videoBox.Image != null)
        {
            var old = _videoBox.Image;
            _videoBox.Image = null;
            old.Dispose();
        }
        _connectingBanner.Visible = true;
        Hide();
    }

    public void UpdateFrame(Image frame)
    {
        if (!_hasReceivedRealFrame)
        {
            _hasReceivedRealFrame = true;
            _connectingBanner.Visible = false;
            _videoBox.Visible = true;
            _headerLabel.Text = $"📡 TRANSMISIÓN EN VIVO — Docente: {_currentTeacherName}";
        }

        var oldImg = _videoBox.Image;
        _videoBox.Image = frame;
        oldImg?.Dispose();
    }
}
