using System;
using System.Windows.Forms;

namespace AssetSchool.Student.SessionAgent;

public static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        uint sessionId = 1;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--session" && i + 1 < args.Length && uint.TryParse(args[i + 1], out uint s))
            {
                sessionId = s;
            }
        }

        Console.WriteLine($"[SessionAgent] Iniciado en sesión interactiva #{sessionId}");

        var ipcClient = new NamedPipeIpcClient(sessionId);
        ipcClient.Start();

        // Hidden background message loop
        var context = new ApplicationContext();
        Application.Run(context);
    }
}
