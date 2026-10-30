namespace Airbnb.Modules.Insights;

// Views consumed since the last flush, already folded into what the flush writes: a count per (listing, UTC day) and,
// per partition, the offset to resume from. A malformed view still moves its partition's offset, or it would be read
// again forever.
internal sealed class ViewBatch
{
    private readonly Dictionary<(string ListingId, DateOnly Day), long> _counts = [];
    private readonly Dictionary<int, long> _nextOffsets = [];

    public int Count { get; private set; }

    public IReadOnlyDictionary<(string ListingId, DateOnly Day), long> Counts => _counts;

    public IReadOnlyDictionary<int, long> NextOffsets => _nextOffsets;

    public void Add(int partition, long offset, string? value)
    {
        Count++;
        _nextOffsets[partition] = Math.Max(_nextOffsets.GetValueOrDefault(partition), offset + 1);
        if (!ListingViewEvent.TryParse(value, out var view))
        {
            return;
        }
        var key = (view.ListingId, DateOnly.FromDateTime(view.ViewedAt.UtcDateTime));
        _counts[key] = _counts.GetValueOrDefault(key) + 1;
    }

    public void Clear()
    {
        Count = 0;
        _counts.Clear();
        _nextOffsets.Clear();
    }
}
