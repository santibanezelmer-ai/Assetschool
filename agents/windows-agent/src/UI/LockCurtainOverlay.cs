using System;
using System.Collections.Generic;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;

namespace AssetSchool.Agent.UI;

/// <summary>
/// Pedagogical Lock Screen Curtain for Windows.
/// Covers all active displays with an institutional full-screen overlay,
/// suppressing local student inputs while locked by the teacher.
/// </summary>
public class LockCurtainOverlay
{
    private static LockCurtainOverlay? _instance;
    public static LockCurtainOverlay Instance => _instance ??= new LockCurtainOverlay();

    private readonly List<Form> _curtainForms = new();
    private bool _isLocked;
    private Thread? _uiThread;

    public bool IsLocked => _isLocked;

    public void Show(string message, string teacherName, string institutionName)
    {
        if (_isLocked) return;
        _isLocked = true;

        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine("==========================================================================");
        Console.WriteLine($"[PAUSA PEDAGÓGICA] 🔒 PANTALLA BLOQUEADA POR EL DOCENTE: {teacherName}");
        Console.WriteLine($"[MENSAJE DEL DOCENTE] \"{message}\"");
        Console.WriteLine("[ENTRADA] Teclado y mouse inhibidos.");
        Console.WriteLine("==========================================================================");
        Console.ResetColor();

        _uiThread = new Thread(() =>
        {
            try
            {
                foreach (var screen in Screen.AllScreens)
                {
                    var form = CreateCurtainForm(screen, message, teacherName, institutionName);
                    _curtainForms.Add(form);
                    form.Show();
                }

                Application.Run();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LOCK OVERLAY ERROR] {ex.Message}");
            }
        });

        _uiThread.SetApartmentState(ApartmentState.STA);
        _uiThread.IsBackground = true;
        _uiThread.Start();
    }

    public void Hide()
    {
        if (!_isLocked) return;
        _isLocked = false;

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("==========================================================================");
        Console.WriteLine("[PAUSA PEDAGÓGICA] 🟢 PANTALLA DESBLOQUEADA. Control restaurado al estudiante.");
        Console.WriteLine("==========================================================================");
        Console.ResetColor();

        foreach (var form in _curtainForms)
        {
            try
            {
                if (form.InvokeRequired)
                {
                    form.Invoke(new Action(() => form.Close()));
                }
                else
                {
                    form.Close();
                }
            }
            catch { }
        }
        _curtainForms.Clear();
    }

    private Form CreateCurtainForm(Screen screen, string message, string teacherName, string institutionName)
    {
        var form = new Form
        {
            FormBorderStyle = FormBorderStyle.None,
            WindowState = FormWindowState.Normal,
            StartPosition = FormStartPosition.Manual,
            Location = screen.Bounds.Location,
            Size = screen.Bounds.Size,
            TopMost = true,
            ShowInTaskbar = false,
            BackColor = Color.FromArgb(2, 6, 23), // Slate-950
            KeyPreview = true
        };

        form.FormClosing += (s, e) =>
        {
            if (_isLocked)
            {
                e.Cancel = true; // Prevent Alt+F4
            }
        };

        // Layout container
        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.Transparent
        };
        form.Controls.Add(panel);

        // Icon
        var iconLabel = new Label
        {
            Text = "🔒",
            Font = new Font("Segoe UI Emoji", 48, FontStyle.Regular),
            ForeColor = Color.FromArgb(245, 158, 11), // Amber-500
            AutoSize = true,
            Location = new Point((screen.Bounds.Width / 2) - 35, (screen.Bounds.Height / 2) - 180)
        };
        panel.Controls.Add(iconLabel);

        // Title
        var titleLabel = new Label
        {
            Text = "ATENCIÓN AL FRENTE",
            Font = new Font("Segoe UI", 28, FontStyle.Bold),
            ForeColor = Color.White,
            AutoSize = true,
            TextAlign = ContentAlignment.MiddleCenter
        };
        titleLabel.Location = new Point((screen.Bounds.Width - 450) / 2, (screen.Bounds.Height / 2) - 90);
        panel.Controls.Add(titleLabel);

        // Subtitle
        var subLabel = new Label
        {
            Text = "PAUSA PEDAGÓGICA ACTIVA",
            Font = new Font("Segoe UI", 12, FontStyle.Bold),
            ForeColor = Color.FromArgb(245, 158, 11),
            AutoSize = true,
            TextAlign = ContentAlignment.MiddleCenter
        };
        subLabel.Location = new Point((screen.Bounds.Width - 250) / 2, (screen.Bounds.Height / 2) - 35);
        panel.Controls.Add(subLabel);

        // Teacher message box
        var msgLabel = new Label
        {
            Text = $"\"{message}\"",
            Font = new Font("Segoe UI", 16, FontStyle.Regular),
            ForeColor = Color.FromArgb(203, 213, 225), // Slate-300
            Size = new Size(800, 100),
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point((screen.Bounds.Width - 800) / 2, (screen.Bounds.Height / 2) + 20)
        };
        panel.Controls.Add(msgLabel);

        // Footer
        var footerLabel = new Label
        {
            Text = $"Docente a cargo: {teacherName}  •  {institutionName}  •  AssetSchool LAN",
            Font = new Font("Segoe UI", 11, FontStyle.Regular),
            ForeColor = Color.FromArgb(100, 116, 139), // Slate-500
            AutoSize = true,
            Location = new Point((screen.Bounds.Width - 550) / 2, screen.Bounds.Height - 60)
        };
        panel.Controls.Add(footerLabel);

        return form;
    }
}
