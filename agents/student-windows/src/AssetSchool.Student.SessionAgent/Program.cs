using System;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;

namespace AssetSchool.Student.SessionAgent;

public static class Program
{
    private static Mutex? _singleInstanceMutex;

    [STAThread]
    public static void Main(string[] args)
    {
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        // 1. Determinar el SessionId real:
        //    a) Si se recibe --session con un valor numérico positivo, utilizarlo.
        //    b) Si no se recibe o es inválido, autodescubrirlo mediante Process.GetCurrentProcess().SessionId.
        //    Bajo ningún concepto asumir o forzar un SessionId fijo.
        uint sessionId = 0;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--session" && i + 1 < args.Length && uint.TryParse(args[i + 1], out uint s) && s > 0)
            {
                sessionId = s;
                break;
            }
        }

        if (sessionId == 0)
        {
            try
            {
                int currentSession = Process.GetCurrentProcess().SessionId;
                if (currentSession > 0)
                {
                    sessionId = (uint)currentSession;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SessionAgent] Error obteniendo SessionId de proceso: {ex.Message}");
            }
        }

        if (sessionId == 0)
        {
            Console.WriteLine("[SessionAgent] Imposible determinar una sesión interactiva válida (SessionId > 0). Finalizando ejecución.");
            return;
        }

        // 2. Mutex de instancia única por sesión:
        //    El prefijo 'Local\' asegura alcance restringido a la sesión de Windows actual,
        //    impidiendo interferencias entre sesiones distintas y garantizando que solo exista
        //    un SessionAgent por sesión interactiva activa.
        string mutexName = $@"Local\AssetSchool_Student_SessionAgent_S{sessionId}";
        bool createdNew = false;

        try
        {
            _singleInstanceMutex = new Mutex(true, mutexName, out createdNew);
        }
        catch (AbandonedMutexException)
        {
            // Una instancia anterior terminó de forma abrupta; adquirimos la propiedad legítima del mutex.
            createdNew = true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SessionAgent] Excepción al inicializar Mutex '{mutexName}': {ex.Message}");
            return;
        }

        if (!createdNew)
        {
            Console.WriteLine($"[SessionAgent] Instancia activa ya detectada para la sesión #{sessionId} ({mutexName}). Finalizando de forma limpia.");
            _singleInstanceMutex?.Dispose();
            _singleInstanceMutex = null;
            return;
        }

        try
        {
            Console.WriteLine($"[SessionAgent] Iniciado en sesión interactiva #{sessionId} (PID={Environment.ProcessId})");

            SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
            var uiContext = SynchronizationContext.Current;

            var ipcClient = new NamedPipeIpcClient(sessionId, uiContext);
            ipcClient.Start();

            // Hidden background message loop
            var context = new ApplicationContext();
            Application.Run(context);

            ipcClient.Stop();
        }
        finally
        {
            if (_singleInstanceMutex != null)
            {
                try
                {
                    _singleInstanceMutex.ReleaseMutex();
                }
                catch (Exception)
                {
                    // Ignorar si el hilo ya no posee la titularidad del mutex al salir
                }
                _singleInstanceMutex.Dispose();
                _singleInstanceMutex = null;
            }
        }
    }
}
