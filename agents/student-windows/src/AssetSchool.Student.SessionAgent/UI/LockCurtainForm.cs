using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace AssetSchool.Student.SessionAgent.UI;

public class LockCurtainForm
{
    private static LockCurtainForm? _instance;
    public static LockCurtainForm Instance => _instance ??= new LockCurtainForm();

    private readonly List<Form> _curtainForms = new();
    private bool _isLocked;
    private IntPtr _hookId = IntPtr.Zero;
    private LowLevelKeyboardProc? _proc;

    public bool IsLocked => _isLocked;

    // Win32 Hook API
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    public void Show(string message = "Atención al frente. La clase está en pausa pedagógica.", string teacherName = "Profesor")
    {
        if (_isLocked) return;
        _isLocked = true;

        Console.WriteLine($"[LockCurtain] 🔒 Activando bloqueo pedagógico: {message}");

        // Install Low-Level Keyboard Hook to suppress Alt+Tab, Win Key, Ctrl+Esc
        _proc = HookCallback;
        using var curProcess = Process.GetCurrentProcess();
        using var curModule = curProcess.MainModule;
        _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(curModule?.ModuleName ?? ""), 0);

        foreach (var screen in Screen.AllScreens)
        {
            var form = CreateFormForScreen(screen, message, teacherName);
            _curtainForms.Add(form);
            form.Show();
        }
    }

    public void Hide()
    {
        if (!_isLocked) return;
        _isLocked = false;

        Console.WriteLine("[LockCurtain] 🟢 Desbloqueando pantalla y restaurando periféricos.");

        // Remove Low-Level Hook
        if (_hookId != IntPtr.Zero)
        {
            UnhookWindowsHookEx(_hookId);
            _hookId = IntPtr.Zero;
        }

        foreach (var form in _curtainForms)
        {
            try
            {
                form.Close();
                form.Dispose();
            }
            catch { }
        }
        _curtainForms.Clear();
    }

    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && _isLocked)
        {
            int vkCode = Marshal.ReadInt32(lParam);
            var key = (Keys)vkCode;

            // Block Windows Keys, Alt+Tab, Alt+Esc, Ctrl+Esc
            if (key == Keys.LWin || key == Keys.RWin || key == Keys.Escape || key == Keys.Tab)
            {
                // Suppress key by returning 1 (non-zero)
                return (IntPtr)1;
            }
        }

        return CallNextHookEx(_hookId, nCode, wParam, lParam);
    }

    private Form CreateFormForScreen(Screen screen, string message, string teacherName)
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
            BackColor = Color.FromArgb(15, 23, 42), // Slate-900
            KeyPreview = true
        };

        form.FormClosing += (s, e) =>
        {
            if (_isLocked) e.Cancel = true; // Prevent Alt+F4
        };

        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.Transparent
        };
        form.Controls.Add(panel);

        var icon = new Label
        {
            Text = "🔒",
            Font = new Font("Segoe UI Emoji", 54, FontStyle.Regular),
            ForeColor = Color.FromArgb(245, 158, 11),
            AutoSize = true,
            Location = new Point((screen.Bounds.Width / 2) - 40, (screen.Bounds.Height / 2) - 170)
        };
        panel.Controls.Add(icon);

        var title = new Label
        {
            Text = "ATENCIÓN AL FRENTE",
            Font = new Font("Segoe UI", 32, FontStyle.Bold),
            ForeColor = Color.White,
            AutoSize = true,
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point((screen.Bounds.Width - 480) / 2, (screen.Bounds.Height / 2) - 80)
        };
        panel.Controls.Add(title);

        var msg = new Label
        {
            Text = $"\"{message}\"",
            Font = new Font("Segoe UI", 18, FontStyle.Regular),
            ForeColor = Color.FromArgb(203, 213, 225),
            Size = new Size(800, 80),
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point((screen.Bounds.Width - 800) / 2, (screen.Bounds.Height / 2) + 10)
        };
        panel.Controls.Add(msg);

        var footer = new Label
        {
            Text = $"Sesión de Aula Supervisada • {teacherName} • AssetSchool Veyon Suite",
            Font = new Font("Segoe UI", 11, FontStyle.Regular),
            ForeColor = Color.FromArgb(100, 116, 139),
            AutoSize = true,
            Location = new Point((screen.Bounds.Width - 500) / 2, screen.Bounds.Height - 50)
        };
        panel.Controls.Add(footer);

        return form;
    }
}
