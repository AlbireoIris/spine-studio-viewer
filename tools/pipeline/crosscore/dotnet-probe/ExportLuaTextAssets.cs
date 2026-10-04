// 探针 v5：把内层全部 TextAsset（.lua）导出到磁盘，供检索语音表
using AssetsTools.NET;
using AssetsTools.NET.Extra;

string path = @"D:\AIHOME\Mimo\work\ref\luascripts-B.unityfs";
string outDir = @"D:\AIHOME\Mimo\work\lua";
Directory.CreateDirectory(outDir);

var am = new AssetsManager();
var bun = am.LoadBundleFile(path);
var inst = am.LoadAssetsFileFromBundle(bun, 0);
Console.WriteLine($"[OK] 资源 {inst.file.AssetInfos.Count} 个 → 导出到 {outDir}");

int n = 0, bytes = 0, skipped = 0;
foreach (var inf in inst.file.AssetInfos)
{
    if (inf.TypeId != 49) continue;                 // 49 = TextAsset
    try
    {
        var bf = am.GetBaseField(inst, inf);
        var nmField = bf.Get("m_Name");
        var scField = bf.Get("m_Script");
        if (nmField.IsDummy || scField.IsDummy) { skipped++; continue; }
        string name = nmField.AsString;
        string text = scField.AsString;
        if (string.IsNullOrEmpty(name)) name = $"unnamed_{inf.PathId}.lua";
        foreach (var ch in Path.GetInvalidFileNameChars()) name = name.Replace(ch, '_');
        var full = Path.Combine(outDir, name);
        File.WriteAllText(full, text, System.Text.Encoding.UTF8);
        n++; bytes += text.Length;
        if (n % 2000 == 0) Console.WriteLine($"   已导出 {n} 个…");
    }
    catch (Exception ex) { skipped++; if (skipped < 5) Console.WriteLine($"   跳过: {ex.Message}"); }
}
Console.WriteLine($"[完成] 导出 {n} 个 lua 文件，合计 {bytes / 1048576.0:F1} M 字符；跳过 {skipped}");
