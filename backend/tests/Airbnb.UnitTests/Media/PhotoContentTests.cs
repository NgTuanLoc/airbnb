using Airbnb.Modules.Media;

namespace Airbnb.UnitTests.Media;

public sealed class PhotoContentTests
{
    public static TheoryData<string, byte[]> Photos => new()
    {
        { "jpeg", [0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0] },
        { "png", [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0] },
        { "webp", [.. "RIFF"u8, 0x24, 0, 0, 0, .. "WEBP"u8] },
    };

    public static TheoryData<string, byte[]> NotPhotos => new()
    {
        { "heic", [0x00, 0x00, 0x00, 0x18, .. "ftypheic"u8] },
        { "gif", [.. "GIF89a"u8, 0, 0, 0, 0, 0, 0] },
        { "text", [.. "hello, world"u8] },
        { "riff but not webp", [.. "RIFF"u8, 0x24, 0, 0, 0, .. "WAVE"u8] },
        { "too short", [0xFF, 0xD8] },
    };

    [Theory]
    [MemberData(nameof(Photos))]
    public void Recognises_jpeg_png_and_webp(string _, byte[] header) => Assert.True(PhotoContent.IsSupported(header));

    [Theory]
    [MemberData(nameof(NotPhotos))]
    public void Refuses_everything_else(string _, byte[] header) => Assert.False(PhotoContent.IsSupported(header));
}
