namespace Airbnb.Modules.Media;

// The upload's real type, from its first bytes; the file name and the browser's content type are ignored.
internal static class PhotoContent
{
    public const int HeaderLength = 12;

    public static bool IsSupported(ReadOnlySpan<byte> header) =>
        header.StartsWith((ReadOnlySpan<byte>)[0xFF, 0xD8, 0xFF])
        || header.StartsWith((ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        || (header.Length >= HeaderLength && header.StartsWith("RIFF"u8) && header[8..12].SequenceEqual("WEBP"u8));
}
