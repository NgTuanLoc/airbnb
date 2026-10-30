using System.Text.Json;
using Airbnb.SharedKernel;

namespace Airbnb.UnitTests.SharedKernel;

public sealed class ApiResponseTests
{
    private static readonly string[] TwoListingIds = ["l1", "l2"];
    private static readonly string[] OneListingId = ["l1"];

    [Fact]
    public void Ok_without_meta_serializes_only_success_and_data()
    {
        var json = JsonSerializer.Serialize(ApiResponse.Ok(TwoListingIds), JsonSerializerOptions.Web);

        Assert.Equal("""{"success":true,"data":["l1","l2"]}""", json);
    }

    [Fact]
    public void Ok_with_meta_serializes_paging_metadata()
    {
        var json = JsonSerializer.Serialize(ApiResponse.Ok(OneListingId, new PageMeta(16, 1, 50)), JsonSerializerOptions.Web);

        Assert.Equal("""{"success":true,"data":["l1"],"meta":{"total":16,"page":1,"limit":50}}""", json);
    }

    [Fact]
    public void Fail_serializes_only_success_and_error()
    {
        var json = JsonSerializer.Serialize(ApiResponse.Fail("Listing was not found"), JsonSerializerOptions.Web);

        Assert.Equal("""{"success":false,"error":"Listing was not found"}""", json);
    }

    [Fact]
    public void Fail_with_a_code_adds_the_machine_readable_code()
    {
        var json = JsonSerializer.Serialize(ApiResponse.Fail("An account with this email already exists", "account_exists"), JsonSerializerOptions.Web);

        Assert.Equal("""{"success":false,"error":"An account with this email already exists","code":"account_exists"}""", json);
    }
}
