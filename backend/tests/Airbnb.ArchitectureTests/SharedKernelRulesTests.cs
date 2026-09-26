using Airbnb.SharedKernel;
using NetArchTest.Rules;

namespace Airbnb.ArchitectureTests;

public sealed class SharedKernelRulesTests
{
    [Fact]
    public void Shared_kernel_depends_on_no_host_or_module()
    {
        var result = Types.InAssembly(typeof(IModuleMigrator).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny("Airbnb.Api", "Airbnb.MigrationService", "Airbnb.AppHost", "Airbnb.Modules")
            .GetResult();

        Assert.True(
            result.IsSuccessful,
            $"SharedKernel types with forbidden dependencies: {string.Join(", ", result.FailingTypes?.Select(t => t.FullName) ?? [])}");
    }
}
