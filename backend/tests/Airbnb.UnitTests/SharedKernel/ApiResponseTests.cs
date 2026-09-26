using System.Text.Json;
using Airbnb.SharedKernel;

namespace Airbnb.UnitTests.SharedKernel;

public sealed class ApiResponseTests
{
    [Fact]
    public void Ok_without_meta_serializes_only_success_and_data()
    {
        var json = JsonSerializer.Serialize(ApiResponse.Ok(new[] { "l1", "l2" }), JsonSerializerOptions.Web);

        Assert.Equal("""{"success":true,"data":["l1","l2"]}""", json);
    }

    [Fact]
    public void Ok_with_meta_serializes_paging_metadata()
    {
        var json = JsonSerializer.Serialize(ApiResponse.Ok(new[] { "l1" }, new PageMeta(16, 1, 50)), JsonSerializerOptions.Web);

        Assert.Equal("""{"success":true,"data":["l1"],"meta":{"total":16,"page":1,"limit":50}}""", json);
    }

    [Fact]
    public void Fail_serializes_only_success_and_error()
    {
        var json = JsonSerializer.Serialize(ApiResponse.Fail("Listing was not found"), JsonSerializerOptions.Web);

        Assert.Equal("""{"success":false,"error":"Listing was not found"}""", json);
    }
}
