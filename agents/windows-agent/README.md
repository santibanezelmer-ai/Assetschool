# AssetSchool Agent — Windows

## Tecnologías
- **Lenguaje**: C# (.NET 8.0)
- **Target OS**: Windows 10 (Build 19041+) y Windows 11
- **Arquitectura**: x86_64 / ARM64

## Capacidades Reales Declaradas
- **Transmisión de Pantalla**: Viable mediante `Windows.Graphics.Capture` (DirectX/DXGI) con aceleración por hardware.
- **Bloqueo de Interacción**: Viable mediante `BlockInput` de Win32 API y Hooks de bajo nivel de teclado (`WH_KEYBOARD_LL`).
- **Control de Procesos**: Supervisión y cierre forzado mediante `Process.Kill()` con privilegios de servicio de sistema.
- **Auditoría de Hardware**: Consultas WMI (`Win32_Processor`, `Win32_PhysicalMemory`, `Win32_DiskDrive`).

## Compilación
```bash
dotnet build AssetSchool.Agent.csproj
dotnet run
```
