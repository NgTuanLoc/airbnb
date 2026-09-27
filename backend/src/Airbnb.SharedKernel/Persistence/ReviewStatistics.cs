using Microsoft.EntityFrameworkCore;

namespace Airbnb.SharedKernel.Persistence;

// A review id a module has already counted, so a redelivered ReviewSubmitted changes nothing (spec §3).
public sealed class AppliedReview
{
    public required string ReviewId { get; init; }
}

public static class ReviewStatistics
{
    private const string AppliedReviewsTable = "applied_reviews";

    // Maps the module's applied_reviews table in the DbContext's default schema.
    public static ModelBuilder MapAppliedReviews(this ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppliedReview>(applied =>
        {
            applied.ToTable(AppliedReviewsTable);
            applied.HasKey(a => a.ReviewId);
            applied.Property(a => a.ReviewId).HasMaxLength(50);
        });
        return modelBuilder;
    }

    // Adds one review to a row's "Rating" and "ReviewCount", at most once per review id, in one transaction.
    // A single UPDATE computes both columns from the row's current values, so concurrent reviews can't lose updates,
    // and raw SQL keeps the intermediate sum out of the numeric(3,2) rating type (EF's ExecuteUpdate overflows there).
    public static async Task ApplyOnceAsync(
        DbContext db, string schema, string table, string reviewId, string subjectId, int rating, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

#pragma warning disable EF1002 // schema and table are module constants, never user input; the values are parameters.
        var isFirstDelivery = await db.Database.ExecuteSqlRawAsync(
            $$"""INSERT INTO {{schema}}.{{AppliedReviewsTable}} ("ReviewId") VALUES ({0}) ON CONFLICT DO NOTHING""",
            [reviewId],
            cancellationToken) == 1;
        if (!isFirstDelivery)
        {
            return;
        }

        await db.Database.ExecuteSqlRawAsync(
            $$"""
            UPDATE {{schema}}.{{table}}
            SET "ReviewCount" = "ReviewCount" + 1,
                "Rating" = round(("Rating" * "ReviewCount" + {0}) / ("ReviewCount" + 1), 2)
            WHERE "Id" = {1}
            """,
            [rating, subjectId],
            cancellationToken);
#pragma warning restore EF1002

        await transaction.CommitAsync(cancellationToken);
    }
}
