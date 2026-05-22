using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Windows.Forms;

namespace GifStudioLauncher
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                string exePath = Assembly.GetExecutingAssembly().Location;
                string appDataDir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string portableRoot = Path.Combine(appDataDir, "GifStudioPortable");
                string currentHash = new FileInfo(exePath).LastWriteTimeUtc.Ticks.ToString();
                string targetDir = Path.Combine(portableRoot, "app-" + currentHash);
                string manifestPath = Path.Combine(portableRoot, "installed-bundle.txt");
                string mainExe = Path.Combine(targetDir, "Gif Studio.exe");
                bool needsExtract = true;

                if (Directory.Exists(targetDir) && File.Exists(manifestPath) && File.Exists(mainExe))
                {
                    string installed = File.ReadAllText(manifestPath).Trim();
                    needsExtract = (installed != currentHash);
                }

                PurgeOldPortableBundles(portableRoot, targetDir);

                if (needsExtract)
                {
                    ExtractEmbeddedApp(exePath, targetDir);
                    Directory.CreateDirectory(portableRoot);
                    File.WriteAllText(manifestPath, currentHash);
                }

                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = mainExe;
                startInfo.Arguments = string.Join(" ", args);
                startInfo.UseShellExecute = false;
                startInfo.WorkingDirectory = targetDir;

                using (Process proc = Process.Start(startInfo))
                {
                    proc.WaitForExit();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Errore durante l'inizializzazione di Gif Studio Portable:\n\n" + ex.Message,
                    "Gif Studio Portable - Errore di avvio",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        static void PurgeOldPortableBundles(string portableRoot, string keepDir)
        {
            if (!Directory.Exists(portableRoot)) return;
            try
            {
                foreach (string dir in Directory.GetDirectories(portableRoot))
                {
                    string dirName = Path.GetFileName(dir);
                    if (dirName.StartsWith("app-") && !string.Equals(dir, keepDir, StringComparison.OrdinalIgnoreCase))
                    {
                        Directory.Delete(dir, true);
                    }
                }
            }
            catch { /* pulizia best-effort */ }
        }

        static void ExtractEmbeddedApp(string exePath, string targetDir)
        {
            if (Directory.Exists(targetDir))
            {
                try { Directory.Delete(targetDir, true); } catch { }
            }

            using (FileStream fs = new FileStream(exePath, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                byte[] sig = new byte[] { 0x50, 0x4B, 0x03, 0x04 };
                byte[] buffer = new byte[65536];
                int bytesRead;
                long currentPos = 0;
                long zipOffset = -1;

                while ((bytesRead = fs.Read(buffer, 0, buffer.Length)) > 0)
                {
                    for (int i = 0; i < bytesRead - 3; i++)
                    {
                        if (buffer[i] == sig[0] && buffer[i + 1] == sig[1] && buffer[i + 2] == sig[2] && buffer[i + 3] == sig[3])
                        {
                            long candidateOffset = currentPos + i;
                            if (IsValidZip(fs, candidateOffset))
                            {
                                zipOffset = candidateOffset;
                                break;
                            }
                        }
                    }
                    if (zipOffset != -1) break;

                    currentPos += bytesRead;
                    fs.Seek(currentPos - 3, SeekOrigin.Begin);
                    currentPos -= 3;
                }

                if (zipOffset == -1)
                {
                    throw new Exception("Archivio compresso dell'applicazione non trovato all'interno dell'eseguibile o non valido.");
                }

                byte[] zipBytes = new byte[fs.Length - zipOffset];
                fs.Seek(zipOffset, SeekOrigin.Begin);

                int totalBytesRead = 0;
                int currentRead;
                while (totalBytesRead < zipBytes.Length && (currentRead = fs.Read(zipBytes, totalBytesRead, zipBytes.Length - totalBytesRead)) > 0)
                {
                    totalBytesRead += currentRead;
                }

                Directory.CreateDirectory(targetDir);

                using (MemoryStream ms = new MemoryStream(zipBytes))
                {
                    using (ZipArchive archive = new ZipArchive(ms, ZipArchiveMode.Read))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            string destinationPath = Path.GetFullPath(Path.Combine(targetDir, entry.FullName));

                            if (!destinationPath.StartsWith(targetDir, StringComparison.OrdinalIgnoreCase))
                            {
                                continue;
                            }

                            string dirName = Path.GetDirectoryName(destinationPath);
                            if (!Directory.Exists(dirName))
                            {
                                Directory.CreateDirectory(dirName);
                            }

                            if (!string.IsNullOrEmpty(entry.Name))
                            {
                                entry.ExtractToFile(destinationPath, true);
                            }
                        }
                    }
                }
            }
        }

        static bool IsValidZip(FileStream fs, long offset)
        {
            long originalPos = fs.Position;
            try
            {
                fs.Seek(offset, SeekOrigin.Begin);
                byte[] zipBytes = new byte[fs.Length - offset];
                int totalBytesRead = 0;
                int currentRead;
                while (totalBytesRead < zipBytes.Length && (currentRead = fs.Read(zipBytes, totalBytesRead, zipBytes.Length - totalBytesRead)) > 0)
                {
                    totalBytesRead += currentRead;
                }

                using (MemoryStream ms = new MemoryStream(zipBytes))
                {
                    using (ZipArchive archive = new ZipArchive(ms, ZipArchiveMode.Read))
                    {
                        return archive.Entries.Count > 0;
                    }
                }
            }
            catch
            {
                return false;
            }
            finally
            {
                fs.Seek(originalPos, SeekOrigin.Begin);
            }
        }
    }
}
