using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AssetSchool.Student.SessionAgent.Capture;

public class WindowsGraphicsCaptureService : IDisposable
{
    private bool _isCapturing;
    private CancellationTokenSource? _cts;
    private int _targetFps = 10;
    private int _targetWidth = 640;
    private int _targetHeight = 360;

    public event Action<byte[], int, int, long>? OnFrameCaptured;

    [DllImport("user32.dll")]
    private static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    private static extern IntPtr GetWindowDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleBitmap(IntPtr hDC, int nWidth, int nHeight);

    [DllImport("gdi32.dll")]
    private static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

    [DllImport("gdi32.dll")]
    private static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjSource, int nXSrc, int nYSrc, int dwRop);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);

    private const int SRCCOPY = 0x00CC0020;

    public void StartCapture(int fps = 10, int width = 640, int height = 360)
    {
        if (_isCapturing) StopCapture();

        _targetFps = fps;
        _targetWidth = width;
        _targetHeight = height;
        _isCapturing = true;
        _cts = new CancellationTokenSource();

        Console.WriteLine($"[Capture] Iniciando captura de pantalla interactiva en Sesión activa a {_targetFps} FPS ({_targetWidth}x{_targetHeight})...");
        _ = Task.Run(() => CaptureLoop(_cts.Token), _cts.Token);
    }

    public void StopCapture()
    {
        _isCapturing = false;
        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;
    }

    private async Task CaptureLoop(CancellationToken token)
    {
        int delayMs = Math.Max(16, 1000 / _targetFps);
        var bounds = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);

        while (!token.IsCancellationRequested && _isCapturing)
        {
            try
            {
                using var bmp = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
                using (var g = Graphics.FromImage(bmp))
                {
                    g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
                }

                // Scale to target thumbnail resolution
                using var scaled = new Bitmap(bmp, new Size(_targetWidth, _targetHeight));
                using var ms = new System.IO.MemoryStream();
                scaled.Save(ms, ImageFormat.Jpeg);
                byte[] jpegBytes = ms.ToArray();

                long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                OnFrameCaptured?.Invoke(jpegBytes, _targetWidth, _targetHeight, timestamp);
            }
            catch (Exception)
            {
                // Access lost or display switched
            }

            try
            {
                await Task.Delay(delayMs, token);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    public void Dispose()
    {
        StopCapture();
    }
}
