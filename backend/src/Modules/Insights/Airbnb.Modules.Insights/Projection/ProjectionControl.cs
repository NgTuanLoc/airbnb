namespace Airbnb.Modules.Insights;

// The rebuild endpoint's line to the projection loop, which does the rebuild itself between batches, on its own
// thread, so nothing races its consumer or its pending batch.
internal sealed class ProjectionControl
{
    private volatile bool _isRunning;
    private int _rebuildRequested;

    public bool IsRunning
    {
        get => _isRunning;
        set => _isRunning = value;
    }

    // False when there's no projection to ask (switched off, or not started yet).
    public bool RequestRebuild()
    {
        if (!_isRunning)
        {
            return false;
        }
        Interlocked.Exchange(ref _rebuildRequested, 1);
        return true;
    }

    public bool TakeRebuildRequest() => Interlocked.Exchange(ref _rebuildRequested, 0) == 1;
}
