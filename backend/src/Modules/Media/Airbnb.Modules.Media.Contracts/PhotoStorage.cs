namespace Airbnb.Modules.Media.Contracts;

// Where uploaded photos live (host photo uploads spec): the API writes originals, the photo-processor function writes
// the processed WebP or marks the original rejected. Shared so both sides agree on names.
public static class PhotoStorage
{
    public const string UploadsContainer = "photo-uploads";
    public const string PhotosContainer = "photos";

    // Blob metadata keys: Azure lower-cases them, so they are lower-case here too.
    public const string OwnerMetadata = "ownerid";
    public const string StatusMetadata = "status";
    public const string RejectedStatus = "rejected";
    public const string ReasonMetadata = "reason";

    public static string ProcessedBlobName(string id) => $"{id}.webp";

    // Guid.CreateVersion7().ToString("N"): 32 lower-case hex digits, so an id is always a safe blob name.
    public static bool IsPhotoId(string id) =>
        id.Length == 32 && id.All(c => char.IsAsciiDigit(c) || c is >= 'a' and <= 'f');
}
