using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace AssetSchool.Student.SessionAgent.FileTransfer;

/// <summary>
/// Confines all remote file operations to the school work directory (Downloads\AssetSchool)
/// Prevents path traversal, validates SHA-256 integrity, and supports listing and collection.
/// </summary>
public class FileManagerService
{
    private static FileManagerService? _instance;
    public static FileManagerService Instance => _instance ??= new FileManagerService();

    public string SandboxRoot { get; }

    public FileManagerService()
    {
        string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        SandboxRoot = Path.Combine(userProfile, "Downloads", "AssetSchool");
        if (!Directory.Exists(SandboxRoot))
        {
            Directory.CreateDirectory(SandboxRoot);
        }
    }

    private string ConfinePath(string? rawPath)
    {
        if (string.IsNullOrWhiteSpace(rawPath) || rawPath == "." || rawPath == "~")
        {
            return SandboxRoot;
        }

        // Clean out path separators or invalid chars
        string combined = Path.IsPathRooted(rawPath)
            ? rawPath
            : Path.Combine(SandboxRoot, rawPath);

        string full = Path.GetFullPath(combined);
        if (!full.StartsWith(SandboxRoot, StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException($"Acceso denegado: La ruta '{rawPath}' está fuera de la carpeta escolar permitida.");
        }

        return full;
    }

    public static string ComputeSha256(byte[] data)
    {
        using var sha = SHA256.Create();
        byte[] hash = sha.ComputeHash(data);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public (bool Success, string? SavedPath, string? Sha256, string? Error) SaveIncomingFile(
        string fileName,
        string base64Content,
        string? targetDir = null,
        string? expectedSha256 = null)
    {
        try
        {
            byte[] fileBytes = Convert.FromBase64String(base64Content);
            string computedHash = ComputeSha256(fileBytes);

            if (!string.IsNullOrEmpty(expectedSha256) &&
                !string.Equals(computedHash, expectedSha256, StringComparison.OrdinalIgnoreCase))
            {
                return (false, null, computedHash, "Error de integridad: El hash SHA-256 no coincide.");
            }

            string targetFolder = ConfinePath(targetDir);
            if (!Directory.Exists(targetFolder))
            {
                Directory.CreateDirectory(targetFolder);
            }

            string safeFileName = Path.GetFileName(fileName);
            if (string.IsNullOrWhiteSpace(safeFileName) || safeFileName.Contains(".."))
            {
                return (false, null, computedHash, "Nombre de archivo inválido o peligroso.");
            }

            string destPath = Path.Combine(targetFolder, safeFileName);
            File.WriteAllBytes(destPath, fileBytes);

            Console.WriteLine($"[FILE MANAGER] Archivo guardado con éxito: {destPath} ({fileBytes.Length} bytes, SHA-256: {computedHash})");
            return (true, destPath, computedHash, null);
        }
        catch (Exception ex)
        {
            return (false, null, null, ex.Message);
        }
    }

    public (bool Success, string FileName, int Size, string? Sha256, string? Base64Content, string? Error) ReadFileToCollect(string relativeOrFullPath)
    {
        try
        {
            string fullPath = ConfinePath(relativeOrFullPath);
            if (!File.Exists(fullPath))
            {
                return (false, Path.GetFileName(relativeOrFullPath), 0, null, null, "El archivo solicitado no existe.");
            }

            byte[] bytes = File.ReadAllBytes(fullPath);
            string sha = ComputeSha256(bytes);
            string b64 = Convert.ToBase64String(bytes);

            return (true, Path.GetFileName(fullPath), bytes.Length, sha, b64, null);
        }
        catch (Exception ex)
        {
            return (false, Path.GetFileName(relativeOrFullPath), 0, null, null, ex.Message);
        }
    }

    public (string CurrentPath, List<Dictionary<string, object>> Items, string? Error) ListDirectory(string? relativeOrFullPath = null)
    {
        try
        {
            string targetDir = ConfinePath(relativeOrFullPath);
            if (!Directory.Exists(targetDir))
            {
                return (targetDir, new List<Dictionary<string, object>>(), "El directorio no existe.");
            }

            var items = new List<Dictionary<string, object>>();
            var dirInfo = new DirectoryInfo(targetDir);

            foreach (var dir in dirInfo.GetDirectories())
            {
                items.Add(new Dictionary<string, object>
                {
                    ["name"] = dir.Name,
                    ["path"] = dir.FullName,
                    ["isDirectory"] = true,
                    ["size"] = 0,
                    ["modifiedAt"] = new DateTimeOffset(dir.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                    ["extension"] = ""
                });
            }

            foreach (var file in dirInfo.GetFiles())
            {
                items.Add(new Dictionary<string, object>
                {
                    ["name"] = file.Name,
                    ["path"] = file.FullName,
                    ["isDirectory"] = false,
                    ["size"] = (int)file.Length,
                    ["modifiedAt"] = new DateTimeOffset(file.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                    ["extension"] = file.Extension.TrimStart('.').ToLowerInvariant()
                });
            }

            return (targetDir, items, null);
        }
        catch (Exception ex)
        {
            return (SandboxRoot, new List<Dictionary<string, object>>(), ex.Message);
        }
    }
}
