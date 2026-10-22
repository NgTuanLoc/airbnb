using System.Text;
using Airbnb.Functions;
using Airbnb.Modules.Media.Contracts;
using SkiaSharp;

namespace Airbnb.UnitTests.Functions;

public sealed class PhotoProcessorTests
{
    [Fact]
    public void Rotated_jpeg_comes_out_upright_without_metadata()
    {
        var jpeg = WithExifOrientation(Encode(Image(600, 400), SKEncodedImageFormat.Jpeg), orientation: 6);

        var result = PhotoProcessor.Process(new MemoryStream(jpeg));

        var (format, width, height) = Describe(result.Webp!);
        Assert.Equal(SKEncodedImageFormat.Webp, format);
        Assert.Equal((400, 600), (width, height));
        var text = Encoding.Latin1.GetString(result.Webp!);
        Assert.DoesNotContain("Exif", text);
        Assert.DoesNotContain("XMP", text);
    }

    [Fact]
    public void Large_photo_is_scaled_to_2560_on_the_long_edge()
    {
        var result = PhotoProcessor.Process(new MemoryStream(Encode(Image(4000, 3000), SKEncodedImageFormat.Jpeg)));

        var (_, width, height) = Describe(result.Webp!);
        Assert.Equal((2560, 1920), (width, height));
    }

    [Fact]
    public void Small_photo_is_kept_at_its_size()
    {
        var result = PhotoProcessor.Process(new MemoryStream(Encode(Image(800, 600), SKEncodedImageFormat.Png)));

        var (_, width, height) = Describe(result.Webp!);
        Assert.Equal((800, 600), (width, height));
    }

    [Fact]
    public void Transparent_png_keeps_alpha()
    {
        using var bitmap = Image(500, 500);
        bitmap.SetPixel(0, 0, SKColors.Transparent);

        var result = PhotoProcessor.Process(new MemoryStream(Encode(bitmap, SKEncodedImageFormat.Png)));

        using var decoded = SKBitmap.Decode(result.Webp!);
        Assert.Equal(0, decoded.GetPixel(0, 0).Alpha);
    }

    [Fact]
    public void Short_edge_under_400_is_rejected()
    {
        var result = PhotoProcessor.Process(new MemoryStream(Encode(Image(1000, 399), SKEncodedImageFormat.Jpeg)));

        Assert.Equal("too_small", result.RejectionReason);
        Assert.Null(result.Webp);
    }

    [Fact]
    public void Over_40_megapixels_is_rejected_before_decoding()
    {
        var result = PhotoProcessor.Process(new MemoryStream(PngHeader(8000, 5001)));

        Assert.Equal("too_large_dimensions", result.RejectionReason);
        Assert.Null(result.Webp);
    }

    [Fact]
    public void Random_bytes_are_not_an_image()
    {
        var bytes = new byte[2048];
        new Random(42).NextBytes(bytes);

        var result = PhotoProcessor.Process(new MemoryStream(bytes));

        Assert.Equal("not_an_image", result.RejectionReason);
        Assert.Null(result.Webp);
    }

    [Fact]
    public void PhotoStorage_ids()
    {
        Assert.True(PhotoStorage.IsPhotoId(Guid.CreateVersion7().ToString("N")));
        Assert.False(PhotoStorage.IsPhotoId(""));
        Assert.False(PhotoStorage.IsPhotoId("../x"));
        Assert.False(PhotoStorage.IsPhotoId(Guid.CreateVersion7().ToString("N").ToUpperInvariant()));
        Assert.False(PhotoStorage.IsPhotoId(Guid.CreateVersion7().ToString("N")[..31]));
    }

    // A gradient, so encoders can't collapse it and orientation is visible in the pixels.
    private static SKBitmap Image(int width, int height)
    {
        var bitmap = new SKBitmap(width, height, SKColorType.Rgba8888, SKAlphaType.Unpremul);
        using var canvas = new SKCanvas(bitmap);
        using var paint = new SKPaint
        {
            Shader = SKShader.CreateLinearGradient(new SKPoint(0, 0), new SKPoint(width, height),
                [SKColors.Coral, SKColors.SteelBlue], SKShaderTileMode.Clamp),
        };
        canvas.DrawRect(0, 0, width, height, paint);
        return bitmap;
    }

    private static byte[] Encode(SKBitmap bitmap, SKEncodedImageFormat format)
    {
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(format, 90);
        return data.ToArray();
    }

    private static (SKEncodedImageFormat Format, int Width, int Height) Describe(byte[] bytes)
    {
        using var codec = SKCodec.Create(new MemoryStream(bytes));
        return (codec.EncodedFormat, codec.Info.Width, codec.Info.Height);
    }

    // An APP1 Exif segment holding only the Orientation tag, inserted right after the JPEG's SOI marker.
    private static byte[] WithExifOrientation(byte[] jpeg, ushort orientation)
    {
        byte[] exif =
        [
            .. "Exif\0\0"u8,
            .. "II*\0"u8, 8, 0, 0, 0,   // little-endian TIFF header, first IFD at offset 8
            1, 0,                        // one entry
            0x12, 0x01, 3, 0, 1, 0, 0, 0, (byte)orientation, 0, 0, 0, // 0x0112 SHORT x1
            0, 0, 0, 0,                  // no next IFD
        ];
        var length = exif.Length + 2;
        return [.. jpeg[..2], 0xFF, 0xE1, (byte)(length >> 8), (byte)length, .. exif, .. jpeg[2..]];
    }

    // A PNG whose IHDR claims the given size but whose pixel data is an empty zlib stream: a codec opens it and reads
    // the dimensions, and a decoder would fail, so only a check made before decoding can reject it.
    private static byte[] PngHeader(int width, int height)
    {
        byte[] ihdr = [.. "IHDR"u8, .. BigEndian(width), .. BigEndian(height), 8, 6, 0, 0, 0];
        byte[] idat = [.. "IDAT"u8, 0x78, 0x9C, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01];
        byte[] iend = [.. "IEND"u8];
        return [0x89, .. "PNG\r\n\x1a\n"u8, .. Chunk(ihdr), .. Chunk(idat), .. Chunk(iend)];
    }

    private static byte[] Chunk(byte[] typeAndData) =>
        [.. BigEndian(typeAndData.Length - 4), .. typeAndData, .. BigEndian((int)Crc32(typeAndData))];

    private static byte[] BigEndian(int value) => [(byte)(value >> 24), (byte)(value >> 16), (byte)(value >> 8), (byte)value];

    private static uint Crc32(byte[] bytes)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var b in bytes)
        {
            crc ^= b;
            for (var bit = 0; bit < 8; bit++) crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : crc >> 1;
        }
        return ~crc;
    }
}
