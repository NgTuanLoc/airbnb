using SkiaSharp;

namespace Airbnb.Functions;

// Exactly one of the two is set.
internal sealed record PhotoResult(byte[]? Webp, string? RejectionReason);

// Turns an uploaded original into the photo that is served: upright, at most 2560 px on its long edge, re-encoded as
// WebP. Skia's encoder writes no EXIF or XMP, so camera metadata (GPS included) never reaches a guest.
internal static class PhotoProcessor
{
    public const int MaxLongEdge = 2560;
    public const int MinShortEdge = 400;
    public const long MaxPixels = 40_000_000;
    private const int WebpQuality = 80;

    public static PhotoResult Process(Stream original)
    {
        using var codec = SKCodec.Create(original);
        if (codec is null) return Rejected("not_an_image");

        // From the header alone, before allocating anything: a small file can claim a huge canvas.
        var (width, height) = (codec.Info.Width, codec.Info.Height);
        if ((long)width * height > MaxPixels) return Rejected("too_large_dimensions");
        if (Math.Min(width, height) < MinShortEdge) return Rejected("too_small");

        using var decoded = SKBitmap.Decode(codec, codec.Info.WithColorType(SKColorType.Rgba8888).WithAlphaType(SKAlphaType.Premul));
        if (decoded is null) return Rejected("not_an_image");

        var swapsSides = codec.EncodedOrigin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop
            or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var (uprightWidth, uprightHeight) = swapsSides ? (height, width) : (width, height);
        var scale = Math.Min(1f, (float)MaxLongEdge / Math.Max(uprightWidth, uprightHeight));
        var (outWidth, outHeight) = ((int)Math.Round(uprightWidth * scale), (int)Math.Round(uprightHeight * scale));

        using var output = new SKBitmap(outWidth, outHeight, SKColorType.Rgba8888, SKAlphaType.Premul);
        using (var canvas = new SKCanvas(output))
        using (var image = SKImage.FromBitmap(decoded))
        {
            canvas.Clear(SKColors.Transparent);
            canvas.SetMatrix(SKMatrix.CreateScale(scale, scale).PreConcat(Orientation(codec.EncodedOrigin, width, height)));
            // Mitchell smooths even at 1:1, so it is only for downscaling; turning a picture upright copies pixels exactly.
            canvas.DrawImage(image, 0, 0, scale < 1 ? new SKSamplingOptions(SKCubicResampler.Mitchell) : SKSamplingOptions.Default);
        }

        using var encoded = SKImage.FromBitmap(output).Encode(SKEncodedImageFormat.Webp, WebpQuality);
        return new PhotoResult(encoded.ToArray(), null);
    }

    private static PhotoResult Rejected(string reason) => new(null, reason);

    // Maps the stored pixels (width x height) onto the upright picture the EXIF orientation describes.
    private static SKMatrix Orientation(SKEncodedOrigin origin, int width, int height) => origin switch
    {
        SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, width, 0, 1, 0, 0, 0, 1),
        SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, width, 0, -1, height, 0, 0, 1),
        SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, height, 0, 0, 1),
        SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
        SKEncodedOrigin.RightTop => new SKMatrix(0, -1, height, 1, 0, 0, 0, 0, 1),
        SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, height, -1, 0, width, 0, 0, 1),
        SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, width, 0, 0, 1),
        _ => SKMatrix.Identity,
    };
}
