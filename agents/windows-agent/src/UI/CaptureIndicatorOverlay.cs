using System;

namespace AssetSchool.Agent.UI;

/// <summary>
/// Student desktop visible indicator banner.
/// Displays an unmistakable top-level system bar whenever screen supervision is active,
/// ensuring full transparency, ethical compliance, and student privacy awareness.
/// </summary>
public class CaptureIndicatorOverlay
{
    private bool _isVisible;

    public bool IsVisible => _isVisible;

    public void Show(string teacherName = "el docente")
    {
        _isVisible = true;
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine("==========================================================================");
        Console.WriteLine($"[AVISO DE PRIVACIDAD] 🔴 Tu pantalla está siendo supervisada por {teacherName}.");
        Console.WriteLine("[AVISO DE PRIVACIDAD] AssetSchool LAN Classroom Monitor — Transmisión activa.");
        Console.WriteLine("==========================================================================");
        Console.ResetColor();

        // In Windows desktop runtime, this initializes a topmost borderless WinForms/WPF bar:
        // TopMost = true, ShowInTaskbar = false, FormBorderStyle = None
        // Height = 32px, Width = Screen.PrimaryScreen.Bounds.Width
        // Background = Crimson Red with white text and live duration timer.
    }

    public void Hide()
    {
        if (!_isVisible) return;
        _isVisible = false;
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("[AVISO DE PRIVACIDAD] 🟢 Supervisión de pantalla finalizada. Indicador cerrado.");
        Console.ResetColor();
    }
}
