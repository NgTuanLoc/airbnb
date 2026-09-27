using System.Reflection;
using Airbnb.Modules.Experiences;
using Airbnb.Modules.Hosts;
using Airbnb.Modules.Reviews;
using Airbnb.Modules.Services;
using Airbnb.Modules.Stays;
using NetArchTest.Rules;

namespace Airbnb.ArchitectureTests;

public sealed class ModuleRulesTests
{
    private static readonly Dictionary<string, Type> Modules = new()
    {
        ["Airbnb.Modules.Experiences"] = typeof(ExperiencesModule),
        ["Airbnb.Modules.Hosts"] = typeof(HostsModule),
        ["Airbnb.Modules.Reviews"] = typeof(ReviewsModule),
        ["Airbnb.Modules.Services"] = typeof(ServicesModule),
        ["Airbnb.Modules.Stays"] = typeof(StaysModule),
    };

    public static TheoryData<string> ModuleNames => new(Modules.Keys.ToArray());

    // The module class is the whole public surface; EF-generated migration classes are the only other exported types.
    [Theory]
    [MemberData(nameof(ModuleNames))]
    public void A_module_exports_only_its_module_class(string module)
    {
        var assembly = Modules[module].Assembly;

        var exported = assembly.GetExportedTypes()
            .Where(type => !(type.Namespace ?? string.Empty).EndsWith(".Data.Migrations", StringComparison.Ordinal))
            .Select(type => type.FullName)
            .ToArray();

        Assert.Equal([Modules[module].FullName], exported);
    }

    [Theory]
    [MemberData(nameof(ModuleNames))]
    public void A_module_depends_on_no_other_module_or_host(string module)
    {
        string[] forbidden = [.. Modules.Keys.Where(other => other != module), "Airbnb.Api", "Airbnb.MigrationService", "Airbnb.AppHost"];

        var result = Types.InAssembly(Modules[module].Assembly)
            .ShouldNot()
            .HaveDependencyOnAny(forbidden)
            .GetResult();

        Assert.True(
            result.IsSuccessful,
            $"{module} types with forbidden dependencies: {string.Join(", ", result.FailingTypes?.Select(t => t.FullName) ?? [])}");
    }

    [Fact]
    public void Every_module_assembly_is_covered_by_these_rules()
    {
        var moduleProjects = Directory.GetDirectories(Path.Combine(RepoBackend(), "src", "Modules"))
            .Select(directory => $"Airbnb.Modules.{Path.GetFileName(directory)}")
            .Order()
            .ToArray();

        Assert.Equal(moduleProjects, Modules.Keys.Order().ToArray());
    }

    // backend/ from this test assembly's output folder (backend/tests/Airbnb.ArchitectureTests/bin/<config>/<tfm>/).
    private static string RepoBackend() =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!, "..", "..", "..", "..", ".."));
}
