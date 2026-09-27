using System.Reflection;
using Airbnb.Modules.Experiences;
using Airbnb.Modules.Hosts;
using Airbnb.Modules.Reviews;
using Airbnb.Modules.Services;
using Airbnb.Modules.Stays;
using Airbnb.Modules.Stays.Contracts;

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

    private static readonly Dictionary<string, Type> Contracts = new()
    {
        ["Airbnb.Modules.Stays.Contracts"] = typeof(IListingLookup),
    };

    public static TheoryData<string> ContractNames => new(Contracts.Keys.ToArray());

    // A module may use SharedKernel and other modules' Contracts, never another module's implementation or a host.
    // Exact assembly names: a namespace-prefix rule can't tell Airbnb.Modules.Stays from Airbnb.Modules.Stays.Contracts.
    [Theory]
    [MemberData(nameof(ModuleNames))]
    public void A_module_references_only_the_shared_kernel_and_contracts(string module)
    {
        var forbidden = Modules[module].Assembly.GetReferencedAssemblies()
            .Select(reference => reference.Name!)
            .Where(name => name.StartsWith("Airbnb.", StringComparison.Ordinal)
                && name != "Airbnb.SharedKernel"
                && !name.EndsWith(".Contracts", StringComparison.Ordinal))
            .ToArray();

        Assert.Empty(forbidden);
    }

    // Contracts hold plain records and interfaces that any module may reference, so they depend on nothing of ours.
    [Theory]
    [MemberData(nameof(ContractNames))]
    public void Contracts_reference_no_other_airbnb_assembly(string contracts)
    {
        var references = Contracts[contracts].Assembly.GetReferencedAssemblies()
            .Select(reference => reference.Name!)
            .Where(name => name.StartsWith("Airbnb.", StringComparison.Ordinal))
            .ToArray();

        Assert.Empty(references);
    }

    [Fact]
    public void Every_contracts_assembly_is_covered_by_these_rules()
    {
        var contractProjects = Directory.GetDirectories(Path.Combine(RepoBackend(), "src", "Modules"))
            .SelectMany(Directory.GetDirectories)
            .Select(Path.GetFileName)
            .Where(name => name!.EndsWith(".Contracts", StringComparison.Ordinal))
            .Order()
            .ToArray();

        Assert.Equal(contractProjects, Contracts.Keys.Order().ToArray());
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
