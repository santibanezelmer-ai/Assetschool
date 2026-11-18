using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace AssetSchool.Student.SessionAgent.RemoteInput;

public static class InputInjector
{
    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public MOUSEKEYBDHARDWAREINPUT mkhi;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct MOUSEKEYBDHARDWAREINPUT
    {
        [FieldOffset(0)]
        public MOUSEINPUT mi;

        [FieldOffset(0)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    private const uint INPUT_MOUSE = 0;
    private const uint INPUT_KEYBOARD = 1;

    private const uint MOUSEEVENTF_MOVE = 0x0001;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;
    private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

    private const uint KEYEVENTF_KEYDOWN = 0x0000;
    private const uint KEYEVENTF_KEYUP = 0x0002;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    public static void InjectMouseMove(double normalizedX, double normalizedY)
    {
        var input = new INPUT
        {
            type = INPUT_MOUSE,
            mkhi = new MOUSEKEYBDHARDWAREINPUT
            {
                mi = new MOUSEINPUT
                {
                    dx = (int)(normalizedX * 65535),
                    dy = (int)(normalizedY * 65535),
                    dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE
                }
            }
        };

        SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void InjectMouseClick(double normalizedX, double normalizedY, string button = "left")
    {
        InjectMouseMove(normalizedX, normalizedY);

        uint downFlag = button.ToLowerInvariant() switch
        {
            "right" => MOUSEEVENTF_RIGHTDOWN,
            "middle" => MOUSEEVENTF_MIDDLEDOWN,
            _ => MOUSEEVENTF_LEFTDOWN
        };
        uint upFlag = button.ToLowerInvariant() switch
        {
            "right" => MOUSEEVENTF_RIGHTUP,
            "middle" => MOUSEEVENTF_MIDDLEUP,
            _ => MOUSEEVENTF_LEFTUP
        };

        var down = new INPUT
        {
            type = INPUT_MOUSE,
            mkhi = new MOUSEKEYBDHARDWAREINPUT { mi = new MOUSEINPUT { dwFlags = downFlag } }
        };

        var up = new INPUT
        {
            type = INPUT_MOUSE,
            mkhi = new MOUSEKEYBDHARDWAREINPUT { mi = new MOUSEINPUT { dwFlags = upFlag } }
        };

        SendInput(2, new[] { down, up }, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void InjectMouseDoubleClick(double normalizedX, double normalizedY)
    {
        InjectMouseClick(normalizedX, normalizedY, "left");
        Thread.Sleep(30);
        InjectMouseClick(normalizedX, normalizedY, "left");
    }

    public static void InjectMouseScroll(int delta)
    {
        var input = new INPUT
        {
            type = INPUT_MOUSE,
            mkhi = new MOUSEKEYBDHARDWAREINPUT
            {
                mi = new MOUSEINPUT
                {
                    mouseData = (uint)delta,
                    dwFlags = MOUSEEVENTF_WHEEL
                }
            }
        };

        SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT)));
    }

        SendInput(2, new[] { down, up }, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void InjectKey(ushort keyCode, bool isKeyDown)
    {
        var input = new INPUT
        {
            type = INPUT_KEYBOARD,
            mkhi = new MOUSEKEYBDHARDWAREINPUT
            {
                ki = new KEYBDINPUT
                {
                    wVk = keyCode,
                    dwFlags = isKeyDown ? KEYEVENTF_KEYDOWN : KEYEVENTF_KEYUP
                }
            }
        };

        SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT)));
    }
}
