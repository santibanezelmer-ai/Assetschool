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

    public TeacherBroadcastForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        TopMost = true;
        BackColor = Color.Black;

        _headerLabel = new Label
        {
            Text = "📡 PRESENTACIÓN EN VIVO DEL PROFESOR",
            Font = new Font("Segoe UI", 12, FontStyle.Bold),
            ForeColor = Color.FromArgb(56, 189, 248),
            BackColor = Color.FromArgb(15, 23, 42),
            Dock = DockStyle.Top,
            Height = 32,
            TextAlign = ContentAlignment.MiddleCenter
        };
        Controls.Add(_headerLabel);

        _videoBox = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.Black
        };
        Controls.Add(_videoBox);
    }

    public void StartBroadcast(string teacherName, string mode)
    {
        _headerLabel.Text = $"📡 TRANSMISIÓN EN VIVO — Docente: {teacherName}";

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
        Hide();
    }

    public void UpdateFrame(Image frame)
    {
        _videoBox.Image = frame;
    }
}
